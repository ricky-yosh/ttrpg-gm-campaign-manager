use campaign_cli::{handle, MAX_MESSAGE_BYTES};
use campaign_core::campaign::Session;
use serde::{de::IgnoredAny, Deserialize, Deserializer};
use serde_json::{json, Value};
use std::io::{self, BufRead, Read, Seek, Write};
use std::process::{Command, Stdio};

const HELP: &str = "\
campaign — headless campaign authoring

Usage:
  campaign describe             Print capabilities and input schemas
  campaign serve                Run JSON-RPC 2.0 over newline-delimited stdio
  campaign run                  Read {method,params} lines and drive a child host

run keeps one host/session alive until EOF. Responses are JSON-RPC envelopes.
Use campaign.inspect to obtain the current revision before mutations.
Save explicitly; EOF discards unsaved changes. Never use original campaigns
for migration experiments. Exit: 0 success, 1 operation error, 2 CLI/I/O error.
";

#[tokio::main(flavor = "current_thread")]
async fn main() {
    let args: Vec<_> = std::env::args().skip(1).collect();
    let result = match args.as_slice() {
        [command] if command == "describe" => {
            println!("{}", Session::discover());
            Ok(false)
        }
        [command] if command == "serve" => serve().await.map(|()| false),
        [command] if command == "run" => run(),
        [] => {
            print!("{HELP}");
            Ok(false)
        }
        [command] if command == "--help" || command == "-h" => {
            print!("{HELP}");
            Ok(false)
        }
        _ => Err("Unknown arguments. Use campaign --help.".into()),
    };
    match result {
        Ok(false) => {}
        Ok(true) => std::process::exit(1),
        Err(error) => {
            eprintln!("{error}");
            std::process::exit(2);
        }
    }
}

// Bound allocation before JSON decoding, including a peer that omits newlines.
fn read_message(reader: &mut impl BufRead) -> Result<Option<String>, String> {
    let mut bytes = Vec::new();
    let count = reader
        .take((MAX_MESSAGE_BYTES + 1) as u64)
        .read_until(b'\n', &mut bytes)
        .map_err(|e| e.to_string())?;
    if count == 0 {
        return Ok(None);
    }
    if bytes.len() > MAX_MESSAGE_BYTES {
        return Err("Message exceeds 16 MiB limit.".into());
    }
    String::from_utf8(bytes)
        .map(Some)
        .map_err(|e| e.to_string())
}

async fn serve() -> Result<(), String> {
    let mut session = Session::default();
    let stdin = io::stdin();
    let mut input = stdin.lock();
    let stdout = io::stdout();
    let mut output = stdout.lock();
    while let Some(line) = read_message(&mut input)? {
        if let Some(response) = handle(&mut session, &line).await {
            writeln!(output, "{response}")
                .and_then(|()| output.flush())
                .map_err(|e| e.to_string())?;
        }
    }
    Ok(())
}

#[derive(Deserialize)]
struct ResponseStatus {
    id: u64,
    #[serde(default, deserialize_with = "error_present")]
    error: bool,
}

fn error_present<'de, D: Deserializer<'de>>(deserializer: D) -> Result<bool, D::Error> {
    IgnoredAny::deserialize(deserializer)?;
    Ok(true)
}

// Only requests are capped at 16 MiB. Our child host may return a whole campaign
// assembled from many individually bounded edits. Spool one NDJSON response to
// disk and validate its envelope before forwarding it, without buffering its
// image-bearing result in memory or changing the public response shape.
fn forward_response(
    reader: &mut impl BufRead,
    output: &mut impl Write,
    expected_id: u64,
) -> Result<bool, String> {
    let mut response = tempfile::tempfile().map_err(|e| e.to_string())?;
    loop {
        let buffer = reader.fill_buf().map_err(|e| e.to_string())?;
        if buffer.is_empty() {
            return Err("Host exited without a complete response.".into());
        }
        let newline = buffer.iter().position(|byte| *byte == b'\n');
        let length = newline.map_or(buffer.len(), |index| index + 1);
        response
            .write_all(&buffer[..length])
            .map_err(|e| e.to_string())?;
        reader.consume(length);
        if newline.is_some() {
            break;
        }
    }
    response.rewind().map_err(|e| e.to_string())?;
    let status: ResponseStatus =
        serde_json::from_reader(io::BufReader::new(&mut response)).map_err(|e| e.to_string())?;
    if status.id != expected_id {
        return Err("Host returned an unexpected response ID.".into());
    }
    response.rewind().map_err(|e| e.to_string())?;
    io::copy(&mut response, output).map_err(|e| e.to_string())?;
    output.flush().map_err(|e| e.to_string())?;
    Ok(status.error)
}

fn run() -> Result<bool, String> {
    let mut child = Command::new(std::env::current_exe().map_err(|e| e.to_string())?)
        .arg("serve")
        .stdin(Stdio::piped())
        .stdout(Stdio::piped())
        .stderr(Stdio::inherit())
        .spawn()
        .map_err(|e| e.to_string())?;
    let result = (|| {
        let mut host_input = child.stdin.take().ok_or("Host stdin unavailable.")?;
        let mut host_output =
            io::BufReader::new(child.stdout.take().ok_or("Host stdout unavailable.")?);
        let stdin = io::stdin();
        let mut input = stdin.lock();
        let stdout = io::stdout();
        let mut output = stdout.lock();
        let mut failed = false;
        let mut id = 0u64;
        while let Some(line) = read_message(&mut input)? {
            let command: Value = serde_json::from_str(&line).map_err(|e| e.to_string())?;
            if !command.is_object()
                || !command["method"].is_string()
                || command
                    .as_object()
                    .unwrap()
                    .keys()
                    .any(|k| k != "method" && k != "params")
            {
                return Err("Expected {\"method\":\"...\",\"params\":{...}}.".into());
            }
            id += 1;
            let request = json!({"jsonrpc": "2.0", "id": id, "method": command["method"],
                "params": command.get("params").cloned().unwrap_or_else(|| json!({}))});
            writeln!(host_input, "{request}")
                .and_then(|()| host_input.flush())
                .map_err(|e| e.to_string())?;
            failed |= forward_response(&mut host_output, &mut output, id)?;
        }
        drop(host_input);
        Ok(failed)
    })();
    if result.is_err() {
        let _ = child.kill();
    }
    let status = child.wait().map_err(|e| e.to_string())?;
    if !status.success() && result.is_ok() {
        return Err(format!("Host exited with {status}."));
    }
    result
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn responses_are_forwarded_one_at_a_time_with_error_status() {
        let success = b"{\"jsonrpc\":\"2.0\",\"id\":1,\"result\":{\"nested\":[\"value\"]}}\n";
        let failure = b"{\"jsonrpc\":\"2.0\",\"id\":2,\"error\":{\"code\":-32000}}\n";
        let stream = [success.as_slice(), failure.as_slice()].concat();
        let mut reader = io::BufReader::with_capacity(3, stream.as_slice());
        let mut output = Vec::new();
        assert!(!forward_response(&mut reader, &mut output, 1).unwrap());
        assert_eq!(output, success);
        output.clear();
        assert!(forward_response(&mut reader, &mut output, 2).unwrap());
        assert_eq!(output, failure);
    }

    #[test]
    fn invalid_responses_are_not_forwarded() {
        for response in [
            "",
            "{\"id\":1,\"result\":{}}",
            "{\"id\":2,\"result\":{}}\n",
            "{\"id\":1,\"result\":broken}\n",
            "{\"id\":1,\"result\":{}} trailing\n",
        ] {
            let mut reader = io::BufReader::new(response.as_bytes());
            let mut output = Vec::new();
            assert!(
                forward_response(&mut reader, &mut output, 1).is_err(),
                "invalid response was accepted: {response}"
            );
            assert!(output.is_empty(), "invalid response leaked to stdout");
        }
    }

    #[test]
    fn requests_still_enforce_the_original_size_limit() {
        let bytes = vec![b' '; MAX_MESSAGE_BYTES + 1];
        let mut at_limit = io::BufReader::new(&bytes[..MAX_MESSAGE_BYTES]);
        assert_eq!(
            read_message(&mut at_limit).unwrap().unwrap().len(),
            MAX_MESSAGE_BYTES
        );
        let mut over_limit = io::BufReader::new(bytes.as_slice());
        assert_eq!(
            read_message(&mut over_limit).unwrap_err(),
            "Message exceeds 16 MiB limit."
        );
    }
}

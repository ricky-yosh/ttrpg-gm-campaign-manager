use campaign_cli::{handle, MAX_MESSAGE_BYTES};
use campaign_core::campaign::Session;
use serde_json::{json, Value};
use std::io::{self, BufRead, Read, Write};
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
            let response =
                read_message(&mut host_output)?.ok_or("Host exited without a response.")?;
            let value: Value = serde_json::from_str(&response).map_err(|e| e.to_string())?;
            if value["id"] != id {
                return Err("Host returned an unexpected response ID.".into());
            }
            failed |= value.get("error").is_some();
            write!(output, "{response}")
                .and_then(|()| output.flush())
                .map_err(|e| e.to_string())?;
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

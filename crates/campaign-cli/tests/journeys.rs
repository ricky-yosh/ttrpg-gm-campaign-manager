use serde_json::{json, Value};
use std::io::{BufRead, BufReader, Write};
use std::process::{Child, ChildStdin, ChildStdout, Command, Stdio};

struct Client {
    child: Child,
    input: Option<ChildStdin>,
    output: BufReader<ChildStdout>,
    id: u64,
}

impl Client {
    fn new() -> Self {
        let mut child = Command::new(env!("CARGO_BIN_EXE_campaign"))
            .arg("serve")
            .stdin(Stdio::piped())
            .stdout(Stdio::piped())
            .stderr(Stdio::inherit())
            .spawn()
            .unwrap();
        Self {
            input: child.stdin.take(),
            output: BufReader::new(child.stdout.take().unwrap()),
            child,
            id: 0,
        }
    }

    fn raw(&mut self, line: &str) {
        writeln!(self.input.as_mut().unwrap(), "{line}").unwrap();
        self.input.as_mut().unwrap().flush().unwrap();
    }

    fn read(&mut self) -> Value {
        let mut line = String::new();
        assert_ne!(
            self.output.read_line(&mut line).unwrap(),
            0,
            "host exited without response"
        );
        serde_json::from_str(&line).expect("stdout must contain only JSON-RPC")
    }

    fn request(&mut self, method: &str, params: Value) -> Value {
        self.id += 1;
        self.raw(
            &json!({"jsonrpc":"2.0","id":self.id,"method":method,"params":params}).to_string(),
        );
        let response = self.read();
        assert_eq!(response["id"], self.id);
        response
    }

    fn ok(&mut self, method: &str, params: Value) -> Value {
        let response = self.request(method, params);
        assert!(response.get("error").is_none(), "{method}: {response}");
        response["result"].clone()
    }

    fn close(mut self) {
        drop(self.input.take());
        assert!(self.child.wait().unwrap().success());
    }
}

impl Drop for Client {
    fn drop(&mut self) {
        drop(self.input.take());
        let _ = self.child.kill();
        let _ = self.child.wait();
    }
}

#[test]
fn author_validate_undo_save_and_reopen_through_real_host() {
    let folder = tempfile::tempdir().unwrap();
    let path = folder.path().join("journey.campaign");
    let mut client = Client::new();
    let description = client.ok("system.describe", json!({}));
    assert!(description["methods"]["npc.update"]["properties"]["expectedRevision"].is_object());
    let created = client.ok(
        "campaign.new",
        json!({"name":"Forest","expectedRevision":0}),
    );
    assert_eq!(created["revision"], 1);
    assert_eq!(created["dirty"], true);
    let npc = client.ok("npc.create", json!({"name":" Scout ","expectedRevision":1}));
    let id = npc["npc"]["id"].as_str().unwrap();
    assert_eq!(npc["npc"]["name"], "Scout");
    let before = client.ok("campaign.inspect", json!({}));
    let rejected = client.request(
        "npc.update",
        json!({"npcId":id,"name":" ","expectedRevision":2}),
    );
    assert_eq!(rejected["error"]["data"]["code"], "validation");
    assert_eq!(client.ok("campaign.inspect", json!({})), before);
    let conflict = client.request(
        "npc.update",
        json!({"npcId":id,"name":"Lost","expectedRevision":1}),
    );
    assert_eq!(conflict["error"]["data"]["code"], "conflict");
    assert_eq!(client.ok("campaign.inspect", json!({})), before);
    let no_op = client.ok(
        "npc.update",
        json!({"npcId":id,"name":"Scout","expectedRevision":2}),
    );
    assert_eq!(no_op["revision"], 2);
    assert_eq!(no_op["history"]["canUndo"], false);
    let edit = client.ok(
        "npc.update",
        json!({"npcId":id,"name":"Ranger","expectedRevision":2,
        "notes":[{"type":"p","children":[{"text":"Private notes","bold":true}]},
            {"type":"img","url":"data:image/png;base64,aW1hZ2U=","children":[{"text":""}]}]}),
    );
    assert_eq!(edit["history"]["npc"]["name"], "Ranger");
    assert_eq!(edit["revision"], 3);
    let undo = client.ok("npc.undo", json!({"npcId":id,"expectedRevision":3}));
    assert_eq!(undo["history"]["npc"]["name"], "Scout");
    assert_eq!(undo["revision"], 4);
    let redo = client.ok("npc.redo", json!({"npcId":id,"expectedRevision":4}));
    assert_eq!(redo["history"]["npc"]["name"], "Ranger");
    assert_eq!(redo["revision"], 5);
    let saved = client.ok("campaign.save", json!({"path":path,"expectedRevision":5}));
    assert_eq!(saved["dirty"], false);
    assert_eq!(saved["revision"], 6);
    assert_eq!(std::fs::read_dir(path.join("assets")).unwrap().count(), 1);
    client.close();

    let mut reopened = Client::new();
    let loaded = reopened.ok("campaign.open", json!({"path":path,"expectedRevision":0}));
    assert_eq!(loaded["campaign"], saved["campaign"]);
    let list = reopened.ok("npc.list", json!({}));
    assert_eq!(list["npcs"][0]["name"], "Ranger");
    let no_history = reopened.request("npc.undo", json!({"npcId":id,"expectedRevision":1}));
    assert_eq!(no_history["error"]["data"]["code"], "conflict");
    reopened.close();
}

#[test]
fn failed_switch_and_busy_packages_preserve_working_session() {
    let folder = tempfile::tempdir().unwrap();
    let path = folder.path().join("locked.campaign");
    let mut first = Client::new();
    first.ok("campaign.new", json!({"name":"First","expectedRevision":0}));
    first.ok("campaign.save", json!({"path":path,"expectedRevision":1}));
    let mut second = Client::new();
    let original = second.ok(
        "campaign.new",
        json!({"name":"Second","expectedRevision":0}),
    );
    let dirty = second.request("campaign.open", json!({"path":path,"expectedRevision":1}));
    assert_eq!(dirty["error"]["data"]["code"], "unsaved_changes");
    let busy = second.request(
        "campaign.open",
        json!({"path":path,"expectedRevision":1,"discardChanges":true}),
    );
    assert_eq!(busy["error"]["data"]["code"], "storage");
    assert_eq!(second.ok("campaign.inspect", json!({})), original);
    let missing = second.request(
        "campaign.open",
        json!({"path":folder.path().join("missing.campaign"),
        "expectedRevision":1,"discardChanges":true}),
    );
    assert_eq!(missing["error"]["data"]["code"], "storage");
    assert_eq!(second.ok("campaign.inspect", json!({})), original);
    first.close();
    second.ok(
        "campaign.open",
        json!({"path":path,"expectedRevision":1,"discardChanges":true}),
    );
    second.close();
}

#[test]
fn protocol_errors_and_notifications_do_not_corrupt_stream() {
    let mut client = Client::new();
    client.raw("{");
    assert_eq!(client.read()["error"]["code"], -32700);
    client.raw("[]");
    assert_eq!(client.read()["error"]["code"], -32600);
    client.raw(r#"{"jsonrpc":"2.0","method":"campaign.new","params":{"name":"Notification","expectedRevision":0}}"#);
    let inspected = client.ok("campaign.inspect", json!({}));
    assert_eq!(inspected["campaign"]["name"], "Notification");
    assert_eq!(inspected["revision"], 1);
    assert_eq!(
        client.request("unknown", json!({}))["error"]["code"],
        -32601
    );
    assert_eq!(
        client.request(
            "npc.create",
            json!({"name":"Typo","expectedRevision":1,"typo":true})
        )["error"]["code"],
        -32602
    );
    assert_eq!(
        client.request("campaign.inspect", json!([]))["error"]["code"],
        -32602
    );
    client.close();
}

#[test]
fn cli_run_drives_child_host_and_returns_operation_exit_status() {
    let folder = tempfile::tempdir().unwrap();
    let path = folder.path().join("cli.campaign");
    let mut child = Command::new(env!("CARGO_BIN_EXE_campaign"))
        .arg("run")
        .stdin(Stdio::piped())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .spawn()
        .unwrap();
    let mut input = child.stdin.take().unwrap();
    for command in [
        json!({"method":"campaign.new","params":{"name":"CLI","expectedRevision":0}}),
        json!({"method":"npc.create","params":{"name":"Scout","expectedRevision":1}}),
        json!({"method":"campaign.save","params":{"path":path,"expectedRevision":2}}),
        json!({"method":"not.implemented"}),
        json!({"method":"campaign.inspect"}),
    ] {
        writeln!(input, "{command}").unwrap();
    }
    drop(input);
    let output = child.wait_with_output().unwrap();
    assert_eq!(output.status.code(), Some(1));
    assert!(
        output.stderr.is_empty(),
        "{}",
        String::from_utf8_lossy(&output.stderr)
    );
    let responses: Vec<Value> = String::from_utf8(output.stdout)
        .unwrap()
        .lines()
        .map(|line| serde_json::from_str(line).unwrap())
        .collect();
    assert_eq!(responses.len(), 5);
    assert_eq!(responses[4]["result"]["dirty"], false);
    let mut reopened = Client::new();
    let campaign = reopened.ok("campaign.open", json!({"path":path,"expectedRevision":0}));
    assert_eq!(campaign["campaign"]["npcs"][0]["name"], "Scout");
    reopened.close();
}

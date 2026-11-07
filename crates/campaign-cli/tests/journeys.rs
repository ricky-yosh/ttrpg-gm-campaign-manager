use serde_json::{json, Value};
use std::io::{BufRead, BufReader, Write};
use std::process::{Child, ChildStdin, ChildStdout, Command, Stdio};

#[cfg(unix)]
#[test]
fn asset_import_rejects_outside_directory_before_writing() {
    let folder = tempfile::tempdir().unwrap();
    let path = folder.path().join("assets.campaign");
    let outside = folder.path().join("outside");
    std::fs::create_dir(&outside).unwrap();
    let mut client = Client::new();
    client.ok(
        "campaign.new",
        json!({"name":"Assets","expectedRevision":0}),
    );
    client.ok("campaign.save", json!({"path":path,"expectedRevision":1}));
    std::fs::remove_dir(path.join("assets")).unwrap();
    std::os::unix::fs::symlink(&outside, path.join("assets")).unwrap();

    let before = client.ok("campaign.inspect", json!({}));
    let history = client.ok("history.status", json!({}));
    let rejected = client.request(
        "asset.import",
        json!({"data":"data:image/png;base64,aW1hZ2U="}),
    );
    assert_eq!(rejected["error"]["data"]["code"], "storage");
    assert_eq!(
        std::fs::read_dir(&outside).unwrap().count(),
        0,
        "a rejected import must not write through the assets symlink"
    );
    assert_eq!(client.ok("campaign.inspect", json!({})), before);
    assert_eq!(client.ok("history.status", json!({})), history);
    let rejected_save = client.request("campaign.save", json!({"expectedRevision":2}));
    assert_eq!(rejected_save["error"]["data"]["code"], "storage");
    assert_eq!(std::fs::read_dir(&outside).unwrap().count(), 0);

    // Removing the unsafe link permits a normal import, even when assets/ is
    // absent. Neither the rejection nor its retry changes campaign history.
    std::fs::remove_file(path.join("assets")).unwrap();
    let imported = client.ok(
        "asset.import",
        json!({"data":"data:image/png;base64,aW1hZ2U="}),
    );
    assert!(path.join(imported["url"].as_str().unwrap()).is_file());
    assert_eq!(client.ok("campaign.inspect", json!({})), before);
    assert_eq!(client.ok("history.status", json!({})), history);
    client.close();
}

#[test]
fn cli_run_forwards_large_open_inspect_and_save_responses() {
    let folder = tempfile::tempdir().unwrap();
    let path = folder.path().join("large.campaign");
    let mut client = Client::new();
    client.ok("campaign.new", json!({"name":"Large","expectedRevision":0}));
    // Each request fits the input limit, but the combined image-bearing
    // campaign exceeds it. These are encoded-byte fixtures, not decoded images.
    let image = format!(
        "data:image/png;base64,{}",
        "AAAA".repeat(campaign_cli::MAX_MESSAGE_BYTES / 12 + 128)
    );
    let mut revision = 1;
    for name in ["One", "Two", "Three"] {
        let created = client.ok(
            "npc.create",
            json!({"name":name,"expectedRevision":revision}),
        );
        revision += 1;
        client.ok(
            "npc.update",
            json!({
                "npcId":created["npc"]["id"],"expectedRevision":revision,
                "notes":[{"type":"img","url":image,"children":[{"text":""}]}]
            }),
        );
        revision += 1;
    }
    client.ok(
        "campaign.save",
        json!({"path":path,"expectedRevision":revision}),
    );
    client.close();

    let mut responses = tempfile::tempfile().unwrap();
    let mut child = Command::new(env!("CARGO_BIN_EXE_campaign"))
        .arg("run")
        .stdin(Stdio::piped())
        .stdout(responses.try_clone().unwrap())
        .stderr(Stdio::piped())
        .spawn()
        .unwrap();
    {
        let mut input = child.stdin.take().unwrap();
        for command in [
            json!({"method":"campaign.open","params":{"path":path,"expectedRevision":0}}),
            json!({"method":"campaign.inspect"}),
            json!({"method":"campaign.save","params":{"expectedRevision":1}}),
        ] {
            writeln!(input, "{command}").unwrap();
        }
    }
    let output = child.wait_with_output().unwrap();
    assert!(
        output.status.success(),
        "run failed: {}",
        String::from_utf8_lossy(&output.stderr)
    );
    std::io::Seek::rewind(&mut responses).unwrap();
    let mut reader = BufReader::new(responses);
    for id in 1..=3 {
        let mut line = String::new();
        reader.read_line(&mut line).unwrap();
        assert!(line.len() > campaign_cli::MAX_MESSAGE_BYTES);
        let response: Value = serde_json::from_str(&line).unwrap();
        assert_eq!(response["id"], id);
        assert!(response.get("error").is_none());
        let campaign = &response["result"]["campaign"];
        assert_eq!(campaign["npcs"].as_array().unwrap().len(), 3);
        assert_eq!(campaign["npcs"][2]["notes"][0]["url"], image);
        assert_eq!(response["result"]["dirty"], false);
    }
    let mut extra = String::new();
    assert_eq!(reader.read_line(&mut extra).unwrap(), 0);

    let mut reopened = Client::new();
    let state = reopened.ok("campaign.open", json!({"path":path,"expectedRevision":0}));
    assert_eq!(state["campaign"]["npcs"][2]["notes"][0]["url"], image);
    reopened.close();
}

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
    let history_before_no_op = client.ok("history.status", json!({}));
    let no_op = client.ok(
        "npc.update",
        json!({"npcId":id,"name":"Scout","expectedRevision":2}),
    );
    assert_eq!(no_op["revision"], 2);
    assert_eq!(
        client.ok("history.status", json!({}))["history"]["length"],
        history_before_no_op["history"]["length"],
        "a no-op update must not add a history entry"
    );
    assert_eq!(no_op["history"]["canUndo"], true);
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

fn revision(response: &Value) -> u64 {
    response["revision"]
        .as_u64()
        .unwrap_or_else(|| panic!("missing revision in {response}"))
}

fn error_code(response: &Value) -> &str {
    response["error"]["data"]["code"]
        .as_str()
        .unwrap_or_else(|| panic!("missing structured error in {response}"))
}

fn gm_reference() -> Value {
    json!({
        "background": "Grew up among the rangers.",
        "wants": "Keep the forest safe.",
        "ideals": "Knowledge shared.",
        "bond": "Owes a life debt.",
        "flaw": "Trusts natural explanations.",
        "secrets": "Saw a pale lantern.",
        "reaction": "Steps between danger and bystanders.",
        "personality": "Patient and watchful.",
        "mannerisms": "Studies tracks while listening.",
        "notableActions": "Checks the wind before entering a clearing.",
        "voice": "Low and calm.",
        "allies": "The wardens.",
        "enemies": "Poachers.",
        "other": "Knows the hidden paths."
    })
}

#[test]
fn full_cross_record_authoring_journey_reopens_in_fresh_process() {
    let folder = tempfile::tempdir().unwrap();
    let path = folder.path().join("cross-record.campaign");
    let mut client = Client::new();

    let description = client.ok("system.describe", json!({}));
    assert!(description["methods"]["location.update"]["properties"]["location"].is_object());
    assert!(description["methods"]["map.create"]["properties"]["image"].is_object());
    assert!(description["methods"]["history.undo"]["properties"]["expectedRevision"].is_object());

    let mut revision = 0;
    let created = client.ok(
        "campaign.new",
        json!({"name":"Cross-record","expectedRevision":revision}),
    );
    revision = self::revision(&created);

    let region = client.ok(
        "location.create",
        json!({"name":"Northern Reach","expectedRevision":revision}),
    );
    revision = self::revision(&region);
    let region_id = region["location"]["id"].as_str().unwrap().to_owned();

    let city = client.ok(
        "location.create",
        json!({"name":"Greyhaven","parentId":region_id,"expectedRevision":revision}),
    );
    revision = self::revision(&city);
    let city_id = city["location"]["id"].as_str().unwrap().to_owned();
    let mut duplicate_city =
        client.ok("location.get", json!({"locationId":city_id}))["location"].clone();
    duplicate_city["associatedNpcs"] = json!([
        {"targetId":"npc-1","label":"Resident"},
        {"targetId":"npc-1","label":"Former resident"}
    ]);
    let before_duplicate = client.ok("campaign.inspect", json!({}));
    let duplicate_link = client.request(
        "location.update",
        json!({"location":duplicate_city,"expectedRevision":revision}),
    );
    assert_eq!(error_code(&duplicate_link), "validation");
    assert_eq!(client.ok("campaign.inspect", json!({})), before_duplicate);
    let mut bad_image =
        client.ok("location.get", json!({"locationId":city_id}))["location"].clone();
    bad_image["image"] = json!({"type":"img","url":" "});
    let before_bad_image = client.ok("campaign.inspect", json!({}));
    let bad_image_response = client.request(
        "location.update",
        json!({"location":bad_image,"expectedRevision":revision}),
    );
    assert_eq!(error_code(&bad_image_response), "validation");
    assert_eq!(client.ok("campaign.inspect", json!({})), before_bad_image);

    let faction = client.ok(
        "faction.create",
        json!({"name":"Harbor Wardens","expectedRevision":revision}),
    );
    revision = self::revision(&faction);
    let faction_id = faction["faction"]["id"].as_str().unwrap().to_owned();

    let scout = client.ok(
        "npc.create",
        json!({"name":"Scout","expectedRevision":revision}),
    );
    revision = self::revision(&scout);
    let scout_id = scout["npc"]["id"].as_str().unwrap().to_owned();
    let guide = client.ok(
        "npc.create",
        json!({"name":"Guide","expectedRevision":revision}),
    );
    revision = self::revision(&guide);
    let guide_id = guide["npc"]["id"].as_str().unwrap().to_owned();

    let thread = client.ok(
        "thread.create",
        json!({"title":"Missing cargo","expectedRevision":revision}),
    );
    revision = self::revision(&thread);
    let thread_id = thread["thread"]["id"].as_str().unwrap().to_owned();

    let inventory = client.ok(
        "inventory.update",
        json!({
            "inventory": {"gold": 25, "entries": [
                {"id": "rope", "name": "Rope", "kind": "item", "quantity": 2, "note": " 50 feet "},
                {"id": "ore", "name": "Iron ore", "kind": "material", "quantity": 8, "note": ""}
            ]},
            "expectedRevision": revision
        }),
    );
    revision = self::revision(&inventory);
    assert_eq!(inventory["inventory"]["entries"][0]["note"], "50 feet");

    let item = client.ok(
        "item.create",
        json!({"name":"Compass","expectedRevision":revision}),
    );
    revision = self::revision(&item);
    let item_id = item["item"]["id"].as_str().unwrap().to_owned();
    let mut item_value = item["item"].clone();
    item_value["image"] = json!({"type":"img","url":"data:image/png;base64,aXRlbQ=="});
    item_value["description"] = json!("Points north.");
    item_value["gmNotes"] = json!("A private note.");
    item_value["values"] = json!({
        "tier": "c", "weight": 2.5, "attune": true, "inscription": "To the harbor"
    });
    let item_updated = client.ok(
        "item.update",
        json!({
            "item": item_value,
            "newFields": [
                {"id":"tier","label":"Tier","kind":"choice","options":[
                    {"id":"c","label":"C"},{"id":"b","label":"B"}]},
                {"id":"weight","label":"Weight","kind":"number","options":[]},
                {"id":"attune","label":"Attunement","kind":"checkbox","options":[]},
                {"id":"inscription","label":"Inscription","kind":"text","options":[]}
            ],
            "expectedRevision": revision
        }),
    );
    revision = self::revision(&item_updated);

    let map_a = client.ok(
        "map.create",
        json!({
            "name":"City map", "kind":"City",
            "image":{"type":"img","url":"data:image/png;base64,bWFwLWE="},
            "width":1400, "height":900,
            "locationIds":[region_id, city_id],
            "pins":[{"id":"","x":0.56,"y":0.65,"locationId":city_id,"label":" Harbor ","destinationMapId":null}],
            "party":{"x":0.2,"y":0.8},
            "expectedRevision": revision
        }),
    );
    revision = self::revision(&map_a);
    let map_a_id = map_a["map"]["id"].as_str().unwrap().to_owned();
    let pin_id = map_a["map"]["pins"][0]["id"].as_str().unwrap();
    assert!(!pin_id.is_empty(), "empty pin IDs are generated");
    assert_eq!(map_a["map"]["pins"][0]["label"], "Harbor");

    let map_b = client.ok(
        "map.create",
        json!({
            "name":"Inn map", "kind":"Building",
            "image":{"type":"img","url":"data:image/png;base64,bWFwLWI="},
            "width":800, "height":600,
            "locationIds":[city_id],
            "pins":[{"id":"inn-pin","x":0.3,"y":0.7,"locationId":city_id,
                "label":"","destinationMapId":map_a_id}],
            "party":null,
            "expectedRevision": revision
        }),
    );
    revision = self::revision(&map_b);
    let map_b_id = map_b["map"]["id"].as_str().unwrap().to_owned();
    let mut map_b_value = map_b["map"].clone();
    map_b_value["name"] = json!("Inn map (updated)");
    map_b_value["party"] = json!({"x":0.4,"y":0.6});
    let map_b_updated = client.ok(
        "map.update",
        json!({"map":map_b_value,"expectedRevision":revision}),
    );
    revision = self::revision(&map_b_updated);
    assert_eq!(map_b_updated["map"]["name"], "Inn map (updated)");
    assert_eq!(map_b_updated["map"]["party"], json!({"x":0.4,"y":0.6}));

    let npc_updated = client.ok(
        "npc.update",
        json!({
            "npcId": scout_id,
            "name": " Scout ",
            "notes": [
                {"type":"p","children":[{"text":"Private","bold":true}]},
                {"type":"img","url":"data:image/png;base64,bm90ZQ==","children":[{"text":""}]},
                {"type":"custom-block","value":{"keep":true},"children":[{"text":"Unknown node"}]}
            ],
            "presentation": {
                "banner":{"type":"img","url":"data:image/png;base64,YmFubmVy"},
                "portrait":{"type":"img","url":"data:image/png;base64,cG9ydHJhaXQ="},
                "playerDescription":"A patient scout.",
                "relationships":[{"targetId":guide_id,"label":"Ally"}],
                "locations":[{"targetId":city_id,"label":"Home"}],
                "factions":[{"targetId":faction_id,"label":"Member"}],
                "gmReference": gm_reference(),
                "statblock":{
                    "fieldSetId":"dnd-5.5e","fieldSetVersion":1,
                    "tokenImage":{"type":"img","url":"data:image/webp;base64,dG9rZW4="},
                    "data":{"armorClass":15,"actions":[{"name":"Track","description":"Follow a trail."}]}
                }
            },
            "expectedRevision": revision
        }),
    );
    revision = self::revision(&npc_updated);
    assert_eq!(npc_updated["npc"]["name"], "Scout");
    assert_eq!(npc_updated["npc"]["notes"][2]["type"], "custom-block");
    assert_eq!(
        npc_updated["npc"]["presentation"]["playerDescription"],
        "A patient scout."
    );
    assert_eq!(
        npc_updated["npc"]["presentation"]["statblock"]["data"]["armorClass"],
        15
    );
    assert_eq!(
        npc_updated["history"]["npc"]["presentation"]["gmReference"]["secrets"],
        "Saw a pale lantern."
    );

    let thread_before = client.ok("thread.get", json!({"threadId":thread_id}))["thread"].clone();
    let mut thread_value = thread_before;
    thread_value["title"] = json!("The Missing Morrow");
    thread_value["status"] = json!("active");
    thread_value["playerReminder"] = json!("The Morrow vanished with a guild shipment.");
    thread_value["origin"] = json!("A request from the dockworkers' guild.");
    thread_value["sourceLabel"] = json!("Rumor");
    thread_value["currentSituation"] = json!([
        {"type":"p","children":[{"text":"The ledger points to the harbor."}]},
        {"type":"img","url":"data:image/png;base64,dGhyZWFk","caption":[{"text":"A clue"}],"children":[{"text":""}]}
    ]);
    thread_value["gmPossibilities"] = json!([
        {"type":"p","children":[{"text":"The guild sends a negotiator."}]}
    ]);
    thread_value["people"] = json!([{"targetId":scout_id,"label":"Witness"}]);
    thread_value["locations"] = json!([{"targetId":city_id,"label":"Last seen"}]);
    thread_value["factions"] = json!([{"targetId":faction_id,"label":"Involved"}]);
    let thread_updated = client.ok(
        "thread.update",
        json!({"thread":thread_value,"expectedRevision":revision}),
    );
    revision = self::revision(&thread_updated);

    let mut city_value =
        client.ok("location.get", json!({"locationId":city_id}))["location"].clone();
    city_value["locationType"] = json!("City");
    city_value["tags"] = json!(["Harbor", "Northern Reach"]);
    city_value["partyKnowledge"] = json!("known");
    city_value["publicDescription"] = json!("A harbor city.");
    city_value["gmNotes"] = json!("The old city was built over a drowned shrine.");
    city_value["gmReference"] = json!({
        "atmosphere":"Salt and bells","background":"Old harbor","currentSituation":"A festival",
        "secrets":"A drowned shrine"
    });
    city_value["banner"] = json!({"type":"img","url":"data:image/png;base64,Y2l0eS1iYW5uZXI="});
    city_value["image"] = json!({"type":"img","url":"data:image/png;base64,Y2l0eS1zY2VuZQ=="});
    city_value["associatedNpcs"] = json!([{"targetId":scout_id,"label":"Resident"}]);
    city_value["associatedFactions"] = json!([{"targetId":faction_id,"label":"Patrols"}]);
    let city_updated = client.ok(
        "location.update",
        json!({"location":city_value,"expectedRevision":revision}),
    );
    revision = self::revision(&city_updated);

    let mut faction_value =
        client.ok("faction.get", json!({"factionId":faction_id}))["faction"].clone();
    faction_value["description"] = json!("Protectors of the harbor.");
    faction_value["gmNotes"] = json!("Suspects a replaced cargo tally.");
    faction_value["image"] = json!({"type":"img","url":"data:image/png;base64,ZmFjdGlvbg=="});
    let faction_updated = client.ok(
        "faction.update",
        json!({"faction":faction_value,"expectedRevision":revision}),
    );
    revision = self::revision(&faction_updated);

    let deleted = client.ok(
        "map.delete",
        json!({"mapId":map_a_id,"expectedRevision":revision}),
    );
    revision = self::revision(&deleted);
    let map_b_after_delete = client.ok("map.get", json!({"mapId":map_b_id}));
    assert_eq!(
        map_b_after_delete["map"]["pins"][0]["destinationMapId"],
        Value::Null
    );
    let undone = client.ok("history.undo", json!({"expectedRevision":revision}));
    revision = self::revision(&undone);
    assert_eq!(undone["label"], "Delete map");
    assert_eq!(
        client.ok("map.get", json!({"mapId":map_b_id}))["map"]["pins"][0]["destinationMapId"],
        map_a_id
    );
    let redone = client.ok("history.redo", json!({"expectedRevision":revision}));
    revision = self::revision(&redone);
    assert_eq!(
        client.ok("map.get", json!({"mapId":map_b_id}))["map"]["pins"][0]["destinationMapId"],
        Value::Null
    );
    let undone_again = client.ok("history.undo", json!({"expectedRevision":revision}));
    revision = self::revision(&undone_again);

    let saved = client.ok(
        "campaign.save",
        json!({"path":path,"expectedRevision":revision}),
    );
    assert_eq!(saved["dirty"], false);
    let saved_campaign = saved["campaign"].clone();
    let assets = std::fs::read_dir(path.join("assets")).unwrap().count();
    assert!(assets >= 10, "expected hashed assets, found {assets}");
    for entry in std::fs::read_dir(path.join("assets")).unwrap() {
        let name = entry.unwrap().file_name().to_string_lossy().into_owned();
        let (hash, extension) = name.split_once('.').unwrap();
        assert_eq!(hash.len(), 64, "asset {name} must be content-hashed");
        assert!(!extension.is_empty());
    }
    client.close();

    let mut reopened = Client::new();
    let loaded = reopened.ok("campaign.open", json!({"path":path,"expectedRevision":0}));
    let reopen_revision = self::revision(&loaded);
    assert_eq!(loaded["campaign"], saved_campaign);
    assert_eq!(loaded["dirty"], false);
    assert_eq!(loaded["campaign"]["locations"].as_array().unwrap().len(), 2);
    assert_eq!(loaded["campaign"]["npcs"].as_array().unwrap().len(), 2);
    assert_eq!(loaded["campaign"]["threads"].as_array().unwrap().len(), 1);
    assert_eq!(loaded["campaign"]["items"].as_array().unwrap().len(), 1);
    assert_eq!(loaded["campaign"]["items"][0]["id"], item_id);
    assert_eq!(
        loaded["campaign"]["itemFields"].as_array().unwrap().len(),
        4
    );
    assert_eq!(loaded["campaign"]["maps"].as_array().unwrap().len(), 2);
    assert_eq!(loaded["campaign"]["inventory"]["gold"], 25);
    let loaded_scout = &loaded["campaign"]["npcs"][0];
    assert_eq!(
        loaded_scout["presentation"]["playerDescription"],
        "A patient scout."
    );
    assert_eq!(
        loaded_scout["presentation"]["relationships"][0]["targetId"],
        guide_id
    );
    assert_eq!(
        loaded_scout["presentation"]["locations"][0]["targetId"],
        city_id
    );
    assert_eq!(
        loaded_scout["presentation"]["factions"][0]["targetId"],
        faction_id
    );
    assert_eq!(
        loaded_scout["presentation"]["banner"]["url"],
        "data:image/png;base64,YmFubmVy"
    );
    assert_eq!(
        loaded_scout["presentation"]["statblock"]["tokenImage"]["url"],
        "data:image/webp;base64,dG9rZW4="
    );
    assert_eq!(loaded_scout["notes"][2]["type"], "custom-block");
    let loaded_thread = &loaded["campaign"]["threads"][0];
    assert_eq!(loaded_thread["title"], "The Missing Morrow");
    assert_eq!(loaded_thread["people"][0]["targetId"], scout_id);
    assert_eq!(
        loaded_thread["currentSituation"][1]["caption"][0]["text"],
        "A clue"
    );
    assert_eq!(
        loaded["campaign"]["items"][0]["values"],
        json!({"tier":"c","weight":2.5,"attune":true,"inscription":"To the harbor"})
    );
    let loaded_map_b = loaded["campaign"]["maps"]
        .as_array()
        .unwrap()
        .iter()
        .find(|map| map["id"] == map_b_id)
        .unwrap();
    assert_eq!(loaded_map_b["pins"][0]["destinationMapId"], map_a_id);
    assert_eq!(loaded_map_b["name"], "Inn map (updated)");
    assert_eq!(loaded_map_b["party"], json!({"x":0.4,"y":0.6}));
    let loaded_city = loaded["campaign"]["locations"]
        .as_array()
        .unwrap()
        .iter()
        .find(|location| location["id"] == city_id)
        .unwrap();
    assert_eq!(loaded_city["partyKnowledge"], "known");
    assert_eq!(loaded_city["associatedNpcs"][0]["targetId"], scout_id);
    assert_eq!(loaded_city["associatedFactions"][0]["targetId"], faction_id);
    assert_eq!(
        reopened.ok("history.status", json!({}))["history"]["canUndo"],
        false,
        "edit history must not survive a process restart"
    );
    let no_history = reopened.request("history.undo", json!({"expectedRevision":reopen_revision}));
    assert_eq!(error_code(&no_history), "conflict");

    // A second save with no path writes the same open package and reopens cleanly.
    let resaved = reopened.ok("campaign.save", json!({"expectedRevision":reopen_revision}));
    let resave_revision = self::revision(&resaved);
    assert_eq!(resaved["dirty"], false);
    reopened.close();

    let mut third = Client::new();
    let loaded_again = third.ok("campaign.open", json!({"path":path,"expectedRevision":0}));
    assert_eq!(loaded_again["campaign"], resaved["campaign"]);
    assert_eq!(third.ok("campaign.inspect", json!({}))["dirty"], false);
    assert_eq!(
        third.ok("campaign.inspect", json!({}))["revision"],
        self::revision(&loaded_again)
    );
    let _ = resave_revision;
    third.close();
}

#[test]
fn rejected_actions_preserve_state_history_and_persisted_package() {
    let folder = tempfile::tempdir().unwrap();
    let path = folder.path().join("rejections.campaign");
    let mut client = Client::new();
    let mut revision = 0;
    let created = client.ok(
        "campaign.new",
        json!({"name":"Rejections","expectedRevision":revision}),
    );
    revision = self::revision(&created);

    let baseline = client.ok("campaign.inspect", json!({}));
    let history_baseline = client.ok("history.status", json!({}));
    let stale = client.request(
        "location.create",
        json!({"name":"Lost place","expectedRevision":0}),
    );
    assert_eq!(error_code(&stale), "conflict");
    assert_eq!(stale["error"]["data"]["expectedRevision"], 0);
    assert_eq!(stale["error"]["data"]["actualRevision"], revision);
    let invalid = client.request(
        "location.create",
        json!({"name":" ","expectedRevision":revision}),
    );
    assert_eq!(error_code(&invalid), "validation");
    assert_eq!(client.ok("campaign.inspect", json!({})), baseline);
    assert_eq!(
        client.ok("history.status", json!({}))["history"]["length"],
        history_baseline["history"]["length"]
    );

    let region = client.ok(
        "location.create",
        json!({"name":"Northern Reach","expectedRevision":revision}),
    );
    revision = self::revision(&region);
    let region_id = region["location"]["id"].as_str().unwrap().to_owned();
    let city = client.ok(
        "location.create",
        json!({"name":"Greyhaven","parentId":region_id,"expectedRevision":revision}),
    );
    revision = self::revision(&city);
    let city_id = city["location"]["id"].as_str().unwrap().to_owned();
    let mut region_value =
        client.ok("location.get", json!({"locationId":region_id}))["location"].clone();
    region_value["parentId"] = json!(city_id);
    let before_cycle = client.ok("campaign.inspect", json!({}));
    let cycle = client.request(
        "location.update",
        json!({"location":region_value,"expectedRevision":revision}),
    );
    assert_eq!(error_code(&cycle), "validation");
    assert_eq!(client.ok("campaign.inspect", json!({})), before_cycle);

    let npc = client.ok(
        "npc.create",
        json!({"name":"Scout","expectedRevision":revision}),
    );
    revision = self::revision(&npc);
    let npc_id = npc["npc"]["id"].as_str().unwrap().to_owned();
    let mut npc_value = client.ok("npc.get", json!({"npcId":npc_id}))["npc"].clone();
    npc_value["presentation"]["relationships"] = json!([{"targetId":npc_id,"label":"Self"}]);
    let before_self_link = client.ok("campaign.inspect", json!({}));
    let history_before_self_link = client.ok("history.status", json!({}));
    let self_link = client.request(
        "npc.update",
        json!({"npcId":npc_id,"presentation":npc_value["presentation"].clone(),"expectedRevision":revision}),
    );
    assert_eq!(error_code(&self_link), "validation");
    assert_eq!(client.ok("campaign.inspect", json!({})), before_self_link);
    assert_eq!(
        client.ok("history.status", json!({}))["history"]["length"],
        history_before_self_link["history"]["length"]
    );

    let mut bad_notes = client.ok("npc.get", json!({"npcId":npc_id}))["npc"].clone();
    bad_notes["notes"] = json!([{"type":"img","url":" ","children":[{"text":""}]}]);
    let bad_note_image = client.request(
        "npc.update",
        json!({"npcId":npc_id,"notes":bad_notes["notes"].clone(),"expectedRevision":revision}),
    );
    assert_eq!(error_code(&bad_note_image), "validation");
    assert_eq!(client.ok("campaign.inspect", json!({})), before_self_link);
    assert_eq!(
        client.ok("history.status", json!({}))["history"]["length"],
        history_before_self_link["history"]["length"]
    );

    let bad_inventory = client.request(
        "inventory.update",
        json!({
            "inventory":{"gold":1,"entries":[{"id":"rope","name":"Rope","kind":"item","quantity":0,"note":""}]},
            "expectedRevision": revision
        }),
    );
    assert_eq!(error_code(&bad_inventory), "validation");

    let item = client.ok(
        "item.create",
        json!({"name":"Compass","expectedRevision":revision}),
    );
    revision = self::revision(&item);
    let item_id = item["item"]["id"].as_str().unwrap().to_owned();
    let mut item_value = item["item"].clone();
    item_value["values"] = json!({"unknown":"value"});
    let bad_item = client.request(
        "item.update",
        json!({"item":item_value,"newFields":[],"expectedRevision":revision}),
    );
    assert_eq!(error_code(&bad_item), "validation");
    assert_eq!(
        client.ok("item.get", json!({"itemId":item_id}))["item"]["name"],
        "Compass"
    );

    let bad_map = client.request(
        "map.create",
        json!({
            "name":"Bad map","kind":"City",
            "image":{"type":"img","url":"data:image/png;base64,bWFw"},
            "width":100,"height":100,
            "pins":[{"id":"pin","x":1.5,"y":0.5,"locationId":city_id,"label":"","destinationMapId":null}],
            "expectedRevision": revision
        }),
    );
    assert_eq!(error_code(&bad_map), "validation");

    let before_save = client.ok("campaign.inspect", json!({}));
    let blocked = folder.path().join("blocked.campaign");
    std::fs::create_dir(&blocked).unwrap();
    let failed_save = client.request(
        "campaign.save",
        json!({"path":blocked,"expectedRevision":revision}),
    );
    assert_eq!(error_code(&failed_save), "storage");
    assert_eq!(client.ok("campaign.inspect", json!({})), before_save);
    let saved = client.ok(
        "campaign.save",
        json!({"path":path,"expectedRevision":revision}),
    );
    revision = self::revision(&saved);
    assert_eq!(saved["dirty"], false);
    assert!(
        blocked.is_dir(),
        "the failed destination is not silently removed"
    );

    // Dirty switch protection, including preserving all state.
    let extra = client.ok(
        "location.create",
        json!({"name":"Harbor","expectedRevision":revision}),
    );
    revision = self::revision(&extra);
    let dirty = client.ok("campaign.inspect", json!({}));
    let dirty_switch = client.request(
        "campaign.new",
        json!({"name":"Should not replace","expectedRevision":revision}),
    );
    assert_eq!(error_code(&dirty_switch), "unsaved_changes");
    assert_eq!(client.ok("campaign.inspect", json!({})), dirty);

    // A future database version is rejected without replacing the active campaign.
    let future = folder.path().join("future.campaign");
    std::fs::create_dir(&future).unwrap();
    let db_path = future.join("campaign.sqlite");
    let runtime = tokio::runtime::Builder::new_current_thread()
        .enable_all()
        .build()
        .unwrap();
    runtime.block_on(async {
        let database = turso::Builder::new_local(db_path.to_str().unwrap())
            .build()
            .await
            .unwrap();
        let connection = database.connect().unwrap();
        connection
            .execute("PRAGMA user_version = 999", ())
            .await
            .unwrap();
    });
    let future_open = client.request(
        "campaign.open",
        json!({"path":future,"expectedRevision":revision,"discardChanges":true}),
    );
    assert_eq!(error_code(&future_open), "storage");
    assert_eq!(client.ok("campaign.inspect", json!({})), dirty);

    // Explicit discard allows the switch.
    let switched = client.ok(
        "campaign.new",
        json!({"name":"After discard","expectedRevision":revision,"discardChanges":true}),
    );
    assert_eq!(self::revision(&switched), revision + 1);
    assert_eq!(switched["campaign"]["name"], "After discard");
    assert_eq!(switched["campaign"]["locations"], json!([]));
    client.close();
}

#[test]
fn campaign_history_covers_creation_updates_deletion_and_noop_without_restart() {
    let folder = tempfile::tempdir().unwrap();
    let path = folder.path().join("history.campaign");
    let mut client = Client::new();
    let mut revision = 0;
    let created = client.ok(
        "campaign.new",
        json!({"name":"History","expectedRevision":revision}),
    );
    revision = self::revision(&created);

    let location = client.ok(
        "location.create",
        json!({"name":"Village","expectedRevision":revision}),
    );
    revision = self::revision(&location);
    let location_id = location["location"]["id"].as_str().unwrap().to_owned();
    let item = client.ok(
        "item.create",
        json!({"name":"Rope","expectedRevision":revision}),
    );
    revision = self::revision(&item);
    let item_id = item["item"]["id"].as_str().unwrap().to_owned();
    let thread = client.ok(
        "thread.create",
        json!({"title":"A rumor","expectedRevision":revision}),
    );
    revision = self::revision(&thread);

    let status = client.ok("history.status", json!({}));
    assert_eq!(status["history"]["length"], 3);
    assert_eq!(status["history"]["canUndo"], true);

    let undo_thread = client.ok("history.undo", json!({"expectedRevision":revision}));
    revision = self::revision(&undo_thread);
    assert_eq!(undo_thread["label"], "Create story thread");
    assert_eq!(
        client.request("thread.get", json!({"threadId":thread["thread"]["id"]}))["error"]["data"]
            ["code"],
        "not_found"
    );
    let undo_item = client.ok("history.undo", json!({"expectedRevision":revision}));
    revision = self::revision(&undo_item);
    assert_eq!(undo_item["label"], "Create item");
    let undo_location = client.ok("history.undo", json!({"expectedRevision":revision}));
    revision = self::revision(&undo_location);
    assert_eq!(undo_location["label"], "Create location");
    let empty = client.ok("history.status", json!({}));
    assert_eq!(empty["history"]["canUndo"], false);
    assert_eq!(empty["history"]["canRedo"], true);
    assert_eq!(empty["history"]["redoLabel"], "Create location");

    for _ in 0..3 {
        let redone = client.ok("history.redo", json!({"expectedRevision":revision}));
        revision = self::revision(&redone);
    }
    assert_eq!(
        client.ok("history.status", json!({}))["history"]["canRedo"],
        false
    );
    assert_eq!(
        client.ok("location.get", json!({"locationId":location_id}))["location"]["name"],
        "Village"
    );

    let mut location_value =
        client.ok("location.get", json!({"locationId":location_id}))["location"].clone();
    let noop = client.ok(
        "location.update",
        json!({"location":location_value.clone(),"expectedRevision":revision}),
    );
    assert_eq!(self::revision(&noop), revision);
    assert_eq!(
        client.ok("history.status", json!({}))["history"]["length"],
        3,
        "a no-op update must not add history"
    );
    location_value["publicDescription"] = json!("A quiet village.");
    let updated = client.ok(
        "location.update",
        json!({"location":location_value,"expectedRevision":revision}),
    );
    revision = self::revision(&updated);
    assert_eq!(updated["location"]["publicDescription"], "A quiet village.");
    let undo_update = client.ok("history.undo", json!({"expectedRevision":revision}));
    revision = self::revision(&undo_update);
    assert_eq!(undo_update["label"], "Edit location");
    assert_eq!(
        client.ok("location.get", json!({"locationId":location_id}))["location"]
            ["publicDescription"],
        ""
    );
    let redo_update = client.ok("history.redo", json!({"expectedRevision":revision}));
    revision = self::revision(&redo_update);
    assert_eq!(
        client.ok("location.get", json!({"locationId":location_id}))["location"]
            ["publicDescription"],
        "A quiet village."
    );

    let deleted = client.ok(
        "item.delete",
        json!({"itemId":item_id,"expectedRevision":revision}),
    );
    revision = self::revision(&deleted);
    assert_eq!(
        client.request("item.get", json!({"itemId":item_id}))["error"]["data"]["code"],
        "not_found"
    );
    let undo_delete = client.ok("history.undo", json!({"expectedRevision":revision}));
    revision = self::revision(&undo_delete);
    assert_eq!(undo_delete["label"], "Delete item");
    assert_eq!(
        client.ok("item.get", json!({"itemId":item_id}))["item"]["name"],
        "Rope"
    );
    let redo_delete = client.ok("history.redo", json!({"expectedRevision":revision}));
    revision = self::revision(&redo_delete);
    let undo_delete_again = client.ok("history.undo", json!({"expectedRevision":revision}));
    revision = self::revision(&undo_delete_again);

    // A new edit after undo truncates the redo branch.
    let undone = client.ok("history.undo", json!({"expectedRevision":revision}));
    revision = self::revision(&undone);
    let mut location_value =
        client.ok("location.get", json!({"locationId":location_id}))["location"].clone();
    location_value["publicDescription"] = json!("Changed after undo.");
    let new_edit = client.ok(
        "location.update",
        json!({"location":location_value,"expectedRevision":revision}),
    );
    revision = self::revision(&new_edit);
    assert_eq!(
        client.ok("history.status", json!({}))["history"]["canRedo"],
        false
    );
    let stale_redo = client.request("history.redo", json!({"expectedRevision":revision}));
    assert_eq!(error_code(&stale_redo), "conflict");

    let saved = client.ok(
        "campaign.save",
        json!({"path":path,"expectedRevision":revision}),
    );
    revision = self::revision(&saved);
    client.close();

    let mut reopened = Client::new();
    let loaded = reopened.ok("campaign.open", json!({"path":path,"expectedRevision":0}));
    let loaded_revision = self::revision(&loaded);
    assert_eq!(
        reopened.ok("history.status", json!({}))["history"]["canUndo"],
        false
    );
    assert_eq!(
        reopened.ok("history.status", json!({}))["history"]["canRedo"],
        false
    );
    let undo_without_history =
        reopened.request("history.undo", json!({"expectedRevision":loaded_revision}));
    assert_eq!(error_code(&undo_without_history), "conflict");
    assert_eq!(
        reopened.ok("location.get", json!({"locationId":location_id}))["location"]
            ["publicDescription"],
        "Changed after undo."
    );
    reopened.close();
    let _ = revision;
}

#[test]
fn asset_import_and_corrupt_or_missing_assets_keep_active_campaign() {
    let folder = tempfile::tempdir().unwrap();
    let path = folder.path().join("assets.campaign");
    let mut client = Client::new();
    let mut revision = 0;
    let created = client.ok(
        "campaign.new",
        json!({"name":"Assets","expectedRevision":revision}),
    );
    revision = self::revision(&created);

    let before_save = client.request(
        "asset.import",
        json!({"data":"data:image/png;base64,aW1hZ2U="}),
    );
    assert_eq!(error_code(&before_save), "no_storage");
    let saved = client.ok(
        "campaign.save",
        json!({"path":path,"expectedRevision":revision}),
    );
    revision = self::revision(&saved);

    let invalid_import =
        client.request("asset.import", json!({"data":"data:image/png;base64,!!!"}));
    assert_eq!(error_code(&invalid_import), "storage");
    let unsupported_import = client.request(
        "asset.import",
        json!({"data":"data:image/svg+xml;base64,PHN2Zy8+"}),
    );
    assert_eq!(error_code(&unsupported_import), "validation");
    assert_eq!(
        client.ok("campaign.inspect", json!({}))["dirty"],
        false,
        "a failed import is not a campaign edit"
    );
    let imported = client.ok(
        "asset.import",
        json!({"data":"data:image/png;base64,aW1hZ2U="}),
    );
    assert_eq!(self::revision(&imported), revision);
    let url = imported["url"].as_str().unwrap().to_owned();
    assert!(url.starts_with("assets/") && url.ends_with(".png"));
    assert!(path.join(&url).is_file());
    assert_eq!(
        client.ok("campaign.inspect", json!({}))["dirty"],
        false,
        "importing an asset is preparation, not a campaign edit"
    );

    let location = client.ok(
        "location.create",
        json!({"name":"Village","expectedRevision":revision}),
    );
    revision = self::revision(&location);
    let location_id = location["location"]["id"].as_str().unwrap().to_owned();
    let mut location_value =
        client.ok("location.get", json!({"locationId":location_id}))["location"].clone();
    location_value["image"] = json!({"type":"img","url":url});
    let updated = client.ok(
        "location.update",
        json!({"location":location_value,"expectedRevision":revision}),
    );
    revision = self::revision(&updated);
    let saved = client.ok("campaign.save", json!({"expectedRevision":revision}));
    revision = self::revision(&saved);
    client.close();

    let bytes = std::fs::read(path.join(&url)).unwrap();
    std::fs::write(path.join(&url), b"corrupt").unwrap();
    let mut observer = Client::new();
    let active = observer.ok(
        "campaign.new",
        json!({"name":"Keep me","expectedRevision":0}),
    );
    let active_revision = self::revision(&active);
    let corrupt = observer.request(
        "campaign.open",
        json!({"path":path,"expectedRevision":active_revision,"discardChanges":true}),
    );
    assert_eq!(error_code(&corrupt), "storage");
    assert_eq!(observer.ok("campaign.inspect", json!({})), active);
    std::fs::write(path.join(&url), &bytes).unwrap();
    let reopened = observer.ok(
        "campaign.open",
        json!({"path":path,"expectedRevision":active_revision,"discardChanges":true}),
    );
    let reopened_revision = self::revision(&reopened);
    assert_eq!(
        reopened["campaign"]["locations"][0]["image"]["url"],
        format!("data:image/png;base64,{}", "aW1hZ2U=")
    );
    observer.ok("campaign.new", json!({"name":"Second observer","expectedRevision":reopened_revision,"discardChanges":false}));
    std::fs::remove_file(path.join(&url)).unwrap();
    let missing = observer.request(
        "campaign.open",
        json!({"path":path,"expectedRevision":reopened_revision + 1,"discardChanges":true}),
    );
    assert_eq!(error_code(&missing), "storage");
    std::fs::write(path.join(&url), &bytes).unwrap();
    let reopened_again = observer.ok(
        "campaign.open",
        json!({"path":path,"expectedRevision":reopened_revision + 1,"discardChanges":true}),
    );
    assert_eq!(self::revision(&reopened_again), reopened_revision + 2);
    observer.close();
    let _ = revision;
}

#[test]
fn item_fields_and_inventory_history_restore_compound_values() {
    let mut client = Client::new();
    let mut revision = 0;
    let created = client.ok(
        "campaign.new",
        json!({"name":"Field history","expectedRevision":revision}),
    );
    revision = self::revision(&created);
    let item = client.ok(
        "item.create",
        json!({"name":"Compass","expectedRevision":revision}),
    );
    revision = self::revision(&item);
    let item_id = item["item"]["id"].as_str().unwrap().to_owned();
    let mut item_value = item["item"].clone();
    item_value["values"] = json!({"tier":"c"});
    let fields = json!([{"id":"tier","label":"Tier","kind":"choice","options":[
        {"id":"c","label":"C"},{"id":"b","label":"B"}]}]);
    let updated = client.ok(
        "item.update",
        json!({"item":item_value,"newFields":fields,"expectedRevision":revision}),
    );
    revision = self::revision(&updated);
    assert_eq!(updated["itemFields"].as_array().unwrap().len(), 1);
    assert_eq!(
        client.ok("history.status", json!({}))["history"]["length"],
        2
    );

    let undone = client.ok("history.undo", json!({"expectedRevision":revision}));
    revision = self::revision(&undone);
    assert_eq!(undone["label"], "Edit item");
    let after_undo = client.ok("item.get", json!({"itemId":item_id}));
    assert_eq!(after_undo["item"]["values"], json!({}));
    assert_eq!(
        client.ok("item.list", json!({}))["itemFields"],
        json!([]),
        "undo restores field definitions and values together"
    );
    let redone = client.ok("history.redo", json!({"expectedRevision":revision}));
    revision = self::revision(&redone);
    assert_eq!(
        client.ok("item.get", json!({"itemId":item_id}))["item"]["values"],
        json!({"tier":"c"})
    );
    assert_eq!(
        client.ok("item.list", json!({}))["itemFields"]
            .as_array()
            .unwrap()
            .len(),
        1
    );

    let redone_item = client.ok("item.get", json!({"itemId":item_id}))["item"].clone();
    let noop_item = client.ok(
        "item.update",
        json!({"item":redone_item,"newFields":[],"expectedRevision":revision}),
    );
    assert_eq!(self::revision(&noop_item), revision);
    assert_eq!(
        client.ok("history.status", json!({}))["history"]["length"],
        2
    );

    let inventory = client.ok(
        "inventory.update",
        json!({
            "inventory":{"gold":10,"entries":[
                {"id":"rope","name":"Rope","kind":"item","quantity":2,"note":""}]},
            "expectedRevision": revision
        }),
    );
    revision = self::revision(&inventory);
    let undo_inventory = client.ok("history.undo", json!({"expectedRevision":revision}));
    revision = self::revision(&undo_inventory);
    assert_eq!(
        client.ok("inventory.get", json!({}))["inventory"],
        json!({"gold":0,"entries":[]})
    );
    let redo_inventory = client.ok("history.redo", json!({"expectedRevision":revision}));
    let revision_after_redo = self::revision(&redo_inventory);
    assert_eq!(
        client.ok("inventory.get", json!({}))["inventory"]["gold"],
        10
    );
    let redone_inventory = client.ok("inventory.get", json!({}))["inventory"].clone();
    let noop_inventory = client.ok(
        "inventory.update",
        json!({"inventory":redone_inventory,"expectedRevision":revision_after_redo}),
    );
    assert_eq!(self::revision(&noop_inventory), revision_after_redo);
    client.close();
}

fn assert_rejected(client: &mut Client, method: &str, params: Value, expected_code: &str) {
    let before = client.ok("campaign.inspect", json!({}));
    let history = client.ok("history.status", json!({}));
    let response = client.request(method, params);
    assert_eq!(
        error_code(&response),
        expected_code,
        "{method} returned {response}"
    );
    assert_eq!(
        client.ok("campaign.inspect", json!({})),
        before,
        "{method} changed campaign state"
    );
    assert_eq!(
        client.ok("history.status", json!({}))["history"]["length"],
        history["history"]["length"],
        "{method} changed edit history"
    );
}

#[test]
fn validation_rejections_preserve_state_and_history() {
    let folder = tempfile::tempdir().unwrap();
    let mut client = Client::new();
    let mut revision = 0;
    let created = client.ok(
        "campaign.new",
        json!({"name":"Validation","expectedRevision":revision}),
    );
    revision = self::revision(&created);

    for (method, params) in [
        (
            "location.create",
            json!({"name":" ","expectedRevision":revision}),
        ),
        (
            "location.create",
            json!({"name":"Orphan","parentId":"missing","expectedRevision":revision}),
        ),
        (
            "faction.create",
            json!({"name":" ","expectedRevision":revision}),
        ),
        (
            "item.create",
            json!({"name":" ","expectedRevision":revision}),
        ),
        (
            "thread.create",
            json!({"title":" ","expectedRevision":revision}),
        ),
        (
            "npc.create",
            json!({"name":" ","expectedRevision":revision}),
        ),
        (
            "map.create",
            json!({
                "name":" ","kind":"City",
                "image":{"type":"img","url":"data:image/png;base64,bWFw"},
                "width":100,"height":100,
                "expectedRevision":revision
            }),
        ),
        (
            "map.create",
            json!({
                "name":"Bad kind","kind":"Village",
                "image":{"type":"img","url":"data:image/png;base64,bWFw"},
                "width":100,"height":100,
                "expectedRevision":revision
            }),
        ),
    ] {
        assert_rejected(&mut client, method, params, "validation");
    }

    let location = client.ok(
        "location.create",
        json!({"name":"Village","expectedRevision":revision}),
    );
    revision = self::revision(&location);
    let location_id = location["location"]["id"].as_str().unwrap().to_owned();
    let faction = client.ok(
        "faction.create",
        json!({"name":"Wardens","expectedRevision":revision}),
    );
    revision = self::revision(&faction);
    let faction_id = faction["faction"]["id"].as_str().unwrap().to_owned();
    let item = client.ok(
        "item.create",
        json!({"name":"Rope","expectedRevision":revision}),
    );
    revision = self::revision(&item);
    let item_id = item["item"]["id"].as_str().unwrap().to_owned();
    let thread = client.ok(
        "thread.create",
        json!({"title":"A rumor","expectedRevision":revision}),
    );
    revision = self::revision(&thread);
    let thread_id = thread["thread"]["id"].as_str().unwrap().to_owned();
    let npc = client.ok(
        "npc.create",
        json!({"name":"Scout","expectedRevision":revision}),
    );
    revision = self::revision(&npc);
    let npc_id = npc["npc"]["id"].as_str().unwrap().to_owned();
    let map = client.ok(
        "map.create",
        json!({
            "name":"City map","kind":"City",
            "image":{"type":"img","url":"data:image/png;base64,bWFw"},
            "width":100,"height":100,
            "pins":[{"id":"pin-1","x":0.5,"y":0.5,"locationId":location_id,
                "label":"","destinationMapId":null}],
            "expectedRevision": revision
        }),
    );
    revision = self::revision(&map);
    let map_id = map["map"]["id"].as_str().unwrap().to_owned();

    let mut faction_value =
        client.ok("faction.get", json!({"factionId":faction_id}))["faction"].clone();
    faction_value["name"] = json!(" ");
    assert_rejected(
        &mut client,
        "faction.update",
        json!({"faction":faction_value,"expectedRevision":revision}),
        "validation",
    );

    let item_value = client.ok("item.get", json!({"itemId":item_id}))["item"].clone();
    let duplicate_fields = json!([
        {"id":"tier","label":"Tier","kind":"choice","options":[{"id":"c","label":"C"}]},
        {"id":"tier","label":"Tier again","kind":"text","options":[]}
    ]);
    assert_rejected(
        &mut client,
        "item.update",
        json!({"item":item_value.clone(),"newFields":duplicate_fields,"expectedRevision":revision}),
        "validation",
    );
    let bad_choices = json!([
        {"id":"tier","label":"Tier","kind":"choice","options":[
            {"id":"c","label":"C"},{"id":"b","label":"c"}]}
    ]);
    assert_rejected(
        &mut client,
        "item.update",
        json!({"item":item_value,"newFields":bad_choices,"expectedRevision":revision}),
        "validation",
    );

    let mut thread_value = client.ok("thread.get", json!({"threadId":thread_id}))["thread"].clone();
    thread_value["status"] = json!("unknown");
    assert_rejected(
        &mut client,
        "thread.update",
        json!({"thread":thread_value.clone(),"expectedRevision":revision}),
        "validation",
    );
    thread_value["status"] = json!("active");
    thread_value["people"] = json!([
        {"targetId":npc_id,"label":"Witness"},
        {"targetId":npc_id,"label":"Again"}
    ]);
    assert_rejected(
        &mut client,
        "thread.update",
        json!({"thread":thread_value,"expectedRevision":revision}),
        "validation",
    );

    let mut map_value = client.ok("map.get", json!({"mapId":map_id}))["map"].clone();
    map_value["pins"][0]["destinationMapId"] = json!("missing-map");
    assert_rejected(
        &mut client,
        "map.update",
        json!({"map":map_value.clone(),"expectedRevision":revision}),
        "validation",
    );
    map_value["pins"][0]["destinationMapId"] = Value::Null;
    map_value["pins"][0]["x"] = json!(1.5);
    assert_rejected(
        &mut client,
        "map.update",
        json!({"map":map_value,"expectedRevision":revision}),
        "validation",
    );

    let mut npc_value = client.ok("npc.get", json!({"npcId":npc_id}))["npc"].clone();
    npc_value["presentation"]["relationships"] = json!([
        {"targetId":"npc-2","label":"Ally"},
        {"targetId":"npc-2","label":"Friend"}
    ]);
    assert_rejected(
        &mut client,
        "npc.update",
        json!({"npcId":npc_id,"presentation":npc_value.clone()["presentation"],"expectedRevision":revision}),
        "validation",
    );
    npc_value["presentation"]["relationships"] = json!([]);
    npc_value["notes"] = json!([]);
    assert_rejected(
        &mut client,
        "npc.update",
        json!({"npcId":npc_id,"notes":npc_value["notes"],"expectedRevision":revision}),
        "validation",
    );

    let mut location_value =
        client.ok("location.get", json!({"locationId":location_id}))["location"].clone();
    location_value["associatedFactions"] = json!([
        {"targetId":faction_id,"label":"Patrols"},
        {"targetId":faction_id,"label":"Again"}
    ]);
    assert_rejected(
        &mut client,
        "location.update",
        json!({"location":location_value,"expectedRevision":revision}),
        "validation",
    );

    assert_rejected(
        &mut client,
        "inventory.update",
        json!({
            "inventory":{"gold":0,"entries":[
                {"id":"rope","name":"Rope","kind":"unknown","quantity":1,"note":""}]},
            "expectedRevision": revision
        }),
        "validation",
    );
    assert_rejected(
        &mut client,
        "item.delete",
        json!({"itemId":"missing","expectedRevision":revision}),
        "not_found",
    );
    assert_rejected(
        &mut client,
        "map.delete",
        json!({"mapId":"missing","expectedRevision":revision}),
        "not_found",
    );

    // Save Copy is explicitly rejected while the package is open.
    let path = folder.path().join("validation.campaign");
    let saved = client.ok(
        "campaign.save",
        json!({"path":path,"expectedRevision":revision}),
    );
    revision = self::revision(&saved);
    let other = folder.path().join("other.campaign");
    std::fs::create_dir(&other).unwrap();
    assert_rejected(
        &mut client,
        "campaign.save",
        json!({"path":other,"expectedRevision":revision}),
        "validation",
    );
    client.close();
}

#[test]
fn npc_creation_is_undoable_through_the_compatibility_endpoint() {
    let mut client = Client::new();
    let created = client.ok(
        "campaign.new",
        json!({"name":"NPC creation","expectedRevision":0}),
    );
    let revision = self::revision(&created);
    let npc = client.ok(
        "npc.create",
        json!({"name":"Scout","expectedRevision":revision}),
    );
    let mut revision = self::revision(&npc);
    let npc_id = npc["npc"]["id"].as_str().unwrap().to_owned();
    let undone = client.ok(
        "npc.undo",
        json!({"npcId":npc_id,"expectedRevision":revision}),
    );
    revision = self::revision(&undone);
    assert_eq!(undone["npc"], Value::Null);
    assert_eq!(undone["label"], "Create NPC");
    assert_eq!(
        client.ok("npc.list", json!({}))["npcs"],
        json!([]),
        "undoing creation removes the record"
    );
    let redone = client.ok(
        "npc.redo",
        json!({"npcId":npc_id,"expectedRevision":revision}),
    );
    assert_eq!(redone["npc"]["name"], "Scout");
    assert_eq!(client.ok("npc.list", json!({}))["npcs"][0]["name"], "Scout");
    client.close();
}

#[test]
fn session_preparation_and_review_persist_through_the_cli() {
    let folder = tempfile::tempdir().unwrap();
    let path = folder.path().join("sessions.campaign");
    let mut client = Client::new();

    let description = client.ok("system.describe", json!({}));
    assert!(description["methods"]["session.create"]["properties"]["expectedRevision"].is_object());
    assert!(description["queries"]
        .as_array()
        .unwrap()
        .contains(&json!("session.list")));
    assert!(description["mutations"]
        .as_array()
        .unwrap()
        .contains(&json!("session.update")));

    let created = client.ok(
        "campaign.new",
        json!({"name":"Session prep","expectedRevision":0}),
    );
    let mut revision = self::revision(&created);
    let before_invalid_create = client.ok("campaign.inspect", json!({}));
    let invalid_create = client.request(
        "session.create",
        json!({"title":" ","expectedRevision":revision}),
    );
    assert_eq!(error_code(&invalid_create), "validation");
    assert_eq!(
        client.ok("campaign.inspect", json!({})),
        before_invalid_create
    );
    let npc = client.ok(
        "npc.create",
        json!({"name":"Niya Jade","expectedRevision":revision}),
    );
    revision = self::revision(&npc);
    let npc_id = npc["npc"]["id"].as_str().unwrap().to_owned();
    let location = client.ok(
        "location.create",
        json!({"name":"Eastern Seawall","expectedRevision":revision}),
    );
    revision = self::revision(&location);
    let location_id = location["location"]["id"].as_str().unwrap().to_owned();
    let faction = client.ok(
        "faction.create",
        json!({"name":"Dockworkers' Guild","expectedRevision":revision}),
    );
    revision = self::revision(&faction);
    let faction_id = faction["faction"]["id"].as_str().unwrap().to_owned();
    let thread = client.ok(
        "thread.create",
        json!({"title":"The Missing Morrow","expectedRevision":revision}),
    );
    revision = self::revision(&thread);
    let thread_id = thread["thread"]["id"].as_str().unwrap().to_owned();

    let session = client.ok(
        "session.create",
        json!({
            "title": " The Low Tide ",
            "number": 8,
            "date": " 2026-11-14 ",
            "previous": false,
            "expectedRevision": revision
        }),
    );
    revision = self::revision(&session);
    let session_id = session["session"]["id"].as_str().unwrap().to_owned();
    assert_eq!(session["session"]["title"], "The Low Tide");
    assert_eq!(session["session"]["date"], "2026-11-14");
    assert_eq!(session["session"]["beats"], json!([]));

    let mut draft = session["session"].clone();
    draft["whereLeftOff"] =
        json!([{"type":"p","children":[{"text":"A soaked manifest survived the fire."}]}]);
    draft["prep"] = json!([
        {"type":"p","children":[{"text":"Meet Niya beneath the bell tower."}]},
        {"type":"custom-block","value":{"keep":true},"children":[{"text":"Preserve unknown node"}]}
    ]);
    draft["happened"] = json!([{"type":"p","children":[{"text":"The party chose the tunnel."}]}]);
    draft["summary"] = json!([
        {"type":"p","children":[{"text":"A lantern waits below the seawall."}]},
        {"type":"img","url":"data:image/png;base64,c2Vzc2lvbg==","children":[{"text":""}]}
    ]);
    draft["beats"] = json!([
        {"id":"beat-1","title":"Meet Niya","notes":[{"type":"p","children":[{"text":"She has a tide chart."}]}],"status":"planned"},
        {"id":"beat-2","title":"Follow the lantern","notes":[{"type":"p","children":[{"text":"The tunnel is one route."}]}],"status":"happened"},
        {"id":"beat-3","title":"The three harbor bells","notes":[{"type":"p","children":[{"text":"The order matters."}]}],"status":"skipped"}
    ]);
    draft["links"] = json!([
        {"kind":"npc","targetId":npc_id,"label":"Contact"},
        {"kind":"location","targetId":location_id,"label":"Last seen"},
        {"kind":"faction","targetId":faction_id,"label":"Involved"},
        {"kind":"thread","targetId":thread_id,"label":"Related thread"},
        {"kind":"item","targetId":"missing-item","label":"Missing target retained"}
    ]);
    let updated = client.ok(
        "session.update",
        json!({"session":draft,"expectedRevision":revision}),
    );
    revision = self::revision(&updated);
    assert_eq!(updated["session"]["beats"][1]["status"], "happened");
    assert_eq!(updated["session"]["prep"][1]["type"], "custom-block");
    assert_eq!(updated["session"]["links"][4]["targetId"], "missing-item");
    assert_eq!(updated["revision"], revision);
    assert_eq!(
        client.ok("session.list", json!({}))["sessions"]
            .as_array()
            .unwrap()
            .len(),
        1
    );
    let fetched = client.ok("session.get", json!({"sessionId":session_id}));
    assert_eq!(fetched["session"], updated["session"]);
    let history_after_update = client.ok("history.status", json!({}));
    let history_length = history_after_update["history"]["length"].clone();

    let no_op = client.ok(
        "session.update",
        json!({"session":updated["session"],"expectedRevision":revision}),
    );
    assert_eq!(self::revision(&no_op), revision);
    assert_eq!(
        client.ok("history.status", json!({}))["history"]["length"],
        history_length,
        "a no-op session update must not add history"
    );

    let before_invalid = client.ok("campaign.inspect", json!({}));
    let mut invalid = updated["session"].clone();
    invalid["beats"][0]["status"] = json!("unknown");
    let rejected = client.request(
        "session.update",
        json!({"session":invalid,"expectedRevision":revision}),
    );
    assert_eq!(error_code(&rejected), "validation");
    assert_eq!(client.ok("campaign.inspect", json!({})), before_invalid);
    assert_eq!(
        client.ok("history.status", json!({}))["history"]["length"],
        history_length
    );

    let mut duplicate_beat = updated["session"].clone();
    duplicate_beat["beats"][1]["id"] = json!("beat-1");
    let duplicate_beat_response = client.request(
        "session.update",
        json!({"session":duplicate_beat,"expectedRevision":revision}),
    );
    assert_eq!(error_code(&duplicate_beat_response), "validation");
    assert_eq!(client.ok("campaign.inspect", json!({})), before_invalid);

    let mut duplicate_link = updated["session"].clone();
    duplicate_link["links"] = json!([
        {"kind":"npc","targetId":npc_id,"label":"First"},
        {"kind":"npc","targetId":npc_id,"label":"Second"}
    ]);
    let duplicate_link_response = client.request(
        "session.update",
        json!({"session":duplicate_link,"expectedRevision":revision}),
    );
    assert_eq!(error_code(&duplicate_link_response), "validation");
    assert_eq!(client.ok("campaign.inspect", json!({})), before_invalid);

    let mut unsupported_link = updated["session"].clone();
    unsupported_link["links"][0]["kind"] = json!("puzzle");
    let unsupported_link_response = client.request(
        "session.update",
        json!({"session":unsupported_link,"expectedRevision":revision}),
    );
    assert_eq!(error_code(&unsupported_link_response), "validation");
    assert_eq!(client.ok("campaign.inspect", json!({})), before_invalid);

    let undone = client.ok("history.undo", json!({"expectedRevision":revision}));
    revision = self::revision(&undone);
    assert_eq!(undone["label"], "Edit session");
    assert_eq!(
        client.ok("session.get", json!({"sessionId":session_id}))["session"]["beats"],
        json!([])
    );
    let redone = client.ok("history.redo", json!({"expectedRevision":revision}));
    revision = self::revision(&redone);
    assert_eq!(
        client.ok("session.get", json!({"sessionId":session_id}))["session"]["beats"]
            .as_array()
            .unwrap()
            .len(),
        3
    );

    let saved = client.ok(
        "campaign.save",
        json!({"path":path,"expectedRevision":revision}),
    );
    assert_eq!(saved["dirty"], false);
    assert_eq!(saved["campaign"]["sessions"].as_array().unwrap().len(), 1);
    assert_eq!(
        std::fs::read_dir(path.join("assets")).unwrap().count(),
        1,
        "the session summary image must be stored as one asset"
    );
    client.close();

    let mut reopened = Client::new();
    let loaded = reopened.ok("campaign.open", json!({"path":path,"expectedRevision":0}));
    let loaded_revision = self::revision(&loaded);
    assert_eq!(loaded["campaign"]["sessions"].as_array().unwrap().len(), 1);
    let loaded_session = reopened.ok("session.get", json!({"sessionId":session_id}));
    assert_eq!(loaded_session["session"]["title"], "The Low Tide");
    assert_eq!(loaded_session["session"]["number"], 8);
    assert_eq!(loaded_session["session"]["date"], "2026-11-14");
    assert_eq!(
        loaded_session["session"]["beats"][2]["title"],
        "The three harbor bells"
    );
    assert_eq!(loaded_session["session"]["beats"][2]["status"], "skipped");
    assert_eq!(loaded_session["session"]["prep"][1]["type"], "custom-block");
    assert_eq!(loaded_session["session"]["links"][0]["targetId"], npc_id);
    assert_eq!(
        loaded_session["session"]["links"][4]["targetId"],
        "missing-item"
    );
    assert_eq!(loaded_session["session"]["summary"][1]["type"], "img");
    assert!(
        loaded_session["session"]["summary"][1]["url"]
            .as_str()
            .unwrap()
            .starts_with("data:image/png;base64,"),
        "the session image URL must resolve back to its data URL"
    );
    assert_eq!(
        reopened.ok("history.status", json!({}))["history"]["canUndo"],
        false
    );
    let no_history = reopened.request("history.undo", json!({"expectedRevision":loaded_revision}));
    assert_eq!(error_code(&no_history), "conflict");
    reopened.close();
}

use base64::{engine::general_purpose::STANDARD, Engine};
use rusqlite::{params, Connection, OptionalExtension, Transaction};
use serde::{Deserialize, Serialize};
use serde_json::Value;
use sha2::{Digest, Sha256};
use std::{
    collections::{HashMap, HashSet},
    fs,
    io::Write,
    path::Path,
};

#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct Campaign {
    format: String,
    schema_version: u32,
    id: String,
    name: String,
    created_at: String,
    updated_at: String,
    npcs: Vec<Npc>,
    workspace: Option<Workspace>,
    section: Option<String>,
    sidebar: Sidebar,
}

#[derive(Debug, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
struct Npc {
    id: String,
    name: String,
    notes: Vec<Value>,
}

#[derive(Debug, Serialize, Deserialize)]
struct Sidebar {
    width: f64,
    open: bool,
}
#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct Workspace {
    layout: Value,
    panels: HashMap<String, Value>,
    next_id: u32,
    sidebar_width: f64,
    collapsed: bool,
    history: NavigationHistory,
}
#[derive(Debug, Serialize, Deserialize)]
struct NavigationHistory {
    #[serde(deserialize_with = "deserialize_destinations")]
    entries: Vec<Destination>,
    index: i32,
}
#[derive(Debug, Serialize, Deserialize)]
#[serde(tag = "kind", rename_all = "camelCase", rename_all_fields = "camelCase")]
enum Destination {
    Character { workspace_id: String, character_id: String, section: Option<String> },
    Map { workspace_id: String, section: Option<String> },
    Workspace { workspace_id: String, section: Option<String> },
    Settings,
    Section { section: Option<String> },
}

// Existing campaign packages used untyped NPC destinations. Normalize on read so
// the next save writes the current format without changing database versions.
fn deserialize_destinations<'de, D>(deserializer: D) -> Result<Vec<Destination>, D::Error>
where D: serde::Deserializer<'de> {
    #[derive(Deserialize)]
    #[serde(untagged)]
    enum StoredDestination {
        Current(Destination),
        Legacy { #[serde(rename = "workspaceId")] workspace_id: String, name: String },
    }
    Ok(Vec::<StoredDestination>::deserialize(deserializer)?.into_iter().map(|entry| match entry {
        StoredDestination::Current(destination) => destination,
        StoredDestination::Legacy { workspace_id, name } => Destination::Character { workspace_id, character_id: name, section: None },
    }).collect())
}

fn validate_layout(layout: &Value, components: &[&str]) -> Result<(), String> {
    let grid = layout.get("grid").ok_or("Workspace has no grid.")?;
    if !grid["width"].is_number()
        || !grid["height"].is_number()
        || !matches!(
            grid["orientation"].as_str(),
            Some("HORIZONTAL" | "VERTICAL")
        )
    {
        return Err("Invalid workspace grid.".into());
    }
    let panels = layout["panels"]
        .as_object()
        .ok_or("Workspace has no panels.")?;
    for (id, panel) in panels {
        if panel["id"].as_str() != Some(id) || !panel["contentComponent"].as_str().is_some_and(|component| components.contains(&component))
        {
            return Err("Unknown workspace panel.".into());
        }
    }
    fn visit(node: &Value, panels: &serde_json::Map<String, Value>) -> Result<(), String> {
        match node["type"].as_str() {
            Some("branch") => {
                for child in node["data"].as_array().ok_or("Invalid workspace branch.")? {
                    visit(child, panels)?;
                }
            }
            Some("leaf") => {
                if !node["data"]["id"].is_string() {
                    return Err("Invalid workspace group.".into());
                }
                for id in node["data"]["views"]
                    .as_array()
                    .ok_or("Invalid workspace tabs.")?
                {
                    if !id.as_str().is_some_and(|id| panels.contains_key(id)) {
                        return Err("Workspace references a missing tab.".into());
                    }
                }
            }
            _ => return Err("Invalid workspace layout.".into()),
        }
        Ok(())
    }
    visit(&grid["root"], panels)
}

impl Campaign {
    fn validate(&self) -> Result<(), String> {
        if self.format != "ttrpg-campaign" || self.schema_version != 1 {
            return Err("Unsupported campaign format or version. No files were changed.".into());
        }
        if self.id.is_empty() || self.name.trim().is_empty() {
            return Err("Campaign ID and name are required.".into());
        }
        if !(200.0..=400.0).contains(&self.sidebar.width) {
            return Err("Invalid campaign sidebar width.".into());
        }
        if let Some(workspace) = &self.workspace {
            if workspace.next_id == 0
                || !(160.0..=320.0).contains(&workspace.sidebar_width)
                || workspace.history.entries.len() > 100
                || workspace.history.index < -1
                || workspace.history.index >= workspace.history.entries.len() as i32
            {
                return Err("Invalid workspace state.".into());
            }
            validate_layout(&workspace.layout, &["workspace"])?;
            let panel_ids = workspace.layout["panels"]
                .as_object()
                .ok_or("Workspace has no panels.")?;
            for id in panel_ids.keys() {
                let layout = workspace
                    .panels
                    .get(id)
                    .ok_or("Missing workspace contents.")?;
                validate_layout(layout, &["character", "map"])?;
            }
        }
        let mut ids = HashSet::new();
        for npc in &self.npcs {
            if npc.id.is_empty() || npc.name.trim().is_empty() || !ids.insert(&npc.id) {
                return Err("NPCs must have unique IDs and nonempty names.".into());
            }
            if npc.notes.is_empty() {
                return Err("NPC notes need at least one block.".into());
            }
            for node in &npc.notes {
                validate_node(node)?;
            }
        }
        Ok(())
    }
}

fn validate_node(node: &Value) -> Result<(), String> {
    if node.get("text").and_then(Value::as_str).is_some() {
        return Ok(());
    }
    if node.get("type").and_then(Value::as_str).is_none() {
        return Err("Invalid note block.".into());
    }
    let children = node
        .get("children")
        .and_then(Value::as_array)
        .ok_or("Note block is missing children.")?;
    if children.is_empty() {
        return Err("Note block has no children.".into());
    }
    for child in children {
        validate_node(child)?;
    }
    Ok(())
}

fn image_type(mime: &str) -> Result<&'static str, String> {
    match mime {
        "image/png" => Ok("png"),
        "image/jpeg" => Ok("jpg"),
        "image/gif" => Ok("gif"),
        "image/webp" => Ok("webp"),
        "image/svg+xml" => Ok("svg"),
        "image/avif" => Ok("avif"),
        _ => Err(format!("Unsupported image type: {mime}")),
    }
}

fn asset_file<'a>(url: &'a str, folder: &Path) -> Result<(std::path::PathBuf, &'a str), String> {
    let filename = url
        .strip_prefix("assets/")
        .ok_or("Images must be imported files, not external URLs.")?;
    let (hash, extension) = filename.split_once('.').ok_or("Invalid image path.")?;
    if hash.len() != 64 || !hash.bytes().all(|b| b.is_ascii_hexdigit()) {
        return Err("Invalid image path.".into());
    }
    let mime = match extension {
        "png" => "image/png",
        "jpg" => "image/jpeg",
        "gif" => "image/gif",
        "webp" => "image/webp",
        "svg" => "image/svg+xml",
        "avif" => "image/avif",
        _ => return Err("Invalid image extension.".into()),
    };
    let file = folder.join("assets").join(filename);
    // A moved campaign must never resolve an asset outside its own folder through a symlink.
    let root = folder.canonicalize().map_err(|e| e.to_string())?;
    let canonical = file
        .canonicalize()
        .map_err(|e| format!("Missing or unreadable image {filename}: {e}"))?;
    if !canonical.starts_with(&root) {
        return Err("Image resolves outside the campaign folder.".into());
    }
    Ok((canonical, mime))
}

fn transform_images(node: &mut Value, folder: &Path, saving: bool) -> Result<(), String> {
    if let Some(object) = node.as_object_mut() {
        if object.get("type").and_then(Value::as_str) == Some("img") {
            let url = object
                .get("url")
                .and_then(Value::as_str)
                .ok_or("Image has no URL.")?
                .to_owned();
            if saving && url.starts_with("data:") {
                let (header, encoded) = url.split_once(',').ok_or("Invalid image data.")?;
                let mime = header
                    .strip_prefix("data:")
                    .and_then(|s| s.strip_suffix(";base64"))
                    .ok_or("Invalid image encoding.")?;
                let extension = image_type(mime)?;
                let bytes = STANDARD.decode(encoded).map_err(|e| e.to_string())?;
                if bytes.is_empty() || bytes.len() > 10 * 1024 * 1024 {
                    return Err("Images must be between 1 byte and 10 MB.".into());
                }
                let filename = format!("{:x}.{extension}", Sha256::digest(&bytes));
                let asset = folder.join("assets").join(&filename);
                if !asset.exists() {
                    atomic_write(&asset, &bytes)?;
                }
                // Also verify an existing asset before committing a reference to it.
                let (file, _) = asset_file(&format!("assets/{filename}"), folder)?;
                if fs::read(file).map_err(|e| e.to_string())? != bytes {
                    return Err("Campaign image hash mismatch.".into());
                }
                object.insert("url".into(), Value::String(format!("assets/{filename}")));
            } else {
                let (file, mime) = asset_file(&url, folder)?;
                let bytes = fs::read(file).map_err(|e| e.to_string())?;
                let expected = format!("assets/{:x}.{}", Sha256::digest(&bytes), image_type(mime)?);
                if expected != url {
                    return Err(format!("Image hash mismatch: {url}"));
                }
                if !saving {
                    object.insert(
                        "url".into(),
                        Value::String(format!("data:{mime};base64,{}", STANDARD.encode(bytes))),
                    );
                }
            }
        }
        for value in object.values_mut() {
            transform_images(value, folder, saving)?;
        }
    } else if let Some(array) = node.as_array_mut() {
        for value in array {
            transform_images(value, folder, saving)?;
        }
    }
    Ok(())
}

fn atomic_write(path: &Path, bytes: &[u8]) -> Result<(), String> {
    let parent = path.parent().ok_or("Choose a campaign package folder.")?;
    let mut temporary = tempfile::NamedTempFile::new_in(parent).map_err(|e| e.to_string())?;
    temporary.write_all(bytes).map_err(|e| e.to_string())?;
    temporary.as_file().sync_all().map_err(|e| e.to_string())?;
    temporary.persist(path).map_err(|e| e.to_string())?;
    Ok(())
}

fn ensure_schema(connection: &mut Connection) -> Result<(), String> {
    let version: i32 = connection
        .pragma_query_value(None, "user_version", |row| row.get(0))
        .map_err(|e| e.to_string())?;
    if version > 1 {
        return Err(format!(
            "Campaign database version {version} is newer than this app supports."
        ));
    }
    let transaction = connection.transaction().map_err(|e| e.to_string())?;
    transaction
        .execute_batch(
            "\
        CREATE TABLE IF NOT EXISTS campaign (
            id TEXT PRIMARY KEY NOT NULL,
            name TEXT NOT NULL,
            schema_version INTEGER NOT NULL,
            created_at TEXT NOT NULL,
            updated_at TEXT NOT NULL,
            section TEXT,
            sidebar_width REAL NOT NULL,
            sidebar_open INTEGER NOT NULL
        );
        CREATE TABLE IF NOT EXISTS npc (
            id TEXT PRIMARY KEY NOT NULL,
            campaign_id TEXT NOT NULL REFERENCES campaign(id) ON DELETE CASCADE,
            name TEXT NOT NULL,
            sort_order INTEGER NOT NULL
        );
        CREATE TABLE IF NOT EXISTS npc_notes (
            npc_id TEXT PRIMARY KEY NOT NULL REFERENCES npc(id) ON DELETE CASCADE,
            document_json TEXT NOT NULL
        );
        CREATE TABLE IF NOT EXISTS workspace_state (
            state_key TEXT PRIMARY KEY NOT NULL,
            value_json TEXT NOT NULL
        );
        PRAGMA user_version = 1;
    ",
        )
        .map_err(|e| e.to_string())?;
    transaction.commit().map_err(|e| e.to_string())
}

fn write_campaign(folder: &Path, mut campaign: Campaign) -> Result<(), String> {
    campaign.validate()?;
    if folder.extension().and_then(|ext| ext.to_str()) != Some("campaign") {
        return Err("Choose a folder ending in .campaign.".into());
    }
    if folder.exists() && !folder.is_dir() {
        return Err("Campaign package must be a folder.".into());
    }
    fs::create_dir_all(folder).map_err(|e| e.to_string())?;
    fs::create_dir_all(folder.join("assets")).map_err(|e| e.to_string())?;
    let root = folder.canonicalize().map_err(|e| e.to_string())?;
    if !folder
        .join("assets")
        .canonicalize()
        .map_err(|e| e.to_string())?
        .starts_with(&root)
    {
        return Err("Assets folder resolves outside the campaign package.".into());
    }
    for npc in &mut campaign.npcs {
        for node in &mut npc.notes {
            transform_images(node, folder, true)?;
        }
    }

    let db_path = folder.join("campaign.sqlite");
    let mut connection = Connection::open(&db_path).map_err(|e| e.to_string())?;
    connection
        .busy_timeout(std::time::Duration::from_secs(5))
        .map_err(|e| e.to_string())?;
    connection
        .pragma_update(None, "journal_mode", "DELETE")
        .map_err(|e| e.to_string())?;
    connection
        .pragma_update(None, "foreign_keys", "ON")
        .map_err(|e| e.to_string())?;
    ensure_schema(&mut connection)?;
    let transaction = connection.transaction().map_err(|e| e.to_string())?;
    write_transaction(&transaction, &campaign)?;
    transaction.commit().map_err(|e| e.to_string())
}

fn write_transaction(transaction: &Transaction<'_>, campaign: &Campaign) -> Result<(), String> {
    let existing: Option<String> = transaction
        .query_row("SELECT id FROM campaign LIMIT 1", [], |row| row.get(0))
        .optional()
        .map_err(|e| e.to_string())?;
    if existing.as_deref().is_some_and(|id| id != campaign.id) {
        return Err("This package belongs to another campaign.".into());
    }
    if existing.is_some()
        && transaction
            .query_row("SELECT COUNT(*) FROM campaign", [], |row| {
                row.get::<_, i64>(0)
            })
            .map_err(|e| e.to_string())?
            != 1
    {
        return Err("Campaign database contains unexpected records.".into());
    }
    transaction.execute("INSERT INTO campaign (id,name,schema_version,created_at,updated_at,section,sidebar_width,sidebar_open)
        VALUES (?1,?2,?3,?4,?5,?6,?7,?8)
        ON CONFLICT(id) DO UPDATE SET name=excluded.name,schema_version=excluded.schema_version,
        updated_at=excluded.updated_at,section=excluded.section,sidebar_width=excluded.sidebar_width,sidebar_open=excluded.sidebar_open",
        params![campaign.id, campaign.name, campaign.schema_version, campaign.created_at, campaign.updated_at,
            campaign.section, campaign.sidebar.width, campaign.sidebar.open as i32]).map_err(|e| e.to_string())?;
    transaction
        .execute("DELETE FROM npc WHERE campaign_id = ?1", [&campaign.id])
        .map_err(|e| e.to_string())?;
    for (index, npc) in campaign.npcs.iter().enumerate() {
        transaction
            .execute(
                "INSERT INTO npc (id,campaign_id,name,sort_order) VALUES (?1,?2,?3,?4)",
                params![npc.id, campaign.id, npc.name, index as i64],
            )
            .map_err(|e| e.to_string())?;
        transaction
            .execute(
                "INSERT INTO npc_notes (npc_id,document_json) VALUES (?1,?2)",
                params![
                    npc.id,
                    serde_json::to_string(&npc.notes).map_err(|e| e.to_string())?
                ],
            )
            .map_err(|e| e.to_string())?;
    }
    transaction
        .execute("DELETE FROM workspace_state", [])
        .map_err(|e| e.to_string())?;
    if let Some(workspace) = &campaign.workspace {
        transaction
            .execute(
                "INSERT INTO workspace_state (state_key,value_json) VALUES ('workspace',?1)",
                [serde_json::to_string(workspace).map_err(|e| e.to_string())?],
            )
            .map_err(|e| e.to_string())?;
    }
    Ok(())
}

#[tauri::command]
pub async fn save_campaign(path: String, campaign: Campaign) -> Result<(), String> {
    tauri::async_runtime::spawn_blocking(move || write_campaign(Path::new(&path), campaign))
        .await
        .map_err(|e| e.to_string())?
}

fn read_campaign(folder: &Path) -> Result<Campaign, String> {
    if folder.extension().and_then(|ext| ext.to_str()) != Some("campaign") {
        return Err("Choose a folder ending in .campaign.".into());
    }
    let connection = Connection::open_with_flags(
        folder.join("campaign.sqlite"),
        rusqlite::OpenFlags::SQLITE_OPEN_READ_ONLY,
    )
    .map_err(|e| e.to_string())?;
    let version: i32 = connection
        .pragma_query_value(None, "user_version", |row| row.get(0))
        .map_err(|e| e.to_string())?;
    if version != 1 {
        return Err(format!("Unsupported campaign database version {version}."));
    }
    let mut statement = connection.prepare("SELECT id,name,schema_version,created_at,updated_at,section,sidebar_width,sidebar_open FROM campaign").map_err(|e| e.to_string())?;
    let campaign_row = statement
        .query_row([], |row| {
            Ok((
                row.get::<_, String>(0)?,
                row.get::<_, String>(1)?,
                row.get::<_, u32>(2)?,
                row.get::<_, String>(3)?,
                row.get::<_, String>(4)?,
                row.get::<_, Option<String>>(5)?,
                row.get::<_, f64>(6)?,
                row.get::<_, i32>(7)? != 0,
            ))
        })
        .optional()
        .map_err(|e| e.to_string())?
        .ok_or("Campaign database has no campaign record.")?;
    let (id, name, schema_version, created_at, updated_at, section, width, open) = campaign_row;
    let mut statement = connection.prepare("SELECT npc.id,npc.name,npc_notes.document_json FROM npc JOIN npc_notes ON npc_notes.npc_id=npc.id WHERE npc.campaign_id=?1 ORDER BY npc.sort_order").map_err(|e| e.to_string())?;
    let npcs = statement
        .query_map([&id], |row| {
            let notes_json: String = row.get(2)?;
            let notes: Vec<Value> = serde_json::from_str(&notes_json).map_err(|error| {
                rusqlite::Error::FromSqlConversionFailure(
                    2,
                    rusqlite::types::Type::Text,
                    Box::new(error),
                )
            })?;
            Ok(Npc {
                id: row.get(0)?,
                name: row.get(1)?,
                notes,
            })
        })
        .map_err(|e| e.to_string())?
        .collect::<Result<Vec<_>, _>>()
        .map_err(|e| e.to_string())?;
    let workspace_json: Option<String> = connection
        .query_row(
            "SELECT value_json FROM workspace_state WHERE state_key='workspace'",
            [],
            |row| row.get(0),
        )
        .optional()
        .map_err(|e| e.to_string())?;
    let workspace = workspace_json
        .map(|json| serde_json::from_str(&json).map_err(|e| e.to_string()))
        .transpose()?;
    let mut campaign = Campaign {
        format: "ttrpg-campaign".into(),
        schema_version,
        id,
        name,
        created_at,
        updated_at,
        npcs,
        workspace,
        section,
        sidebar: Sidebar { width, open },
    };
    campaign.validate()?;
    for npc in &mut campaign.npcs {
        for node in &mut npc.notes {
            transform_images(node, folder, false)?;
        }
    }
    Ok(campaign)
}

#[tauri::command]
pub async fn open_campaign(path: String) -> Result<Campaign, String> {
    tauri::async_runtime::spawn_blocking(move || read_campaign(Path::new(&path)))
        .await
        .map_err(|e| e.to_string())?
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    fn example() -> Campaign {
        serde_json::from_value(json!({
            "format": "ttrpg-campaign", "schemaVersion": 1, "id": "campaign-1", "name": "The forest",
            "createdAt": "2026-10-01", "updatedAt": "2026-10-01", "section": "Characters",
            "sidebar": {"width": 256, "open": true},
            "workspace": {
                "layout": {"grid": {"root": {"type": "branch", "data": []}, "height": 600, "width": 800, "orientation": "HORIZONTAL"}, "panels": {}},
                "panels": {}, "nextId": 3, "sidebarWidth": 192, "collapsed": false, "history": {"entries": [], "index": -1}
            },
            "npcs": [{"id": "npc-1", "name": "Scout", "notes": [
                {"type": "p", "children": [{"text": "Keep this private", "bold": true}]},
                {"type": "img", "url": "data:image/png;base64,aW1hZ2U=", "width": 245,
                    "caption": [{"text": "Forest trail"}], "children": [{"text": ""}]}
            ]}]
        })).unwrap()
    }

    #[test]
    fn legacy_navigation_history_is_normalized_on_read() {
        let history: NavigationHistory = serde_json::from_value(json!({
            "entries": [{"workspaceId": "workspace:1", "name": "npc-1"}], "index": 0
        })).unwrap();
        assert_eq!(serde_json::to_value(history).unwrap(), json!({
            "entries": [{"kind": "character", "workspaceId": "workspace:1", "characterId": "npc-1", "section": null}], "index": 0
        }));
    }

    #[test]
    fn map_tabs_and_typed_history_round_trip() {
        let folder = tempfile::tempdir().unwrap();
        let path = folder.path().join("map.campaign");
        let mut value = serde_json::to_value(example()).unwrap();
        value["workspace"]["layout"]["panels"] = json!({
            "workspace:1": {"id": "workspace:1", "contentComponent": "workspace"}
        });
        value["workspace"]["panels"] = json!({
            "workspace:1": {
                "grid": {"root": {"type": "branch", "data": []}, "height": 600, "width": 800, "orientation": "HORIZONTAL"},
                "panels": {"map:prototype": {"id": "map:prototype", "contentComponent": "map"}}
            }
        });
        value["workspace"]["history"] = json!({"entries": [
            {"kind": "character", "workspaceId": "workspace:1", "characterId": "npc-1", "section": "Characters"},
            {"kind": "map", "workspaceId": "workspace:1", "section": "Locations & Maps"},
            {"kind": "settings"},
            {"kind": "section", "section": null},
            {"kind": "workspace", "workspaceId": "workspace:1", "section": null}
        ], "index": 4});
        let expected = value.clone();
        write_campaign(&path, serde_json::from_value(value.clone()).unwrap()).unwrap();
        assert_eq!(serde_json::to_value(read_campaign(&path).unwrap()).unwrap(), expected);
        value["workspace"]["panels"]["workspace:1"]["panels"]["map:prototype"]["contentComponent"] = json!("unknown");
        assert!(serde_json::from_value::<Campaign>(value).unwrap().validate().is_err());
    }

    #[test]
    fn campaign_and_image_round_trip_after_moving_folder() {
        let parent = tempfile::tempdir().unwrap();
        let old = parent.path().join("old.campaign");
        let expected = serde_json::to_value(example()).unwrap();
        write_campaign(&old, example()).unwrap();
        let db = Connection::open(old.join("campaign.sqlite")).unwrap();
        let stored_asset: String = db
            .query_row(
                "SELECT document_json FROM npc_notes WHERE npc_id='npc-1'",
                [],
                |row| row.get::<_, String>(0),
            )
            .unwrap();
        assert!(stored_asset.contains("assets/"));
        assert_eq!(fs::read_dir(old.join("assets")).unwrap().count(), 1);
        let moved = parent.path().join("moved.campaign");
        fs::rename(old, &moved).unwrap();
        let reopened = read_campaign(&moved).unwrap();
        assert_eq!(serde_json::to_value(&reopened).unwrap(), expected);
        write_campaign(&moved, reopened).unwrap();
        assert_eq!(fs::read_dir(moved.join("assets")).unwrap().count(), 1);
    }

    #[test]
    fn failed_save_preserves_previous_file() {
        let folder = tempfile::tempdir().unwrap();
        let path = folder.path().join("test.campaign");
        write_campaign(&path, example()).unwrap();
        let previous = read_campaign(&path).unwrap();
        let mut invalid = example();
        invalid.npcs[0].notes[1]["url"] = json!("assets/../../secret.png");
        assert!(write_campaign(&path, invalid).is_err());
        assert_eq!(
            serde_json::to_value(read_campaign(&path).unwrap()).unwrap(),
            serde_json::to_value(&previous).unwrap()
        );
        let mut invalid = example();
        invalid.schema_version = 2;
        assert!(write_campaign(&path, invalid).is_err());
        assert_eq!(
            serde_json::to_value(read_campaign(&path).unwrap()).unwrap(),
            serde_json::to_value(&previous).unwrap()
        );
        let mut other = example();
        other.id = "other-campaign".into();
        assert!(write_campaign(&path, other).is_err());
        assert_eq!(
            serde_json::to_value(read_campaign(&path).unwrap()).unwrap(),
            serde_json::to_value(&previous).unwrap()
        );
    }

    #[test]
    fn missing_or_corrupt_images_are_reported() {
        let folder = tempfile::tempdir().unwrap();
        let path = folder.path().join("test.campaign");
        write_campaign(&path, example()).unwrap();
        let asset = fs::read_dir(path.join("assets"))
            .unwrap()
            .next()
            .unwrap()
            .unwrap()
            .path();
        fs::write(&asset, "corrupted").unwrap();
        assert!(read_campaign(&path).unwrap_err().contains("hash mismatch"));
        fs::remove_file(asset).unwrap();
        assert!(read_campaign(&path)
            .unwrap_err()
            .contains("Missing or unreadable image"));
    }
}

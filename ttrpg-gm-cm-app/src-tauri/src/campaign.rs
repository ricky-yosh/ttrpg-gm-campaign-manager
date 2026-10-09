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
    #[serde(default)]
    statblock_field_set: StatblockFieldSet,
    npcs: Vec<Npc>,
    #[serde(default)]
    locations: Vec<Location>,
    #[serde(default)]
    factions: Vec<Faction>,
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
    #[serde(default)]
    presentation: NpcPresentation,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct StatblockFieldSet {
    id: String,
    version: u32,
}

impl Default for StatblockFieldSet {
    fn default() -> Self {
        Self {
            id: "dnd-5.5e".into(),
            version: 1,
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct NpcPresentation {
    #[serde(default)]
    relationships: Vec<NpcRelationship>,
    #[serde(default)]
    locations: Vec<NpcRelationship>,
    #[serde(default)]
    factions: Vec<NpcRelationship>,
    banner: Option<NpcImage>,
    portrait: Option<NpcImage>,
    player_description: String,
    #[serde(alias = "reference")]
    gm_reference: NpcGmReference,
    statblock: NpcStatblock,
}

impl Default for NpcPresentation {
    fn default() -> Self {
        Self {
            relationships: Vec::new(),
            locations: Vec::new(),
            factions: Vec::new(),
            banner: None,
            portrait: None,
            player_description: String::new(),
            gm_reference: NpcGmReference::default(),
            statblock: NpcStatblock::default(),
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct NpcRelationship {
    target_id: String,
    label: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
struct NpcImage {
    #[serde(rename = "type")]
    kind: String,
    url: String,
}

#[derive(Debug, Clone, Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct NpcGmReference {
    background: String,
    wants: String,
    ideals: String,
    bond: String,
    flaw: String,
    secrets: String,
    reaction: String,
    personality: String,
    mannerisms: String,
    notable_actions: String,
    voice: String,
    allies: String,
    enemies: String,
    other: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct NpcStatblock {
    field_set_id: String,
    field_set_version: u32,
    token_image: Option<NpcImage>,
    data: Value,
}

impl Default for NpcStatblock {
    fn default() -> Self {
        Self {
            field_set_id: "dnd-5.5e".into(),
            field_set_version: 1,
            token_image: None,
            data: Value::Object(Default::default()),
        }
    }
}

#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct Location {
    id: String,
    name: String,
    image: Option<NpcImage>,
    public_description: String,
    gm_notes: String,
}

fn transform_location_image(
    location: &mut Location,
    folder: &Path,
    saving: bool,
) -> Result<(), String> {
    let mut value = serde_json::to_value(&*location).map_err(|e| e.to_string())?;
    transform_images(&mut value, folder, saving)?;
    *location = serde_json::from_value(value).map_err(|e| e.to_string())?;
    Ok(())
}

#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct Faction {
    id: String,
    name: String,
    image: Option<NpcImage>,
    description: String,
    gm_notes: String,
}

fn transform_faction_image(
    faction: &mut Faction,
    folder: &Path,
    saving: bool,
) -> Result<(), String> {
    let mut value = serde_json::to_value(&*faction).map_err(|e| e.to_string())?;
    transform_images(&mut value, folder, saving)?;
    *faction = serde_json::from_value(value).map_err(|e| e.to_string())?;
    Ok(())
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
#[serde(
    tag = "kind",
    rename_all = "camelCase",
    rename_all_fields = "camelCase"
)]
enum Destination {
    Character {
        workspace_id: String,
        character_id: String,
        section: Option<String>,
    },
    Faction {
        workspace_id: String,
        faction_id: String,
        section: Option<String>,
    },
    Location {
        workspace_id: String,
        location_id: String,
        section: Option<String>,
    },
    Map {
        workspace_id: String,
        section: Option<String>,
    },
    Workspace {
        workspace_id: String,
        section: Option<String>,
    },
    Settings,
    Section {
        section: Option<String>,
    },
}

// Existing campaign packages used untyped NPC destinations. Normalize on read so
// the next save writes the current format without changing database versions.
fn deserialize_destinations<'de, D>(deserializer: D) -> Result<Vec<Destination>, D::Error>
where
    D: serde::Deserializer<'de>,
{
    #[derive(Deserialize)]
    #[serde(untagged)]
    enum StoredDestination {
        Current(Destination),
        Legacy {
            #[serde(rename = "workspaceId")]
            workspace_id: String,
            name: String,
        },
    }
    Ok(Vec::<StoredDestination>::deserialize(deserializer)?
        .into_iter()
        .map(|entry| match entry {
            StoredDestination::Current(destination) => destination,
            StoredDestination::Legacy { workspace_id, name } => Destination::Character {
                workspace_id,
                character_id: name,
                section: None,
            },
        })
        .collect())
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
        if panel["id"].as_str() != Some(id)
            || !panel["contentComponent"]
                .as_str()
                .is_some_and(|component| components.contains(&component))
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
                validate_layout(layout, &["character", "map", "location", "faction"])?;
            }
        }
        let mut ids = HashSet::new();
        let mut location_ids = HashSet::new();
        for location in &self.locations {
            if location.id.trim().is_empty()
                || location.name.trim().is_empty()
                || !location_ids.insert(&location.id)
            {
                return Err("Locations must have unique IDs and nonempty names.".into());
            }
            if location
                .image
                .as_ref()
                .is_some_and(|image| image.kind != "img")
            {
                return Err("Location images must use type 'img'.".into());
            }
        }
        let mut faction_ids = HashSet::new();
        for faction in &self.factions {
            if faction.id.trim().is_empty()
                || faction.name.trim().is_empty()
                || !faction_ids.insert(&faction.id)
            {
                return Err("Factions must have unique IDs and nonempty names.".into());
            }
            if faction
                .image
                .as_ref()
                .is_some_and(|image| image.kind != "img")
            {
                return Err("Faction images must use type 'img'.".into());
            }
        }
        for npc in &self.npcs {
            let mut location_targets = HashSet::new();
            for link in &npc.presentation.locations {
                if link.target_id.trim().is_empty() || !location_targets.insert(&link.target_id) {
                    return Err("NPC location links must have unique, nonempty target IDs.".into());
                }
            }
            let mut faction_targets = HashSet::new();
            for link in &npc.presentation.factions {
                if link.target_id.trim().is_empty() || !faction_targets.insert(&link.target_id) {
                    return Err("NPC faction links must have unique, nonempty target IDs.".into());
                }
            }
            if npc.id.is_empty() || npc.name.trim().is_empty() || !ids.insert(&npc.id) {
                return Err("NPCs must have unique IDs and nonempty names.".into());
            }
            let mut targets = HashSet::new();
            for relationship in &npc.presentation.relationships {
                if relationship.target_id.trim().is_empty()
                    || relationship.target_id == npc.id
                    || !targets.insert(&relationship.target_id)
                {
                    return Err("NPC relationships must have unique, nonempty target IDs and cannot link to themselves.".into());
                }
                // Missing targets are retained so deleting a record does not invalidate a campaign.
            }
            if npc.notes.is_empty() {
                return Err("NPC notes need at least one block.".into());
            }
            for node in &npc.notes {
                validate_node(node)?;
            }
            if npc.presentation.statblock.field_set_id.is_empty()
                || npc.presentation.statblock.field_set_version == 0
            {
                return Err("NPC statblock field set is invalid.".into());
            }
            for image in [
                npc.presentation.banner.as_ref(),
                npc.presentation.portrait.as_ref(),
                npc.presentation.statblock.token_image.as_ref(),
            ]
            .into_iter()
            .flatten()
            {
                if image.kind != "img" {
                    return Err("NPC presentation images must use type 'img'.".into());
                }
            }
        }
        Ok(())
    }
}

fn transform_presentation_images(
    presentation: &mut NpcPresentation,
    folder: &Path,
    saving: bool,
) -> Result<(), String> {
    let mut value = serde_json::to_value(&*presentation).map_err(|e| e.to_string())?;
    transform_images(&mut value, folder, saving)?;
    *presentation = serde_json::from_value(value).map_err(|e| e.to_string())?;
    Ok(())
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
    if version > 3 {
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
        CREATE TABLE IF NOT EXISTS campaign_settings (
            campaign_id TEXT PRIMARY KEY NOT NULL REFERENCES campaign(id) ON DELETE CASCADE,
            statblock_field_set_json TEXT NOT NULL
        );
        CREATE TABLE IF NOT EXISTS npc_presentation (
            npc_id TEXT PRIMARY KEY NOT NULL REFERENCES npc(id) ON DELETE CASCADE,
            presentation_json TEXT NOT NULL
        );
        CREATE TABLE IF NOT EXISTS workspace_state (
            state_key TEXT PRIMARY KEY NOT NULL,
            value_json TEXT NOT NULL
        );
        CREATE TABLE IF NOT EXISTS location (
            id TEXT PRIMARY KEY NOT NULL,
            campaign_id TEXT NOT NULL REFERENCES campaign(id) ON DELETE CASCADE,
            sort_order INTEGER NOT NULL,
            record_json TEXT NOT NULL
        );
        CREATE TABLE IF NOT EXISTS faction (
            id TEXT PRIMARY KEY NOT NULL,
            campaign_id TEXT NOT NULL REFERENCES campaign(id) ON DELETE CASCADE,
            sort_order INTEGER NOT NULL,
            record_json TEXT NOT NULL
        );
        PRAGMA user_version = 3;
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
        transform_presentation_images(&mut npc.presentation, folder, true)?;
    }

    for location in &mut campaign.locations {
        transform_location_image(location, folder, true)?;
    }
    for faction in &mut campaign.factions {
        transform_faction_image(faction, folder, true)?;
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
    transaction.execute(
        "INSERT INTO campaign_settings (campaign_id,statblock_field_set_json) VALUES (?1,?2)
         ON CONFLICT(campaign_id) DO UPDATE SET statblock_field_set_json=excluded.statblock_field_set_json",
        params![campaign.id, serde_json::to_string(&campaign.statblock_field_set).map_err(|e| e.to_string())?],
    ).map_err(|e| e.to_string())?;
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
        transaction
            .execute(
                "INSERT INTO npc_presentation (npc_id,presentation_json) VALUES (?1,?2)",
                params![
                    npc.id,
                    serde_json::to_string(&npc.presentation).map_err(|e| e.to_string())?
                ],
            )
            .map_err(|e| e.to_string())?;
    }
    transaction
        .execute("DELETE FROM location WHERE campaign_id=?1", [&campaign.id])
        .map_err(|e| e.to_string())?;
    for (index, location) in campaign.locations.iter().enumerate() {
        transaction
            .execute(
                "INSERT INTO location (id,campaign_id,sort_order,record_json) VALUES (?1,?2,?3,?4)",
                params![
                    location.id,
                    campaign.id,
                    index as i64,
                    serde_json::to_string(location).map_err(|e| e.to_string())?
                ],
            )
            .map_err(|e| e.to_string())?;
    }
    transaction
        .execute("DELETE FROM faction WHERE campaign_id=?1", [&campaign.id])
        .map_err(|e| e.to_string())?;
    for (index, faction) in campaign.factions.iter().enumerate() {
        transaction
            .execute(
                "INSERT INTO faction (id,campaign_id,sort_order,record_json) VALUES (?1,?2,?3,?4)",
                params![
                    faction.id,
                    campaign.id,
                    index as i64,
                    serde_json::to_string(faction).map_err(|e| e.to_string())?
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
    if !(1..=3).contains(&version) {
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
    let statblock_field_set = if table_exists(&connection, "campaign_settings")? {
        connection
            .query_row(
                "SELECT statblock_field_set_json FROM campaign_settings WHERE campaign_id=?1",
                [&id],
                |row| row.get::<_, String>(0),
            )
            .optional()
            .map_err(|e| e.to_string())?
            .map(|json| serde_json::from_str(&json).map_err(|e| e.to_string()))
            .transpose()?
            .unwrap_or_default()
    } else {
        StatblockFieldSet::default()
    };
    let has_npc_presentation = table_exists(&connection, "npc_presentation")?;
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
                presentation: NpcPresentation::default(),
            })
        })
        .map_err(|e| e.to_string())?
        .collect::<Result<Vec<_>, _>>()
        .map_err(|e| e.to_string())?;
    let mut npcs = npcs;
    if has_npc_presentation {
        let mut statement = connection.prepare(
            "SELECT npc_presentation.npc_id,npc_presentation.presentation_json FROM npc_presentation JOIN npc ON npc.id=npc_presentation.npc_id WHERE npc.campaign_id=?1"
        ).map_err(|e| e.to_string())?;
        let rows = statement
            .query_map([&id], |row| {
                Ok((row.get::<_, String>(0)?, row.get::<_, String>(1)?))
            })
            .map_err(|e| e.to_string())?;
        let mut saved_presentations = HashMap::new();
        for row in rows {
            let (npc_id, json) = row.map_err(|e| e.to_string())?;
            saved_presentations.insert(
                npc_id,
                serde_json::from_str::<NpcPresentation>(&json).map_err(|e| e.to_string())?,
            );
        }
        for npc in &mut npcs {
            if let Some(presentation) = saved_presentations.remove(&npc.id) {
                npc.presentation = presentation;
            }
        }
        if !saved_presentations.is_empty() {
            return Err("Campaign contains presentation data for an unknown NPC.".into());
        }
    }
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
    let mut locations = Vec::new();
    if table_exists(&connection, "location")? {
        let mut statement = connection
            .prepare("SELECT id,record_json FROM location WHERE campaign_id=?1 ORDER BY sort_order")
            .map_err(|e| e.to_string())?;
        let rows = statement
            .query_map([&id], |row| {
                Ok((row.get::<_, String>(0)?, row.get::<_, String>(1)?))
            })
            .map_err(|e| e.to_string())?;
        for row in rows {
            let (record_id, json) = row.map_err(|e| e.to_string())?;
            let location: Location = serde_json::from_str(&json).map_err(|e| e.to_string())?;
            if location.id != record_id {
                return Err("Location record ID does not match its stored ID.".into());
            }
            locations.push(location);
        }
    }
    let mut factions = Vec::new();
    if table_exists(&connection, "faction")? {
        let mut statement = connection
            .prepare("SELECT id,record_json FROM faction WHERE campaign_id=?1 ORDER BY sort_order")
            .map_err(|e| e.to_string())?;
        let rows = statement
            .query_map([&id], |row| {
                Ok((row.get::<_, String>(0)?, row.get::<_, String>(1)?))
            })
            .map_err(|e| e.to_string())?;
        for row in rows {
            let (record_id, json) = row.map_err(|e| e.to_string())?;
            let faction: Faction = serde_json::from_str(&json).map_err(|e| e.to_string())?;
            if faction.id != record_id {
                return Err("Faction record ID does not match its stored ID.".into());
            }
            factions.push(faction);
        }
    }
    let mut campaign = Campaign {
        format: "ttrpg-campaign".into(),
        schema_version,
        id,
        name,
        created_at,
        updated_at,
        statblock_field_set,
        npcs,
        locations,
        factions,
        workspace,
        section,
        sidebar: Sidebar { width, open },
    };
    campaign.validate()?;
    for npc in &mut campaign.npcs {
        for node in &mut npc.notes {
            transform_images(node, folder, false)?;
        }
        transform_presentation_images(&mut npc.presentation, folder, false)?;
    }
    for location in &mut campaign.locations {
        transform_location_image(location, folder, false)?;
    }
    for faction in &mut campaign.factions {
        transform_faction_image(faction, folder, false)?;
    }
    Ok(campaign)
}

fn table_exists(connection: &Connection, name: &str) -> Result<bool, String> {
    connection
        .query_row(
            "SELECT EXISTS(SELECT 1 FROM sqlite_master WHERE type='table' AND name=?1)",
            [name],
            |row| row.get(0),
        )
        .map_err(|e| e.to_string())
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
        }))
        .unwrap();
        assert_eq!(
            serde_json::to_value(history).unwrap(),
            json!({
                "entries": [{"kind": "character", "workspaceId": "workspace:1", "characterId": "npc-1", "section": null}], "index": 0
            })
        );
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
        assert_eq!(
            serde_json::to_value(read_campaign(&path).unwrap()).unwrap(),
            expected
        );
        value["workspace"]["panels"]["workspace:1"]["panels"]["map:prototype"]
            ["contentComponent"] = json!("unknown");
        assert!(serde_json::from_value::<Campaign>(value)
            .unwrap()
            .validate()
            .is_err());
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
    fn legacy_package_without_npc_presentation_storage_opens_with_defaults() {
        let folder = tempfile::tempdir().unwrap();
        let path = folder.path().join("legacy.campaign");
        write_campaign(&path, example()).unwrap();
        let connection = Connection::open(path.join("campaign.sqlite")).unwrap();
        connection
            .execute_batch("DROP TABLE npc_presentation; DROP TABLE campaign_settings;")
            .unwrap();
        let opened = read_campaign(&path).unwrap();
        let value = serde_json::to_value(opened).unwrap();
        assert_eq!(
            value["statblockFieldSet"],
            json!({"id":"dnd-5.5e","version":1})
        );
        assert_eq!(value["npcs"][0]["presentation"]["playerDescription"], "");
        assert_eq!(
            value["npcs"][0]["presentation"]["statblock"]["data"],
            json!({})
        );
    }

    #[test]
    fn npc_presentation_and_all_images_round_trip_through_assets() {
        let folder = tempfile::tempdir().unwrap();
        let path = folder.path().join("presentation.campaign");
        let mut value = serde_json::to_value(example()).unwrap();
        value["statblockFieldSet"] = json!({"id":"dnd-5.5e","version":1});
        value["npcs"][0]["presentation"] = json!({
            "banner":{"type":"img","url":"data:image/png;base64,YmFubmVy"},
            "portrait":{"type":"img","url":"data:image/jpeg;base64,cG9ydHJhaXQ="},
            "playerDescription":"A cautious scout.",
            "relationships":[],
            "locations":[],
            "factions":[],
            "gmReference":{
                "background":"A traveler.","wants":"Safety","ideals":"Truth","bond":"The village",
                "flaw":"Distrustful","secrets":"Knows the pass","reaction":"Withdraws",
                "personality":"Patient","mannerisms":"Studies tracks","notableActions":"Leaves markers",
                "voice":"Soft","allies":"Rangers","enemies":"Bandits","other":""
            },
            "statblock":{
                "fieldSetId":"dnd-5.5e","fieldSetVersion":1,
                "tokenImage":{"type":"img","url":"data:image/webp;base64,dG9rZW4="},
                "data":{"armorClass":15,"actions":[{"name":"Track","description":"Follow a trail."}]}
            }
        });
        let expected = value.clone();
        write_campaign(&path, serde_json::from_value(value).unwrap()).unwrap();
        let db = Connection::open(path.join("campaign.sqlite")).unwrap();
        let stored: String = db
            .query_row(
                "SELECT presentation_json FROM npc_presentation WHERE npc_id='npc-1'",
                [],
                |row| row.get(0),
            )
            .unwrap();
        assert!(stored.contains("assets/"));
        assert_eq!(fs::read_dir(path.join("assets")).unwrap().count(), 4);
        assert_eq!(
            serde_json::to_value(read_campaign(&path).unwrap()).unwrap(),
            expected
        );
    }

    #[test]
    fn relationships_round_trip_including_missing_targets() {
        let folder = tempfile::tempdir().unwrap();
        let path = folder.path().join("relationships.campaign");
        let mut campaign = example();
        campaign.npcs[0].presentation.relationships = vec![NpcRelationship {
            target_id: "deleted-npc".into(),
            label: "Close friend".into(),
        }];
        write_campaign(&path, campaign).unwrap();
        let loaded = read_campaign(&path).unwrap();
        assert_eq!(
            loaded.npcs[0].presentation.relationships[0].target_id,
            "deleted-npc"
        );
        assert_eq!(
            loaded.npcs[0].presentation.relationships[0].label,
            "Close friend"
        );
    }

    #[test]
    fn legacy_presentation_defaults_to_no_relationships() {
        let mut value = serde_json::to_value(NpcPresentation::default()).unwrap();
        value.as_object_mut().unwrap().remove("relationships");
        let loaded: NpcPresentation = serde_json::from_value(value).unwrap();
        assert!(loaded.relationships.is_empty());
    }

    #[test]
    fn invalid_relationship_targets_are_rejected() {
        let mut campaign = example();
        for target in ["", "npc-1"] {
            campaign.npcs[0].presentation.relationships = vec![NpcRelationship {
                target_id: target.into(),
                label: String::new(),
            }];
            assert!(campaign.validate().is_err());
        }
        campaign.npcs[0].presentation.relationships = vec![
            NpcRelationship {
                target_id: "npc-2".into(),
                label: "Friend".into(),
            },
            NpcRelationship {
                target_id: "npc-2".into(),
                label: "Ally".into(),
            },
        ];
        assert!(campaign.validate().is_err());
    }

    #[test]
    fn locations_images_links_and_navigation_round_trip() {
        let folder = tempfile::tempdir().unwrap();
        let path = folder.path().join("locations.campaign");
        let mut campaign = example();
        campaign.locations.push(Location {
            id: "loc-1".into(),
            name: "Harrow Glen".into(),
            image: Some(NpcImage {
                kind: "img".into(),
                url: "data:image/webp;base64,dG9rZW4=".into(),
            }),
            public_description: "A woodland village.".into(),
            gm_notes: "A hidden passage.".into(),
        });
        campaign.npcs[0]
            .presentation
            .locations
            .push(NpcRelationship {
                target_id: "loc-1".into(),
                label: "Childhood home".into(),
            });
        campaign
            .workspace
            .as_mut()
            .unwrap()
            .history
            .entries
            .push(Destination::Location {
                workspace_id: "workspace:1".into(),
                location_id: "loc-1".into(),
                section: Some("Locations & Maps".into()),
            });
        let expected = serde_json::to_value(&campaign).unwrap();
        write_campaign(&path, campaign).unwrap();
        let stored: String = Connection::open(path.join("campaign.sqlite"))
            .unwrap()
            .query_row(
                "SELECT record_json FROM location WHERE id='loc-1'",
                [],
                |row| row.get(0),
            )
            .unwrap();
        assert!(stored.contains("assets/"));
        let moved = folder.path().join("moved.campaign");
        fs::rename(&path, &moved).unwrap();
        assert_eq!(
            serde_json::to_value(read_campaign(&moved).unwrap()).unwrap(),
            expected
        );
    }

    #[test]
    fn version_one_campaigns_load_and_upgrade_locations_on_save() {
        let folder = tempfile::tempdir().unwrap();
        let path = folder.path().join("legacy.campaign");
        write_campaign(&path, example()).unwrap();
        let db = Connection::open(path.join("campaign.sqlite")).unwrap();
        db.execute_batch("DROP TABLE location; PRAGMA user_version=1;")
            .unwrap();
        drop(db);
        let campaign = read_campaign(&path).unwrap();
        assert!(campaign.locations.is_empty());
        write_campaign(&path, campaign).unwrap();
        let db = Connection::open(path.join("campaign.sqlite")).unwrap();
        assert_eq!(
            db.pragma_query_value(None, "user_version", |row| row.get::<_, i32>(0))
                .unwrap(),
            3
        );
        assert!(table_exists(&db, "location").unwrap());
    }

    #[test]
    fn invalid_locations_and_duplicate_location_links_are_rejected() {
        let mut campaign = example();
        campaign.locations.push(Location {
            id: "loc-1".into(),
            name: " ".into(),
            image: None,
            public_description: String::new(),
            gm_notes: String::new(),
        });
        assert!(campaign.validate().is_err());
        campaign.locations[0].name = "Village".into();
        campaign.npcs[0].presentation.locations = vec![
            NpcRelationship {
                target_id: "loc-1".into(),
                label: String::new(),
            },
            NpcRelationship {
                target_id: "loc-1".into(),
                label: String::new(),
            },
        ];
        assert!(campaign.validate().is_err());
    }

    #[test]
    fn factions_images_links_and_navigation_round_trip() {
        let folder = tempfile::tempdir().unwrap();
        let path = folder.path().join("factions.campaign");
        let mut campaign = example();
        campaign.factions.push(Faction {
            id: "faction-1".into(),
            name: "Harrow Glen Wardens".into(),
            image: Some(NpcImage {
                kind: "img".into(),
                url: "data:image/webp;base64,dG9rZW4=".into(),
            }),
            description: "Protectors of the village.".into(),
            gm_notes: "A hidden passage.".into(),
        });
        campaign.npcs[0]
            .presentation
            .factions
            .push(NpcRelationship {
                target_id: "faction-1".into(),
                label: "Member".into(),
            });
        campaign
            .workspace
            .as_mut()
            .unwrap()
            .history
            .entries
            .push(Destination::Faction {
                workspace_id: "workspace:1".into(),
                faction_id: "faction-1".into(),
                section: Some("Factions".into()),
            });
        let expected = serde_json::to_value(&campaign).unwrap();
        write_campaign(&path, campaign).unwrap();
        let stored: String = Connection::open(path.join("campaign.sqlite"))
            .unwrap()
            .query_row(
                "SELECT record_json FROM faction WHERE id='faction-1'",
                [],
                |row| row.get(0),
            )
            .unwrap();
        assert!(stored.contains("assets/"));
        let moved = folder.path().join("moved.campaign");
        fs::rename(&path, &moved).unwrap();
        assert_eq!(
            serde_json::to_value(read_campaign(&moved).unwrap()).unwrap(),
            expected
        );
    }

    #[test]
    fn invalid_factions_and_duplicate_faction_links_are_rejected() {
        let mut campaign = example();
        campaign.factions.push(Faction {
            id: "loc-1".into(),
            name: " ".into(),
            image: None,
            description: String::new(),
            gm_notes: String::new(),
        });
        assert!(campaign.validate().is_err());
        campaign.factions[0].name = "Village".into();
        campaign.npcs[0].presentation.factions = vec![
            NpcRelationship {
                target_id: "loc-1".into(),
                label: String::new(),
            },
            NpcRelationship {
                target_id: "loc-1".into(),
                label: String::new(),
            },
        ];
        assert!(campaign.validate().is_err());
    }

    #[test]
    fn version_two_campaigns_default_factions_and_upgrade_on_save() {
        let folder = tempfile::tempdir().unwrap();
        let path = folder.path().join("legacy-factions.campaign");
        let mut campaign = example();
        campaign.locations.push(Location {
            id: "loc-1".into(),
            name: "Village".into(),
            image: None,
            public_description: "An old village.".into(),
            gm_notes: "Private.".into(),
        });
        write_campaign(&path, campaign).unwrap();
        let db = Connection::open(path.join("campaign.sqlite")).unwrap();
        db.execute_batch("DROP TABLE faction; UPDATE npc_presentation SET presentation_json=json_remove(presentation_json,'$.factions'); PRAGMA user_version=2;").unwrap();
        drop(db);
        let campaign = read_campaign(&path).unwrap();
        assert!(campaign.factions.is_empty());
        assert!(campaign.npcs[0].presentation.factions.is_empty());
        assert_eq!(campaign.locations[0].name, "Village");
        write_campaign(&path, campaign).unwrap();
        let db = Connection::open(path.join("campaign.sqlite")).unwrap();
        assert_eq!(
            db.pragma_query_value(None, "user_version", |row| row.get::<_, i32>(0))
                .unwrap(),
            3
        );
        assert!(table_exists(&db, "faction").unwrap());
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

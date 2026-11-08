//! Turso adapter for the existing campaign schema. No UI or RPC dependencies.
use super::*;
use std::{
    fs::{self, File, OpenOptions},
    path::{Path, PathBuf},
};
use turso::{params, Connection};

type Result<T> = std::result::Result<T, String>;

pub(super) struct Storage {
    connection: Connection,
    // Keep the database and advisory package lock alive for the entire session.
    _database: turso::Database,
    _lock: File,
    pub folder: PathBuf,
}

pub(super) fn lock_package(folder: &Path) -> Result<File> {
    let file = OpenOptions::new()
        .read(true)
        .write(true)
        .create(true)
        .truncate(false)
        .open(folder.join(".campaign.lock"))
        .map_err(|e| e.to_string())?;
    file.try_lock()
        .map_err(|e| format!("Campaign is busy or cannot be locked: {e}"))?;
    Ok(file)
}

impl Storage {
    pub async fn open(folder: &Path, create: bool) -> Result<Self> {
        if folder.extension().and_then(|s| s.to_str()) != Some("campaign") {
            return Err("Choose a folder ending in .campaign.".into());
        }
        if create {
            // Never initialize over an existing package, even an empty one.
            fs::create_dir(folder).map_err(|e| e.to_string())?;
        } else if !folder.join("campaign.sqlite").is_file() {
            return Err("Campaign database does not exist.".into());
        }
        let folder = folder.canonicalize().map_err(|e| e.to_string())?;
        let lock = lock_package(&folder)?;
        let db_path = folder.join("campaign.sqlite");
        if db_path.exists()
            && !db_path
                .canonicalize()
                .map_err(|e| e.to_string())?
                .starts_with(&folder)
        {
            return Err("Database resolves outside the campaign package.".into());
        }
        let database =
            turso::Builder::new_local(db_path.to_str().ok_or("Campaign path must be UTF-8.")?)
                .build()
                .await
                .map_err(|e| e.to_string())?;
        let connection = database.connect().map_err(|e| e.to_string())?;
        connection
            .execute("PRAGMA foreign_keys = ON", ())
            .await
            .map_err(|e| e.to_string())?;
        let mut storage = Self {
            connection,
            _database: database,
            _lock: lock,
            folder,
        };
        let version = storage.version().await?;
        if (create && version != 0) || (!create && !(1..=8).contains(&version)) {
            return Err(format!("Unsupported campaign database version {version}."));
        }
        // Existing packages are only migrated on explicit Save.
        if create {
            storage.migrate().await?;
        }
        Ok(storage)
    }

    async fn version(&self) -> Result<i64> {
        let mut rows = self
            .connection
            .query("PRAGMA user_version", ())
            .await
            .map_err(|e| e.to_string())?;
        rows.next()
            .await
            .map_err(|e| e.to_string())?
            .ok_or("Database has no version.")?
            .get::<i64>(0)
            .map_err(|e| e.to_string())
    }

    async fn migrate(&mut self) -> Result<()> {
        let tx = self
            .connection
            .transaction()
            .await
            .map_err(|e| e.to_string())?;
        for sql in include_str!("schema.sql")
            .split(';')
            .filter(|s| !s.trim().is_empty())
        {
            tx.execute(sql, ()).await.map_err(|e| e.to_string())?;
        }
        tx.commit().await.map_err(|e| e.to_string())
    }

    pub async fn save(&mut self, campaign: &Campaign) -> Result<()> {
        campaign.validate()?;
        let mut document = serde_json::to_value(campaign).map_err(|e| e.to_string())?;
        assets::prepare_asset_directory(&self.folder)?;
        transform_images(&mut document, &self.folder, true)?;
        let campaign: Campaign = serde_json::from_value(document).map_err(|e| e.to_string())?;
        let version = self.version().await?;
        if !(1..=8).contains(&version) {
            return Err(format!("Unsupported campaign database version {version}."));
        }
        let tx = self
            .connection
            .transaction()
            .await
            .map_err(|e| e.to_string())?;
        let result = async {
            for sql in include_str!("schema.sql")
                .split(';')
                .filter(|s| !s.trim().is_empty())
            {
                tx.execute(sql, ()).await.map_err(|e| e.to_string())?;
            }
            write(&tx, &campaign).await
        }
        .await;
        match result {
            Ok(()) => tx.commit().await.map_err(|e| e.to_string()),
            Err(error) => {
                tx.rollback()
                    .await
                    .map_err(|rollback| format!("{error}; rollback failed: {rollback}"))?;
                Err(error)
            }
        }
    }

    pub async fn load(&self) -> Result<Campaign> {
        let rows = self.rows("SELECT id,name,schema_version,created_at,updated_at,section,sidebar_width,sidebar_open FROM campaign", ()).await?;
        if rows.len() != 1 {
            return Err("Campaign database must contain exactly one campaign.".into());
        }
        let row = &rows[0];
        let id = row.get::<String>(0).map_err(|e| e.to_string())?;
        let (items, item_fields) = self.item_catalog(&id).await?;
        let mut campaign = Campaign {
            format: "ttrpg-campaign".into(),
            schema_version: row
                .get::<i64>(2)
                .map_err(|e| e.to_string())?
                .try_into()
                .map_err(|_| "Invalid schema version.")?,
            id: id.clone(),
            name: row.get(1).map_err(|e| e.to_string())?,
            created_at: row.get(3).map_err(|e| e.to_string())?,
            updated_at: row.get(4).map_err(|e| e.to_string())?,
            section: row.get(5).map_err(|e| e.to_string())?,
            sidebar: Sidebar {
                width: row.get(6).map_err(|e| e.to_string())?,
                open: row.get::<i64>(7).map_err(|e| e.to_string())? != 0,
            },
            statblock_field_set: self
                .json_row("campaign_settings", "statblock_field_set_json", &id)
                .await?
                .unwrap_or_default(),
            inventory: self
                .json_row("party_inventory", "inventory_json", &id)
                .await?
                .unwrap_or_default(),
            items,
            item_fields,
            threads: self.records("story_thread", &id).await?,
            sessions: self.records("session_record", &id).await?,
            npcs: Vec::new(),
            locations: self.records("location", &id).await?,
            factions: self.records("faction", &id).await?,
            maps: self.records("map_record", &id).await?,
            workspace: None,
        };
        for row in self.rows("SELECT npc.id,npc.name,npc_notes.document_json FROM npc LEFT JOIN npc_notes ON npc_notes.npc_id=npc.id WHERE npc.campaign_id=?1 ORDER BY npc.sort_order", [id.clone()]).await? {
            let npc_id: String = row.get(0).map_err(|e| e.to_string())?;
            let presentation = if self.table_exists("npc_presentation").await? {
                let rows = self.rows("SELECT presentation_json FROM npc_presentation WHERE npc_id=?1", [npc_id.clone()]).await?;
                rows.first().map(|row| decode(row, 0)).transpose()?.unwrap_or_default()
            } else { NpcPresentation::default() };
            campaign.npcs.push(Npc {
                id: npc_id,
                name: row.get(1).map_err(|e| e.to_string())?,
                notes: decode(&row, 2)?,
                presentation,
            });
        }
        let rows = self
            .rows(
                "SELECT value_json FROM workspace_state WHERE state_key='workspace'",
                (),
            )
            .await?;
        campaign.workspace = rows.first().map(|row| decode(row, 0)).transpose()?;
        campaign.validate()?;
        // Hydrate assets only after validating the stored campaign.
        let mut value = serde_json::to_value(campaign).map_err(|e| e.to_string())?;
        transform_images(&mut value, &self.folder, false)?;
        serde_json::from_value(value).map_err(|e| e.to_string())
    }

    async fn rows(&self, sql: &str, params: impl turso::IntoParams) -> Result<Vec<turso::Row>> {
        let mut rows = self
            .connection
            .query(sql, params)
            .await
            .map_err(|e| e.to_string())?;
        let mut result = Vec::new();
        while let Some(row) = rows.next().await.map_err(|e| e.to_string())? {
            result.push(row);
        }
        Ok(result)
    }

    async fn table_exists(&self, table: &str) -> Result<bool> {
        Ok(!self
            .rows(
                "SELECT name FROM sqlite_master WHERE type='table' AND name=?1",
                [table],
            )
            .await?
            .is_empty())
    }

    async fn json_row<T: serde::de::DeserializeOwned>(
        &self,
        table: &str,
        column: &str,
        id: &str,
    ) -> Result<Option<T>> {
        if !self.table_exists(table).await? {
            return Ok(None);
        }
        let rows = self
            .rows(
                &format!("SELECT {column} FROM {table} WHERE campaign_id=?1"),
                [id],
            )
            .await?;
        rows.first().map(|row| decode(row, 0)).transpose()
    }

    async fn item_catalog(
        &self,
        id: &str,
    ) -> Result<(Vec<CampaignItem>, Vec<ItemFieldDefinition>)> {
        if !self.table_exists("item_catalog").await? {
            return Ok((Vec::new(), Vec::new()));
        }
        let rows = self
            .rows(
                "SELECT items_json,fields_json FROM item_catalog WHERE campaign_id=?1",
                [id],
            )
            .await?;
        match rows.first() {
            Some(row) => Ok((decode(row, 0)?, decode(row, 1)?)),
            None => Ok((Vec::new(), Vec::new())),
        }
    }

    async fn records<T: serde::de::DeserializeOwned>(
        &self,
        table: &str,
        id: &str,
    ) -> Result<Vec<T>> {
        if !self.table_exists(table).await? {
            return Ok(Vec::new());
        }
        let rows = self
            .rows(
                &format!(
                    "SELECT id,record_json FROM {table} WHERE campaign_id=?1 ORDER BY sort_order"
                ),
                [id],
            )
            .await?;
        rows.iter()
            .map(|row| {
                let value: Value = decode(row, 1)?;
                let id: String = row.get(0).map_err(|e| e.to_string())?;
                if value["id"].as_str() != Some(&id) {
                    return Err("Record ID does not match stored ID.".into());
                }
                serde_json::from_value(value).map_err(|e| e.to_string())
            })
            .collect()
    }
}

fn decode<T: serde::de::DeserializeOwned>(row: &turso::Row, column: usize) -> Result<T> {
    serde_json::from_str(&row.get::<String>(column).map_err(|e| e.to_string())?)
        .map_err(|e| e.to_string())
}

async fn write(connection: &Connection, campaign: &Campaign) -> Result<()> {
    let mut rows = connection
        .query("SELECT id FROM campaign", ())
        .await
        .map_err(|e| e.to_string())?;
    if let Some(row) = rows.next().await.map_err(|e| e.to_string())? {
        if row.get::<String>(0).map_err(|e| e.to_string())? != campaign.id
            || rows.next().await.map_err(|e| e.to_string())?.is_some()
        {
            return Err(
                "This package belongs to another campaign or contains unexpected records.".into(),
            );
        }
    }
    drop(rows);
    connection.execute(
        "INSERT INTO campaign (id,name,schema_version,created_at,updated_at,section,sidebar_width,sidebar_open)
         VALUES (?1,?2,?3,?4,?5,?6,?7,?8)
         ON CONFLICT(id) DO UPDATE SET name=excluded.name,updated_at=excluded.updated_at,section=excluded.section,sidebar_width=excluded.sidebar_width,sidebar_open=excluded.sidebar_open",
        params![campaign.id.clone(), campaign.name.clone(), campaign.schema_version as i64,
            campaign.created_at.clone(), campaign.updated_at.clone(), campaign.section.clone(),
            campaign.sidebar.width, campaign.sidebar.open as i64],
    ).await.map_err(|e| e.to_string())?;
    for (table, column, value) in [
        (
            "campaign_settings",
            "statblock_field_set_json",
            serde_json::to_value(&campaign.statblock_field_set),
        ),
        (
            "party_inventory",
            "inventory_json",
            serde_json::to_value(&campaign.inventory),
        ),
    ] {
        connection.execute(&format!("INSERT INTO {table} (campaign_id,{column}) VALUES (?1,?2) ON CONFLICT(campaign_id) DO UPDATE SET {column}=excluded.{column}"),
            params![campaign.id.clone(), value.map_err(|e| e.to_string())?.to_string()]).await.map_err(|e| e.to_string())?;
    }
    connection
        .execute(
            "INSERT INTO item_catalog (campaign_id,items_json,fields_json) VALUES (?1,?2,?3)
             ON CONFLICT(campaign_id) DO UPDATE SET items_json=excluded.items_json,fields_json=excluded.fields_json",
            params![
                campaign.id.clone(),
                serde_json::to_string(&campaign.items).map_err(|e| e.to_string())?,
                serde_json::to_string(&campaign.item_fields).map_err(|e| e.to_string())?
            ],
        )
        .await
        .map_err(|e| e.to_string())?;
    // Explicit child deletes also keep this safe if FK cascade behavior changes.
    for table in ["npc_notes", "npc_presentation"] {
        connection
            .execute(
                &format!(
                    "DELETE FROM {table} WHERE npc_id IN (SELECT id FROM npc WHERE campaign_id=?1)"
                ),
                [campaign.id.clone()],
            )
            .await
            .map_err(|e| e.to_string())?;
    }
    connection
        .execute(
            "DELETE FROM npc WHERE campaign_id=?1",
            [campaign.id.clone()],
        )
        .await
        .map_err(|e| e.to_string())?;
    for (order, npc) in campaign.npcs.iter().enumerate() {
        connection
            .execute(
                "INSERT INTO npc (id,campaign_id,name,sort_order) VALUES (?1,?2,?3,?4)",
                params![
                    npc.id.clone(),
                    campaign.id.clone(),
                    npc.name.clone(),
                    order as i64
                ],
            )
            .await
            .map_err(|e| e.to_string())?;
        for (table, column, value) in [
            (
                "npc_notes",
                "document_json",
                serde_json::to_value(&npc.notes),
            ),
            (
                "npc_presentation",
                "presentation_json",
                serde_json::to_value(&npc.presentation),
            ),
        ] {
            connection
                .execute(
                    &format!("INSERT INTO {table} (npc_id,{column}) VALUES (?1,?2)"),
                    params![
                        npc.id.clone(),
                        value.map_err(|e| e.to_string())?.to_string()
                    ],
                )
                .await
                .map_err(|e| e.to_string())?;
        }
    }
    for (table, records) in [
        ("location", serde_json::to_value(&campaign.locations)),
        ("faction", serde_json::to_value(&campaign.factions)),
        ("map_record", serde_json::to_value(&campaign.maps)),
        ("story_thread", serde_json::to_value(&campaign.threads)),
        ("session_record", serde_json::to_value(&campaign.sessions)),
    ] {
        connection
            .execute(
                &format!("DELETE FROM {table} WHERE campaign_id=?1"),
                [campaign.id.clone()],
            )
            .await
            .map_err(|e| e.to_string())?;
        let records = records.map_err(|e| e.to_string())?;
        for (order, record) in records
            .as_array()
            .ok_or("Records must be an array.")?
            .iter()
            .enumerate()
        {
            connection.execute(&format!("INSERT INTO {table} (id,campaign_id,sort_order,record_json) VALUES (?1,?2,?3,?4)"),
                params![record["id"].as_str().ok_or("Record has no ID.")?, campaign.id.clone(), order as i64, record.to_string()]).await.map_err(|e| e.to_string())?;
        }
    }
    connection
        .execute("DELETE FROM workspace_state", ())
        .await
        .map_err(|e| e.to_string())?;
    if let Some(workspace) = &campaign.workspace {
        connection
            .execute(
                "INSERT INTO workspace_state (state_key,value_json) VALUES ('workspace',?1)",
                [serde_json::to_string(workspace).map_err(|e| e.to_string())?],
            )
            .await
            .map_err(|e| e.to_string())?;
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    async fn example() -> Campaign {
        let mut session = Session::default();
        session
            .execute(
                "campaign.new",
                json!({"name":"Storage test","expectedRevision":0}),
            )
            .await
            .unwrap();
        session
            .execute("npc.create", json!({"name":"Scout","expectedRevision":1}))
            .await
            .unwrap();
        serde_json::from_value(session.inspect()["campaign"].clone()).unwrap()
    }

    #[tokio::test]
    async fn failed_write_rolls_back_and_next_save_can_succeed() {
        let temp = tempfile::tempdir().unwrap();
        let path = temp.path().join("rollback.campaign");
        let mut storage = Storage::open(&path, true).await.unwrap();
        let original = example().await;
        storage.save(&original).await.unwrap();
        // Fail late, after the campaign and NPC rows have already been written.
        storage.connection.execute(
            "CREATE TRIGGER fail_notes BEFORE INSERT ON npc_notes BEGIN SELECT RAISE(ABORT, 'fixture failure'); END",
            (),
        ).await.unwrap();
        let mut changed = original.clone();
        changed.name = "Must roll back".into();
        changed.npcs[0].name = "Must also roll back".into();
        assert!(storage.save(&changed).await.is_err());
        assert_eq!(
            serde_json::to_value(storage.load().await.unwrap()).unwrap(),
            serde_json::to_value(&original).unwrap()
        );
        storage
            .connection
            .execute("DROP TRIGGER fail_notes", ())
            .await
            .unwrap();
        storage.save(&changed).await.unwrap();
        assert_eq!(storage.load().await.unwrap().name, changed.name);
    }

    #[tokio::test]
    async fn unknown_versions_and_existing_destinations_are_rejected() {
        let temp = tempfile::tempdir().unwrap();
        let path = temp.path().join("future.campaign");
        let storage = Storage::open(&path, true).await.unwrap();
        storage
            .connection
            .execute("PRAGMA user_version = 999", ())
            .await
            .unwrap();
        drop(storage);
        assert!(Storage::open(&path, false)
            .await
            .err()
            .unwrap()
            .contains("999"));
        assert!(Storage::open(&path, true).await.is_err());
    }

    #[tokio::test]
    async fn constraints_and_missing_assets_are_checked() {
        let temp = tempfile::tempdir().unwrap();
        let path = temp.path().join("constraints.campaign");
        let mut storage = Storage::open(&path, true).await.unwrap();
        assert!(storage.connection.execute(
            "INSERT INTO npc (id,campaign_id,name,sort_order) VALUES ('orphan','missing','Orphan',0)", ()
        ).await.is_err(), "foreign keys must actually be enforced");
        let mut campaign = example().await;
        campaign.npcs[0].notes = vec![
            json!({"type":"img","url":"data:image/png;base64,aW1hZ2U=","children":[{"text":""}]}),
        ];
        storage.save(&campaign).await.unwrap();
        assert_eq!(
            storage.load().await.unwrap().npcs[0].notes,
            campaign.npcs[0].notes
        );
        let asset = fs::read_dir(path.join("assets"))
            .unwrap()
            .next()
            .unwrap()
            .unwrap()
            .path();
        fs::write(&asset, b"corrupt").unwrap();
        assert!(storage
            .load()
            .await
            .err()
            .unwrap()
            .contains("hash mismatch"));
        fs::remove_file(asset).unwrap();
        assert!(storage
            .load()
            .await
            .err()
            .unwrap()
            .contains("Missing or unreadable"));
    }

    fn session_campaign() -> Campaign {
        let mut value = serde_json::to_value(version_seven_campaign()).unwrap();
        value["sessions"] = json!([{
            "id": "session-1", "title": "The Low Tide", "number": 8,
            "date": "2026-11-14", "previous": false,
            "whereLeftOff": [{"type":"p","children":[{"text":"The party reached the harbor."}]}],
            "prep": [{"type":"p","children":[{"text":"Meet Niya beneath the bell tower."}]}],
            "happened": [{"type":"p","children":[{"text":"The party chose the tunnel."}]}],
            "summary": [{"type":"p","children":[{"text":"A lantern waits below the seawall."}]},
                {"type":"img","url":"data:image/png;base64,c2Vzc2lvbg==","children":[{"text":""}]}],
            "beats": [
                {"id":"beat-1","title":"Meet Niya","notes":[{"type":"p","children":[{"text":"She has a tide chart."}]}],"status":"planned"},
                {"id":"beat-2","title":"Follow the lantern","notes":[{"type":"p","children":[{"text":"The tunnel is one route."}]}],"status":"happened"}
            ],
            "links": [
                {"kind":"npc","targetId":"missing-npc","label":"Witness"},
                {"kind":"location","targetId":"missing-place","label":"Last seen"}
            ]
        }]);
        serde_json::from_value(value).unwrap()
    }

    fn version_seven_campaign() -> Campaign {
        serde_json::from_value(json!({
            "format": "ttrpg-campaign", "schemaVersion": 1, "id": "v7-campaign",
            "name": "Version seven", "createdAt": "2026-11-07", "updatedAt": "2026-11-07",
            "section": null, "sidebar": {"width": 256, "open": true},
            "npcs": [], "locations": [], "factions": [], "maps": [],
            "threads": [{"id": "thread-1", "title": "A missing shipment", "status": "active",
                "playerReminder": "A crate vanished.", "origin": "A dock rumor", "sourceLabel": "Rumor",
                "currentSituation": [{"type": "p", "children": [{"text": "The crew is missing."}]},
                    {"type": "img", "url": "data:image/png;base64,dGhyZWFk", "children": [{"text": ""}]}],
                "gmPossibilities": [{"type": "p", "children": [{"text": "A guild negotiator arrives."}]}],
                "people": [], "locations": [], "factions": []}],
            "inventory": {"gold": 12, "entries": [{"id": "rope", "name": "Rope", "kind": "item", "quantity": 2, "note": ""}]},
            "items": [{"id": "item-1", "name": "Compass", "image": {"type": "img", "url": "data:image/png;base64,aXRlbQ=="},
                "description": "Points north", "gmNotes": "Private", "values": {}}],
            "itemFields": [{"id": "tier", "label": "Tier", "kind": "choice",
                "options": [{"id": "c", "label": "C"}, {"id": "b", "label": "B"}]}],
            "workspace": null
        }))
        .unwrap()
    }

    #[tokio::test]
    async fn version_seven_threads_items_and_assets_round_trip_through_turso() {
        let temp = tempfile::tempdir().unwrap();
        let path = temp.path().join("v7.campaign");
        let original = version_seven_campaign();
        let mut storage = Storage::open(&path, true).await.unwrap();
        storage.save(&original).await.unwrap();
        // The item/thread image bytes are installed as hashed assets.
        assert_eq!(fs::read_dir(path.join("assets")).unwrap().count(), 2);
        let stored: String = {
            let mut rows = storage
                .connection
                .query("SELECT items_json FROM item_catalog", ())
                .await
                .unwrap();
            rows.next().await.unwrap().unwrap().get(0).unwrap()
        };
        assert!(stored.contains("assets/"));
        assert!(!stored.contains("data:image"));
        let loaded = storage.load().await.unwrap();
        assert_eq!(loaded.threads.len(), 1);
        assert_eq!(loaded.threads[0].title, "A missing shipment");
        assert_eq!(loaded.items.len(), 1);
        assert_eq!(
            serde_json::to_value(&loaded.items).unwrap(),
            serde_json::to_value(&original.items).unwrap()
        );
        assert_eq!(
            serde_json::to_value(&loaded.item_fields).unwrap(),
            serde_json::to_value(&original.item_fields).unwrap()
        );
        assert_eq!(loaded.inventory.gold, 12);
        drop(storage);
        let moved = temp.path().join("moved.campaign");
        fs::rename(&path, &moved).unwrap();
        let mut reopened = Storage::open(&moved, false).await.unwrap();
        let loaded = reopened.load().await.unwrap();
        assert_eq!(
            serde_json::to_value(&loaded).unwrap(),
            serde_json::to_value(&original).unwrap()
        );
        // Saving a loaded package keeps the v7 catalog and threads.
        reopened.save(&loaded).await.unwrap();
        assert_eq!(
            serde_json::to_value(&reopened.load().await.unwrap().items).unwrap(),
            serde_json::to_value(&original.items).unwrap()
        );
    }

    #[tokio::test]
    async fn sessions_round_trip_and_v7_upgrade_adds_empty_session_table() {
        let temp = tempfile::tempdir().unwrap();
        let path = temp.path().join("sessions.campaign");
        let original = session_campaign();
        let mut storage = Storage::open(&path, true).await.unwrap();
        storage.save(&original).await.unwrap();
        assert_eq!(storage.version().await.unwrap(), 8);
        // Thread, item, and session summary images.
        assert_eq!(fs::read_dir(path.join("assets")).unwrap().count(), 3);
        let loaded = storage.load().await.unwrap();
        assert_eq!(loaded.sessions.len(), 1);
        assert_eq!(loaded.sessions[0].title, "The Low Tide");
        assert_eq!(loaded.sessions[0].beats.len(), 2);
        assert_eq!(loaded.sessions[0].beats[1].status, "happened");
        assert_eq!(loaded.sessions[0].links[1].target_id, "missing-place");
        assert_eq!(
            serde_json::to_value(&loaded).unwrap(),
            serde_json::to_value(&original).unwrap()
        );
        drop(storage);

        let moved = temp.path().join("moved-sessions.campaign");
        fs::rename(&path, &moved).unwrap();
        let mut storage = Storage::open(&moved, false).await.unwrap();
        let loaded = storage.load().await.unwrap();
        storage.save(&loaded).await.unwrap();
        assert_eq!(storage.version().await.unwrap(), 8);

        // A v7 package has no session table and loads with an empty collection.
        let v7_path = temp.path().join("v7-no-sessions.campaign");
        let mut v7 = Storage::open(&v7_path, true).await.unwrap();
        v7.save(&version_seven_campaign()).await.unwrap();
        v7.connection
            .execute("DROP TABLE session_record", ())
            .await
            .unwrap();
        v7.connection
            .execute("PRAGMA user_version=7", ())
            .await
            .unwrap();
        drop(v7);
        let mut v7 = Storage::open(&v7_path, false).await.unwrap();
        assert!(v7.load().await.unwrap().sessions.is_empty());
        v7.save(&version_seven_campaign()).await.unwrap();
        assert_eq!(v7.version().await.unwrap(), 8);
        assert!(v7.table_exists("session_record").await.unwrap());
    }

    #[tokio::test]
    async fn version_six_loads_without_items_and_upgrades_on_save() {
        let temp = tempfile::tempdir().unwrap();
        let path = temp.path().join("v6.campaign");
        let original = version_seven_campaign();
        let mut storage = Storage::open(&path, true).await.unwrap();
        storage.save(&original).await.unwrap();
        storage
            .connection
            .execute("DROP TABLE item_catalog", ())
            .await
            .unwrap();
        storage
            .connection
            .execute("DROP TABLE session_record", ())
            .await
            .unwrap();
        storage
            .connection
            .execute("PRAGMA user_version=6", ())
            .await
            .unwrap();
        drop(storage);
        let mut storage = Storage::open(&path, false).await.unwrap();
        let loaded = storage.load().await.unwrap();
        assert!(loaded.items.is_empty() && loaded.item_fields.is_empty());
        assert!(loaded.sessions.is_empty());
        assert_eq!(loaded.threads.len(), 1);
        storage.save(&loaded).await.unwrap();
        assert_eq!(storage.version().await.unwrap(), 8);
        assert!(storage.table_exists("item_catalog").await.unwrap());
        assert!(storage.table_exists("session_record").await.unwrap());
    }

    #[tokio::test]
    async fn version_five_loads_without_threads_and_upgrades_on_save() {
        let temp = tempfile::tempdir().unwrap();
        let path = temp.path().join("v5.campaign");
        let mut storage = Storage::open(&path, true).await.unwrap();
        storage.save(&version_seven_campaign()).await.unwrap();
        for sql in [
            "DROP TABLE story_thread",
            "DROP TABLE item_catalog",
            "DROP TABLE session_record",
            "PRAGMA user_version=5",
        ] {
            storage.connection.execute(sql, ()).await.unwrap();
        }
        drop(storage);
        let mut storage = Storage::open(&path, false).await.unwrap();
        let loaded = storage.load().await.unwrap();
        assert!(loaded.threads.is_empty());
        assert!(loaded.items.is_empty());
        assert!(loaded.sessions.is_empty());
        storage.save(&loaded).await.unwrap();
        assert_eq!(storage.version().await.unwrap(), 8);
    }

    #[cfg(feature = "legacy-sqlite")]
    #[tokio::test]
    async fn legacy_sqlite_and_turso_round_trip_same_package() {
        let temp = tempfile::tempdir().unwrap();
        let path = temp.path().join("compatibility.campaign");
        let original = example().await;
        CampaignRepository::save(&path, original.clone()).unwrap();
        let mut storage = Storage::open(&path, false).await.unwrap();
        let mut loaded = storage.load().await.unwrap();
        assert_eq!(
            serde_json::to_value(&loaded).unwrap(),
            serde_json::to_value(&original).unwrap()
        );
        // Legacy and headless adapters honor the same package lock.
        assert!(CampaignRepository::save(&path, original).is_err());
        loaded.npcs[0].name = "Written by Turso".into();
        storage.save(&loaded).await.unwrap();
        drop(storage);
        let legacy = CampaignRepository::load(&path).unwrap();
        assert_eq!(
            serde_json::to_value(legacy).unwrap(),
            serde_json::to_value(loaded).unwrap()
        );
    }

    #[cfg(feature = "legacy-sqlite")]
    #[tokio::test]
    async fn legacy_sqlite_v7_threads_items_and_workspace_round_trip_through_turso() {
        let temp = tempfile::tempdir().unwrap();
        let path = temp.path().join("v7-compatibility.campaign");
        let original = version_seven_campaign();
        CampaignRepository::save(&path, original.clone()).unwrap();
        let mut storage = Storage::open(&path, false).await.unwrap();
        let mut loaded = storage.load().await.unwrap();
        assert_eq!(
            serde_json::to_value(&loaded).unwrap(),
            serde_json::to_value(&original).unwrap()
        );
        loaded.threads[0].status = "resolved".into();
        storage.save(&loaded).await.unwrap();
        drop(storage);
        let legacy = CampaignRepository::load(&path).unwrap();
        assert_eq!(
            serde_json::to_value(&legacy).unwrap(),
            serde_json::to_value(&loaded).unwrap()
        );
    }
}

#[cfg(all(test, feature = "legacy-sqlite"))]
mod compatibility_fixture {
    use super::*;
    use serde_json::json;

    fn complex_campaign() -> Campaign {
        serde_json::from_value(json!({
            "format": "ttrpg-campaign", "schemaVersion": 1, "id": "complex-campaign",
            "name": "The Lanterns of Greyhaven", "createdAt": "2026-10-01T00:00:00Z",
            "updatedAt": "2026-10-02T00:00:00Z", "section": "Characters",
            "sidebar": {"width": 256, "open": true},
            "workspace": {
                "layout": {
                    "grid": {"root": {"type": "branch", "data": []}, "height": 600,
                        "width": 800, "orientation": "HORIZONTAL"},
                    "panels": {}
                },
                "panels": {}, "nextId": 1, "sidebarWidth": 192, "collapsed": false,
                "history": {"entries": [{"kind": "settings"}], "index": 0}
            },
            "statblockFieldSet": {"id": "dnd-5.5e", "version": 1},
            "npcs": [{
                "id": "npc-1", "name": "Carlos Tree",
                "notes": [
                    {"type": "p", "children": [{"text": "Private ", "bold": true},
                        {"text": "notes", "italic": true}]},
                    {"type": "img", "url": "data:image/png;base64,bm90ZS1pbWFnZQ==",
                        "caption": [{"text": "Forest trail"}], "children": [{"text": ""}]},
                    {"type": "custom-block", "value": {"keep": true},
                        "children": [{"text": "Unknown node"}]}
                ],
                "presentation": {
                    "banner": {"type": "img", "url": "data:image/png;base64,YmFubmVy"},
                    "portrait": {"type": "img", "url": "data:image/jpeg;base64,cG9ydHJhaXQ="},
                    "playerDescription": "A patient scout.",
                    "relationships": [{"targetId": "npc-2", "label": "Ally"}],
                    "locations": [{"targetId": "loc-2", "label": "Home"}],
                    "factions": [{"targetId": "faction-1", "label": "Member"}],
                    "gmReference": {
                        "background": "A traveler.", "wants": "Safety", "ideals": "Truth",
                        "bond": "The village", "flaw": "Distrustful", "secrets": "Knows the pass",
                        "reaction": "Withdraws", "personality": "Patient",
                        "mannerisms": "Studies tracks", "notableActions": "Leaves markers",
                        "voice": "Soft", "allies": "Rangers", "enemies": "Bandits", "other": ""
                    },
                    "statblock": {
                        "fieldSetId": "dnd-5.5e", "fieldSetVersion": 1,
                        "tokenImage": {"type": "img", "url": "data:image/webp;base64,dG9rZW4="},
                        "data": {"armorClass": 15,
                            "actions": [{"name": "Track", "description": "Follow a trail."}]}
                    }
                }
            }, {
                "id": "npc-2", "name": "Guide",
                "notes": [{"type": "p", "children": [{"text": ""}]}]
            }],
            "locations": [{
                "id": "loc-1", "name": "Northern Reach", "image": null,
                "publicDescription": "A rugged region.", "gmNotes": "Old prep.",
                "parentId": null, "locationType": "Region", "tags": ["Forest"],
                "partyKnowledge": "known", "banner": null,
                "gmReference": {"atmosphere": "", "background": "", "currentSituation": "",
                    "secrets": ""},
                "associatedNpcs": [], "associatedFactions": []
            }, {
                "id": "loc-2", "name": "Greyhaven",
                "image": {"type": "img", "url": "data:image/png;base64,bG9jYXRpb24="},
                "banner": {"type": "img", "url": "data:image/png;base64,bG9jLWJhbm5lcg=="},
                "publicDescription": "A harbor city.", "gmNotes": "A drowned shrine.",
                "parentId": "loc-1", "locationType": "City", "tags": ["Harbor"],
                "partyKnowledge": "visited",
                "gmReference": {"atmosphere": "Salt", "background": "Old harbor",
                    "currentSituation": "A festival", "secrets": "A drowned shrine"},
                "associatedNpcs": [{"targetId": "npc-1", "label": "Resident"}],
                "associatedFactions": [{"targetId": "faction-1", "label": "Patrols"}]
            }],
            "factions": [{
                "id": "faction-1", "name": "Harbor Wardens",
                "image": {"type": "img", "url": "data:image/png;base64,ZmFjdGlvbg=="},
                "description": "Protectors.", "gmNotes": "A private suspicion."
            }],
            "maps": [{
                "id": "map-1", "name": "City map", "kind": "City",
                "image": {"type": "img", "url": "data:image/png;base64,bWFwLW9uZQ=="},
                "width": 1400, "height": 900, "locationIds": ["loc-2"],
                "pins": [{"id": "pin-1", "x": 0.5, "y": 0.5, "locationId": "loc-2",
                    "label": "Harbor", "destinationMapId": "map-2"}],
                "party": {"x": 0.2, "y": 0.8}
            }, {
                "id": "map-2", "name": "Inn map", "kind": "Building",
                "image": {"type": "img", "url": "data:image/png;base64,bWFwLXR3bw=="},
                "width": 800, "height": 600, "locationIds": ["loc-2"],
                "pins": [], "party": null
            }],
            "threads": [{
                "id": "thread-1", "title": "The Missing Morrow", "status": "active",
                "playerReminder": "The Morrow vanished.", "origin": "A guild request.",
                "sourceLabel": "Rumor",
                "currentSituation": [
                    {"type": "p", "children": [{"text": "The ledger points to the harbor."}]},
                    {"type": "img", "url": "data:image/png;base64,dGhyZWFk",
                        "caption": [{"text": "A clue"}], "children": [{"text": ""}]}
                ],
                "gmPossibilities": [{"type": "p", "children": [{"text": "A negotiator arrives."}]}],
                "people": [{"targetId": "npc-1", "label": "Witness"}],
                "locations": [{"targetId": "loc-2", "label": "Last seen"}],
                "factions": [{"targetId": "faction-1", "label": "Involved"}]
            }],
            "sessions": [{
                "id": "session-1", "title": "The Low Tide", "number": 8,
                "date": "2026-11-14", "previous": false,
                "whereLeftOff": [{"type": "p", "children": [{"text": "The party reached the harbor."}]}],
                "prep": [{"type": "p", "children": [{"text": "Meet Niya beneath the bell tower."}]}],
                "happened": [{"type": "p", "children": [{"text": "The party chose the tunnel."}]}],
                "summary": [{"type": "p", "children": [{"text": "A lantern waits below the seawall."}]},
                    {"type": "img", "url": "data:image/png;base64,c2Vzc2lvbg==", "children": [{"text": ""}]}],
                "beats": [
                    {"id": "beat-1", "title": "Meet Niya",
                        "notes": [{"type": "p", "children": [{"text": "She has a tide chart."}]}],
                        "status": "planned"},
                    {"id": "beat-2", "title": "Follow the lantern",
                        "notes": [{"type": "p", "children": [{"text": "The tunnel is one route."}]}],
                        "status": "happened"}
                ],
                "links": [{"kind": "npc", "targetId": "npc-1", "label": "Witness"}]
            }],
            "inventory": {"gold": 248, "entries": [
                {"id": "rope", "name": "Rope", "kind": "item", "quantity": 2, "note": "50 feet"},
                {"id": "ore", "name": "Iron ore", "kind": "material", "quantity": 8, "note": ""}
            ]},
            "items": [{
                "id": "item-1", "name": "Tideglass Compass",
                "image": {"type": "img", "url": "data:image/png;base64,aXRlbQ=="},
                "description": "Points toward salt water.", "gmNotes": "A keeper's relic.",
                "values": {"tier": "c", "weight": 0.5, "attune": true,
                    "inscription": "To the harbor"}
            }],
            "itemFields": [
                {"id": "tier", "label": "Tier", "kind": "choice",
                    "options": [{"id": "c", "label": "C"}, {"id": "b", "label": "B"}]},
                {"id": "weight", "label": "Weight", "kind": "number", "options": []},
                {"id": "attune", "label": "Attunement", "kind": "checkbox", "options": []},
                {"id": "inscription", "label": "Inscription", "kind": "text", "options": []}
            ]
        }))
        .unwrap()
    }

    #[tokio::test]
    async fn complex_legacy_package_round_trips_through_turso_after_moving() {
        let temp = tempfile::tempdir().unwrap();
        let path = temp.path().join("complex.campaign");
        let original = complex_campaign();
        CampaignRepository::save(&path, original.clone()).unwrap();
        assert_eq!(fs::read_dir(path.join("assets")).unwrap().count(), 12);
        let storage = Storage::open(&path, false).await.unwrap();
        let loaded = storage.load().await.unwrap();
        assert_eq!(
            serde_json::to_value(&loaded).unwrap(),
            serde_json::to_value(&original).unwrap()
        );
        assert_eq!(loaded.threads[0].title, "The Missing Morrow");
        assert_eq!(loaded.items.len(), 1);
        assert_eq!(loaded.item_fields.len(), 4);
        assert!(loaded.maps[0].calibration.is_none());
        assert_eq!(loaded.maps[0].grid.mode, "none");
        assert!(!loaded.maps[0].grid.visible);
        assert!(!loaded.maps[0].snap);
        assert_eq!(loaded.maps[0].pins[0].x, 0.5);
        assert_eq!(loaded.maps[0].pins[0].y, 0.5);
        assert_eq!(
            loaded.maps[0]
                .party
                .as_ref()
                .map(|point| (point.x, point.y)),
            Some((0.2, 0.8))
        );
        drop(storage);
        let moved = temp.path().join("moved-complex.campaign");
        fs::rename(&path, &moved).unwrap();
        let mut storage = Storage::open(&moved, false).await.unwrap();
        let mut loaded = storage.load().await.unwrap();
        loaded.inventory.gold = 249;
        loaded.maps[0].calibration = Some(MapCalibration {
            units: "metres".into(),
            pixels_per_unit: 2.5,
        });
        loaded.maps[0].grid = MapGrid {
            mode: "hex".into(),
            visible: true,
            size: 50.0,
            offset_x: 12.0,
            offset_y: 8.0,
            orientation: "flat".into(),
        };
        loaded.maps[0].snap = true;
        storage.save(&loaded).await.unwrap();
        drop(storage);
        let legacy = CampaignRepository::load(&moved).unwrap();
        assert_eq!(legacy.inventory.gold, 249);
        assert_eq!(
            legacy.maps[0].calibration,
            Some(MapCalibration {
                units: "metres".into(),
                pixels_per_unit: 2.5,
            })
        );
        assert_eq!(legacy.maps[0].grid.mode, "hex");
        assert_eq!(legacy.maps[0].grid.orientation, "flat");
        assert!(legacy.maps[0].grid.visible);
        assert!(legacy.maps[0].snap);
        assert_eq!(legacy.maps[0].pins[0].x, 0.5);
        assert_eq!(legacy.maps[0].pins[0].y, 0.5);
        assert_eq!(
            legacy.maps[0]
                .party
                .as_ref()
                .map(|point| (point.x, point.y)),
            Some((0.2, 0.8))
        );
        assert_eq!(legacy.locations[1].parent_id.as_deref(), Some("loc-1"));
        assert_eq!(
            legacy.maps[0].pins[0].destination_map_id.as_deref(),
            Some("map-2")
        );
        assert_eq!(legacy.threads[0].people[0].target_id, "npc-1");
        assert_eq!(legacy.sessions[0].title, "The Low Tide");
        assert_eq!(legacy.sessions[0].beats[1].status, "happened");
        assert_eq!(legacy.sessions[0].links[0].target_id, "npc-1");
        assert_eq!(
            legacy.npcs[0].presentation.relationships[0].target_id,
            "npc-2"
        );
        assert_eq!(legacy.npcs[0].notes[2]["type"], "custom-block");
        assert_eq!(legacy.workspace.as_ref().unwrap().history.index, 0);
    }
}

#[cfg(test)]
mod historical_versions {
    use super::*;
    use serde_json::json;

    fn historical_campaign() -> Campaign {
        serde_json::from_value(json!({
            "format": "ttrpg-campaign", "schemaVersion": 1, "id": "historical",
            "name": "Historical", "createdAt": "2026-01-01", "updatedAt": "2026-01-02",
            "section": null, "sidebar": {"width": 256, "open": true}, "workspace": null,
            "npcs": [{"id": "npc-1", "name": "Scout",
                "notes": [{"type": "p", "children": [{"text": "Private"}]}],
                "presentation": {
                    "playerDescription": "A scout.",
                    "gmReference": {"background": "", "wants": "", "ideals": "", "bond": "",
                        "flaw": "", "secrets": "", "reaction": "", "personality": "",
                        "mannerisms": "", "notableActions": "", "voice": "", "allies": "",
                        "enemies": "", "other": ""},
                    "statblock": {"fieldSetId": "dnd-5.5e", "fieldSetVersion": 1, "data": {}}
                }}],
            "locations": [{"id": "loc-1", "name": "Village", "image": null,
                "publicDescription": "A village.", "gmNotes": "Private.", "partyKnowledge": "unknown"}],
            "factions": [{"id": "faction-1", "name": "Wardens", "image": null,
                "description": "Protectors.", "gmNotes": ""}],
            "inventory": {"gold": 5, "entries": []},
            "maps": [{"id": "map-1", "name": "Map", "kind": "City",
                "image": {"type": "img", "url": "data:image/png;base64,bWFw"},
                "width": 100, "height": 100, "locationIds": ["loc-1"],
                "pins": [], "party": null}],
            "threads": [{"id": "thread-1", "title": "Thread", "status": "idea",
                "playerReminder": "", "origin": "", "sourceLabel": "",
                "currentSituation": [{"type": "p", "children": [{"text": ""}]}],
                "gmPossibilities": [{"type": "p", "children": [{"text": ""}]}],
                "people": [], "locations": [], "factions": []}],
            "items": [{"id": "item-1", "name": "Rope", "image": null,
                "description": "", "gmNotes": "", "values": {}}],
            "itemFields": []
        }))
        .unwrap()
    }

    async fn assert_version_round_trip(version: i64, drops: &[&str]) {
        let temp = tempfile::tempdir().unwrap();
        let path = temp.path().join(format!("v{version}.campaign"));
        let original = historical_campaign();
        let mut storage = Storage::open(&path, true).await.unwrap();
        storage.save(&original).await.unwrap();
        for table in drops {
            storage
                .connection
                .execute(&format!("DROP TABLE {table}"), ())
                .await
                .unwrap();
        }
        storage
            .connection
            .execute(&format!("PRAGMA user_version={version}"), ())
            .await
            .unwrap();
        drop(storage);

        let mut storage = Storage::open(&path, false).await.unwrap();
        let loaded = storage.load().await.unwrap();
        assert_eq!(loaded.id, "historical");
        assert_eq!(loaded.npcs.len(), 1);
        if version == 1 {
            assert_eq!(loaded.statblock_field_set.id, "dnd-5.5e");
            assert_eq!(loaded.npcs[0].presentation.player_description, "");
        } else {
            assert_eq!(loaded.npcs[0].presentation.player_description, "A scout.");
        }
        if version >= 2 {
            assert_eq!(loaded.locations.len(), 1);
        } else {
            assert!(loaded.locations.is_empty());
        }
        if version >= 3 {
            assert_eq!(loaded.factions.len(), 1);
        } else {
            assert!(loaded.factions.is_empty());
        }
        if version >= 4 {
            assert_eq!(loaded.inventory.gold, 5);
        } else {
            assert_eq!(loaded.inventory.gold, 0);
        }
        if version >= 5 {
            assert_eq!(loaded.maps.len(), 1);
        } else {
            assert!(loaded.maps.is_empty());
        }
        if version >= 6 {
            assert_eq!(loaded.threads.len(), 1);
        } else {
            assert!(loaded.threads.is_empty());
        }
        if version >= 7 {
            assert_eq!(loaded.items.len(), 1);
        } else {
            assert!(loaded.items.is_empty());
        }
        storage.save(&loaded).await.unwrap();
        assert_eq!(storage.version().await.unwrap(), 8);
        assert!(storage.table_exists("item_catalog").await.unwrap());
        assert!(storage.table_exists("story_thread").await.unwrap());
        assert!(storage.table_exists("session_record").await.unwrap());
        drop(storage);

        let storage = Storage::open(&path, false).await.unwrap();
        let upgraded = storage.load().await.unwrap();
        assert_eq!(upgraded.npcs[0].name, "Scout");
        assert_eq!(upgraded.inventory.gold, if version >= 4 { 5 } else { 0 });
    }

    #[tokio::test]
    async fn turso_reads_and_upgrades_every_historical_version() {
        assert_version_round_trip(
            1,
            &[
                "location",
                "faction",
                "party_inventory",
                "map_record",
                "story_thread",
                "item_catalog",
                "session_record",
                "npc_presentation",
                "campaign_settings",
            ],
        )
        .await;
        assert_version_round_trip(
            2,
            &[
                "faction",
                "party_inventory",
                "map_record",
                "story_thread",
                "item_catalog",
                "session_record",
            ],
        )
        .await;
        assert_version_round_trip(
            3,
            &[
                "party_inventory",
                "map_record",
                "story_thread",
                "item_catalog",
                "session_record",
            ],
        )
        .await;
        assert_version_round_trip(
            4,
            &[
                "map_record",
                "story_thread",
                "item_catalog",
                "session_record",
            ],
        )
        .await;
    }
}

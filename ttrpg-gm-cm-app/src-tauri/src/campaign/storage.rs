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
        if (create && version != 0) || (!create && !(1..=5).contains(&version)) {
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
        let assets = self.folder.join("assets");
        fs::create_dir_all(&assets).map_err(|e| e.to_string())?;
        if !assets
            .canonicalize()
            .map_err(|e| e.to_string())?
            .starts_with(&self.folder)
        {
            return Err("Assets folder resolves outside the campaign package.".into());
        }
        transform_images(&mut document, &self.folder, true)?;
        let campaign: Campaign = serde_json::from_value(document).map_err(|e| e.to_string())?;
        let version = self.version().await?;
        if !(1..=5).contains(&version) {
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
}

use super::*;
use rusqlite::{params, Connection, OptionalExtension, Transaction};
use serde_json::Value;
use std::{collections::HashMap, fs, path::Path};

pub(super) fn write_campaign(folder: &Path, mut campaign: Campaign) -> Result<(), String> {
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
        .execute(
            "INSERT INTO party_inventory (campaign_id,inventory_json) VALUES (?1,?2)
         ON CONFLICT(campaign_id) DO UPDATE SET inventory_json=excluded.inventory_json",
            params![
                campaign.id,
                serde_json::to_string(&campaign.inventory).map_err(|e| e.to_string())?
            ],
        )
        .map_err(|e| e.to_string())?;
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

pub(super) fn read_campaign(folder: &Path) -> Result<Campaign, String> {
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
    if !(1..=4).contains(&version) {
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
    let inventory = if table_exists(&connection, "party_inventory")? {
        let json: Option<String> = connection
            .query_row(
                "SELECT inventory_json FROM party_inventory WHERE campaign_id=?1",
                [&id],
                |row| row.get(0),
            )
            .optional()
            .map_err(|e| e.to_string())?;
        json.map(|value| serde_json::from_str(&value).map_err(|e| e.to_string()))
            .transpose()?
            .unwrap_or_default()
    } else {
        PartyInventory::default()
    };
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
        inventory,
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

pub(super) fn table_exists(connection: &Connection, name: &str) -> Result<bool, String> {
    connection
        .query_row(
            "SELECT EXISTS(SELECT 1 FROM sqlite_master WHERE type='table' AND name=?1)",
            [name],
            |row| row.get(0),
        )
        .map_err(|e| e.to_string())
}

/// Owns campaign-package reads and writes backed by SQLite and the assets directory.
pub(crate) struct CampaignRepository;

impl CampaignRepository {
    pub(crate) fn save(folder: &Path, campaign: Campaign) -> Result<(), String> {
        write_campaign(folder, campaign)
    }

    pub(crate) fn load(folder: &Path) -> Result<Campaign, String> {
        read_campaign(folder)
    }
}

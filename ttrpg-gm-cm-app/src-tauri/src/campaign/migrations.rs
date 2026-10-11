use rusqlite::Connection;

pub(super) fn ensure_schema(connection: &mut Connection) -> Result<(), String> {
    let version: i32 = connection
        .pragma_query_value(None, "user_version", |row| row.get(0))
        .map_err(|e| e.to_string())?;
    if version > 5 {
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
        CREATE TABLE IF NOT EXISTS party_inventory (
            campaign_id TEXT PRIMARY KEY NOT NULL REFERENCES campaign(id) ON DELETE CASCADE,
            inventory_json TEXT NOT NULL
        );
        CREATE TABLE IF NOT EXISTS map_record (
            id TEXT PRIMARY KEY NOT NULL,
            campaign_id TEXT NOT NULL REFERENCES campaign(id) ON DELETE CASCADE,
            sort_order INTEGER NOT NULL,
            record_json TEXT NOT NULL
        );
        PRAGMA user_version = 5;
    ",
        )
        .map_err(|e| e.to_string())?;
    transaction.commit().map_err(|e| e.to_string())
}

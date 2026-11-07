use rusqlite::Connection;

pub(super) fn ensure_schema(connection: &mut Connection) -> Result<(), String> {
    let version: i32 = connection
        .pragma_query_value(None, "user_version", |row| row.get(0))
        .map_err(|e| e.to_string())?;
    if version > 8 {
        return Err(format!(
            "Campaign database version {version} is newer than this app supports."
        ));
    }
    let transaction = connection.transaction().map_err(|e| e.to_string())?;
    transaction
        .execute_batch(include_str!("schema.sql"))
        .map_err(|e| e.to_string())?;
    transaction
        .execute_batch(
            "\
        CREATE TABLE IF NOT EXISTS story_thread (
            id TEXT PRIMARY KEY NOT NULL,
            campaign_id TEXT NOT NULL REFERENCES campaign(id) ON DELETE CASCADE,
            sort_order INTEGER NOT NULL,
            record_json TEXT NOT NULL
        );
        CREATE TABLE IF NOT EXISTS item_catalog (
            campaign_id TEXT PRIMARY KEY NOT NULL REFERENCES campaign(id) ON DELETE CASCADE,
            items_json TEXT NOT NULL,
            fields_json TEXT NOT NULL
        );
        CREATE TABLE IF NOT EXISTS session_record (
            id TEXT PRIMARY KEY NOT NULL,
            campaign_id TEXT NOT NULL REFERENCES campaign(id) ON DELETE CASCADE,
            sort_order INTEGER NOT NULL,
            record_json TEXT NOT NULL
        );
        PRAGMA user_version = 8;
    ",
        )
        .map_err(|e| e.to_string())?;
    transaction.commit().map_err(|e| e.to_string())
}

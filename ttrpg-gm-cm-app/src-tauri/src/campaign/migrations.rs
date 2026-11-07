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
        .execute_batch(include_str!("schema.sql"))
        .map_err(|e| e.to_string())?;
    transaction.commit().map_err(|e| e.to_string())
}

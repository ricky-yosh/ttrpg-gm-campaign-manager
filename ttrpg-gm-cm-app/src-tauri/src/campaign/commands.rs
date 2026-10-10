use super::Campaign;
use std::path::Path;
use tauri::State;

#[tauri::command]
pub async fn save_campaign(path: String, campaign: Campaign) -> Result<(), String> {
    tauri::async_runtime::spawn_blocking(move || {
        super::CampaignRepository::save(Path::new(&path), campaign)
    })
    .await
    .map_err(|e| e.to_string())?
}

#[tauri::command]
pub async fn open_campaign(
    history: State<'_, super::CampaignHistory>,
    path: String,
) -> Result<Campaign, String> {
    let history = history.inner().clone();
    tauri::async_runtime::spawn_blocking(move || {
        let campaign = super::CampaignRepository::load(Path::new(&path))?;
        history.clear();
        Ok(campaign)
    })
    .await
    .map_err(|e| e.to_string())?
}

#[tauri::command]
pub async fn update_npc(
    history: State<'_, super::CampaignHistory>,
    campaign: Campaign,
    change: super::service::UpdateNpc,
) -> Result<super::history::NpcHistoryResult, super::service::CampaignOperationError> {
    let history = history.inner().clone();
    tauri::async_runtime::spawn_blocking(move || history.update(campaign, change))
        .await
        .map_err(|error| super::service::CampaignOperationError::Internal(error.to_string()))?
}

#[tauri::command]
pub async fn undo_npc(
    history: State<'_, super::CampaignHistory>,
    campaign: Campaign,
    npc_id: String,
) -> Result<super::history::NpcHistoryResult, super::service::CampaignOperationError> {
    let history = history.inner().clone();
    tauri::async_runtime::spawn_blocking(move || history.undo(campaign, &npc_id))
        .await
        .map_err(|error| super::service::CampaignOperationError::Internal(error.to_string()))?
}

#[tauri::command]
pub async fn redo_npc(
    history: State<'_, super::CampaignHistory>,
    campaign: Campaign,
    npc_id: String,
) -> Result<super::history::NpcHistoryResult, super::service::CampaignOperationError> {
    let history = history.inner().clone();
    tauri::async_runtime::spawn_blocking(move || history.redo(campaign, &npc_id))
        .await
        .map_err(|error| super::service::CampaignOperationError::Internal(error.to_string()))?
}

use super::Campaign;
use std::path::Path;

#[tauri::command]
pub async fn save_campaign(path: String, campaign: Campaign) -> Result<(), String> {
    tauri::async_runtime::spawn_blocking(move || {
        super::CampaignRepository::save(Path::new(&path), campaign)
    })
    .await
    .map_err(|e| e.to_string())?
}

#[tauri::command]
pub async fn open_campaign(path: String) -> Result<Campaign, String> {
    tauri::async_runtime::spawn_blocking(move || super::CampaignRepository::load(Path::new(&path)))
        .await
        .map_err(|e| e.to_string())?
}

#[tauri::command]
pub async fn update_npc(
    campaign: Campaign,
    change: super::service::UpdateNpc,
) -> Result<super::Npc, super::service::CampaignOperationError> {
    tauri::async_runtime::spawn_blocking(move || super::service::update_npc(campaign, change))
        .await
        .map_err(|error| super::service::CampaignOperationError::Internal(error.to_string()))?
}

use super::{Campaign, Npc, NpcPresentation};
use serde::{Deserialize, Serialize};
use serde_json::Value;

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct UpdateNpc {
    pub(super) npc_id: String,
    pub(super) name: String,
    pub(super) notes: Vec<Value>,
    pub(super) presentation: NpcPresentation,
}

#[derive(Debug, Serialize)]
#[serde(tag = "code", content = "message", rename_all = "snake_case")]
pub enum CampaignOperationError {
    NpcNotFound(String),
    Validation(String),
    Conflict(String),
    Internal(String),
}

pub fn update_npc(
    mut campaign: Campaign,
    change: UpdateNpc,
) -> Result<Npc, CampaignOperationError> {
    let index = campaign
        .npcs
        .iter()
        .position(|npc| npc.id == change.npc_id)
        .ok_or_else(|| {
            CampaignOperationError::NpcNotFound("This NPC is no longer available.".into())
        })?;
    campaign.npcs[index] = Npc {
        id: change.npc_id,
        name: change.name.trim().to_owned(),
        notes: change.notes,
        presentation: change.presentation,
    };
    campaign
        .validate()
        .map_err(CampaignOperationError::Validation)?;
    Ok(campaign.npcs.remove(index))
}

pub fn restore_npc(mut campaign: Campaign, npc: Npc) -> Result<Npc, CampaignOperationError> {
    let index = campaign
        .npcs
        .iter()
        .position(|current| current.id == npc.id)
        .ok_or_else(|| {
            CampaignOperationError::NpcNotFound("This NPC is no longer available.".into())
        })?;
    campaign.npcs[index] = npc;
    campaign
        .validate()
        .map_err(CampaignOperationError::Validation)?;
    Ok(campaign.npcs.remove(index))
}

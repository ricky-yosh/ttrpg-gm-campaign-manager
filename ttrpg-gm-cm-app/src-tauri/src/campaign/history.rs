use super::{service, Campaign, Npc};
use serde::Serialize;
use serde_json::{Map, Value};
use std::collections::HashMap;
use std::sync::{Arc, Mutex};

const MAX_HISTORY_ENTRIES: usize = 100;

#[derive(Clone, Default)]
pub struct CampaignHistory(Arc<Mutex<HashMap<String, HashMap<String, NpcHistory>>>>);

#[derive(Default)]
struct NpcHistory {
    entries: Vec<NpcChange>,
    cursor: usize,
    current: Option<Npc>,
}

struct NpcChange {
    fields: Vec<FieldChange>,
}

struct FieldChange {
    path: Vec<String>,
    before: Option<Value>,
    after: Option<Value>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct NpcHistoryResult {
    pub npc: Npc,
    pub can_undo: bool,
    pub can_redo: bool,
}

impl CampaignHistory {
    pub fn clear(&self) {
        self.0
            .lock()
            .unwrap_or_else(std::sync::PoisonError::into_inner)
            .clear();
    }

    pub fn update(
        &self,
        campaign: Campaign,
        change: service::UpdateNpc,
    ) -> Result<NpcHistoryResult, service::CampaignOperationError> {
        let campaign_id = campaign.id.clone();
        let npc_id = change.npc_id.clone();
        let before = find_npc(&campaign, &npc_id)?;
        let mut histories = self.0.lock().map_err(internal_error)?;
        let history = histories
            .entry(campaign_id)
            .or_default()
            .entry(npc_id.clone())
            .or_default();
        if let Some(expected) = &history.current {
            ensure_matches(&before, expected)?;
        }

        let after = service::update_npc(campaign, change)?;
        let fields = diff_npc(&before, &after)?;
        if !fields.is_empty() {
            history.entries.truncate(history.cursor);
            history.entries.push(NpcChange { fields });
            history.cursor = history.entries.len();
            if history.entries.len() > MAX_HISTORY_ENTRIES {
                history.entries.remove(0);
                history.cursor -= 1;
            }
        }
        history.current = Some(after.clone());
        Ok(history_result(history, after))
    }

    pub fn undo(
        &self,
        campaign: Campaign,
        npc_id: &str,
    ) -> Result<NpcHistoryResult, service::CampaignOperationError> {
        self.step(campaign, npc_id, false)
    }

    pub fn redo(
        &self,
        campaign: Campaign,
        npc_id: &str,
    ) -> Result<NpcHistoryResult, service::CampaignOperationError> {
        self.step(campaign, npc_id, true)
    }

    fn step(
        &self,
        campaign: Campaign,
        npc_id: &str,
        redo: bool,
    ) -> Result<NpcHistoryResult, service::CampaignOperationError> {
        let campaign_id = campaign.id.clone();
        let mut histories = self.0.lock().map_err(internal_error)?;
        let history = histories
            .get_mut(&campaign_id)
            .and_then(|records| records.get_mut(npc_id))
            .ok_or_else(|| {
                service::CampaignOperationError::Conflict(
                    "There is no NPC edit history to apply.".into(),
                )
            })?;
        let entry_index = if redo {
            history.cursor
        } else {
            history.cursor.checked_sub(1).ok_or_else(|| {
                service::CampaignOperationError::Conflict("There is no NPC edit to undo.".into())
            })?
        };
        let entry = history.entries.get(entry_index).ok_or_else(|| {
            service::CampaignOperationError::Conflict("There is no NPC edit to apply.".into())
        })?;
        let current = find_npc(&campaign, npc_id)?;
        ensure_fields_match(&current, &entry.fields, redo)?;
        let replacement = apply_fields(&current, &entry.fields, !redo)?;
        let restored = service::restore_npc(campaign, replacement)?;
        history.current = Some(restored.clone());
        if redo {
            history.cursor += 1;
        } else {
            history.cursor -= 1;
        }
        Ok(history_result(history, restored))
    }
}

fn find_npc(campaign: &Campaign, npc_id: &str) -> Result<Npc, service::CampaignOperationError> {
    campaign
        .npcs
        .iter()
        .find(|npc| npc.id == npc_id)
        .cloned()
        .ok_or_else(|| {
            service::CampaignOperationError::NpcNotFound("This NPC is no longer available.".into())
        })
}

fn diff_npc(
    before: &Npc,
    after: &Npc,
) -> Result<Vec<FieldChange>, service::CampaignOperationError> {
    let before = serde_json::to_value(before).map_err(internal_error)?;
    let after = serde_json::to_value(after).map_err(internal_error)?;
    let mut fields = Vec::new();
    diff_values(&before, &after, &mut Vec::new(), &mut fields);
    Ok(fields)
}

fn diff_values(
    before: &Value,
    after: &Value,
    path: &mut Vec<String>,
    fields: &mut Vec<FieldChange>,
) {
    if let (Value::Object(before), Value::Object(after)) = (before, after) {
        let keys = before
            .keys()
            .chain(after.keys())
            .collect::<std::collections::HashSet<_>>();
        for key in keys {
            path.push(key.clone());
            match (before.get(key), after.get(key)) {
                (Some(before), Some(after)) => diff_values(before, after, path, fields),
                (before, after) if before != after => fields.push(FieldChange {
                    path: path.clone(),
                    before: before.cloned(),
                    after: after.cloned(),
                }),
                _ => {}
            }
            path.pop();
        }
    } else if before != after {
        fields.push(FieldChange {
            path: path.clone(),
            before: Some(before.clone()),
            after: Some(after.clone()),
        });
    }
}

fn ensure_matches(current: &Npc, expected: &Npc) -> Result<(), service::CampaignOperationError> {
    if serde_json::to_value(current).map_err(internal_error)?
        != serde_json::to_value(expected).map_err(internal_error)?
    {
        return Err(conflict_error());
    }
    Ok(())
}

fn ensure_fields_match(
    npc: &Npc,
    fields: &[FieldChange],
    redo: bool,
) -> Result<(), service::CampaignOperationError> {
    let value = serde_json::to_value(npc).map_err(internal_error)?;
    for field in fields {
        let expected = if redo { &field.before } else { &field.after };
        if get_path(&value, &field.path) != expected.as_ref() {
            return Err(conflict_error());
        }
    }
    Ok(())
}

fn apply_fields(
    npc: &Npc,
    fields: &[FieldChange],
    use_before: bool,
) -> Result<Npc, service::CampaignOperationError> {
    let mut value = serde_json::to_value(npc).map_err(internal_error)?;
    for field in fields {
        let replacement = if use_before {
            &field.before
        } else {
            &field.after
        };
        set_path(&mut value, &field.path, replacement.clone()).map_err(internal_error)?;
    }
    serde_json::from_value(value).map_err(internal_error)
}

fn get_path<'a>(mut value: &'a Value, path: &[String]) -> Option<&'a Value> {
    for key in path {
        value = value.as_object()?.get(key)?;
    }
    Some(value)
}

fn set_path(value: &mut Value, path: &[String], replacement: Option<Value>) -> Result<(), String> {
    if path.is_empty() {
        return Err("Cannot replace the NPC root.".into());
    }
    let mut current = value;
    for key in &path[..path.len() - 1] {
        current = current
            .as_object_mut()
            .and_then(|object| object.get_mut(key))
            .ok_or("NPC history field no longer exists.")?;
    }
    let object: &mut Map<String, Value> = current
        .as_object_mut()
        .ok_or("NPC history parent is not an object.")?;
    let key = path.last().expect("nonempty path").clone();
    if let Some(replacement) = replacement {
        object.insert(key, replacement);
    } else {
        object.remove(&key);
    }
    Ok(())
}

fn history_result(history: &NpcHistory, npc: Npc) -> NpcHistoryResult {
    NpcHistoryResult {
        npc,
        can_undo: history.cursor > 0,
        can_redo: history.cursor < history.entries.len(),
    }
}

fn conflict_error() -> service::CampaignOperationError {
    service::CampaignOperationError::Conflict(
        "This NPC changed outside its undo history. Save the current edit before undoing.".into(),
    )
}

fn internal_error(error: impl std::fmt::Display) -> service::CampaignOperationError {
    service::CampaignOperationError::Internal(error.to_string())
}

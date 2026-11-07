//! Core-owned, in-memory campaign edit history.
//!
//! One chronological stream per campaign session. Updates store field diffs so
//! large unchanged image payloads are not copied into every entry; creation and
//! deletion store the record snapshot plus its list position. History is
//! intentionally not persisted and is cleared whenever a campaign is replaced.
use super::{service, Campaign, Npc};
use serde::{Deserialize, Serialize};
use serde_json::{Map, Value};
use std::collections::HashMap;
use std::sync::{Arc, Mutex};

const MAX_HISTORY_ENTRIES: usize = 100;
const MAX_HISTORY_BYTES: usize = 16 * 1024 * 1024;

#[derive(Clone, Default)]
pub struct CampaignHistory(Arc<Mutex<HashMap<String, HistoryState>>>);

#[derive(Default)]
struct HistoryState {
    entries: Vec<HistoryEntry>,
    cursor: usize,
    bytes: usize,
    current: HashMap<String, Value>,
}

struct HistoryEntry {
    label: String,
    changes: Vec<StoredChange>,
    bytes: usize,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum RecordKind {
    Npc,
    Location,
    Faction,
    Item,
    ItemFields,
    Thread,
    Session,
    Map,
    Inventory,
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize)]
pub struct RecordTarget {
    pub kind: RecordKind,
    pub id: String,
}

impl RecordTarget {
    pub fn new(kind: RecordKind, id: impl Into<String>) -> Self {
        Self {
            kind,
            id: id.into(),
        }
    }

    fn key(&self) -> String {
        format!(
            "{}:{}",
            match self.kind {
                RecordKind::Npc => "npc",
                RecordKind::Location => "location",
                RecordKind::Faction => "faction",
                RecordKind::Item => "item",
                RecordKind::ItemFields => "item-fields",
                RecordKind::Thread => "thread",
                RecordKind::Session => "session",
                RecordKind::Map => "map",
                RecordKind::Inventory => "inventory",
            },
            self.id
        )
    }
}

/// A requested change to one record before it is stored in history.
#[derive(Clone, Debug)]
pub struct RecordChange {
    pub target: RecordTarget,
    pub before: Option<Value>,
    pub after: Option<Value>,
    /// Position for list-backed records that are inserted on undo/redo.
    pub position: Option<usize>,
}

impl RecordChange {
    pub fn update(target: RecordTarget, before: Value, after: Value) -> Self {
        Self {
            target,
            before: Some(before),
            after: Some(after),
            position: None,
        }
    }

    pub fn create(target: RecordTarget, after: Value, position: Option<usize>) -> Self {
        Self {
            target,
            before: None,
            after: Some(after),
            position,
        }
    }

    pub fn delete(target: RecordTarget, before: Value, position: Option<usize>) -> Self {
        Self {
            target,
            before: Some(before),
            after: None,
            position,
        }
    }
}

#[derive(Clone, Debug, Serialize)]
struct StoredChange {
    target: RecordTarget,
    kind: StoredKind,
}

#[derive(Clone, Debug, Serialize)]
enum StoredKind {
    Fields(Vec<FieldChange>),
    Replace {
        before: Option<Value>,
        after: Option<Value>,
        position: Option<usize>,
    },
}

#[derive(Clone, Debug, Serialize, Deserialize)]
enum PathSegment {
    Key(String),
    Index(usize),
}

#[derive(Clone, Debug, Serialize)]
struct FieldChange {
    path: Vec<PathSegment>,
    before: Option<Value>,
    after: Option<Value>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct HistoryStatus {
    pub can_undo: bool,
    pub can_redo: bool,
    pub undo_label: Option<String>,
    pub redo_label: Option<String>,
    pub length: usize,
    pub cursor: usize,
}

#[derive(Debug)]
pub struct HistoryOutcome {
    pub campaign: Campaign,
    pub label: String,
    pub status: HistoryStatus,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct NpcHistoryResult {
    pub npc: Npc,
    pub can_undo: bool,
    pub can_redo: bool,
    pub undo_label: Option<String>,
    pub redo_label: Option<String>,
}

impl CampaignHistory {
    pub fn clear(&self) {
        self.0
            .lock()
            .unwrap_or_else(std::sync::PoisonError::into_inner)
            .clear();
    }

    pub fn status(&self, campaign_id: &str) -> HistoryStatus {
        let histories = self
            .0
            .lock()
            .unwrap_or_else(std::sync::PoisonError::into_inner);
        histories
            .get(campaign_id)
            .map(status_for)
            .unwrap_or_else(empty_status)
    }

    /// Remember the latest observed state of a target even when an update was a
    /// no-op, so later edits can still detect external changes.
    pub fn remember(&self, campaign_id: &str, target: RecordTarget, value: Value) {
        let mut histories = self
            .0
            .lock()
            .unwrap_or_else(std::sync::PoisonError::into_inner);
        histories
            .entry(campaign_id.to_owned())
            .or_default()
            .current
            .insert(target.key(), value);
    }

    pub fn record(
        &self,
        campaign_id: &str,
        label: impl Into<String>,
        changes: Vec<RecordChange>,
    ) -> Result<bool, service::CampaignOperationError> {
        let mut stored = Vec::new();
        for change in &changes {
            let kind = match (&change.before, &change.after) {
                (Some(before), Some(after)) if before == after => continue,
                (Some(before), Some(after)) => {
                    let mut fields = Vec::new();
                    diff_values(before, after, &mut Vec::new(), &mut fields);
                    if fields.is_empty() {
                        continue;
                    }
                    StoredKind::Fields(fields)
                }
                _ => StoredKind::Replace {
                    before: change.before.clone(),
                    after: change.after.clone(),
                    position: change.position,
                },
            };
            stored.push(StoredChange {
                target: change.target.clone(),
                kind,
            });
        }

        let mut histories = self
            .0
            .lock()
            .unwrap_or_else(std::sync::PoisonError::into_inner);
        let state = histories.entry(campaign_id.to_owned()).or_default();
        // Check the whole entry before touching the redo branch.
        for change in &changes {
            if let Some(current) = state.current.get(&change.target.key()) {
                if Some(current) != change.before.as_ref() {
                    return Err(conflict_error());
                }
            }
        }
        if stored.is_empty() {
            for change in &changes {
                if let Some(after) = &change.after {
                    state.current.insert(change.target.key(), after.clone());
                } else {
                    state.current.remove(&change.target.key());
                }
            }
            return Ok(false);
        }

        if state.cursor < state.entries.len() {
            let discarded = state.entries[state.cursor..]
                .iter()
                .map(|entry| entry.bytes)
                .sum::<usize>();
            state.bytes = state.bytes.saturating_sub(discarded);
            state.entries.truncate(state.cursor);
        }
        let bytes = serde_json::to_vec(&stored).map_err(internal_error)?.len();
        state.entries.push(HistoryEntry {
            label: label.into(),
            changes: stored,
            bytes,
        });
        state.cursor = state.entries.len();
        state.bytes += bytes;
        for change in &changes {
            if let Some(after) = &change.after {
                state.current.insert(change.target.key(), after.clone());
            } else {
                state.current.remove(&change.target.key());
            }
        }
        evict(&mut state.entries, &mut state.cursor, &mut state.bytes);
        Ok(true)
    }

    pub fn undo_last(
        &self,
        campaign: Campaign,
    ) -> Result<HistoryOutcome, service::CampaignOperationError> {
        self.step(campaign, None, false)
    }

    pub fn redo_last(
        &self,
        campaign: Campaign,
    ) -> Result<HistoryOutcome, service::CampaignOperationError> {
        self.step(campaign, None, true)
    }

    pub fn update(
        &self,
        campaign: Campaign,
        change: service::UpdateNpc,
    ) -> Result<NpcHistoryResult, service::CampaignOperationError> {
        let campaign_id = campaign.id.clone();
        let npc_id = change.npc_id.clone();
        let target = RecordTarget::new(RecordKind::Npc, npc_id.clone());
        let before = find_npc(&campaign, &npc_id)?;
        let after = service::update_npc(campaign, change)?;
        let before_value = serde_json::to_value(&before).map_err(internal_error)?;
        let after_value = serde_json::to_value(&after).map_err(internal_error)?;
        let label = npc_label(&before, &after);
        self.record(
            &campaign_id,
            label,
            vec![RecordChange::update(
                target.clone(),
                before_value,
                after_value.clone(),
            )],
        )?;
        self.remember(&campaign_id, target, after_value);
        let status = self.status(&campaign_id);
        Ok(NpcHistoryResult {
            npc: after,
            can_undo: status.can_undo,
            can_redo: status.can_redo,
            undo_label: status.undo_label,
            redo_label: status.redo_label,
        })
    }

    pub fn undo(
        &self,
        campaign: Campaign,
        npc_id: &str,
    ) -> Result<NpcHistoryResult, service::CampaignOperationError> {
        self.npc_step(campaign, npc_id, false)
    }

    pub fn redo(
        &self,
        campaign: Campaign,
        npc_id: &str,
    ) -> Result<NpcHistoryResult, service::CampaignOperationError> {
        self.npc_step(campaign, npc_id, true)
    }

    fn npc_step(
        &self,
        campaign: Campaign,
        npc_id: &str,
        redo: bool,
    ) -> Result<NpcHistoryResult, service::CampaignOperationError> {
        let outcome = self.npc_outcome(campaign, npc_id, redo)?;
        let npc = find_npc(&outcome.campaign, npc_id)?;
        Ok(NpcHistoryResult {
            npc,
            can_undo: outcome.status.can_undo,
            can_redo: outcome.status.can_redo,
            undo_label: outcome.status.undo_label,
            redo_label: outcome.status.redo_label,
        })
    }

    pub fn undo_npc(
        &self,
        campaign: Campaign,
        npc_id: &str,
    ) -> Result<HistoryOutcome, service::CampaignOperationError> {
        self.npc_outcome(campaign, npc_id, false)
    }

    pub fn redo_npc(
        &self,
        campaign: Campaign,
        npc_id: &str,
    ) -> Result<HistoryOutcome, service::CampaignOperationError> {
        self.npc_outcome(campaign, npc_id, true)
    }

    fn npc_outcome(
        &self,
        campaign: Campaign,
        npc_id: &str,
        redo: bool,
    ) -> Result<HistoryOutcome, service::CampaignOperationError> {
        let target = RecordTarget::new(RecordKind::Npc, npc_id);
        self.step(campaign, Some(&target), redo)
    }

    fn step(
        &self,
        campaign: Campaign,
        only_target: Option<&RecordTarget>,
        redo: bool,
    ) -> Result<HistoryOutcome, service::CampaignOperationError> {
        let campaign_id = campaign.id.clone();
        let mut histories = self
            .0
            .lock()
            .unwrap_or_else(std::sync::PoisonError::into_inner);
        let state = histories.get_mut(&campaign_id).ok_or_else(|| {
            service::CampaignOperationError::Conflict(
                "There is no campaign edit history to apply.".into(),
            )
        })?;
        let entry_index = if redo {
            state.cursor
        } else {
            state.cursor.checked_sub(1).ok_or_else(|| {
                service::CampaignOperationError::Conflict(
                    "There is no campaign edit to undo.".into(),
                )
            })?
        };
        let entry = state.entries.get(entry_index).ok_or_else(|| {
            service::CampaignOperationError::Conflict("There is no campaign edit to apply.".into())
        })?;
        if let Some(target) = only_target {
            if entry.changes.len() != 1 || &entry.changes[0].target != target {
                return Err(service::CampaignOperationError::Conflict(
                    "The latest campaign edit belongs to another record.".into(),
                ));
            }
        }
        let label = entry.label.clone();
        let changes = entry.changes.clone();
        let campaign = apply_entry(campaign, &changes, !redo)?;
        for change in &changes {
            match (&change.kind, redo) {
                (StoredKind::Fields(fields), false) => {
                    update_current_fields(state, change, fields, true)
                }
                (StoredKind::Fields(fields), true) => {
                    update_current_fields(state, change, fields, false)
                }
                (StoredKind::Replace { before, .. }, false) => {
                    update_current_replace(state, change, before)
                }
                (StoredKind::Replace { after, .. }, true) => {
                    update_current_replace(state, change, after)
                }
            }
        }
        if redo {
            state.cursor += 1;
        } else {
            state.cursor -= 1;
        }
        Ok(HistoryOutcome {
            campaign,
            label,
            status: status_for(state),
        })
    }
}

fn update_current_fields(
    state: &mut HistoryState,
    change: &StoredChange,
    fields: &[FieldChange],
    undo: bool,
) {
    if let Some(mut value) = state.current.get(&change.target.key()).cloned() {
        if apply_fields(&mut value, fields, undo).is_ok() {
            state.current.insert(change.target.key(), value);
        }
    }
}

fn update_current_replace(state: &mut HistoryState, change: &StoredChange, value: &Option<Value>) {
    if let Some(value) = value {
        state.current.insert(change.target.key(), value.clone());
    } else {
        state.current.remove(&change.target.key());
    }
}

fn evict(entries: &mut Vec<HistoryEntry>, cursor: &mut usize, bytes: &mut usize) {
    while entries.len() > MAX_HISTORY_ENTRIES || *bytes > MAX_HISTORY_BYTES {
        if *cursor == 0 {
            entries.clear();
            *bytes = 0;
            return;
        }
        let removed = entries.remove(0);
        *bytes = (*bytes).saturating_sub(removed.bytes);
        *cursor -= 1;
    }
}

fn status_for(state: &HistoryState) -> HistoryStatus {
    HistoryStatus {
        can_undo: state.cursor > 0,
        can_redo: state.cursor < state.entries.len(),
        undo_label: state
            .cursor
            .checked_sub(1)
            .and_then(|index| state.entries.get(index))
            .map(|entry| entry.label.clone()),
        redo_label: state
            .entries
            .get(state.cursor)
            .map(|entry| entry.label.clone()),
        length: state.entries.len(),
        cursor: state.cursor,
    }
}

fn empty_status() -> HistoryStatus {
    HistoryStatus {
        can_undo: false,
        can_redo: false,
        undo_label: None,
        redo_label: None,
        length: 0,
        cursor: 0,
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

fn npc_label(before: &Npc, after: &Npc) -> String {
    let before_value = match serde_json::to_value(before) {
        Ok(value) => value,
        Err(_) => return format!("Edit {}", before.name),
    };
    let after_value = match serde_json::to_value(after) {
        Ok(value) => value,
        Err(_) => return format!("Edit {}", before.name),
    };
    let mut fields = Vec::new();
    diff_values(&before_value, &after_value, &mut Vec::new(), &mut fields);
    change_label(&before.name, &fields)
}

fn change_label(name: &str, fields: &[FieldChange]) -> String {
    let Some(first_field) = fields.first() else {
        return format!("Edit {name}");
    };
    let section = |field: &FieldChange| match field.path.first() {
        Some(PathSegment::Key(key)) if key == "presentation" => field
            .path
            .get(1)
            .and_then(|segment| match segment {
                PathSegment::Key(key) => Some(key.clone()),
                PathSegment::Index(_) => None,
            })
            .unwrap_or_else(|| "presentation".into()),
        Some(PathSegment::Key(key)) => key.clone(),
        Some(PathSegment::Index(_)) => "list".to_owned(),
        None => "npc".to_owned(),
    };
    let first = section(first_field);
    if fields.iter().any(|field| section(field) != first) {
        return format!("Edit {name}");
    }
    match first.as_str() {
        "name" => "Rename NPC".into(),
        "statblock" => "Update Statblock".into(),
        "notes" => "Update GM Notes".into(),
        "gmReference" => "Update GM Reference".into(),
        "playerDescription" => "Update Player Description".into(),
        "relationships" => "Update Relationships".into(),
        "locations" => "Update Linked Locations".into(),
        "factions" => "Update Linked Factions".into(),
        "banner" => "Update Banner".into(),
        "portrait" => "Update Portrait".into(),
        _ => format!("Edit {name}"),
    }
}

fn apply_entry(
    campaign: Campaign,
    changes: &[StoredChange],
    undo: bool,
) -> Result<Campaign, service::CampaignOperationError> {
    let mut value = serde_json::to_value(&campaign).map_err(internal_error)?;
    if undo {
        for change in changes.iter().rev() {
            apply_change(&mut value, change, true)?;
        }
    } else {
        for change in changes {
            apply_change(&mut value, change, false)?;
        }
    }
    let campaign: Campaign = serde_json::from_value(value).map_err(internal_error)?;
    campaign
        .validate()
        .map_err(service::CampaignOperationError::Validation)?;
    Ok(campaign)
}

fn apply_change(
    campaign: &mut Value,
    change: &StoredChange,
    undo: bool,
) -> Result<(), service::CampaignOperationError> {
    match &change.kind {
        StoredKind::Fields(fields) => {
            let target = target_value_mut(campaign, &change.target).ok_or_else(conflict_error)?;
            apply_fields(target, fields, undo).map_err(internal_error)
        }
        StoredKind::Replace {
            before,
            after,
            position,
        } => {
            let expected = if undo { after } else { before };
            let replacement = if undo { before } else { after };
            let current = target_value(campaign, &change.target).cloned();
            if current.as_ref() != expected.as_ref() {
                return Err(conflict_error());
            }
            match (&change.target.kind, replacement) {
                (RecordKind::Inventory, Some(value)) => {
                    let inventory = campaign
                        .as_object_mut()
                        .ok_or_else(conflict_error)?
                        .get_mut("inventory")
                        .ok_or_else(conflict_error)?;
                    *inventory = value.clone();
                    Ok(())
                }
                (RecordKind::ItemFields, Some(value)) => {
                    let fields = campaign
                        .as_object_mut()
                        .ok_or_else(conflict_error)?
                        .get_mut("itemFields")
                        .ok_or_else(conflict_error)?;
                    *fields = value.clone();
                    Ok(())
                }
                (_, Some(value)) => replace_in_list(campaign, &change.target, value, *position),
                (_, None) => remove_from_list(campaign, &change.target),
            }
        }
    }
}

fn target_value<'a>(campaign: &'a Value, target: &RecordTarget) -> Option<&'a Value> {
    if target.kind == RecordKind::Inventory {
        return campaign.get("inventory");
    }
    if target.kind == RecordKind::ItemFields {
        return campaign.get("itemFields");
    }
    campaign
        .get(list_key(target.kind))?
        .as_array()?
        .iter()
        .find(|record| record.get("id").and_then(Value::as_str) == Some(target.id.as_str()))
}

fn target_value_mut<'a>(campaign: &'a mut Value, target: &RecordTarget) -> Option<&'a mut Value> {
    if target.kind == RecordKind::Inventory {
        return campaign.get_mut("inventory");
    }
    if target.kind == RecordKind::ItemFields {
        return campaign.get_mut("itemFields");
    }
    campaign
        .get_mut(list_key(target.kind))?
        .as_array_mut()?
        .iter_mut()
        .find(|record| record.get("id").and_then(Value::as_str) == Some(target.id.as_str()))
}

fn replace_in_list(
    campaign: &mut Value,
    target: &RecordTarget,
    replacement: &Value,
    position: Option<usize>,
) -> Result<(), service::CampaignOperationError> {
    let records = campaign
        .get_mut(list_key(target.kind))
        .and_then(Value::as_array_mut)
        .ok_or_else(conflict_error)?;
    if let Some(index) = records
        .iter()
        .position(|record| record.get("id").and_then(Value::as_str) == Some(target.id.as_str()))
    {
        records[index] = replacement.clone();
    } else {
        let index = position.unwrap_or(records.len()).min(records.len());
        records.insert(index, replacement.clone());
    }
    Ok(())
}

fn remove_from_list(
    campaign: &mut Value,
    target: &RecordTarget,
) -> Result<(), service::CampaignOperationError> {
    let records = campaign
        .get_mut(list_key(target.kind))
        .and_then(Value::as_array_mut)
        .ok_or_else(conflict_error)?;
    let index = records
        .iter()
        .position(|record| record.get("id").and_then(Value::as_str) == Some(target.id.as_str()))
        .ok_or_else(conflict_error)?;
    records.remove(index);
    Ok(())
}

fn list_key(kind: RecordKind) -> &'static str {
    match kind {
        RecordKind::Npc => "npcs",
        RecordKind::Location => "locations",
        RecordKind::Faction => "factions",
        RecordKind::Item => "items",
        RecordKind::Thread => "threads",
        RecordKind::Session => "sessions",
        RecordKind::Map => "maps",
        RecordKind::ItemFields | RecordKind::Inventory => "",
    }
}

fn diff_values(
    before: &Value,
    after: &Value,
    path: &mut Vec<PathSegment>,
    fields: &mut Vec<FieldChange>,
) {
    match (before, after) {
        (Value::Object(before), Value::Object(after)) => {
            let keys = before
                .keys()
                .chain(after.keys())
                .collect::<std::collections::HashSet<_>>();
            for key in keys {
                path.push(PathSegment::Key(key.clone()));
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
        }
        (Value::Array(before), Value::Array(after)) if before.len() == after.len() => {
            for (index, (before, after)) in before.iter().zip(after).enumerate() {
                path.push(PathSegment::Index(index));
                diff_values(before, after, path, fields);
                path.pop();
            }
        }
        _ if before != after => fields.push(FieldChange {
            path: path.clone(),
            before: Some(before.clone()),
            after: Some(after.clone()),
        }),
        _ => {}
    }
}

fn get_path<'a>(mut value: &'a Value, path: &[PathSegment]) -> Option<&'a Value> {
    for segment in path {
        value = match segment {
            PathSegment::Key(key) => value.as_object()?.get(key)?,
            PathSegment::Index(index) => value.as_array()?.get(*index)?,
        };
    }
    Some(value)
}

fn apply_fields(value: &mut Value, fields: &[FieldChange], undo: bool) -> Result<(), String> {
    for field in fields {
        let expected = if undo { &field.after } else { &field.before };
        let replacement = if undo { &field.before } else { &field.after };
        if get_path(value, &field.path) != expected.as_ref() {
            return Err("The record changed outside its edit history.".into());
        }
        if field.path.is_empty() {
            match replacement {
                Some(replacement) => *value = replacement.clone(),
                None => return Err("Cannot remove the whole record.".into()),
            }
        } else {
            set_path(value, &field.path, replacement.clone())?;
        }
    }
    Ok(())
}

fn set_path(
    value: &mut Value,
    path: &[PathSegment],
    replacement: Option<Value>,
) -> Result<(), String> {
    if path.is_empty() {
        match replacement {
            Some(replacement) => {
                *value = replacement;
                return Ok(());
            }
            None => return Err("Cannot remove the whole record.".into()),
        }
    }
    let mut current = value;
    for segment in &path[..path.len() - 1] {
        current = match segment {
            PathSegment::Key(key) => current
                .as_object_mut()
                .and_then(|object| object.get_mut(key))
                .ok_or("History field no longer exists.")?,
            PathSegment::Index(index) => current
                .as_array_mut()
                .and_then(|array| array.get_mut(*index))
                .ok_or("History array item no longer exists.")?,
        };
    }
    let last = path.last().expect("nonempty path");
    match last {
        PathSegment::Key(key) => {
            let object: &mut Map<String, Value> = current
                .as_object_mut()
                .ok_or("History parent is not an object.")?;
            if let Some(replacement) = replacement {
                object.insert(key.clone(), replacement);
            } else {
                object.remove(key);
            }
        }
        PathSegment::Index(index) => {
            let array = current
                .as_array_mut()
                .ok_or("History parent is not an array.")?;
            match replacement {
                Some(replacement) => {
                    if let Some(slot) = array.get_mut(*index) {
                        *slot = replacement;
                    } else {
                        return Err("History array item no longer exists.".into());
                    }
                }
                None => {
                    if *index < array.len() {
                        array.remove(*index);
                    }
                }
            }
        }
    }
    Ok(())
}

fn conflict_error() -> service::CampaignOperationError {
    service::CampaignOperationError::Conflict(
        "This record changed outside its edit history. Save the current edit before undoing."
            .into(),
    )
}

fn internal_error(error: impl std::fmt::Display) -> service::CampaignOperationError {
    service::CampaignOperationError::Internal(error.to_string())
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    fn campaign() -> Campaign {
        serde_json::from_value(json!({
            "format": "ttrpg-campaign", "schemaVersion": 1, "id": "history-test",
            "name": "History", "createdAt": "2026-10-01", "updatedAt": "2026-10-01",
            "section": null, "sidebar": {"width": 256, "open": true},
            "workspace": null,
            "npcs": [
                {"id": "npc-1", "name": "Scout", "notes": [{"type": "p", "children": [{"text": ""}]}]},
                {"id": "npc-2", "name": "Guide", "notes": [{"type": "p", "children": [{"text": ""}]}]}
            ],
            "locations": [{"id": "loc-1", "name": "Village", "image": null,
                "publicDescription": "", "gmNotes": ""}],
            "items": [{"id": "item-1", "name": "Rope", "image": null,
                "description": "", "gmNotes": "", "values": {}}],
            "inventory": {"gold": 0, "entries": []}
        }))
        .unwrap()
    }

    fn snapshot(campaign: &Campaign) -> Campaign {
        serde_json::from_value(serde_json::to_value(campaign).unwrap()).unwrap()
    }

    fn save(history: &CampaignHistory, campaign: &mut Campaign, name: &str) -> NpcHistoryResult {
        let npc = &campaign.npcs[0];
        let change = serde_json::from_value(json!({
            "npcId": npc.id, "name": name, "notes": npc.notes, "presentation": npc.presentation
        }))
        .unwrap();
        let result = history.update(snapshot(campaign), change).unwrap();
        campaign.npcs[0] = result.npc.clone();
        result
    }

    #[test]
    fn save_undo_redo_restores_values_and_cursor_labels() {
        let history = CampaignHistory::default();
        let mut campaign = campaign();
        let saved = save(&history, &mut campaign, "Ranger");
        assert!(saved.can_undo);
        assert!(!saved.can_redo);
        assert_eq!(saved.undo_label.as_deref(), Some("Rename NPC"));
        let undone = history.undo(snapshot(&campaign), "npc-1").unwrap();
        assert_eq!(undone.npc.name, "Scout");
        assert!(!undone.can_undo);
        assert_eq!(undone.undo_label, None);
        assert_eq!(undone.redo_label.as_deref(), Some("Rename NPC"));
        campaign.npcs[0] = undone.npc;
        let redone = history.redo(campaign, "npc-1").unwrap();
        assert_eq!(redone.npc.name, "Ranger");
        assert!(redone.can_undo);
        assert!(!redone.can_redo);
        assert_eq!(redone.redo_label, None);
    }

    #[test]
    fn no_op_save_does_not_add_history() {
        let result = save(&CampaignHistory::default(), &mut campaign(), "Scout");
        assert!(!result.can_undo && !result.can_redo);
        assert_eq!(result.undo_label, None);
    }

    #[test]
    fn new_save_after_undo_discards_redo() {
        let history = CampaignHistory::default();
        let mut campaign = campaign();
        save(&history, &mut campaign, "Ranger");
        campaign.npcs[0] = history.undo(snapshot(&campaign), "npc-1").unwrap().npc;
        let result = save(&history, &mut campaign, "Guide");
        assert!(!result.can_redo);
        assert_eq!(result.redo_label, None);
        assert!(history.redo(campaign, "npc-1").is_err());
    }

    #[test]
    fn empty_stack_and_external_changes_are_rejected() {
        let history = CampaignHistory::default();
        let mut campaign = campaign();
        assert!(history.undo(snapshot(&campaign), "npc-1").is_err());
        assert!(history.redo(snapshot(&campaign), "npc-1").is_err());
        save(&history, &mut campaign, "Ranger");
        campaign.npcs[0].name = "External edit".into();
        assert!(history.undo(campaign, "npc-1").is_err());
    }

    #[test]
    fn clear_removes_history() {
        let history = CampaignHistory::default();
        let mut campaign = campaign();
        save(&history, &mut campaign, "Ranger");
        history.clear();
        assert!(history.undo(campaign, "npc-1").is_err());
    }

    #[test]
    fn generic_updates_undo_and_redo_in_order_across_records() {
        let history = CampaignHistory::default();
        let campaign = campaign();
        let mut updated = campaign.clone();
        updated.npcs[0].name = "Ranger".into();
        updated.locations[0].name = "Harbor".into();
        let npc_before = serde_json::to_value(&campaign.npcs[0]).unwrap();
        let location_before = serde_json::to_value(&campaign.locations[0]).unwrap();
        let mut npc_after = npc_before.clone();
        npc_after["name"] = json!("Ranger");
        let mut location_after = location_before.clone();
        location_after["name"] = json!("Harbor");
        history
            .record(
                "history-test",
                "Rename NPC",
                vec![RecordChange::update(
                    RecordTarget::new(RecordKind::Npc, "npc-1"),
                    npc_before,
                    npc_after,
                )],
            )
            .unwrap();
        history
            .record(
                "history-test",
                "Rename location",
                vec![RecordChange::update(
                    RecordTarget::new(RecordKind::Location, "loc-1"),
                    location_before,
                    location_after,
                )],
            )
            .unwrap();
        let undone = history.undo_last(updated).unwrap();
        assert_eq!(undone.label, "Rename location");
        assert_eq!(undone.campaign.locations[0].name, "Village");
        let undone = history.undo_last(undone.campaign).unwrap();
        assert_eq!(undone.label, "Rename NPC");
        assert_eq!(undone.campaign.npcs[0].name, "Scout");
        assert!(!undone.status.can_undo);
        let redone = history.redo_last(undone.campaign).unwrap();
        assert_eq!(redone.campaign.npcs[0].name, "Ranger");
        let redone = history.redo_last(redone.campaign).unwrap();
        assert_eq!(redone.campaign.locations[0].name, "Harbor");
    }

    #[test]
    fn creation_and_deletion_restore_positions() {
        let history = CampaignHistory::default();
        let campaign = campaign();
        let item = json!({"id": "item-2", "name": "Lantern", "image": null,
            "description": "", "gmNotes": "", "values": {}});
        history
            .record(
                "history-test",
                "Create item",
                vec![RecordChange::create(
                    RecordTarget::new(RecordKind::Item, "item-2"),
                    item.clone(),
                    Some(1),
                )],
            )
            .unwrap();
        let mut value = serde_json::to_value(&campaign).unwrap();
        value["items"]
            .as_array_mut()
            .unwrap()
            .insert(1, item.clone());
        let created: Campaign = serde_json::from_value(value).unwrap();
        let undone = history.undo_last(created).unwrap();
        assert_eq!(undone.campaign.items.len(), 1);
        let redone = history.redo_last(undone.campaign).unwrap();
        assert_eq!(redone.campaign.items.len(), 2);
        assert_eq!(
            serde_json::to_value(&redone.campaign.items[1]).unwrap(),
            item
        );
        let before = serde_json::to_value(&redone.campaign.items[1]).unwrap();
        history
            .record(
                "history-test",
                "Delete item",
                vec![RecordChange::delete(
                    RecordTarget::new(RecordKind::Item, "item-2"),
                    before,
                    Some(1),
                )],
            )
            .unwrap();
        let mut value = serde_json::to_value(&redone.campaign).unwrap();
        value["items"].as_array_mut().unwrap().remove(1);
        let deleted: Campaign = serde_json::from_value(value).unwrap();
        let undone = history.undo_last(deleted).unwrap();
        assert_eq!(undone.campaign.items.len(), 2);
        assert_eq!(
            serde_json::to_value(&undone.campaign.items[1]).unwrap(),
            item
        );
    }

    #[test]
    fn compound_entry_undoes_changes_in_reverse_order() {
        let history = CampaignHistory::default();
        let campaign = campaign();
        let map_before = json!({"id": "map-1", "name": "City", "kind": "City",
            "image": {"type": "img", "url": "data:image/png;base64,bWFw"},
            "width": 100, "height": 100, "locationIds": [], "pins": [], "party": null});
        let other_before = json!({"id": "map-2", "name": "Region", "kind": "Region",
            "image": {"type": "img", "url": "data:image/png;base64,bWFw"},
            "width": 100, "height": 100, "locationIds": [],
            "pins": [{"id": "pin-1", "x": 0.5, "y": 0.5, "locationId": "loc-1",
                "label": "", "destinationMapId": "map-1"}], "party": null});
        let mut other_after = other_before.clone();
        other_after["pins"][0]["destinationMapId"] = Value::Null;
        let mut value = serde_json::to_value(&campaign).unwrap();
        value["maps"] = json!([map_before.clone(), other_after.clone()]);
        let before_delete: Campaign = serde_json::from_value(value).unwrap();
        history
            .record(
                "history-test",
                "Delete map",
                vec![
                    RecordChange::delete(
                        RecordTarget::new(RecordKind::Map, "map-1"),
                        map_before.clone(),
                        Some(0),
                    ),
                    RecordChange::update(
                        RecordTarget::new(RecordKind::Map, "map-2"),
                        other_before,
                        other_after,
                    ),
                ],
            )
            .unwrap();
        let mut value = serde_json::to_value(&before_delete).unwrap();
        value["maps"].as_array_mut().unwrap().remove(0);
        let deleted: Campaign = serde_json::from_value(value).unwrap();
        let undone = history.undo_last(deleted).unwrap();
        assert_eq!(undone.campaign.maps.len(), 2);
        assert_eq!(
            serde_json::to_value(&undone.campaign.maps[0]).unwrap(),
            map_before
        );
        assert_eq!(
            undone.campaign.maps[1].pins[0]
                .destination_map_id
                .as_deref(),
            Some("map-1")
        );
        let redone = history.redo_last(undone.campaign).unwrap();
        assert_eq!(redone.campaign.maps.len(), 1);
        assert_eq!(redone.campaign.maps[0].pins[0].destination_map_id, None);
    }

    #[test]
    fn history_is_bounded() {
        let history = CampaignHistory::default();
        let mut campaign = campaign();
        for index in 0..(MAX_HISTORY_ENTRIES + 10) {
            save(&history, &mut campaign, &format!("Ranger {index}"));
        }
        let status = history.status("history-test");
        assert!(status.length <= MAX_HISTORY_ENTRIES);
        assert!(status.can_undo);
    }
}

#[cfg(test)]
mod label_tests {
    use super::*;
    use serde_json::json;

    #[test]
    fn presentation_only_edits_use_section_labels() {
        let history = CampaignHistory::default();
        let campaign: Campaign = serde_json::from_value(json!({
            "format": "ttrpg-campaign", "schemaVersion": 1, "id": "labels",
            "name": "Labels", "createdAt": "2026-01-01", "updatedAt": "2026-01-01",
            "section": null, "sidebar": {"width": 256, "open": true}, "workspace": null,
            "npcs": [{"id": "npc-1", "name": "Scout",
                "notes": [{"type": "p", "children": [{"text": ""}]}]}]
        }))
        .unwrap();
        let mut presentation = campaign.npcs[0].presentation.clone();
        presentation.player_description = "A patient scout.".into();
        let result = history
            .update(
                campaign,
                service::UpdateNpc {
                    npc_id: "npc-1".into(),
                    name: "Scout".into(),
                    notes: vec![json!({"type": "p", "children": [{"text": ""}]})],
                    presentation,
                },
            )
            .unwrap();
        assert_eq!(
            result.undo_label.as_deref(),
            Some("Update Player Description")
        );
    }
}

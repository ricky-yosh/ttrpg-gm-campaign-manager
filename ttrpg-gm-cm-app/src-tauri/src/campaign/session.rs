//! Single-writer in-memory application session. No transport or UI imports.
use super::*;
use schemars::{schema_for, JsonSchema};
use serde_json::json;
use std::path::PathBuf;

#[derive(Debug, Serialize)]
pub struct CoreError {
    pub code: &'static str,
    pub message: String,
}

impl CoreError {
    fn new(code: &'static str, message: impl Into<String>) -> Self {
        Self {
            code,
            message: message.into(),
        }
    }
}

impl std::fmt::Display for CoreError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        write!(f, "{}: {}", self.code, self.message)
    }
}

impl std::error::Error for CoreError {}

impl From<String> for CoreError {
    fn from(message: String) -> Self {
        Self::new("storage", message)
    }
}

impl From<service::CampaignOperationError> for CoreError {
    fn from(error: service::CampaignOperationError) -> Self {
        use service::CampaignOperationError::*;
        match error {
            Validation(message) => Self::new("validation", message),
            NpcNotFound(message) => Self::new("not_found", message),
            Conflict(message) => Self::new("conflict", message),
            Internal(message) => Self::new("internal", message),
        }
    }
}

// The same types drive decoding and discovery. Unknown keys are errors.
#[derive(Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct NewCampaign {
    name: String,
    expected_revision: u64,
    #[serde(default)]
    discard_changes: bool,
}

#[derive(Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct OpenCampaign {
    path: PathBuf,
    expected_revision: u64,
    #[serde(default)]
    discard_changes: bool,
}

#[derive(Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct SaveCampaign {
    expected_revision: u64,
    path: Option<PathBuf>,
}

#[derive(Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct CreateNpc {
    name: String,
    expected_revision: u64,
}

#[derive(Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct EditNpc {
    npc_id: String,
    expected_revision: u64,
    name: Option<String>,
    notes: Option<Vec<Value>>,
}

#[derive(Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct HistoryStep {
    npc_id: String,
    expected_revision: u64,
}

#[derive(Deserialize, JsonSchema)]
#[serde(deny_unknown_fields)]
struct Empty {}

/// One campaign per host. Revision is monotonic across campaign switches.
#[derive(Default)]
pub struct Session {
    campaign: Option<Campaign>,
    storage: Option<storage::Storage>,
    history: CampaignHistory,
    revision: u64,
    dirty: bool,
}

impl Session {
    pub fn discover() -> Value {
        json!({
            "protocolVersion": 1,
            "transport": "json-rpc-2.0-ndjson",
            "methods": {
                "system.describe": schema_for!(Empty),
                "campaign.inspect": schema_for!(Empty),
                "campaign.new": schema_for!(NewCampaign),
                "campaign.open": schema_for!(OpenCampaign),
                "campaign.save": schema_for!(SaveCampaign),
                "npc.list": schema_for!(Empty),
                "npc.create": schema_for!(CreateNpc),
                "npc.update": schema_for!(EditNpc),
                "npc.undo": schema_for!(HistoryStep),
                "npc.redo": schema_for!(HistoryStep)
            },
            "limitations": [
                "One independent campaign session per host; no desktop attachment.",
                "Explicit save, no autosave. EOF discards unsaved work.",
                "NPC saved-edit history is per NPC, bounded to 100 edits, and not persisted.",
                "NPC creation is not undoable yet; presentation editing is not exposed yet.",
                "Inspect returns GM data; it is not a player-safe endpoint."
            ]
        })
    }

    pub fn inspect(&self) -> Value {
        json!({
            "revision": self.revision,
            "dirty": self.dirty,
            "path": self.storage.as_ref().map(|s| &s.folder),
            "campaign": self.campaign,
        })
    }

    fn campaign(&self) -> Result<&Campaign, CoreError> {
        self.campaign
            .as_ref()
            .ok_or_else(|| CoreError::new("no_campaign", "Create or open a campaign first."))
    }

    fn check_revision(&self, expected: u64) -> Result<(), CoreError> {
        if expected != self.revision {
            return Err(CoreError::new(
                "conflict",
                format!(
                    "Expected revision {expected}, current revision is {}.",
                    self.revision
                ),
            ));
        }
        Ok(())
    }

    fn check_switch(&self, discard: bool) -> Result<(), CoreError> {
        if self.dirty && !discard {
            return Err(CoreError::new(
                "unsaved_changes",
                "Save first, or explicitly set discardChanges.",
            ));
        }
        Ok(())
    }

    fn replace(&mut self, campaign: Campaign) {
        self.campaign = Some(campaign);
        self.history.clear();
        self.revision += 1;
    }

    fn accept_npc(&mut self, npc: Npc) -> Result<(), CoreError> {
        let current = self
            .campaign
            .as_mut()
            .and_then(|c| c.npcs.iter_mut().find(|n| n.id == npc.id))
            .ok_or_else(|| CoreError::new("not_found", "NPC no longer exists."))?;
        if serde_json::to_value(&*current).unwrap() != serde_json::to_value(&npc).unwrap() {
            *current = npc;
            self.changed();
        }
        Ok(())
    }

    fn changed(&mut self) {
        self.revision += 1;
        self.dirty = true;
        if let Some(campaign) = &mut self.campaign {
            campaign.updated_at = chrono::Utc::now().to_rfc3339();
        }
    }

    /// Stable application operations shared by headless and future UI adapters.
    /// All requests are serialized by the host. Success means applied in memory;
    /// only campaign.save promises a committed database transaction.
    pub async fn execute(&mut self, method: &str, params: Value) -> Result<Value, CoreError> {
        match method {
            "system.describe" => {
                parse::<Empty>(params)?;
                return Ok(Self::discover());
            }
            "campaign.inspect" => {
                parse::<Empty>(params)?;
                return Ok(self.inspect());
            }
            "campaign.new" => {
                let input: NewCampaign = parse(params)?;
                self.check_revision(input.expected_revision)?;
                self.check_switch(input.discard_changes)?;
                let now = chrono::Utc::now().to_rfc3339();
                let campaign = Campaign {
                    format: "ttrpg-campaign".into(),
                    schema_version: 1,
                    id: uuid::Uuid::new_v4().to_string(),
                    name: input.name.trim().into(),
                    created_at: now.clone(),
                    updated_at: now,
                    statblock_field_set: StatblockFieldSet::default(),
                    npcs: Vec::new(),
                    locations: Vec::new(),
                    factions: Vec::new(),
                    maps: Vec::new(),
                    inventory: PartyInventory::default(),
                    workspace: None,
                    section: None,
                    sidebar: Sidebar {
                        width: 256.0,
                        open: true,
                    },
                };
                campaign
                    .validate()
                    .map_err(|e| CoreError::new("validation", e))?;
                self.storage = None;
                self.replace(campaign);
                self.dirty = true;
            }
            "campaign.open" => {
                let input: OpenCampaign = parse(params)?;
                self.check_revision(input.expected_revision)?;
                self.check_switch(input.discard_changes)?;
                // Build and validate before replacing any working state or history.
                let storage = storage::Storage::open(&input.path, false).await?;
                let campaign = storage.load().await?;
                self.storage = Some(storage);
                self.replace(campaign);
                self.dirty = false;
            }
            "campaign.save" => {
                let input: SaveCampaign = parse(params)?;
                self.check_revision(input.expected_revision)?;
                let campaign = self.campaign()?.clone();
                if let Some(storage) = &mut self.storage {
                    if let Some(path) = input.path {
                        if path
                            .canonicalize()
                            .map_err(|e| CoreError::new("storage", e.to_string()))?
                            != storage.folder
                        {
                            return Err(CoreError::new("validation", "Save Copy is not implemented; omit path when saving an open campaign."));
                        }
                    }
                    storage.save(&campaign).await?;
                } else {
                    let path = input.path.ok_or_else(|| {
                        CoreError::new("invalid_params", "First save requires path.")
                    })?;
                    let mut storage = storage::Storage::open(&path, true).await?;
                    storage.save(&campaign).await?;
                    self.storage = Some(storage);
                }
                self.dirty = false;
                self.revision += 1;
            }
            "npc.list" => {
                parse::<Empty>(params)?;
                return Ok(json!({"revision": self.revision, "npcs": self.campaign()?.npcs}));
            }
            "npc.create" => {
                let input: CreateNpc = parse(params)?;
                self.check_revision(input.expected_revision)?;
                let mut campaign = self.campaign()?.clone();
                let npc = Npc {
                    id: uuid::Uuid::new_v4().to_string(),
                    name: input.name.trim().into(),
                    notes: vec![json!({"type":"p","children":[{"text":""}]})],
                    presentation: NpcPresentation::default(),
                };
                campaign.npcs.push(npc.clone());
                campaign
                    .validate()
                    .map_err(|e| CoreError::new("validation", e))?;
                self.campaign = Some(campaign);
                self.changed();
                return Ok(json!({"revision": self.revision, "npc": npc}));
            }
            "npc.update" => {
                let input: EditNpc = parse(params)?;
                self.check_revision(input.expected_revision)?;
                let campaign = self.campaign()?.clone();
                let npc = campaign
                    .npcs
                    .iter()
                    .find(|n| n.id == input.npc_id)
                    .ok_or_else(|| CoreError::new("not_found", "NPC not found."))?;
                let change = service::UpdateNpc {
                    npc_id: input.npc_id,
                    name: input.name.unwrap_or_else(|| npc.name.clone()),
                    notes: input.notes.unwrap_or_else(|| npc.notes.clone()),
                    presentation: npc.presentation.clone(),
                };
                let result = self.history.update(campaign, change)?;
                self.accept_npc(result.npc.clone())?;
                return Ok(json!({"revision": self.revision, "history": result}));
            }
            "npc.undo" | "npc.redo" => {
                let input: HistoryStep = parse(params)?;
                self.check_revision(input.expected_revision)?;
                let campaign = self.campaign()?.clone();
                let result = if method == "npc.undo" {
                    self.history.undo(campaign, &input.npc_id)?
                } else {
                    self.history.redo(campaign, &input.npc_id)?
                };
                self.accept_npc(result.npc.clone())?;
                return Ok(json!({"revision": self.revision, "history": result}));
            }
            _ => {
                return Err(CoreError::new(
                    "method_not_found",
                    format!("Unknown method: {method}"),
                ))
            }
        }
        Ok(self.inspect())
    }
}

fn parse<T: serde::de::DeserializeOwned>(value: Value) -> Result<T, CoreError> {
    if !value.is_object() {
        return Err(CoreError::new(
            "invalid_params",
            "Parameters must be a named object.",
        ));
    }
    serde_json::from_value(value).map_err(|e| CoreError::new("invalid_params", e.to_string()))
}

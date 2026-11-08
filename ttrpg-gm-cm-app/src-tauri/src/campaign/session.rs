//! Single-writer in-memory application session. No transport or UI imports.
use super::history::{CampaignHistory, HistoryStatus, RecordChange, RecordKind, RecordTarget};
use super::items;
use super::map_geometry::{self, image_point, GridCell, MeasurementMetric};
use super::*;
use schemars::{schema_for, JsonSchema};
use serde_json::{json, Value};
use std::path::PathBuf;

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CoreError {
    pub code: &'static str,
    pub message: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub action: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub expected_revision: Option<u64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub actual_revision: Option<u64>,
}

impl CoreError {
    fn new(code: &'static str, message: impl Into<String>) -> Self {
        Self {
            code,
            message: message.into(),
            action: None,
            expected_revision: None,
            actual_revision: None,
        }
    }

    fn with_revisions(
        code: &'static str,
        message: impl Into<String>,
        expected: u64,
        actual: u64,
    ) -> Self {
        Self {
            code,
            message: message.into(),
            action: None,
            expected_revision: Some(expected),
            actual_revision: Some(actual),
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

fn json_error(error: serde_json::Error) -> CoreError {
    CoreError::new("internal", error.to_string())
}

/// Injected time source. The host uses the system clock; tests can use a fixed one.
pub trait Clock: Send + Sync {
    fn now(&self) -> String;
}

/// Injected ID source. The host uses UUIDs; tests can use a deterministic counter.
pub trait IdSource: Send + Sync {
    fn next_id(&self) -> String;
}

struct SystemClock;
impl Clock for SystemClock {
    fn now(&self) -> String {
        chrono::Utc::now().to_rfc3339()
    }
}

struct UuidSource;
impl IdSource for UuidSource {
    fn next_id(&self) -> String {
        uuid::Uuid::new_v4().to_string()
    }
}

// The same typed definitions drive decoding and discovery. Unknown keys are errors.
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
struct AssetImport {
    data: String,
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
    presentation: Option<NpcPresentation>,
}

#[derive(Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct HistoryStep {
    npc_id: String,
    expected_revision: u64,
}

#[derive(Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct HistoryInput {
    expected_revision: u64,
}

#[derive(Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct GetNpc {
    npc_id: String,
}

#[derive(Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct CreateLocation {
    name: String,
    parent_id: Option<String>,
    expected_revision: u64,
}

#[derive(Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct UpdateLocation {
    location: Location,
    expected_revision: u64,
}

#[derive(Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct GetLocation {
    location_id: String,
}

#[derive(Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct CreateFaction {
    name: String,
    expected_revision: u64,
}

#[derive(Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct UpdateFaction {
    faction: Faction,
    expected_revision: u64,
}

#[derive(Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct GetFaction {
    faction_id: String,
}

#[derive(Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct UpdateInventory {
    inventory: PartyInventory,
    expected_revision: u64,
}

#[derive(Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct CreateItem {
    name: String,
    expected_revision: u64,
}

#[derive(Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct UpdateItem {
    item: CampaignItem,
    #[serde(default)]
    new_fields: Vec<ItemFieldDefinition>,
    expected_revision: u64,
}

#[derive(Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct GetItem {
    item_id: String,
}

#[derive(Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct DeleteItem {
    item_id: String,
    expected_revision: u64,
}

#[derive(Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct CreateThread {
    title: String,
    expected_revision: u64,
}

#[derive(Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct UpdateThread {
    thread: StoryThread,
    expected_revision: u64,
}

#[derive(Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct GetThread {
    thread_id: String,
}

#[derive(Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct CreateSession {
    title: String,
    number: Option<u32>,
    #[serde(default)]
    date: String,
    #[serde(default)]
    previous: bool,
    #[serde(default, alias = "whereWeLeftOff")]
    where_left_off: Option<Vec<Value>>,
    #[serde(default, alias = "prepNotes")]
    prep: Option<Vec<Value>>,
    #[serde(default, alias = "runningNotes")]
    happened: Option<Vec<Value>>,
    #[serde(default, alias = "recap", alias = "playerSummary")]
    summary: Option<Vec<Value>>,
    #[serde(default)]
    beats: Vec<SessionBeat>,
    #[serde(default)]
    links: Vec<SessionLink>,
    expected_revision: u64,
}

#[derive(Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct UpdateSession {
    session: CampaignSession,
    expected_revision: u64,
}

#[derive(Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct GetSession {
    session_id: String,
}

#[derive(Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct GetSessionReferences {
    session_id: String,
}

#[derive(Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct GetSessionBacklinks {
    kind: String,
    target_id: String,
}

#[derive(Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct CreateMap {
    name: String,
    kind: String,
    image: NpcImage,
    width: u32,
    height: u32,
    #[serde(default)]
    location_ids: Vec<String>,
    #[serde(default)]
    pins: Vec<MapPin>,
    party: Option<MapPoint>,
    expected_revision: u64,
}

#[derive(Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct UpdateMap {
    map: MapUpdate,
    expected_revision: u64,
}

#[derive(Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct MapUpdate {
    id: String,
    name: String,
    kind: String,
    image: NpcImage,
    width: u32,
    height: u32,
    #[serde(default)]
    location_ids: Vec<String>,
    #[serde(default)]
    pins: Vec<MapPin>,
    #[serde(default)]
    party: Option<MapPoint>,
    #[serde(default)]
    calibration: Option<MapCalibration>,
    #[serde(default)]
    grid: Option<MapGridInput>,
    #[serde(default)]
    snap: Option<bool>,
}

#[derive(Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct MapGridInput {
    mode: String,
    visible: bool,
    size: f64,
    offset_x: f64,
    offset_y: f64,
    orientation: String,
}

impl MapGridInput {
    fn into_grid(self) -> MapGrid {
        MapGrid {
            mode: self.mode,
            visible: self.visible,
            size: self.size,
            offset_x: self.offset_x,
            offset_y: self.offset_y,
            orientation: self.orientation,
        }
    }
}

#[derive(Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct GetMap {
    map_id: String,
}

#[derive(Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct DeleteMap {
    map_id: String,
    expected_revision: u64,
}

#[derive(Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct CalibrateMap {
    map_id: String,
    point_a: MapPoint,
    point_b: MapPoint,
    known_distance: f64,
    units: String,
    expected_revision: u64,
}

#[derive(Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct ConfigureMap {
    map_id: String,
    #[serde(default)]
    units: Option<String>,
    #[serde(default)]
    grid: Option<MapGridInput>,
    #[serde(default)]
    snap: Option<bool>,
    expected_revision: u64,
}

#[derive(Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct SnapMap {
    map_id: String,
    point: MapPoint,
    #[serde(default)]
    snap: Option<bool>,
}

#[derive(Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct MeasureMap {
    map_id: String,
    points: Vec<MapPoint>,
    #[serde(default)]
    metric: Option<String>,
    #[serde(default)]
    snap: Option<bool>,
}

#[derive(Deserialize, JsonSchema)]
#[serde(deny_unknown_fields)]
struct Empty {}

/// One campaign per host. Revision is monotonic across campaign switches.
pub struct Session {
    campaign: Option<Campaign>,
    storage: Option<storage::Storage>,
    history: CampaignHistory,
    revision: u64,
    dirty: bool,
    clock: Box<dyn Clock>,
    ids: Box<dyn IdSource>,
}

impl Default for Session {
    fn default() -> Self {
        Self::with_dependencies(Box::new(SystemClock), Box::new(UuidSource))
    }
}

impl Session {
    pub fn with_dependencies(clock: Box<dyn Clock>, ids: Box<dyn IdSource>) -> Self {
        Self {
            campaign: None,
            storage: None,
            history: CampaignHistory::default(),
            revision: 0,
            dirty: false,
            clock,
            ids,
        }
    }

    pub fn discover() -> Value {
        let mut methods = serde_json::Map::new();
        macro_rules! method {
            ($name:literal => $ty:ty) => {
                methods.insert(
                    $name.into(),
                    serde_json::to_value(schema_for!($ty)).expect("schema serializes"),
                );
            };
        }
        method!("system.describe" => Empty);
        method!("campaign.inspect" => Empty);
        method!("campaign.new" => NewCampaign);
        method!("campaign.open" => OpenCampaign);
        method!("campaign.save" => SaveCampaign);
        method!("asset.import" => AssetImport);
        method!("npc.list" => Empty);
        method!("npc.get" => GetNpc);
        method!("npc.create" => CreateNpc);
        method!("npc.update" => EditNpc);
        method!("npc.undo" => HistoryStep);
        method!("npc.redo" => HistoryStep);
        method!("location.list" => Empty);
        method!("location.get" => GetLocation);
        method!("location.create" => CreateLocation);
        method!("location.update" => UpdateLocation);
        method!("faction.list" => Empty);
        method!("faction.get" => GetFaction);
        method!("faction.create" => CreateFaction);
        method!("faction.update" => UpdateFaction);
        method!("inventory.get" => Empty);
        method!("inventory.update" => UpdateInventory);
        method!("item.list" => Empty);
        method!("item.get" => GetItem);
        method!("item.create" => CreateItem);
        method!("item.update" => UpdateItem);
        method!("item.delete" => DeleteItem);
        method!("thread.list" => Empty);
        method!("thread.get" => GetThread);
        method!("thread.create" => CreateThread);
        method!("thread.update" => UpdateThread);
        method!("session.list" => Empty);
        method!("session.get" => GetSession);
        method!("session.references" => GetSessionReferences);
        method!("session.backlinks" => GetSessionBacklinks);
        method!("session.create" => CreateSession);
        method!("session.update" => UpdateSession);
        method!("map.list" => Empty);
        method!("map.get" => GetMap);
        method!("map.snap" => SnapMap);
        method!("map.measure" => MeasureMap);
        method!("map.create" => CreateMap);
        method!("map.update" => UpdateMap);
        method!("map.calibrate" => CalibrateMap);
        method!("map.configure" => ConfigureMap);
        method!("map.delete" => DeleteMap);
        method!("history.status" => Empty);
        method!("history.undo" => HistoryInput);
        method!("history.redo" => HistoryInput);
        json!({
            "protocolVersion": 1,
            "transport": "json-rpc-2.0-ndjson",
            "queries": [
                "system.describe", "campaign.inspect", "npc.list", "npc.get",
                "location.list", "location.get", "faction.list", "faction.get",
                "inventory.get", "item.list", "item.get", "thread.list", "thread.get",
                "session.list", "session.get", "session.references", "session.backlinks",
                "map.list", "map.get", "map.snap", "map.measure", "history.status"
            ],
            "mutations": [
                "campaign.new", "campaign.open", "campaign.save", "asset.import",
                "npc.create", "npc.update", "npc.undo", "npc.redo",
                "location.create", "location.update",
                "faction.create", "faction.update", "inventory.update",
                "item.create", "item.update", "item.delete",
                "thread.create", "thread.update",
                "session.create", "session.update",
                "map.create", "map.update", "map.calibrate", "map.configure", "map.delete",
                "history.undo", "history.redo"
            ],
            "methods": Value::Object(methods),
            "limitations": [
                "One independent campaign session per host; no desktop attachment.",
                "Explicit save, no autosave. EOF discards unsaved work.",
                "Edit history is one in-memory stream per campaign session, bounded to 100 entries and 16 MiB; it is not persisted.",
                "campaign.inspect returns complete GM data and is not a player-safe endpoint.",
                "Map calibration, grids, snapping previews, and measurement are GM inspection/authoring only; no tokens, fog, templates, player projection, or renderer is implemented.",
                "Game-session preparation and review are persistent; no player presentation, backup/save-copy, Rune, or frontend workspace actions are implemented.",
                "asset.import is preparation-only, requires an open saved package, and accepts only already-encoded PNG/JPEG/WebP data URLs; it does not require expectedRevision and does not perform WebP conversion.",
                "Output schemas are not generated; inspect the result of a successful action for its shape."
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
            return Err(CoreError::with_revisions(
                "conflict",
                format!(
                    "Expected revision {expected}, current revision is {}.",
                    self.revision
                ),
                expected,
                self.revision,
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

    fn changed(&mut self) {
        self.revision += 1;
        self.dirty = true;
        if let Some(campaign) = &mut self.campaign {
            campaign.updated_at = self.clock.now();
        }
    }

    fn commit(
        &mut self,
        current: Campaign,
        next: Campaign,
        label: &str,
        changes: Vec<RecordChange>,
    ) -> Result<bool, CoreError> {
        if changes.is_empty() {
            return Ok(false);
        }
        next.validate()
            .map_err(|error| CoreError::new("validation", error))?;
        let recorded = self
            .history
            .record(&current.id, label, changes)
            .map_err(CoreError::from)?;
        if !recorded {
            return Ok(false);
        }
        self.campaign = Some(next);
        self.changed();
        Ok(true)
    }

    pub async fn execute(&mut self, method: &str, params: Value) -> Result<Value, CoreError> {
        let action = method.to_owned();
        self.dispatch(method, params).await.map_err(|mut error| {
            if error.action.is_none() {
                error.action = Some(action);
            }
            error
        })
    }

    async fn dispatch(&mut self, method: &str, params: Value) -> Result<Value, CoreError> {
        match method {
            "system.describe" => {
                parse::<Empty>(params)?;
                Ok(Self::discover())
            }
            "campaign.inspect" => {
                parse::<Empty>(params)?;
                Ok(self.inspect())
            }
            "campaign.new" => self.campaign_new(parse::<NewCampaign>(params)?),
            "campaign.open" => self.campaign_open(parse::<OpenCampaign>(params)?).await,
            "campaign.save" => self.campaign_save(parse::<SaveCampaign>(params)?).await,
            "asset.import" => self.asset_import(parse::<AssetImport>(params)?),
            "npc.list" => {
                parse::<Empty>(params)?;
                Ok(json!({"revision": self.revision, "npcs": self.campaign()?.npcs}))
            }
            "npc.get" => self.npc_get(parse::<GetNpc>(params)?),
            "npc.create" => self.npc_create(parse::<CreateNpc>(params)?),
            "npc.update" => self.npc_update(parse::<EditNpc>(params)?),
            "npc.undo" => self.npc_history(parse::<HistoryStep>(params)?, false),
            "npc.redo" => self.npc_history(parse::<HistoryStep>(params)?, true),
            "location.list" => {
                parse::<Empty>(params)?;
                Ok(json!({"revision": self.revision, "locations": self.campaign()?.locations}))
            }
            "location.get" => self.location_get(parse::<GetLocation>(params)?),
            "location.create" => self.location_create(parse::<CreateLocation>(params)?),
            "location.update" => self.location_update(parse::<UpdateLocation>(params)?),
            "faction.list" => {
                parse::<Empty>(params)?;
                Ok(json!({"revision": self.revision, "factions": self.campaign()?.factions}))
            }
            "faction.get" => self.faction_get(parse::<GetFaction>(params)?),
            "faction.create" => self.faction_create(parse::<CreateFaction>(params)?),
            "faction.update" => self.faction_update(parse::<UpdateFaction>(params)?),
            "inventory.get" => {
                parse::<Empty>(params)?;
                Ok(json!({"revision": self.revision, "inventory": self.campaign()?.inventory}))
            }
            "inventory.update" => self.inventory_update(parse::<UpdateInventory>(params)?),
            "item.list" => {
                parse::<Empty>(params)?;
                let campaign = self.campaign()?;
                Ok(json!({
                    "revision": self.revision,
                    "items": campaign.items,
                    "itemFields": campaign.item_fields,
                }))
            }
            "item.get" => self.item_get(parse::<GetItem>(params)?),
            "item.create" => self.item_create(parse::<CreateItem>(params)?),
            "item.update" => self.item_update(parse::<UpdateItem>(params)?),
            "item.delete" => self.item_delete(parse::<DeleteItem>(params)?),
            "thread.list" => {
                parse::<Empty>(params)?;
                Ok(json!({"revision": self.revision, "threads": self.campaign()?.threads}))
            }
            "thread.get" => self.thread_get(parse::<GetThread>(params)?),
            "thread.create" => self.thread_create(parse::<CreateThread>(params)?),
            "thread.update" => self.thread_update(parse::<UpdateThread>(params)?),
            "session.list" => {
                parse::<Empty>(params)?;
                Ok(json!({"revision": self.revision, "sessions": self.campaign()?.sessions}))
            }
            "session.get" => self.session_get(parse::<GetSession>(params)?),
            "session.references" => self.session_references(parse::<GetSessionReferences>(params)?),
            "session.backlinks" => self.session_backlinks(parse::<GetSessionBacklinks>(params)?),
            "session.create" => self.session_create(parse::<CreateSession>(params)?),
            "session.update" => self.session_update(parse::<UpdateSession>(params)?),
            "map.list" => {
                parse::<Empty>(params)?;
                Ok(json!({"revision": self.revision, "maps": self.campaign()?.maps}))
            }
            "map.get" => self.map_get(parse::<GetMap>(params)?),
            "map.snap" => self.map_snap(parse::<SnapMap>(params)?),
            "map.measure" => self.map_measure(parse::<MeasureMap>(params)?),
            "map.create" => self.map_create(parse::<CreateMap>(params)?),
            "map.update" => self.map_update(parse::<UpdateMap>(params)?),
            "map.calibrate" => self.map_calibrate(parse::<CalibrateMap>(params)?),
            "map.configure" => self.map_configure(parse::<ConfigureMap>(params)?),
            "map.delete" => self.map_delete(parse::<DeleteMap>(params)?),
            "history.status" => self.history_status(),
            "history.undo" => self.history_step(parse::<HistoryInput>(params)?, false),
            "history.redo" => self.history_step(parse::<HistoryInput>(params)?, true),
            _ => Err(CoreError::new(
                "method_not_found",
                format!("Unknown method: {method}"),
            )),
        }
    }

    fn campaign_new(&mut self, input: NewCampaign) -> Result<Value, CoreError> {
        self.check_revision(input.expected_revision)?;
        self.check_switch(input.discard_changes)?;
        let now = self.clock.now();
        let campaign = Campaign {
            format: "ttrpg-campaign".into(),
            schema_version: 1,
            id: self.ids.next_id(),
            name: input.name.trim().into(),
            created_at: now.clone(),
            updated_at: now,
            statblock_field_set: StatblockFieldSet::default(),
            npcs: Vec::new(),
            locations: Vec::new(),
            factions: Vec::new(),
            maps: Vec::new(),
            threads: Vec::new(),
            sessions: Vec::new(),
            inventory: PartyInventory::default(),
            items: Vec::new(),
            item_fields: Vec::new(),
            workspace: None,
            section: None,
            sidebar: Sidebar {
                width: 256.0,
                open: true,
            },
        };
        campaign
            .validate()
            .map_err(|error| CoreError::new("validation", error))?;
        self.storage = None;
        self.replace(campaign);
        self.dirty = true;
        Ok(self.inspect())
    }

    async fn campaign_open(&mut self, input: OpenCampaign) -> Result<Value, CoreError> {
        self.check_revision(input.expected_revision)?;
        self.check_switch(input.discard_changes)?;
        // Build and validate before replacing any working state or history.
        let storage = storage::Storage::open(&input.path, false).await?;
        let campaign = storage.load().await?;
        self.storage = Some(storage);
        self.replace(campaign);
        self.dirty = false;
        Ok(self.inspect())
    }

    async fn campaign_save(&mut self, input: SaveCampaign) -> Result<Value, CoreError> {
        self.check_revision(input.expected_revision)?;
        let campaign = self.campaign()?.clone();
        if let Some(storage) = &mut self.storage {
            if let Some(path) = input.path {
                if path
                    .canonicalize()
                    .map_err(|error| CoreError::new("storage", error.to_string()))?
                    != storage.folder
                {
                    return Err(CoreError::new(
                        "validation",
                        "Save Copy is not implemented; omit path when saving an open campaign.",
                    ));
                }
            }
            storage.save(&campaign).await?;
        } else {
            let path = input
                .path
                .ok_or_else(|| CoreError::new("invalid_params", "First save requires path."))?;
            let mut storage = storage::Storage::open(&path, true).await?;
            storage.save(&campaign).await?;
            self.storage = Some(storage);
        }
        self.dirty = false;
        self.revision += 1;
        Ok(self.inspect())
    }

    fn asset_import(&mut self, input: AssetImport) -> Result<Value, CoreError> {
        let storage = self.storage.as_ref().ok_or_else(|| {
            CoreError::new(
                "no_storage",
                "Save or open the campaign before importing an asset.",
            )
        })?;
        let mime = input
            .data
            .strip_prefix("data:")
            .and_then(|rest| rest.split_once(';'))
            .map(|(mime, _)| mime);
        if !matches!(mime, Some("image/png" | "image/jpeg" | "image/webp")) {
            return Err(CoreError::new(
                "validation",
                "asset.import accepts PNG, JPEG, or WebP image data URLs.",
            ));
        }
        let mut node = json!({"type": "img", "url": input.data});
        assets::transform_images(&mut node, &storage.folder, true)?;
        let url = node["url"]
            .as_str()
            .ok_or_else(|| CoreError::new("internal", "Imported asset has no URL."))?
            .to_owned();
        Ok(json!({"revision": self.revision, "url": url}))
    }

    fn npc_get(&self, input: GetNpc) -> Result<Value, CoreError> {
        let npc = self
            .campaign()?
            .npcs
            .iter()
            .find(|npc| npc.id == input.npc_id)
            .cloned()
            .ok_or_else(|| CoreError::new("not_found", "NPC not found."))?;
        Ok(json!({"revision": self.revision, "npc": npc}))
    }

    fn npc_create(&mut self, input: CreateNpc) -> Result<Value, CoreError> {
        self.check_revision(input.expected_revision)?;
        let current = self.campaign()?.clone();
        let npc = Npc {
            id: self.ids.next_id(),
            name: input.name.trim().into(),
            notes: vec![json!({"type":"p","children":[{"text":""}]})],
            presentation: NpcPresentation::default(),
        };
        let position = current.npcs.len();
        let mut next = current.clone();
        next.npcs.push(npc.clone());
        let change = RecordChange::create(
            RecordTarget::new(RecordKind::Npc, npc.id.clone()),
            serde_json::to_value(&npc).map_err(json_error)?,
            Some(position),
        );
        self.commit(current, next, "Create NPC", vec![change])?;
        Ok(json!({"revision": self.revision, "npc": npc}))
    }

    fn npc_update(&mut self, input: EditNpc) -> Result<Value, CoreError> {
        self.check_revision(input.expected_revision)?;
        let current = self.campaign()?.clone();
        let npc = current
            .npcs
            .iter()
            .find(|npc| npc.id == input.npc_id)
            .cloned()
            .ok_or_else(|| CoreError::new("not_found", "NPC not found."))?;
        let change = service::UpdateNpc {
            npc_id: input.npc_id,
            name: input.name.unwrap_or_else(|| npc.name.clone()),
            notes: input.notes.unwrap_or_else(|| npc.notes.clone()),
            presentation: input
                .presentation
                .unwrap_or_else(|| npc.presentation.clone()),
        };
        let result = self.history.update(current.clone(), change)?;
        let changed = serde_json::to_value(&result.npc).map_err(json_error)?
            != serde_json::to_value(&npc).map_err(json_error)?;
        if changed {
            let mut next = current;
            let index = next
                .npcs
                .iter()
                .position(|current| current.id == result.npc.id)
                .ok_or_else(|| CoreError::new("not_found", "NPC not found."))?;
            next.npcs[index] = result.npc.clone();
            next.validate()
                .map_err(|error| CoreError::new("validation", error))?;
            self.campaign = Some(next);
            self.changed();
        }
        Ok(json!({
            "revision": self.revision,
            "npc": result.npc,
            "history": {
                "npc": result.npc.clone(),
                "canUndo": result.can_undo,
                "canRedo": result.can_redo,
                "undoLabel": result.undo_label,
                "redoLabel": result.redo_label,
            }
        }))
    }

    fn npc_history(&mut self, input: HistoryStep, redo: bool) -> Result<Value, CoreError> {
        self.check_revision(input.expected_revision)?;
        let current = self.campaign()?.clone();
        let outcome = if redo {
            self.history.redo_npc(current, &input.npc_id)?
        } else {
            self.history.undo_npc(current, &input.npc_id)?
        };
        let npc = outcome
            .campaign
            .npcs
            .iter()
            .find(|npc| npc.id == input.npc_id)
            .cloned();
        self.campaign = Some(outcome.campaign);
        self.changed();
        Ok(json!({
            "revision": self.revision,
            "npc": npc,
            "label": outcome.label,
            "history": {
                "npc": npc.clone(),
                "canUndo": outcome.status.can_undo,
                "canRedo": outcome.status.can_redo,
                "undoLabel": outcome.status.undo_label,
                "redoLabel": outcome.status.redo_label,
            },
        }))
    }

    fn location_get(&self, input: GetLocation) -> Result<Value, CoreError> {
        let location = self
            .campaign()?
            .locations
            .iter()
            .find(|location| location.id == input.location_id)
            .cloned()
            .ok_or_else(|| CoreError::new("not_found", "Location not found."))?;
        Ok(json!({"revision": self.revision, "location": location}))
    }

    fn location_create(&mut self, input: CreateLocation) -> Result<Value, CoreError> {
        self.check_revision(input.expected_revision)?;
        let current = self.campaign()?.clone();
        let location = Location {
            id: self.ids.next_id(),
            name: input.name.trim().into(),
            parent_id: input.parent_id,
            party_knowledge: unknown_party_knowledge(),
            ..Default::default()
        };
        let position = current.locations.len();
        let mut next = current.clone();
        next.locations.push(location.clone());
        let change = RecordChange::create(
            RecordTarget::new(RecordKind::Location, location.id.clone()),
            serde_json::to_value(&location).map_err(json_error)?,
            Some(position),
        );
        self.commit(current, next, "Create location", vec![change])?;
        Ok(json!({"revision": self.revision, "location": location}))
    }

    fn location_update(&mut self, input: UpdateLocation) -> Result<Value, CoreError> {
        self.check_revision(input.expected_revision)?;
        let current = self.campaign()?.clone();
        let index = current
            .locations
            .iter()
            .position(|location| location.id == input.location.id)
            .ok_or_else(|| CoreError::new("not_found", "Location not found."))?;
        let mut location = input.location;
        location.name = location.name.trim().into();
        let before = current.locations[index].clone();
        let label = rename_label("location", "name", &before, &location)?;
        let mut next = current.clone();
        next.locations[index] = location.clone();
        let Some(change) = update_change(
            RecordTarget::new(RecordKind::Location, location.id.clone()),
            &before,
            &location,
        )?
        else {
            return Ok(json!({"revision": self.revision, "location": location}));
        };
        self.commit(current, next, &label, vec![change])?;
        Ok(json!({"revision": self.revision, "location": location}))
    }

    fn faction_get(&self, input: GetFaction) -> Result<Value, CoreError> {
        let faction = self
            .campaign()?
            .factions
            .iter()
            .find(|faction| faction.id == input.faction_id)
            .cloned()
            .ok_or_else(|| CoreError::new("not_found", "Faction not found."))?;
        Ok(json!({"revision": self.revision, "faction": faction}))
    }

    fn faction_create(&mut self, input: CreateFaction) -> Result<Value, CoreError> {
        self.check_revision(input.expected_revision)?;
        let current = self.campaign()?.clone();
        let faction = Faction {
            id: self.ids.next_id(),
            name: input.name.trim().into(),
            image: None,
            description: String::new(),
            gm_notes: String::new(),
        };
        let position = current.factions.len();
        let mut next = current.clone();
        next.factions.push(faction.clone());
        let change = RecordChange::create(
            RecordTarget::new(RecordKind::Faction, faction.id.clone()),
            serde_json::to_value(&faction).map_err(json_error)?,
            Some(position),
        );
        self.commit(current, next, "Create faction", vec![change])?;
        Ok(json!({"revision": self.revision, "faction": faction}))
    }

    fn faction_update(&mut self, input: UpdateFaction) -> Result<Value, CoreError> {
        self.check_revision(input.expected_revision)?;
        let current = self.campaign()?.clone();
        let index = current
            .factions
            .iter()
            .position(|faction| faction.id == input.faction.id)
            .ok_or_else(|| CoreError::new("not_found", "Faction not found."))?;
        let mut faction = input.faction;
        faction.name = faction.name.trim().into();
        let before = current.factions[index].clone();
        let label = rename_label("faction", "name", &before, &faction)?;
        let mut next = current.clone();
        next.factions[index] = faction.clone();
        let Some(change) = update_change(
            RecordTarget::new(RecordKind::Faction, faction.id.clone()),
            &before,
            &faction,
        )?
        else {
            return Ok(json!({"revision": self.revision, "faction": faction}));
        };
        self.commit(current, next, &label, vec![change])?;
        Ok(json!({"revision": self.revision, "faction": faction}))
    }

    fn inventory_update(&mut self, input: UpdateInventory) -> Result<Value, CoreError> {
        self.check_revision(input.expected_revision)?;
        let current = self.campaign()?.clone();
        let mut inventory = input.inventory;
        for entry in &mut inventory.entries {
            entry.name = entry.name.trim().into();
            entry.note = entry.note.trim().into();
        }
        let before = serde_json::to_value(&current.inventory).map_err(json_error)?;
        let after = serde_json::to_value(&inventory).map_err(json_error)?;
        if before == after {
            return Ok(json!({"revision": self.revision, "inventory": inventory}));
        }
        let mut next = current.clone();
        next.inventory = inventory.clone();
        let change = RecordChange::update(
            RecordTarget::new(RecordKind::Inventory, "party"),
            before,
            after,
        );
        self.commit(current, next, "Update inventory", vec![change])?;
        Ok(json!({"revision": self.revision, "inventory": inventory}))
    }

    fn item_get(&self, input: GetItem) -> Result<Value, CoreError> {
        let item = self
            .campaign()?
            .items
            .iter()
            .find(|item| item.id == input.item_id)
            .cloned()
            .ok_or_else(|| CoreError::new("not_found", "Item not found."))?;
        Ok(json!({"revision": self.revision, "item": item}))
    }

    fn item_create(&mut self, input: CreateItem) -> Result<Value, CoreError> {
        self.check_revision(input.expected_revision)?;
        let current = self.campaign()?.clone();
        let item = items::new_item(self.ids.next_id(), input.name.trim().to_owned());
        let position = current.items.len();
        let mut next = current.clone();
        next.items.push(item.clone());
        let change = RecordChange::create(
            RecordTarget::new(RecordKind::Item, item.id.clone()),
            serde_json::to_value(&item).map_err(json_error)?,
            Some(position),
        );
        self.commit(current, next, "Create item", vec![change])?;
        Ok(json!({"revision": self.revision, "item": item}))
    }

    fn item_update(&mut self, input: UpdateItem) -> Result<Value, CoreError> {
        self.check_revision(input.expected_revision)?;
        let current = self.campaign()?.clone();
        let index = current
            .items
            .iter()
            .position(|item| item.id == input.item.id)
            .ok_or_else(|| CoreError::new("not_found", "Item not found."))?;
        let mut item = input.item;
        item.name = item.name.trim().into();
        let before_item = current.items[index].clone();
        let before_fields = serde_json::to_value(&current.item_fields).map_err(json_error)?;
        let label = rename_label("item", "name", &before_item, &item)?;
        let mut next = current.clone();
        next.items[index] = item.clone();
        next.item_fields.extend(input.new_fields);
        let after_fields = serde_json::to_value(&next.item_fields).map_err(json_error)?;
        let mut changes = Vec::new();
        if let Some(change) = update_change(
            RecordTarget::new(RecordKind::Item, item.id.clone()),
            &before_item,
            &item,
        )? {
            changes.push(change);
        }
        if before_fields != after_fields {
            changes.push(RecordChange::update(
                RecordTarget::new(RecordKind::ItemFields, "catalog"),
                before_fields,
                after_fields,
            ));
        }
        if changes.is_empty() {
            return Ok(json!({
                "revision": self.revision,
                "item": item,
                "itemFields": next.item_fields,
            }));
        }
        self.commit(current, next.clone(), &label, changes)?;
        Ok(json!({
            "revision": self.revision,
            "item": item,
            "itemFields": next.item_fields,
        }))
    }

    fn item_delete(&mut self, input: DeleteItem) -> Result<Value, CoreError> {
        self.check_revision(input.expected_revision)?;
        let current = self.campaign()?.clone();
        let index = current
            .items
            .iter()
            .position(|item| item.id == input.item_id)
            .ok_or_else(|| CoreError::new("not_found", "Item not found."))?;
        let item = current.items[index].clone();
        let mut next = current.clone();
        next.items.remove(index);
        let change = RecordChange::delete(
            RecordTarget::new(RecordKind::Item, input.item_id),
            serde_json::to_value(&item).map_err(json_error)?,
            Some(index),
        );
        self.commit(current, next, "Delete item", vec![change])?;
        Ok(json!({"revision": self.revision, "deleted": true}))
    }

    fn thread_get(&self, input: GetThread) -> Result<Value, CoreError> {
        let thread = self
            .campaign()?
            .threads
            .iter()
            .find(|thread| thread.id == input.thread_id)
            .cloned()
            .ok_or_else(|| CoreError::new("not_found", "Story thread not found."))?;
        Ok(json!({"revision": self.revision, "thread": thread}))
    }

    fn thread_create(&mut self, input: CreateThread) -> Result<Value, CoreError> {
        self.check_revision(input.expected_revision)?;
        let current = self.campaign()?.clone();
        let notes = blank_notes();
        let thread = StoryThread {
            id: self.ids.next_id(),
            title: input.title.trim().into(),
            status: "idea".into(),
            player_reminder: String::new(),
            origin: String::new(),
            source_label: String::new(),
            current_situation: notes.clone(),
            gm_possibilities: notes,
            people: Vec::new(),
            locations: Vec::new(),
            factions: Vec::new(),
        };
        let position = current.threads.len();
        let mut next = current.clone();
        next.threads.push(thread.clone());
        let change = RecordChange::create(
            RecordTarget::new(RecordKind::Thread, thread.id.clone()),
            serde_json::to_value(&thread).map_err(json_error)?,
            Some(position),
        );
        self.commit(current, next, "Create story thread", vec![change])?;
        Ok(json!({"revision": self.revision, "thread": thread}))
    }

    fn thread_update(&mut self, input: UpdateThread) -> Result<Value, CoreError> {
        self.check_revision(input.expected_revision)?;
        let current = self.campaign()?.clone();
        let index = current
            .threads
            .iter()
            .position(|thread| thread.id == input.thread.id)
            .ok_or_else(|| CoreError::new("not_found", "Story thread not found."))?;
        let mut thread = input.thread;
        thread.title = thread.title.trim().into();
        let before = current.threads[index].clone();
        let label = rename_label("story thread", "title", &before, &thread)?;
        let mut next = current.clone();
        next.threads[index] = thread.clone();
        let Some(change) = update_change(
            RecordTarget::new(RecordKind::Thread, thread.id.clone()),
            &before,
            &thread,
        )?
        else {
            return Ok(json!({"revision": self.revision, "thread": thread}));
        };
        self.commit(current, next, &label, vec![change])?;
        Ok(json!({"revision": self.revision, "thread": thread}))
    }

    fn session_get(&self, input: GetSession) -> Result<Value, CoreError> {
        let session = self
            .campaign()?
            .sessions
            .iter()
            .find(|session| session.id == input.session_id)
            .cloned()
            .ok_or_else(|| CoreError::new("not_found", "Game session not found."))?;
        Ok(json!({"revision": self.revision, "session": session}))
    }

    fn session_references(&self, input: GetSessionReferences) -> Result<Value, CoreError> {
        let campaign = self.campaign()?;
        let session = campaign
            .sessions
            .iter()
            .find(|session| session.id == input.session_id)
            .ok_or_else(|| CoreError::new("not_found", "Game session not found."))?;
        let references = session
            .links
            .iter()
            .map(|link| {
                let name = session_link_name(campaign, &link.kind, &link.target_id);
                json!({
                    "kind": link.kind,
                    "targetId": link.target_id,
                    "label": link.label,
                    "available": name.is_some(),
                    "name": name,
                })
            })
            .collect::<Vec<_>>();
        Ok(json!({
            "revision": self.revision,
            "sessionId": session.id,
            "references": references,
        }))
    }

    fn session_backlinks(&self, input: GetSessionBacklinks) -> Result<Value, CoreError> {
        let kind = input.kind.trim();
        if !SESSION_LINK_KINDS.contains(&kind) {
            return Err(CoreError::new(
                "validation",
                "Unsupported session reference kind.",
            ));
        }
        let target_id = input.target_id.trim();
        if target_id.is_empty() {
            return Err(CoreError::new(
                "validation",
                "Session reference target ID must not be empty.",
            ));
        }
        let campaign = self.campaign()?;
        let sessions = campaign
            .sessions
            .iter()
            .filter_map(|session| {
                session
                    .links
                    .iter()
                    .find(|link| link.kind == kind && link.target_id.trim() == target_id)
                    .map(|link| {
                        json!({
                            "id": session.id,
                            "title": session.title,
                            "number": session.number,
                            "date": session.date,
                            "previous": session.previous,
                            "label": link.label,
                        })
                    })
            })
            .collect::<Vec<_>>();
        Ok(json!({
            "revision": self.revision,
            "kind": kind,
            "targetId": target_id,
            "sessions": sessions,
        }))
    }

    fn session_create(&mut self, input: CreateSession) -> Result<Value, CoreError> {
        self.check_revision(input.expected_revision)?;
        let current = self.campaign()?.clone();
        let number = match input.number {
            Some(number) => number,
            None => current
                .sessions
                .iter()
                .map(|session| session.number)
                .max()
                .unwrap_or(0)
                .checked_add(1)
                .ok_or_else(|| {
                    CoreError::new("validation", "No next session number is available.")
                })?,
        };
        let mut session = CampaignSession {
            id: self.ids.next_id(),
            title: input.title,
            number,
            date: input.date,
            previous: input.previous,
            where_left_off: input.where_left_off.unwrap_or_else(blank_notes),
            prep: input.prep.unwrap_or_else(blank_notes),
            happened: input.happened.unwrap_or_else(blank_notes),
            summary: input.summary.unwrap_or_else(blank_notes),
            beats: input.beats,
            links: input.links,
        };
        normalize_session(&mut session);
        let position = current.sessions.len();
        let mut next = current.clone();
        next.sessions.push(session.clone());
        let change = RecordChange::create(
            RecordTarget::new(RecordKind::Session, session.id.clone()),
            serde_json::to_value(&session).map_err(json_error)?,
            Some(position),
        );
        self.commit(current, next, "Create session", vec![change])?;
        Ok(json!({"revision": self.revision, "session": session}))
    }

    fn session_update(&mut self, input: UpdateSession) -> Result<Value, CoreError> {
        self.check_revision(input.expected_revision)?;
        let current = self.campaign()?.clone();
        let index = current
            .sessions
            .iter()
            .position(|session| session.id == input.session.id)
            .ok_or_else(|| CoreError::new("not_found", "Game session not found."))?;
        let mut session = input.session;
        normalize_session(&mut session);
        let before = current.sessions[index].clone();
        let label = rename_label("session", "title", &before, &session)?;
        let mut next = current.clone();
        next.sessions[index] = session.clone();
        let Some(change) = update_change(
            RecordTarget::new(RecordKind::Session, session.id.clone()),
            &before,
            &session,
        )?
        else {
            return Ok(json!({"revision": self.revision, "session": session}));
        };
        self.commit(current, next, &label, vec![change])?;
        Ok(json!({"revision": self.revision, "session": session}))
    }

    fn map_get(&self, input: GetMap) -> Result<Value, CoreError> {
        let map = self
            .campaign()?
            .maps
            .iter()
            .find(|map| map.id == input.map_id)
            .cloned()
            .ok_or_else(|| CoreError::new("not_found", "Map not found."))?;
        Ok(json!({"revision": self.revision, "map": map}))
    }

    fn map_create(&mut self, input: CreateMap) -> Result<Value, CoreError> {
        self.check_revision(input.expected_revision)?;
        let current = self.campaign()?.clone();
        let mut pins = input.pins;
        for pin in &mut pins {
            if pin.id.trim().is_empty() {
                pin.id = self.ids.next_id();
            }
            pin.label = pin.label.trim().into();
        }
        let map = CampaignMap {
            id: self.ids.next_id(),
            name: input.name.trim().into(),
            kind: input.kind,
            image: input.image,
            width: input.width,
            height: input.height,
            location_ids: input.location_ids,
            pins,
            party: input.party,
            calibration: None,
            grid: MapGrid::default(),
            snap: false,
        };
        let position = current.maps.len();
        let mut next = current.clone();
        next.maps.push(map.clone());
        let change = RecordChange::create(
            RecordTarget::new(RecordKind::Map, map.id.clone()),
            serde_json::to_value(&map).map_err(json_error)?,
            Some(position),
        );
        self.commit(current, next, "Create map", vec![change])?;
        Ok(json!({"revision": self.revision, "map": map}))
    }

    fn map_update(&mut self, input: UpdateMap) -> Result<Value, CoreError> {
        self.check_revision(input.expected_revision)?;
        let current = self.campaign()?.clone();
        let index = current
            .maps
            .iter()
            .position(|map| map.id == input.map.id)
            .ok_or_else(|| CoreError::new("not_found", "Map not found."))?;
        let input = input.map;
        let before = current.maps[index].clone();
        let mut map = CampaignMap {
            id: input.id,
            name: input.name.trim().into(),
            kind: input.kind,
            image: input.image,
            width: input.width,
            height: input.height,
            location_ids: input.location_ids,
            pins: input.pins,
            party: input.party,
            calibration: input
                .calibration
                .map(map_geometry::normalize_calibration)
                .or_else(|| before.calibration.clone()),
            grid: input
                .grid
                .map(|grid| map_geometry::normalize_grid(grid.into_grid()))
                .unwrap_or_else(|| before.grid.clone()),
            snap: input.snap.unwrap_or(before.snap),
        };
        for pin in &mut map.pins {
            if pin.id.trim().is_empty() {
                pin.id = self.ids.next_id();
            }
            pin.label = pin.label.trim().into();
        }
        let label = rename_label("map", "name", &before, &map)?;
        let mut next = current.clone();
        next.maps[index] = map.clone();
        let Some(change) = update_change(
            RecordTarget::new(RecordKind::Map, map.id.clone()),
            &before,
            &map,
        )?
        else {
            return Ok(json!({"revision": self.revision, "map": map}));
        };
        self.commit(current, next, &label, vec![change])?;
        Ok(json!({"revision": self.revision, "map": map}))
    }

    fn map_calibrate(&mut self, input: CalibrateMap) -> Result<Value, CoreError> {
        self.check_revision(input.expected_revision)?;
        let current = self.campaign()?.clone();
        let index = current
            .maps
            .iter()
            .position(|map| map.id == input.map_id)
            .ok_or_else(|| CoreError::new("not_found", "Map not found."))?;
        let calibration = map_geometry::calibration_from_points(
            &current.maps[index],
            &input.point_a,
            &input.point_b,
            input.known_distance,
            &input.units,
        )
        .map_err(|error| CoreError::new("validation", error))?;
        let before = current.maps[index].clone();
        let mut next = current.clone();
        next.maps[index].calibration = Some(calibration);
        let Some(change) = update_change(
            RecordTarget::new(RecordKind::Map, before.id.clone()),
            &before,
            &next.maps[index],
        )?
        else {
            return Ok(json!({"revision": self.revision, "map": before}));
        };
        self.commit(current, next, "Calibrate map", vec![change])?;
        Ok(json!({
            "revision": self.revision,
            "map": self.campaign()?.maps[index],
        }))
    }

    fn map_configure(&mut self, input: ConfigureMap) -> Result<Value, CoreError> {
        self.check_revision(input.expected_revision)?;
        let current = self.campaign()?.clone();
        let index = current
            .maps
            .iter()
            .position(|map| map.id == input.map_id)
            .ok_or_else(|| CoreError::new("not_found", "Map not found."))?;
        let before = current.maps[index].clone();
        let mut map = before.clone();
        let mut changed_units = false;
        let mut changed_grid = false;
        let mut changed_snap = false;
        if let Some(units) = input.units {
            let units = units.trim();
            if !map_geometry::metres_per_unit(units).is_some() {
                return Err(CoreError::new(
                    "validation",
                    "Map scale units must be feet, metres, or miles.",
                ));
            }
            let calibration = map.calibration.as_ref().ok_or_else(|| {
                CoreError::new(
                    "validation",
                    "Calibrate the map before changing its scale units.",
                )
            })?;
            if calibration.units != units {
                map.calibration = Some(
                    map_geometry::convert_calibration_units(calibration, units)
                        .map_err(|error| CoreError::new("validation", error))?,
                );
                changed_units = true;
            }
        }
        if let Some(grid) = input.grid {
            let grid = map_geometry::normalize_grid(grid.into_grid());
            map_geometry::validate_grid(&grid)
                .map_err(|error| CoreError::new("validation", error))?;
            if grid.mode != map.grid.mode
                || grid.visible != map.grid.visible
                || grid.size != map.grid.size
                || grid.offset_x != map.grid.offset_x
                || grid.offset_y != map.grid.offset_y
                || grid.orientation != map.grid.orientation
            {
                map.grid = grid;
                changed_grid = true;
            }
        }
        if let Some(snap) = input.snap {
            if snap != map.snap {
                map.snap = snap;
                changed_snap = true;
            }
        }
        if !changed_units && !changed_grid && !changed_snap {
            return Ok(json!({"revision": self.revision, "map": before}));
        }
        let label = match (changed_units, changed_grid, changed_snap) {
            (true, false, false) => "Change map units",
            (false, true, false) => "Configure map grid",
            (false, false, true) => "Change map snapping",
            _ => "Configure map",
        };
        let mut next = current.clone();
        next.maps[index] = map.clone();
        let Some(change) = update_change(
            RecordTarget::new(RecordKind::Map, map.id.clone()),
            &before,
            &map,
        )?
        else {
            return Ok(json!({"revision": self.revision, "map": before}));
        };
        self.commit(current, next, label, vec![change])?;
        Ok(json!({"revision": self.revision, "map": map}))
    }

    fn map_snap(&self, input: SnapMap) -> Result<Value, CoreError> {
        let campaign = self.campaign()?;
        let map = campaign
            .maps
            .iter()
            .find(|map| map.id == input.map_id)
            .ok_or_else(|| CoreError::new("not_found", "Map not found."))?;
        let outcome = map_geometry::snap_point(
            map,
            &input.point,
            input.snap.unwrap_or(map.snap),
            "Requested point",
        )
        .map_err(|error| CoreError::new("validation", error))?;
        let (requested_x, requested_y) = image_point(map, &outcome.requested);
        let (effective_x, effective_y) = image_point(map, &outcome.effective);
        Ok(json!({
            "revision": self.revision,
            "mapId": map.id,
            "requested": outcome.requested,
            "effective": outcome.effective,
            "requestedImage": {"x": requested_x, "y": requested_y},
            "effectiveImage": {"x": effective_x, "y": effective_y},
            "snapRequested": input.snap.unwrap_or(map.snap),
            "snapped": outcome.snapped,
            "cell": outcome.cell.as_ref().map(GridCell::to_json),
            "grid": map_geometry::grid_json(&map.grid),
        }))
    }

    fn map_measure(&self, input: MeasureMap) -> Result<Value, CoreError> {
        let metric_name = input.metric.as_deref().unwrap_or("straight").trim();
        let metric = MeasurementMetric::parse(metric_name).ok_or_else(|| {
            CoreError::new(
                "validation",
                "Map measurement metric must be straight, square-equal-diagonals, square-alternating-diagonals, or hex-steps.",
            )
        })?;
        let campaign = self.campaign()?;
        let map = campaign
            .maps
            .iter()
            .find(|map| map.id == input.map_id)
            .ok_or_else(|| CoreError::new("not_found", "Map not found."))?;
        let measurement =
            map_geometry::measure(map, &input.points, metric, input.snap.unwrap_or(map.snap))
                .map_err(|error| CoreError::new("validation", error))?;
        let units = measurement.units.clone();
        let segments = measurement
            .segments
            .iter()
            .map(|segment| {
                json!({
                    "from": segment.from,
                    "to": segment.to,
                    "imageDistance": segment.image_distance,
                    "distance": segment.distance,
                    "units": &units,
                    "fromCell": segment.from_cell.as_ref().map(GridCell::to_json),
                    "toCell": segment.to_cell.as_ref().map(GridCell::to_json),
                    "diagonalSteps": segment.diagonal_steps,
                    "nextDiagonalCost": segment.next_diagonal_cost,
                })
            })
            .collect::<Vec<_>>();
        Ok(json!({
            "revision": self.revision,
            "mapId": map.id,
            "metric": metric.as_str(),
            "units": units,
            "snapRequested": input.snap.unwrap_or(map.snap),
            "snapped": measurement.snapped,
            "calibration": measurement.calibration,
            "grid": map_geometry::grid_json(&map.grid),
            "points": measurement.points,
            "segments": segments,
            "imageTotal": measurement.image_total,
            "total": measurement.total,
        }))
    }

    fn map_delete(&mut self, input: DeleteMap) -> Result<Value, CoreError> {
        self.check_revision(input.expected_revision)?;
        let current = self.campaign()?.clone();
        let index = current
            .maps
            .iter()
            .position(|map| map.id == input.map_id)
            .ok_or_else(|| CoreError::new("not_found", "Map not found."))?;
        let map = current.maps[index].clone();
        let mut next = current.clone();
        next.maps.remove(index);
        let mut changes = vec![RecordChange::delete(
            RecordTarget::new(RecordKind::Map, input.map_id.clone()),
            serde_json::to_value(&map).map_err(json_error)?,
            Some(index),
        )];
        for map in &mut next.maps {
            let needs_clear = map
                .pins
                .iter()
                .any(|pin| pin.destination_map_id.as_deref() == Some(input.map_id.as_str()));
            if !needs_clear {
                continue;
            }
            let before = map.clone();
            for pin in &mut map.pins {
                if pin.destination_map_id.as_deref() == Some(input.map_id.as_str()) {
                    pin.destination_map_id = None;
                }
            }
            if let Some(change) = update_change(
                RecordTarget::new(RecordKind::Map, map.id.clone()),
                &before,
                map,
            )? {
                changes.push(change);
            }
        }
        self.commit(current, next, "Delete map", changes)?;
        Ok(json!({"revision": self.revision, "deleted": true}))
    }

    fn history_status(&self) -> Result<Value, CoreError> {
        let status = match &self.campaign {
            Some(campaign) => self.history.status(&campaign.id),
            None => HistoryStatus {
                can_undo: false,
                can_redo: false,
                undo_label: None,
                redo_label: None,
                length: 0,
                cursor: 0,
            },
        };
        Ok(json!({"revision": self.revision, "history": status}))
    }

    fn history_step(&mut self, input: HistoryInput, redo: bool) -> Result<Value, CoreError> {
        self.check_revision(input.expected_revision)?;
        let current = self.campaign()?.clone();
        let outcome = if redo {
            self.history.redo_last(current)?
        } else {
            self.history.undo_last(current)?
        };
        self.campaign = Some(outcome.campaign);
        self.changed();
        Ok(json!({
            "revision": self.revision,
            "label": outcome.label,
            "history": outcome.status,
        }))
    }
}

fn update_change<T: Serialize>(
    target: RecordTarget,
    before: &T,
    after: &T,
) -> Result<Option<RecordChange>, CoreError> {
    let before = serde_json::to_value(before).map_err(json_error)?;
    let after = serde_json::to_value(after).map_err(json_error)?;
    if before == after {
        return Ok(None);
    }
    Ok(Some(RecordChange::update(target, before, after)))
}

fn rename_label<T: Serialize>(
    kind: &str,
    field: &str,
    before: &T,
    after: &T,
) -> Result<String, CoreError> {
    let before = serde_json::to_value(before).map_err(json_error)?;
    let after = serde_json::to_value(after).map_err(json_error)?;
    if before.get(field) != after.get(field) {
        Ok(format!("Rename {kind}"))
    } else {
        Ok(format!("Edit {kind}"))
    }
}

fn blank_notes() -> Vec<Value> {
    vec![json!({"type": "p", "children": [{"text": ""}]})]
}

fn session_link_name(campaign: &Campaign, kind: &str, target_id: &str) -> Option<String> {
    let target_id = target_id.trim();
    match kind {
        "npc" => campaign
            .npcs
            .iter()
            .find(|record| record.id == target_id)
            .map(|record| record.name.clone()),
        "location" => campaign
            .locations
            .iter()
            .find(|record| record.id == target_id)
            .map(|record| record.name.clone()),
        "faction" => campaign
            .factions
            .iter()
            .find(|record| record.id == target_id)
            .map(|record| record.name.clone()),
        "thread" => campaign
            .threads
            .iter()
            .find(|record| record.id == target_id)
            .map(|record| record.title.clone()),
        "item" => campaign
            .items
            .iter()
            .find(|record| record.id == target_id)
            .map(|record| record.name.clone()),
        _ => None,
    }
}

fn normalize_session(session: &mut CampaignSession) {
    session.title = session.title.trim().into();
    session.date = session.date.trim().into();
    for beat in &mut session.beats {
        beat.title = beat.title.trim().into();
    }
    for link in &mut session.links {
        link.target_id = link.target_id.trim().into();
        link.label = link.label.trim().into();
    }
}

fn parse<T: serde::de::DeserializeOwned>(value: Value) -> Result<T, CoreError> {
    if !value.is_object() {
        return Err(CoreError::new(
            "invalid_params",
            "Parameters must be a named object.",
        ));
    }
    serde_json::from_value(value)
        .map_err(|error| CoreError::new("invalid_params", error.to_string()))
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::sync::atomic::{AtomicU64, Ordering};

    struct FixedClock;
    impl Clock for FixedClock {
        fn now(&self) -> String {
            "2026-01-02T03:04:05Z".into()
        }
    }

    #[derive(Default)]
    struct CounterIds(AtomicU64);
    impl IdSource for CounterIds {
        fn next_id(&self) -> String {
            format!("id-{}", self.0.fetch_add(1, Ordering::SeqCst) + 1)
        }
    }

    fn session() -> Session {
        Session::with_dependencies(Box::new(FixedClock), Box::new(CounterIds::default()))
    }

    #[tokio::test]
    async fn injected_clock_and_ids_make_new_campaign_data_deterministic() {
        let mut session = session();
        let created = session
            .execute(
                "campaign.new",
                json!({"name":"Deterministic","expectedRevision":0}),
            )
            .await
            .unwrap();
        assert_eq!(created["campaign"]["id"], "id-1");
        assert_eq!(created["campaign"]["createdAt"], "2026-01-02T03:04:05Z");
        assert_eq!(created["campaign"]["updatedAt"], "2026-01-02T03:04:05Z");

        let npc = session
            .execute("npc.create", json!({"name":"Scout","expectedRevision":1}))
            .await
            .unwrap();
        assert_eq!(npc["npc"]["id"], "id-2");
        let location = session
            .execute(
                "location.create",
                json!({"name":"Village","expectedRevision":2}),
            )
            .await
            .unwrap();
        assert_eq!(location["location"]["id"], "id-3");
        let inspected = session
            .execute("campaign.inspect", json!({}))
            .await
            .unwrap();
        assert_eq!(inspected["campaign"]["updatedAt"], "2026-01-02T03:04:05Z");
        assert_eq!(inspected["revision"], 3);
    }

    #[tokio::test]
    async fn no_campaign_queries_and_stale_writes_are_structured() {
        let mut session = session();
        let history = session.execute("history.status", json!({})).await.unwrap();
        assert_eq!(history["history"]["canUndo"], false);
        let missing = session.execute("npc.list", json!({})).await.unwrap_err();
        assert_eq!(missing.code, "no_campaign");
        session
            .execute(
                "campaign.new",
                json!({"name":"Campaign","expectedRevision":0}),
            )
            .await
            .unwrap();
        let stale = session
            .execute("npc.create", json!({"name":"Scout","expectedRevision":0}))
            .await
            .unwrap_err();
        assert_eq!(stale.code, "conflict");
        assert_eq!(stale.expected_revision, Some(0));
        assert_eq!(stale.actual_revision, Some(1));
    }

    #[tokio::test]
    async fn sessions_persist_details_beats_notes_links_and_history() {
        let mut session = session();
        session
            .execute(
                "campaign.new",
                json!({"name":"Session test","expectedRevision":0}),
            )
            .await
            .unwrap();
        session
            .execute("npc.create", json!({"name":"Niya","expectedRevision":1}))
            .await
            .unwrap();
        session
            .execute(
                "location.create",
                json!({"name":"Eastern Seawall","expectedRevision":2}),
            )
            .await
            .unwrap();
        let created = session
            .execute(
                "session.create",
                json!({"title":" The Low Tide ","number":8,"date":" 2026-11-14 ",
                    "previous":false,"expectedRevision":3}),
            )
            .await
            .unwrap();
        let id = created["session"]["id"].as_str().unwrap().to_owned();
        assert_eq!(created["session"]["title"], "The Low Tide");
        assert_eq!(created["session"]["number"], 8);
        let automatically_numbered = session
            .execute(
                "session.create",
                json!({"title":"A Quiet Bargain","expectedRevision":4,
                    "prep":[{"type":"p","children":[{"text":"Breakfast."}]}],
                    "beats":[{"id":"bargain-1","title":"Talk","notes":[{"type":"p","children":[{"text":"Listen."}]}],"status":"planned"}]}),
            )
            .await
            .unwrap();
        assert_eq!(automatically_numbered["session"]["number"], 9);
        assert_eq!(automatically_numbered["session"]["prep"][0]["type"], "p");
        assert_eq!(
            automatically_numbered["session"]["beats"][0]["status"],
            "planned"
        );
        let mut draft = created["session"].clone();
        draft["prep"] = json!([{"type":"p","children":[{"text":"Meet Niya."}]}]);
        draft["happened"] =
            json!([{"type":"p","children":[{"text":"The party chose the tunnel."}]}]);
        draft["summary"] = json!([{"type":"p","children":[{"text":"A lantern waits below."}]},
            {"type":"custom-block","children":[{"text":"Keep unknown nodes"}]}]);
        draft["beats"] = json!([
            {"id":"beat-1","title":"Meet Niya","notes":[{"type":"p","children":[{"text":"Tide chart."}]}],"status":"planned"},
            {"id":"beat-2","title":"Follow the lantern","notes":[{"type":"p","children":[{"text":"One route."}]}],"status":"happened"}
        ]);
        draft["links"] = json!([
            {"kind":"npc","targetId":"missing-npc","label":"Witness"},
            {"kind":"location","targetId":"missing-place","label":"Last seen"}
        ]);
        let updated = session
            .execute(
                "session.update",
                json!({"session":draft,"expectedRevision":5}),
            )
            .await
            .unwrap();
        assert_eq!(updated["session"]["beats"][1]["status"], "happened");
        assert_eq!(updated["session"]["summary"][1]["type"], "custom-block");
        assert_eq!(updated["revision"], 6);
        let listed = session.execute("session.list", json!({})).await.unwrap();
        assert_eq!(listed["sessions"].as_array().unwrap().len(), 2);
        let fetched = session
            .execute("session.get", json!({"sessionId":id}))
            .await
            .unwrap();
        assert_eq!(fetched["session"], updated["session"]);

        let before_invalid = session
            .execute("campaign.inspect", json!({}))
            .await
            .unwrap();
        let history_before_invalid = session.execute("history.status", json!({})).await.unwrap();
        let mut invalid = updated["session"].clone();
        invalid["beats"][0]["status"] = json!("unknown");
        let rejected = session
            .execute(
                "session.update",
                json!({"session":invalid,"expectedRevision":6}),
            )
            .await
            .unwrap_err();
        assert_eq!(rejected.code, "validation");
        assert_eq!(
            session
                .execute("campaign.inspect", json!({}))
                .await
                .unwrap(),
            before_invalid
        );
        assert_eq!(
            session.execute("history.status", json!({})).await.unwrap()["history"]["length"],
            history_before_invalid["history"]["length"]
        );

        let history_before_no_op = session.execute("history.status", json!({})).await.unwrap();
        let no_op = session
            .execute(
                "session.update",
                json!({"session":updated["session"],"expectedRevision":6}),
            )
            .await
            .unwrap();
        assert_eq!(no_op["revision"], 6);
        assert_eq!(
            session.execute("history.status", json!({})).await.unwrap()["history"]["length"],
            history_before_no_op["history"]["length"]
        );

        let undone = session
            .execute("history.undo", json!({"expectedRevision":6}))
            .await
            .unwrap();
        assert_eq!(undone["revision"], 7);
        assert_eq!(
            session
                .execute("session.get", json!({"sessionId":id}))
                .await
                .unwrap()["session"]["beats"],
            json!([])
        );
        let redone = session
            .execute("history.redo", json!({"expectedRevision":7}))
            .await
            .unwrap();
        assert_eq!(redone["revision"], 8);
        assert_eq!(
            session
                .execute("session.get", json!({"sessionId":id}))
                .await
                .unwrap()["session"]["beats"]
                .as_array()
                .unwrap()
                .len(),
            2
        );
        let undone_update = session
            .execute("history.undo", json!({"expectedRevision":8}))
            .await
            .unwrap();
        assert_eq!(undone_update["revision"], 9);
        assert_eq!(
            session
                .execute("session.get", json!({"sessionId":id}))
                .await
                .unwrap()["session"]["beats"],
            json!([])
        );
        let removed = session
            .execute("history.undo", json!({"expectedRevision":9}))
            .await
            .unwrap();
        assert_eq!(removed["revision"], 10);
        assert_eq!(
            session.execute("session.list", json!({})).await.unwrap()["sessions"]
                .as_array()
                .unwrap()
                .len(),
            1
        );
        let restored = session
            .execute("history.redo", json!({"expectedRevision":10}))
            .await
            .unwrap();
        assert_eq!(restored["revision"], 11);
        assert_eq!(
            session
                .execute("session.get", json!({"sessionId":id}))
                .await
                .unwrap()["session"]["beats"],
            json!([])
        );
        let restored_update = session
            .execute("history.redo", json!({"expectedRevision":11}))
            .await
            .unwrap();
        assert_eq!(restored_update["revision"], 12);
        assert_eq!(
            session
                .execute("session.get", json!({"sessionId":id}))
                .await
                .unwrap()["session"]["beats"]
                .as_array()
                .unwrap()
                .len(),
            2
        );
    }

    #[tokio::test]
    async fn session_references_and_backlinks_follow_live_state_and_history() {
        let mut state = session();
        for (method, params) in [
            ("session.references", json!({"sessionId":"missing"})),
            (
                "session.backlinks",
                json!({"kind":"npc","targetId":"missing"}),
            ),
        ] {
            let error = state.execute(method, params).await.unwrap_err();
            assert_eq!(error.code, "no_campaign");
        }

        state
            .execute(
                "campaign.new",
                json!({"name":"Reference test","expectedRevision":0}),
            )
            .await
            .unwrap();
        let npc = state
            .execute(
                "npc.create",
                json!({"name":"Niya Jade","expectedRevision":1}),
            )
            .await
            .unwrap();
        let npc_id = npc["npc"]["id"].as_str().unwrap().to_owned();
        // Duplicate display name on another kind proves resolution is by ID.
        let location = state
            .execute(
                "location.create",
                json!({"name":"Niya Jade","expectedRevision":2}),
            )
            .await
            .unwrap();
        let location_id = location["location"]["id"].as_str().unwrap().to_owned();
        let faction = state
            .execute(
                "faction.create",
                json!({"name":"Dockworkers' Guild","expectedRevision":3}),
            )
            .await
            .unwrap();
        let faction_id = faction["faction"]["id"].as_str().unwrap().to_owned();
        let item = state
            .execute(
                "item.create",
                json!({"name":"Tide Chart","expectedRevision":4}),
            )
            .await
            .unwrap();
        let item_id = item["item"]["id"].as_str().unwrap().to_owned();
        let thread = state
            .execute(
                "thread.create",
                json!({"title":"The Missing Morrow","expectedRevision":5}),
            )
            .await
            .unwrap();
        let thread_id = thread["thread"]["id"].as_str().unwrap().to_owned();
        let unused = state
            .execute("npc.create", json!({"name":"Unused","expectedRevision":6}))
            .await
            .unwrap();
        let unused_id = unused["npc"]["id"].as_str().unwrap().to_owned();

        let first = state
            .execute(
                "session.create",
                json!({
                    "title":"The Low Tide","number":8,"date":"2026-11-14","previous":false,
                    "links":[
                        {"kind":"npc","targetId":npc_id,"label":"Witness"},
                        {"kind":"location","targetId":location_id,"label":"Last seen"},
                        {"kind":"item","targetId":item_id,"label":"Clue"},
                        {"kind":"thread","targetId":"never-existed","label":"Lost thread"}
                    ],
                    "expectedRevision":7
                }),
            )
            .await
            .unwrap();
        let first_id = first["session"]["id"].as_str().unwrap().to_owned();
        let second = state
            .execute(
                "session.create",
                json!({
                    "title":"A Quiet Bargain","number":3,"previous":true,
                    "links":[
                        {"kind":"npc","targetId":npc_id,"label":"Ally"},
                        {"kind":"faction","targetId":faction_id,"label":"Employer"},
                        {"kind":"thread","targetId":thread_id,"label":"Origin"}
                    ],
                    "expectedRevision":8
                }),
            )
            .await
            .unwrap();
        let second_id = second["session"]["id"].as_str().unwrap().to_owned();
        let third = state
            .execute(
                "session.create",
                json!({
                    "title":"Bells at Dusk","number":5,
                    "links":[{"kind":"location","targetId":location_id,"label":"Visited"}],
                    "expectedRevision":9
                }),
            )
            .await
            .unwrap();
        let third_id = third["session"]["id"].as_str().unwrap().to_owned();

        let before_query = state.execute("campaign.inspect", json!({})).await.unwrap();
        let history_before_query = state.execute("history.status", json!({})).await.unwrap();
        assert_eq!(before_query["dirty"], true);
        let references = state
            .execute("session.references", json!({"sessionId":first_id}))
            .await
            .unwrap();
        assert_eq!(references["revision"], 10);
        assert_eq!(
            references["references"],
            json!([
                {"kind":"npc","targetId":npc_id,"label":"Witness","available":true,"name":"Niya Jade"},
                {"kind":"location","targetId":location_id,"label":"Last seen","available":true,"name":"Niya Jade"},
                {"kind":"item","targetId":item_id,"label":"Clue","available":true,"name":"Tide Chart"},
                {"kind":"thread","targetId":"never-existed","label":"Lost thread","available":false,"name":null}
            ])
        );
        let backlinks = state
            .execute("session.backlinks", json!({"kind":"npc","targetId":npc_id}))
            .await
            .unwrap();
        assert_eq!(
            backlinks["sessions"],
            json!([
                {"id":first_id,"title":"The Low Tide","number":8,"date":"2026-11-14","previous":false,"label":"Witness"},
                {"id":second_id,"title":"A Quiet Bargain","number":3,"date":"","previous":true,"label":"Ally"}
            ])
        );
        assert_eq!(
            state
                .execute(
                    "session.backlinks",
                    json!({"kind":"location","targetId":location_id}),
                )
                .await
                .unwrap()["sessions"],
            json!([
                {"id":first_id,"title":"The Low Tide","number":8,"date":"2026-11-14","previous":false,"label":"Last seen"},
                {"id":third_id,"title":"Bells at Dusk","number":5,"date":"","previous":false,"label":"Visited"}
            ])
        );
        assert_eq!(
            state
                .execute(
                    "session.backlinks",
                    json!({"kind":"npc","targetId":unused_id}),
                )
                .await
                .unwrap()["sessions"],
            json!([])
        );
        assert_eq!(
            state
                .execute(
                    "session.backlinks",
                    json!({"kind":"item","targetId":"never-existed"}),
                )
                .await
                .unwrap()["sessions"],
            json!([])
        );
        for params in [
            json!({"kind":"puzzle","targetId":npc_id}),
            json!({"kind":"npc","targetId":"   "}),
        ] {
            let error = state
                .execute("session.backlinks", params)
                .await
                .unwrap_err();
            assert_eq!(error.code, "validation");
        }
        let missing_session = state
            .execute("session.references", json!({"sessionId":"missing"}))
            .await
            .unwrap_err();
        assert_eq!(missing_session.code, "not_found");
        assert_eq!(
            state.execute("campaign.inspect", json!({})).await.unwrap(),
            before_query
        );
        assert_eq!(
            state.execute("history.status", json!({})).await.unwrap(),
            history_before_query
        );

        // Rename through the public action; labels and order stay authored.
        state
            .execute(
                "npc.update",
                json!({"npcId":npc_id,"name":"Niya Jade Renamed","expectedRevision":10}),
            )
            .await
            .unwrap();
        let renamed = state
            .execute("session.references", json!({"sessionId":first_id}))
            .await
            .unwrap();
        assert_eq!(renamed["references"][0]["name"], "Niya Jade Renamed");
        assert_eq!(renamed["references"][0]["label"], "Witness");
        assert_eq!(renamed["references"][1]["name"], "Niya Jade");
        let undo = state
            .execute("history.undo", json!({"expectedRevision":11}))
            .await
            .unwrap();
        assert_eq!(undo["revision"], 12);
        assert_eq!(
            state
                .execute("session.references", json!({"sessionId":first_id}))
                .await
                .unwrap()["references"][0]["name"],
            "Niya Jade"
        );
        let redo = state
            .execute("history.redo", json!({"expectedRevision":12}))
            .await
            .unwrap();
        assert_eq!(redo["revision"], 13);
        assert_eq!(
            state
                .execute("session.references", json!({"sessionId":first_id}))
                .await
                .unwrap()["references"][0]["name"],
            "Niya Jade Renamed"
        );

        // Editing session-owned links updates backlinks immediately.
        let mut second_record = state
            .execute("session.get", json!({"sessionId":second_id}))
            .await
            .unwrap()["session"]
            .clone();
        second_record["links"] = json!([
            {"kind":"faction","targetId":faction_id,"label":"Employer"},
            {"kind":"thread","targetId":thread_id,"label":"Origin"}
        ]);
        state
            .execute(
                "session.update",
                json!({"session":second_record,"expectedRevision":13}),
            )
            .await
            .unwrap();
        assert_eq!(
            state
                .execute("session.backlinks", json!({"kind":"npc","targetId":npc_id}),)
                .await
                .unwrap()["sessions"]
                .as_array()
                .unwrap()
                .len(),
            1
        );
        state
            .execute("history.undo", json!({"expectedRevision":14}))
            .await
            .unwrap();
        assert_eq!(
            state
                .execute("session.backlinks", json!({"kind":"npc","targetId":npc_id}),)
                .await
                .unwrap()["sessions"]
                .as_array()
                .unwrap()
                .len(),
            2
        );
        state
            .execute("history.redo", json!({"expectedRevision":15}))
            .await
            .unwrap();
        assert_eq!(
            state
                .execute("session.backlinks", json!({"kind":"npc","targetId":npc_id}),)
                .await
                .unwrap()["sessions"]
                .as_array()
                .unwrap()
                .len(),
            1
        );

        // Deleting a target makes it unavailable but preserves the reference.
        state
            .execute(
                "item.delete",
                json!({"itemId":item_id,"expectedRevision":16}),
            )
            .await
            .unwrap();
        let deleted_references = state
            .execute("session.references", json!({"sessionId":first_id}))
            .await
            .unwrap();
        assert_eq!(deleted_references["references"][2]["available"], false);
        assert_eq!(deleted_references["references"][2]["name"], Value::Null);
        assert_eq!(deleted_references["references"][2]["label"], "Clue");
        assert_eq!(
            state
                .execute(
                    "session.backlinks",
                    json!({"kind":"item","targetId":item_id}),
                )
                .await
                .unwrap()["sessions"][0]["id"],
            first_id
        );
        state
            .execute("history.undo", json!({"expectedRevision":17}))
            .await
            .unwrap();
        assert_eq!(
            state
                .execute("session.references", json!({"sessionId":first_id}))
                .await
                .unwrap()["references"][2]["name"],
            "Tide Chart"
        );
    }

    #[tokio::test]
    async fn session_reference_lookup_isolates_equal_ids_across_kinds() {
        let mut state = session();
        state.campaign = Some(
            serde_json::from_value(json!({
                "format": "ttrpg-campaign", "schemaVersion": 1,
                "id": "campaign-shared", "name": "Shared IDs",
                "createdAt": "2026-01-01", "updatedAt": "2026-01-01",
                "section": null, "sidebar": {"width": 256, "open": true},
                "workspace": null,
                "npcs": [{"id": "shared", "name": "Shared NPC",
                    "notes": [{"type": "p", "children": [{"text": ""}]}]}],
                "locations": [{"id": "shared", "name": "Shared Location",
                    "image": null, "publicDescription": "", "gmNotes": ""}],
                "sessions": [{"id": "session-1", "title": "One", "number": 1,
                    "links": [
                        {"kind": "npc", "targetId": "shared", "label": "NPC role"},
                        {"kind": "location", "targetId": " shared ", "label": "Place role"}
                    ]}]
            }))
            .unwrap(),
        );
        state.revision = 1;
        let references = state
            .execute("session.references", json!({"sessionId":"session-1"}))
            .await
            .unwrap();
        assert_eq!(
            references["references"],
            json!([
                {"kind":"npc","targetId":"shared","label":"NPC role","available":true,"name":"Shared NPC"},
                {"kind":"location","targetId":" shared ","label":"Place role","available":true,"name":"Shared Location"}
            ])
        );
        assert_eq!(
            state
                .execute(
                    "session.backlinks",
                    json!({"kind":"npc","targetId":"shared"}),
                )
                .await
                .unwrap()["sessions"][0]["label"],
            "NPC role"
        );
        assert_eq!(
            state
                .execute(
                    "session.backlinks",
                    json!({"kind":"location","targetId":"shared"}),
                )
                .await
                .unwrap()["sessions"][0]["label"],
            "Place role"
        );
        assert_eq!(
            state
                .execute(
                    "session.backlinks",
                    json!({"kind":"location","targetId":" shared "}),
                )
                .await
                .unwrap()["sessions"][0]["label"],
            "Place role"
        );
        assert_eq!(
            state
                .execute("session.get", json!({"sessionId":"session-1"}))
                .await
                .unwrap()["session"]["links"][1]["targetId"],
            " shared ",
            "queries must not rewrite stored target IDs"
        );
    }

    #[tokio::test]
    async fn map_geometry_queries_follow_configuration_history_and_read_only_state() {
        let mut state = session();
        for (method, params) in [
            (
                "map.snap",
                json!({"mapId":"missing","point":{"x":0.5,"y":0.5}}),
            ),
            (
                "map.measure",
                json!({"mapId":"missing","points":[{"x":0.1,"y":0.5},{"x":0.2,"y":0.5}]}),
            ),
            (
                "map.calibrate",
                json!({"mapId":"missing","pointA":{"x":0.1,"y":0.5},"pointB":{"x":0.2,"y":0.5},"knownDistance":10,"units":"feet","expectedRevision":0}),
            ),
            (
                "map.configure",
                json!({"mapId":"missing","snap":true,"expectedRevision":0}),
            ),
        ] {
            let error = state.execute(method, params).await.unwrap_err();
            assert_eq!(error.code, "no_campaign");
        }

        let mut revision = state
            .execute(
                "campaign.new",
                json!({"name":"Map geometry test","expectedRevision":0}),
            )
            .await
            .unwrap()["revision"]
            .as_u64()
            .unwrap();
        let location = state
            .execute(
                "location.create",
                json!({"name":"Dock","expectedRevision":revision}),
            )
            .await
            .unwrap();
        revision = location["revision"].as_u64().unwrap();
        let location_id = location["location"]["id"].as_str().unwrap().to_owned();
        let map = state
            .execute(
                "map.create",
                json!({
                    "name":"Harbor battle map", "kind":"Battle",
                    "image":{"type":"img","url":"data:image/png;base64,bWFw"},
                    "width":1000, "height":500,
                    "pins":[{"id":"pin-1","x":0.56,"y":0.65,"locationId":location_id,"label":"Dock","destinationMapId":null}],
                    "party":{"x":0.2,"y":0.8},
                    "expectedRevision":revision
                }),
            )
            .await
            .unwrap();
        revision = map["revision"].as_u64().unwrap();
        let map_id = map["map"]["id"].as_str().unwrap().to_owned();
        let image_before = map["map"]["image"].clone();
        assert_eq!(map["map"]["calibration"], Value::Null);
        assert_eq!(map["map"]["grid"]["mode"], "none");
        assert_eq!(map["map"]["snap"], false);

        let uncalibrated = state
            .execute(
                "map.measure",
                json!({"mapId":map_id,"points":[{"x":0.1,"y":0.5},{"x":0.35,"y":0.5}]}),
            )
            .await
            .unwrap();
        assert_eq!(uncalibrated["units"], "imagePixels");
        assert_eq!(uncalibrated["total"], 250.0);

        let stale = state
            .execute(
                "map.calibrate",
                json!({"mapId":map_id,"pointA":{"x":0.1,"y":0.5},"pointB":{"x":0.2,"y":0.5},"knownDistance":10,"units":"feet","expectedRevision":revision - 1}),
            )
            .await
            .unwrap_err();
        assert_eq!(stale.code, "conflict");
        let calibrated = state
            .execute(
                "map.calibrate",
                json!({"mapId":map_id,"pointA":{"x":0.1,"y":0.5},"pointB":{"x":0.2,"y":0.5},"knownDistance":10,"units":"feet","expectedRevision":revision}),
            )
            .await
            .unwrap();
        revision = calibrated["revision"].as_u64().unwrap();
        assert_eq!(calibrated["map"]["calibration"]["units"], "feet");
        assert_eq!(calibrated["map"]["calibration"]["pixelsPerUnit"], 10.0);
        let equivalent_calibration = state
            .execute(
                "map.calibrate",
                json!({"mapId":map_id,"pointA":{"x":0.1,"y":0.5},"pointB":{"x":0.3,"y":0.5},"knownDistance":20,"units":"feet","expectedRevision":revision}),
            )
            .await
            .unwrap();
        assert_eq!(equivalent_calibration["revision"], revision);
        let measured = state
            .execute(
                "map.measure",
                json!({"mapId":map_id,"points":[{"x":0.1,"y":0.5},{"x":0.35,"y":0.5}]}),
            )
            .await
            .unwrap();
        assert_eq!(measured["total"], 25.0);
        assert_eq!(measured["units"], "feet");

        let configured = state
            .execute(
                "map.configure",
                json!({"mapId":map_id,"grid":{"mode":"square","visible":true,"size":100.0,"offsetX":150.0,"offsetY":100.0,"orientation":"pointy"},"snap":true,"expectedRevision":revision}),
            )
            .await
            .unwrap();
        revision = configured["revision"].as_u64().unwrap();
        let stored = state
            .execute("map.get", json!({"mapId":map_id}))
            .await
            .unwrap();
        assert_eq!(stored["map"]["pins"][0]["x"], 0.56);
        assert_eq!(stored["map"]["party"], json!({"x":0.2,"y":0.8}));
        assert_eq!(stored["map"]["grid"]["visible"], true);
        assert_eq!(stored["map"]["snap"], true);

        // Older map-update payloads that omit the new settings preserve them.
        let legacy_update = state
            .execute(
                "map.update",
                json!({
                    "map":{"id":map_id,"name":"Harbor battle map renamed","kind":"Battle",
                        "image":{"type":"img","url":"data:image/png;base64,bWFw"},
                        "width":1000,"height":500,"locationIds":[],"pins":[],"party":null},
                    "expectedRevision":revision
                }),
            )
            .await
            .unwrap();
        revision = legacy_update["revision"].as_u64().unwrap();
        assert_eq!(legacy_update["map"]["name"], "Harbor battle map renamed");
        assert_eq!(legacy_update["map"]["calibration"]["units"], "feet");
        assert_eq!(legacy_update["map"]["grid"]["mode"], "square");
        assert_eq!(legacy_update["map"]["snap"], true);

        let snapped = state
            .execute(
                "map.snap",
                json!({"mapId":map_id,"point":{"x":0.24,"y":0.21}}),
            )
            .await
            .unwrap();
        assert_eq!(snapped["requested"], json!({"x":0.24,"y":0.21}));
        assert_eq!(snapped["effective"], json!({"x":0.25,"y":0.2}));
        assert_eq!(snapped["cell"], json!({"col":1,"row":0}));
        assert_eq!(snapped["snapped"], true);
        let tie = state
            .execute(
                "map.snap",
                json!({"mapId":map_id,"point":{"x":0.2,"y":0.2}}),
            )
            .await
            .unwrap();
        assert_eq!(tie["cell"], json!({"col":1,"row":0}));
        let unsnapped = state
            .execute(
                "map.snap",
                json!({"mapId":map_id,"point":{"x":0.24,"y":0.21},"snap":false}),
            )
            .await
            .unwrap();
        assert_eq!(unsnapped["effective"], json!({"x":0.24,"y":0.21}));
        assert_eq!(unsnapped["snapped"], false);

        let equal = state
            .execute(
                "map.measure",
                json!({"mapId":map_id,"metric":"square-equal-diagonals","points":[{"x":0.15,"y":0.2},{"x":0.45,"y":1.0}]}),
            )
            .await
            .unwrap();
        assert_eq!(equal["total"], 4.0);
        assert_eq!(equal["units"], "cells");
        let alternating = state
            .execute(
                "map.measure",
                json!({"mapId":map_id,"metric":"square-alternating-diagonals","points":[{"x":0.15,"y":0.2},{"x":0.45,"y":1.0}]}),
            )
            .await
            .unwrap();
        assert_eq!(alternating["total"], 5.0);
        let off_centre = state
            .execute(
                "map.measure",
                json!({"mapId":map_id,"metric":"square-equal-diagonals","points":[{"x":0.16,"y":0.21},{"x":0.45,"y":1.0}],"snap":false}),
            )
            .await
            .unwrap_err();
        assert_eq!(off_centre.code, "validation");

        let converted = state
            .execute(
                "map.configure",
                json!({"mapId":map_id,"units":"metres","expectedRevision":revision}),
            )
            .await
            .unwrap();
        revision = converted["revision"].as_u64().unwrap();
        assert!(
            (converted["map"]["calibration"]["pixelsPerUnit"]
                .as_f64()
                .unwrap()
                - 32.808_398_950_131_24)
                .abs()
                < 1e-9
        );
        assert_eq!(converted["map"]["grid"]["mode"], "square");
        assert_eq!(converted["map"]["grid"]["offsetX"], 150.0);
        assert_eq!(converted["map"]["grid"]["offsetY"], 100.0);
        assert_eq!(converted["map"]["image"], image_before);
        let metric = state
            .execute(
                "map.measure",
                json!({"mapId":map_id,"points":[{"x":0.1,"y":0.5},{"x":0.35,"y":0.5}],"snap":false}),
            )
            .await
            .unwrap();
        assert!((metric["total"].as_f64().unwrap() - 7.62).abs() < 1e-9);
        assert_eq!(metric["units"], "metres");

        let before_queries = state.execute("campaign.inspect", json!({})).await.unwrap();
        let history_before = state.execute("history.status", json!({})).await.unwrap();
        state
            .execute(
                "map.snap",
                json!({"mapId":map_id,"point":{"x":0.24,"y":0.21}}),
            )
            .await
            .unwrap();
        state
            .execute(
                "map.measure",
                json!({"mapId":map_id,"metric":"hex-steps","points":[{"x":0.1,"y":0.1},{"x":0.2,"y":0.2}]}),
            )
            .await
            .unwrap_err();
        assert_eq!(
            state.execute("campaign.inspect", json!({})).await.unwrap(),
            before_queries
        );
        assert_eq!(
            state.execute("history.status", json!({})).await.unwrap(),
            history_before
        );

        let undo_units = state
            .execute("history.undo", json!({"expectedRevision":revision}))
            .await
            .unwrap();
        revision = undo_units["revision"].as_u64().unwrap();
        assert_eq!(undo_units["label"], "Change map units");
        assert_eq!(
            state
                .execute("map.get", json!({"mapId":map_id}))
                .await
                .unwrap()["map"]["calibration"]["units"],
            "feet"
        );
        let redo_units = state
            .execute("history.redo", json!({"expectedRevision":revision}))
            .await
            .unwrap();
        revision = redo_units["revision"].as_u64().unwrap();
        assert_eq!(
            state
                .execute("map.get", json!({"mapId":map_id}))
                .await
                .unwrap()["map"]["calibration"]["units"],
            "metres"
        );

        let state_before_invalid = state.execute("campaign.inspect", json!({})).await.unwrap();
        let history_before_invalid = state.execute("history.status", json!({})).await.unwrap();
        let stale_config = state
            .execute(
                "map.configure",
                json!({"mapId":map_id,"snap":false,"expectedRevision":revision - 1}),
            )
            .await
            .unwrap_err();
        assert_eq!(stale_config.code, "conflict");
        for (method, params) in [
            (
                "map.calibrate",
                json!({"mapId":map_id,"pointA":{"x":0.1,"y":0.5},"pointB":{"x":0.1,"y":0.5},"knownDistance":10,"units":"feet","expectedRevision":revision}),
            ),
            (
                "map.calibrate",
                json!({"mapId":map_id,"pointA":{"x":0.1,"y":0.5},"pointB":{"x":0.2,"y":0.5},"knownDistance":0,"units":"feet","expectedRevision":revision}),
            ),
            (
                "map.configure",
                json!({"mapId":map_id,"grid":{"mode":"triangle","visible":true,"size":100.0,"offsetX":0.0,"offsetY":0.0,"orientation":"pointy"},"expectedRevision":revision}),
            ),
            (
                "map.configure",
                json!({"mapId":map_id,"units":"yards","expectedRevision":revision}),
            ),
            (
                "map.measure",
                json!({"mapId":map_id,"points":[{"x":-0.1,"y":0.5},{"x":0.2,"y":0.5}]}),
            ),
            (
                "map.measure",
                json!({"mapId":map_id,"metric":"hex-steps","points":[{"x":0.15,"y":0.2},{"x":0.45,"y":1.0}]}),
            ),
            (
                "map.snap",
                json!({"mapId":"missing","point":{"x":0.5,"y":0.5}}),
            ),
            (
                "map.measure",
                json!({"mapId":"missing","points":[{"x":0.1,"y":0.5},{"x":0.2,"y":0.5}]}),
            ),
        ] {
            state.execute(method, params).await.unwrap_err();
        }
        assert_eq!(
            state.execute("campaign.inspect", json!({})).await.unwrap(),
            state_before_invalid
        );
        assert_eq!(
            state.execute("history.status", json!({})).await.unwrap(),
            history_before_invalid
        );
        assert_eq!(revision, state.inspect()["revision"]);
    }

    #[tokio::test]
    async fn failed_open_preserves_active_campaign_and_history() {
        let temp = tempfile::tempdir().unwrap();
        let path = temp.path().join("missing.campaign");
        let mut session = session();
        session
            .execute(
                "campaign.new",
                json!({"name":"Keep me","expectedRevision":0}),
            )
            .await
            .unwrap();
        session
            .execute("npc.create", json!({"name":"Scout","expectedRevision":1}))
            .await
            .unwrap();
        let before = session
            .execute("campaign.inspect", json!({}))
            .await
            .unwrap();
        let error = session
            .execute(
                "campaign.open",
                json!({"path":path,"expectedRevision":2,"discardChanges":true}),
            )
            .await
            .unwrap_err();
        assert_eq!(error.code, "storage");
        assert_eq!(
            session
                .execute("campaign.inspect", json!({}))
                .await
                .unwrap(),
            before
        );
    }
}

#[cfg(test)]
mod discovery_tests {
    use super::*;
    use std::collections::HashSet;

    #[test]
    fn discovery_lists_every_schema_backed_method_once() {
        let description = Session::discover();
        let methods = description["methods"].as_object().unwrap();
        let mut listed = HashSet::new();
        for group in ["queries", "mutations"] {
            for method in description[group].as_array().unwrap() {
                let method = method.as_str().unwrap();
                assert!(
                    listed.insert(method.to_owned()),
                    "{method} is listed more than once"
                );
            }
        }
        let schema_methods: HashSet<_> = methods.keys().cloned().collect();
        assert_eq!(listed, schema_methods);
        assert!(methods.len() >= 49);
    }
}

use serde::{Deserialize, Serialize};
use serde_json::Value;
use std::collections::HashMap;

mod assets;
pub mod history;
#[cfg(feature = "legacy-sqlite")]
mod migrations;
#[cfg(feature = "legacy-sqlite")]
mod repository;
pub mod service;
mod session;
mod storage;
mod validation;

use assets::transform_images;
#[cfg(feature = "legacy-sqlite")]
use assets::{transform_faction_image, transform_location_image, transform_presentation_images};
pub use history::CampaignHistory;
#[cfg(feature = "legacy-sqlite")]
use migrations::ensure_schema;
#[cfg(all(test, feature = "legacy-sqlite"))]
use repository::table_exists;
#[cfg(feature = "legacy-sqlite")]
pub use repository::CampaignRepository;
#[cfg(all(test, feature = "legacy-sqlite"))]
use repository::{read_campaign, write_campaign};
pub use session::{CoreError, Session};

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct Campaign {
    format: String,
    schema_version: u32,
    id: String,
    name: String,
    created_at: String,
    updated_at: String,
    #[serde(default)]
    statblock_field_set: StatblockFieldSet,
    npcs: Vec<Npc>,
    #[serde(default)]
    locations: Vec<Location>,
    #[serde(default)]
    maps: Vec<CampaignMap>,
    #[serde(default)]
    factions: Vec<Faction>,
    #[serde(default)]
    inventory: PartyInventory,
    workspace: Option<Workspace>,
    section: Option<String>,
    sidebar: Sidebar,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct Npc {
    id: String,
    name: String,
    notes: Vec<Value>,
    #[serde(default)]
    presentation: NpcPresentation,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct StatblockFieldSet {
    id: String,
    version: u32,
}

impl Default for StatblockFieldSet {
    fn default() -> Self {
        Self {
            id: "dnd-5.5e".into(),
            version: 1,
        }
    }
}

#[derive(Debug, Clone, Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct NpcPresentation {
    #[serde(default)]
    relationships: Vec<NpcRelationship>,
    #[serde(default)]
    locations: Vec<NpcRelationship>,
    #[serde(default)]
    factions: Vec<NpcRelationship>,
    banner: Option<NpcImage>,
    portrait: Option<NpcImage>,
    player_description: String,
    #[serde(alias = "reference")]
    gm_reference: NpcGmReference,
    statblock: NpcStatblock,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct NpcRelationship {
    target_id: String,
    label: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
struct NpcImage {
    #[serde(rename = "type")]
    kind: String,
    url: String,
}

#[derive(Debug, Clone, Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct NpcGmReference {
    background: String,
    wants: String,
    ideals: String,
    bond: String,
    flaw: String,
    secrets: String,
    reaction: String,
    personality: String,
    mannerisms: String,
    notable_actions: String,
    voice: String,
    allies: String,
    enemies: String,
    other: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct NpcStatblock {
    field_set_id: String,
    field_set_version: u32,
    token_image: Option<NpcImage>,
    data: Value,
}

impl Default for NpcStatblock {
    fn default() -> Self {
        Self {
            field_set_id: "dnd-5.5e".into(),
            field_set_version: 1,
            token_image: None,
            data: Value::Object(Default::default()),
        }
    }
}

#[derive(Debug, Clone, Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct Location {
    #[serde(default)]
    associated_npcs: Vec<NpcRelationship>,
    #[serde(default)]
    associated_factions: Vec<NpcRelationship>,
    #[serde(default)]
    parent_id: Option<String>,
    #[serde(default)]
    location_type: String,
    #[serde(default)]
    tags: Vec<String>,
    #[serde(default = "unknown_party_knowledge")]
    party_knowledge: String,
    #[serde(default)]
    banner: Option<NpcImage>,
    #[serde(default)]
    gm_reference: LocationReference,
    id: String,
    name: String,
    image: Option<NpcImage>,
    public_description: String,
    gm_notes: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct CampaignMap {
    id: String,
    name: String,
    kind: String,
    image: NpcImage,
    width: u32,
    height: u32,
    location_ids: Vec<String>,
    pins: Vec<MapPin>,
    party: Option<MapPoint>,
}
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
struct MapPoint {
    x: f64,
    y: f64,
}
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct MapPin {
    id: String,
    x: f64,
    y: f64,
    location_id: String,
    label: String,
    destination_map_id: Option<String>,
}

fn unknown_party_knowledge() -> String {
    "unknown".into()
}

#[derive(Debug, Clone, Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct LocationReference {
    #[serde(default)]
    atmosphere: String,
    #[serde(default)]
    background: String,
    #[serde(default)]
    current_situation: String,
    #[serde(default)]
    secrets: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct Faction {
    id: String,
    name: String,
    image: Option<NpcImage>,
    description: String,
    gm_notes: String,
}

#[derive(Debug, Clone, Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct PartyInventory {
    gold: u64,
    entries: Vec<InventoryEntry>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct InventoryEntry {
    id: String,
    name: String,
    kind: String,
    quantity: u64,
    note: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
struct Sidebar {
    width: f64,
    open: bool,
}
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct Workspace {
    layout: Value,
    panels: HashMap<String, Value>,
    next_id: u32,
    sidebar_width: f64,
    collapsed: bool,
    history: NavigationHistory,
}
#[derive(Debug, Clone, Serialize, Deserialize)]
struct NavigationHistory {
    #[serde(deserialize_with = "deserialize_destinations")]
    entries: Vec<Destination>,
    index: i32,
}
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(
    tag = "kind",
    rename_all = "camelCase",
    rename_all_fields = "camelCase"
)]
enum Destination {
    Character {
        workspace_id: String,
        character_id: String,
        section: Option<String>,
    },
    Faction {
        workspace_id: String,
        faction_id: String,
        section: Option<String>,
    },
    Location {
        workspace_id: String,
        location_id: String,
        section: Option<String>,
    },
    Inventory {
        workspace_id: String,
        section: Option<String>,
    },
    Map {
        #[serde(default, skip_serializing_if = "Option::is_none")]
        map_id: Option<String>,
        workspace_id: String,
        section: Option<String>,
    },
    Workspace {
        workspace_id: String,
        section: Option<String>,
    },
    Settings,
    Section {
        section: Option<String>,
    },
}

// Existing campaign packages used untyped NPC destinations. Normalize on read so
// the next save writes the current format without changing database versions.
fn deserialize_destinations<'de, D>(deserializer: D) -> Result<Vec<Destination>, D::Error>
where
    D: serde::Deserializer<'de>,
{
    #[derive(Deserialize)]
    #[serde(untagged)]
    enum StoredDestination {
        Current(Destination),
        Legacy {
            #[serde(rename = "workspaceId")]
            workspace_id: String,
            name: String,
        },
    }
    Ok(Vec::<StoredDestination>::deserialize(deserializer)?
        .into_iter()
        .map(|entry| match entry {
            StoredDestination::Current(destination) => destination,
            StoredDestination::Legacy { workspace_id, name } => Destination::Character {
                workspace_id,
                character_id: name,
                section: None,
            },
        })
        .collect())
}

#[cfg(all(test, feature = "legacy-sqlite"))]
mod tests {
    use super::*;
    use rusqlite::Connection;
    use serde_json::json;
    use std::fs;

    fn example() -> Campaign {
        serde_json::from_value(json!({
            "format": "ttrpg-campaign", "schemaVersion": 1, "id": "campaign-1", "name": "The forest",
            "createdAt": "2026-10-01", "updatedAt": "2026-10-01", "section": "Characters",
            "sidebar": {"width": 256, "open": true},
            "workspace": {
                "layout": {"grid": {"root": {"type": "branch", "data": []}, "height": 600, "width": 800, "orientation": "HORIZONTAL"}, "panels": {}},
                "panels": {}, "nextId": 3, "sidebarWidth": 192, "collapsed": false, "history": {"entries": [], "index": -1}
            },
            "npcs": [{"id": "npc-1", "name": "Scout", "notes": [
                {"type": "p", "children": [{"text": "Keep this private", "bold": true}]},
                {"type": "img", "url": "data:image/png;base64,aW1hZ2U=", "width": 245,
                    "caption": [{"text": "Forest trail"}], "children": [{"text": ""}]}
            ]}]
        })).unwrap()
    }

    #[test]
    fn legacy_navigation_history_is_normalized_on_read() {
        let history: NavigationHistory = serde_json::from_value(json!({
            "entries": [{"workspaceId": "workspace:1", "name": "npc-1"}], "index": 0
        }))
        .unwrap();
        assert_eq!(
            serde_json::to_value(history).unwrap(),
            json!({
                "entries": [{"kind": "character", "workspaceId": "workspace:1", "characterId": "npc-1", "section": null}], "index": 0
            })
        );
    }

    #[test]
    fn map_tabs_and_typed_history_round_trip() {
        let folder = tempfile::tempdir().unwrap();
        let path = folder.path().join("map.campaign");
        let mut value = serde_json::to_value(example()).unwrap();
        value["workspace"]["layout"]["panels"] = json!({
            "workspace:1": {"id": "workspace:1", "contentComponent": "workspace"}
        });
        value["workspace"]["panels"] = json!({
            "workspace:1": {
                "grid": {"root": {"type": "branch", "data": []}, "height": 600, "width": 800, "orientation": "HORIZONTAL"},
                "panels": {"map:prototype": {"id": "map:prototype", "contentComponent": "map"}}
            }
        });
        value["workspace"]["history"] = json!({"entries": [
            {"kind": "character", "workspaceId": "workspace:1", "characterId": "npc-1", "section": "Characters"},
            {"kind": "map", "workspaceId": "workspace:1", "section": "Locations & Maps"},
            {"kind": "settings"},
            {"kind": "section", "section": null},
            {"kind": "workspace", "workspaceId": "workspace:1", "section": null}
        ], "index": 4});
        let expected = value.clone();
        write_campaign(&path, serde_json::from_value(value.clone()).unwrap()).unwrap();
        assert_eq!(
            serde_json::to_value(read_campaign(&path).unwrap()).unwrap(),
            expected
        );
        value["workspace"]["panels"]["workspace:1"]["panels"]["map:prototype"]
            ["contentComponent"] = json!("unknown");
        assert!(serde_json::from_value::<Campaign>(value)
            .unwrap()
            .validate()
            .is_err());
    }

    #[test]
    fn inventory_round_trip_legacy_upgrade_and_invalid_save() {
        let folder = tempfile::tempdir().unwrap();
        let path = folder.path().join("inventory.campaign");
        let mut value = serde_json::to_value(example()).unwrap();
        value["inventory"] = json!({"gold": 250, "entries": [
            {"id":"rope","name":"Rope","kind":"item","quantity":2,"note":"50 feet"},
            {"id":"ore","name":"Iron ore","kind":"material","quantity":8,"note":""}
        ]});
        value["workspace"]["history"] = json!({"entries":[
            {"kind":"inventory","workspaceId":"workspace:1","section":"Inventory"}
        ],"index":0});
        write_campaign(&path, serde_json::from_value(value.clone()).unwrap()).unwrap();
        assert_eq!(
            serde_json::to_value(read_campaign(&path).unwrap()).unwrap(),
            value
        );
        for patch in [
            json!({"quantity":0}),
            json!({"name":" "}),
            json!({"kind":"unknown"}),
        ] {
            let mut invalid = value.clone();
            for (key, replacement) in patch.as_object().unwrap() {
                invalid["inventory"]["entries"][0][key] = replacement.clone();
            }
            assert!(write_campaign(&path, serde_json::from_value(invalid).unwrap()).is_err());
            assert_eq!(
                serde_json::to_value(read_campaign(&path).unwrap()).unwrap(),
                value
            );
        }
        let db = Connection::open(path.join("campaign.sqlite")).unwrap();
        db.execute_batch("DROP TABLE party_inventory; PRAGMA user_version=3;")
            .unwrap();
        drop(db);
        let legacy = read_campaign(&path).unwrap();
        assert_eq!(legacy.inventory.gold, 0);
        assert!(legacy.inventory.entries.is_empty());
        write_campaign(&path, legacy).unwrap();
        let db = Connection::open(path.join("campaign.sqlite")).unwrap();
        assert_eq!(
            db.pragma_query_value(None, "user_version", |row| row.get::<_, i32>(0))
                .unwrap(),
            5
        );
    }

    #[test]
    fn campaign_and_image_round_trip_after_moving_folder() {
        let parent = tempfile::tempdir().unwrap();
        let old = parent.path().join("old.campaign");
        let expected = serde_json::to_value(example()).unwrap();
        write_campaign(&old, example()).unwrap();
        let db = Connection::open(old.join("campaign.sqlite")).unwrap();
        let stored_asset: String = db
            .query_row(
                "SELECT document_json FROM npc_notes WHERE npc_id='npc-1'",
                [],
                |row| row.get::<_, String>(0),
            )
            .unwrap();
        assert!(stored_asset.contains("assets/"));
        assert_eq!(fs::read_dir(old.join("assets")).unwrap().count(), 1);
        let moved = parent.path().join("moved.campaign");
        fs::rename(old, &moved).unwrap();
        let reopened = read_campaign(&moved).unwrap();
        assert_eq!(serde_json::to_value(&reopened).unwrap(), expected);
        write_campaign(&moved, reopened).unwrap();
        assert_eq!(fs::read_dir(moved.join("assets")).unwrap().count(), 1);
    }

    #[test]
    fn legacy_package_without_npc_presentation_storage_opens_with_defaults() {
        let folder = tempfile::tempdir().unwrap();
        let path = folder.path().join("legacy.campaign");
        write_campaign(&path, example()).unwrap();
        let connection = Connection::open(path.join("campaign.sqlite")).unwrap();
        connection
            .execute_batch("DROP TABLE npc_presentation; DROP TABLE campaign_settings;")
            .unwrap();
        let opened = read_campaign(&path).unwrap();
        let value = serde_json::to_value(opened).unwrap();
        assert_eq!(
            value["statblockFieldSet"],
            json!({"id":"dnd-5.5e","version":1})
        );
        assert_eq!(value["npcs"][0]["presentation"]["playerDescription"], "");
        assert_eq!(
            value["npcs"][0]["presentation"]["statblock"]["data"],
            json!({})
        );
    }

    #[test]
    fn npc_presentation_and_all_images_round_trip_through_assets() {
        let folder = tempfile::tempdir().unwrap();
        let path = folder.path().join("presentation.campaign");
        let mut value = serde_json::to_value(example()).unwrap();
        value["statblockFieldSet"] = json!({"id":"dnd-5.5e","version":1});
        value["npcs"][0]["presentation"] = json!({
            "banner":{"type":"img","url":"data:image/png;base64,YmFubmVy"},
            "portrait":{"type":"img","url":"data:image/jpeg;base64,cG9ydHJhaXQ="},
            "playerDescription":"A cautious scout.",
            "relationships":[],
            "locations":[],
            "factions":[],
            "gmReference":{
                "background":"A traveler.","wants":"Safety","ideals":"Truth","bond":"The village",
                "flaw":"Distrustful","secrets":"Knows the pass","reaction":"Withdraws",
                "personality":"Patient","mannerisms":"Studies tracks","notableActions":"Leaves markers",
                "voice":"Soft","allies":"Rangers","enemies":"Bandits","other":""
            },
            "statblock":{
                "fieldSetId":"dnd-5.5e","fieldSetVersion":1,
                "tokenImage":{"type":"img","url":"data:image/webp;base64,dG9rZW4="},
                "data":{"armorClass":15,"actions":[{"name":"Track","description":"Follow a trail."}]}
            }
        });
        let expected = value.clone();
        write_campaign(&path, serde_json::from_value(value).unwrap()).unwrap();
        let db = Connection::open(path.join("campaign.sqlite")).unwrap();
        let stored: String = db
            .query_row(
                "SELECT presentation_json FROM npc_presentation WHERE npc_id='npc-1'",
                [],
                |row| row.get(0),
            )
            .unwrap();
        assert!(stored.contains("assets/"));
        assert_eq!(fs::read_dir(path.join("assets")).unwrap().count(), 4);
        assert_eq!(
            serde_json::to_value(read_campaign(&path).unwrap()).unwrap(),
            expected
        );
    }

    #[test]
    fn relationships_round_trip_including_missing_targets() {
        let folder = tempfile::tempdir().unwrap();
        let path = folder.path().join("relationships.campaign");
        let mut campaign = example();
        campaign.npcs[0].presentation.relationships = vec![NpcRelationship {
            target_id: "deleted-npc".into(),
            label: "Close friend".into(),
        }];
        write_campaign(&path, campaign).unwrap();
        let loaded = read_campaign(&path).unwrap();
        assert_eq!(
            loaded.npcs[0].presentation.relationships[0].target_id,
            "deleted-npc"
        );
        assert_eq!(
            loaded.npcs[0].presentation.relationships[0].label,
            "Close friend"
        );
    }

    #[test]
    fn legacy_presentation_defaults_to_no_relationships() {
        let mut value = serde_json::to_value(NpcPresentation::default()).unwrap();
        value.as_object_mut().unwrap().remove("relationships");
        let loaded: NpcPresentation = serde_json::from_value(value).unwrap();
        assert!(loaded.relationships.is_empty());
    }

    #[test]
    fn invalid_relationship_targets_are_rejected() {
        let mut campaign = example();
        for target in ["", "npc-1"] {
            campaign.npcs[0].presentation.relationships = vec![NpcRelationship {
                target_id: target.into(),
                label: String::new(),
            }];
            assert!(campaign.validate().is_err());
        }
        campaign.npcs[0].presentation.relationships = vec![
            NpcRelationship {
                target_id: "npc-2".into(),
                label: "Friend".into(),
            },
            NpcRelationship {
                target_id: "npc-2".into(),
                label: "Ally".into(),
            },
        ];
        assert!(campaign.validate().is_err());
    }

    #[test]
    fn locations_images_links_and_navigation_round_trip() {
        let folder = tempfile::tempdir().unwrap();
        let path = folder.path().join("locations.campaign");
        let mut campaign = example();
        campaign.locations.push(Location {
            id: "loc-1".into(),
            name: "Harrow Glen".into(),
            image: Some(NpcImage {
                kind: "img".into(),
                url: "data:image/webp;base64,dG9rZW4=".into(),
            }),
            public_description: "A woodland village.".into(),
            gm_notes: "A hidden passage.".into(),
            party_knowledge: unknown_party_knowledge(),
            ..Default::default()
        });
        campaign.locations.push(
            serde_json::from_value(serde_json::json!({
                "id": "region-1", "name": "Northern Reach", "image": null,
                "publicDescription": "A rugged region.", "gmNotes": "Old prep."
            }))
            .unwrap(),
        );
        let location = &mut campaign.locations[0];
        location.parent_id = Some("region-1".into());
        location.location_type = "Village".into();
        location.tags = vec!["Forest".into(), "Social".into()];
        location.party_knowledge = "visited".into();
        location.gm_reference.atmosphere = "Wood smoke and birdsong.".into();
        location.gm_reference.background = "An old refuge.".into();
        location.gm_reference.current_situation = "Preparing a festival.".into();
        location.gm_reference.secrets = "A hidden cellar.".into();
        location.banner = Some(NpcImage {
            kind: "img".into(),
            url: "data:image/webp;base64,YmFubmVy".into(),
        });
        campaign.npcs[0]
            .presentation
            .locations
            .push(NpcRelationship {
                target_id: "loc-1".into(),
                label: "Childhood home".into(),
            });
        campaign
            .workspace
            .as_mut()
            .unwrap()
            .history
            .entries
            .push(Destination::Location {
                workspace_id: "workspace:1".into(),
                location_id: "loc-1".into(),
                section: Some("Locations & Maps".into()),
            });
        let expected = serde_json::to_value(&campaign).unwrap();
        write_campaign(&path, campaign).unwrap();
        let stored: String = Connection::open(path.join("campaign.sqlite"))
            .unwrap()
            .query_row(
                "SELECT record_json FROM location WHERE id='loc-1'",
                [],
                |row| row.get(0),
            )
            .unwrap();
        assert!(stored.contains("assets/"));
        let moved = folder.path().join("moved.campaign");
        fs::rename(&path, &moved).unwrap();
        assert_eq!(
            serde_json::to_value(read_campaign(&moved).unwrap()).unwrap(),
            expected
        );
    }

    #[test]
    fn version_one_campaigns_load_and_upgrade_locations_on_save() {
        let folder = tempfile::tempdir().unwrap();
        let path = folder.path().join("legacy.campaign");
        write_campaign(&path, example()).unwrap();
        let db = Connection::open(path.join("campaign.sqlite")).unwrap();
        db.execute_batch("DROP TABLE location; PRAGMA user_version=1;")
            .unwrap();
        drop(db);
        let campaign = read_campaign(&path).unwrap();
        assert!(campaign.locations.is_empty());
        write_campaign(&path, campaign).unwrap();
        let db = Connection::open(path.join("campaign.sqlite")).unwrap();
        assert_eq!(
            db.pragma_query_value(None, "user_version", |row| row.get::<_, i32>(0))
                .unwrap(),
            5
        );
        assert!(table_exists(&db, "location").unwrap());
    }

    #[test]
    fn location_dossier_defaults_and_hierarchy_validation() {
        let legacy = serde_json::json!({
            "id": "loc-1", "name": "Village", "image": null,
            "publicDescription": "Existing description", "gmNotes": "Existing notes"
        });
        let mut campaign = example();
        campaign
            .locations
            .push(serde_json::from_value(legacy.clone()).unwrap());
        assert!(campaign.validate().is_ok());
        assert_eq!(campaign.locations[0].party_knowledge, "unknown");
        assert!(campaign.locations[0].tags.is_empty());
        assert!(campaign.locations[0].gm_reference.background.is_empty());
        assert_eq!(
            campaign.locations[0].public_description,
            "Existing description"
        );
        campaign.locations[0].parent_id = Some("loc-1".into());
        assert!(campaign.validate().is_err());
        campaign.locations[0].parent_id = Some("missing".into());
        assert!(campaign.validate().is_err());
        campaign.locations[0].parent_id = None;
        let mut child: Location = serde_json::from_value(legacy).unwrap();
        child.id = "loc-2".into();
        child.parent_id = Some("loc-1".into());
        campaign.locations.push(child);
        assert!(campaign.validate().is_ok());
        campaign.locations[0].parent_id = Some("loc-2".into());
        assert!(campaign.validate().is_err());
        campaign.locations[0].parent_id = None;
        campaign.locations[0].party_knowledge = "published".into();
        assert!(campaign.validate().is_err());
        campaign.locations[0].party_knowledge = "known".into();
        campaign.locations[0].banner = Some(NpcImage {
            kind: "invalid".into(),
            url: "unused".into(),
        });
        assert!(campaign.validate().is_err());
    }

    #[test]
    fn invalid_locations_and_duplicate_location_links_are_rejected() {
        let mut campaign = example();
        campaign.locations.push(Location {
            id: "loc-1".into(),
            name: " ".into(),
            image: None,
            public_description: String::new(),
            gm_notes: String::new(),
            party_knowledge: unknown_party_knowledge(),
            ..Default::default()
        });
        assert!(campaign.validate().is_err());
        campaign.locations[0].name = "Village".into();
        campaign.npcs[0].presentation.locations = vec![
            NpcRelationship {
                target_id: "loc-1".into(),
                label: String::new(),
            },
            NpcRelationship {
                target_id: "loc-1".into(),
                label: String::new(),
            },
        ];
        assert!(campaign.validate().is_err());
    }

    #[test]
    fn factions_images_links_and_navigation_round_trip() {
        let folder = tempfile::tempdir().unwrap();
        let path = folder.path().join("factions.campaign");
        let mut campaign = example();
        campaign.factions.push(Faction {
            id: "faction-1".into(),
            name: "Harrow Glen Wardens".into(),
            image: Some(NpcImage {
                kind: "img".into(),
                url: "data:image/webp;base64,dG9rZW4=".into(),
            }),
            description: "Protectors of the village.".into(),
            gm_notes: "A hidden passage.".into(),
        });
        campaign.npcs[0]
            .presentation
            .factions
            .push(NpcRelationship {
                target_id: "faction-1".into(),
                label: "Member".into(),
            });
        campaign
            .workspace
            .as_mut()
            .unwrap()
            .history
            .entries
            .push(Destination::Faction {
                workspace_id: "workspace:1".into(),
                faction_id: "faction-1".into(),
                section: Some("Factions".into()),
            });
        let expected = serde_json::to_value(&campaign).unwrap();
        write_campaign(&path, campaign).unwrap();
        let stored: String = Connection::open(path.join("campaign.sqlite"))
            .unwrap()
            .query_row(
                "SELECT record_json FROM faction WHERE id='faction-1'",
                [],
                |row| row.get(0),
            )
            .unwrap();
        assert!(stored.contains("assets/"));
        let moved = folder.path().join("moved.campaign");
        fs::rename(&path, &moved).unwrap();
        assert_eq!(
            serde_json::to_value(read_campaign(&moved).unwrap()).unwrap(),
            expected
        );
    }

    #[test]
    fn invalid_factions_and_duplicate_faction_links_are_rejected() {
        let mut campaign = example();
        campaign.factions.push(Faction {
            id: "loc-1".into(),
            name: " ".into(),
            image: None,
            description: String::new(),
            gm_notes: String::new(),
        });
        assert!(campaign.validate().is_err());
        campaign.factions[0].name = "Village".into();
        campaign.npcs[0].presentation.factions = vec![
            NpcRelationship {
                target_id: "loc-1".into(),
                label: String::new(),
            },
            NpcRelationship {
                target_id: "loc-1".into(),
                label: String::new(),
            },
        ];
        assert!(campaign.validate().is_err());
    }

    #[test]
    fn version_two_campaigns_default_factions_and_upgrade_on_save() {
        let folder = tempfile::tempdir().unwrap();
        let path = folder.path().join("legacy-factions.campaign");
        let mut campaign = example();
        campaign.locations.push(Location {
            id: "loc-1".into(),
            name: "Village".into(),
            image: None,
            public_description: "An old village.".into(),
            gm_notes: "Private.".into(),
            party_knowledge: unknown_party_knowledge(),
            ..Default::default()
        });
        write_campaign(&path, campaign).unwrap();
        let db = Connection::open(path.join("campaign.sqlite")).unwrap();
        db.execute_batch("DROP TABLE faction; UPDATE npc_presentation SET presentation_json=json_remove(presentation_json,'$.factions'); PRAGMA user_version=2;").unwrap();
        drop(db);
        let campaign = read_campaign(&path).unwrap();
        assert!(campaign.factions.is_empty());
        assert!(campaign.npcs[0].presentation.factions.is_empty());
        assert_eq!(campaign.locations[0].name, "Village");
        write_campaign(&path, campaign).unwrap();
        let db = Connection::open(path.join("campaign.sqlite")).unwrap();
        assert_eq!(
            db.pragma_query_value(None, "user_version", |row| row.get::<_, i32>(0))
                .unwrap(),
            5
        );
        assert!(table_exists(&db, "faction").unwrap());
    }

    #[test]
    fn failed_save_preserves_previous_file() {
        let folder = tempfile::tempdir().unwrap();
        let path = folder.path().join("test.campaign");
        write_campaign(&path, example()).unwrap();
        let previous = read_campaign(&path).unwrap();
        let mut invalid = example();
        invalid.npcs[0].notes[1]["url"] = json!("assets/../../secret.png");
        assert!(write_campaign(&path, invalid).is_err());
        assert_eq!(
            serde_json::to_value(read_campaign(&path).unwrap()).unwrap(),
            serde_json::to_value(&previous).unwrap()
        );
        let mut invalid = example();
        invalid.schema_version = 2;
        assert!(write_campaign(&path, invalid).is_err());
        assert_eq!(
            serde_json::to_value(read_campaign(&path).unwrap()).unwrap(),
            serde_json::to_value(&previous).unwrap()
        );
        let mut other = example();
        other.id = "other-campaign".into();
        assert!(write_campaign(&path, other).is_err());
        assert_eq!(
            serde_json::to_value(read_campaign(&path).unwrap()).unwrap(),
            serde_json::to_value(&previous).unwrap()
        );
    }

    #[test]
    fn missing_or_corrupt_images_are_reported() {
        let folder = tempfile::tempdir().unwrap();
        let path = folder.path().join("test.campaign");
        write_campaign(&path, example()).unwrap();
        let asset = fs::read_dir(path.join("assets"))
            .unwrap()
            .next()
            .unwrap()
            .unwrap()
            .path();
        fs::write(&asset, "corrupted").unwrap();
        assert!(read_campaign(&path).unwrap_err().contains("hash mismatch"));
        fs::remove_file(asset).unwrap();
        assert!(read_campaign(&path)
            .unwrap_err()
            .contains("Missing or unreadable image"));
    }
    fn atlas_example() -> Campaign {
        let mut campaign = example();
        campaign.locations.push(serde_json::from_value(json!({
            "id": "city", "name": "Greyhaven", "image": null, "publicDescription": "A harbor city", "gmNotes": "Private",
            "associatedNpcs": [{"targetId": "npc-1", "label": "Home"}], "associatedFactions": []
        })).unwrap());
        campaign.maps.push(serde_json::from_value(json!({
            "id": "city-map", "name": "City map", "kind": "City", "image": {"type": "img", "url": "data:image/png;base64,bWFw"},
            "width": 1400, "height": 900, "locationIds": ["city"], "party": {"x": 0.2, "y": 0.8},
            "pins": [{"id": "city-pin", "x": 0.5, "y": 0.6, "locationId": "city", "label": "Harbor", "destinationMapId": null}]
        })).unwrap());
        campaign
            .workspace
            .as_mut()
            .unwrap()
            .history
            .entries
            .push(Destination::Map {
                map_id: Some("city-map".into()),
                workspace_id: "workspace:1".into(),
                section: Some("Maps".into()),
            });
        campaign
    }

    #[test]
    fn saved_maps_assets_links_and_navigation_survive_moving_package() {
        let folder = tempfile::tempdir().unwrap();
        let path = folder.path().join("atlas.campaign");
        let campaign = atlas_example();
        let expected = serde_json::to_value(&campaign).unwrap();
        write_campaign(&path, campaign).unwrap();
        let moved = folder.path().join("moved.campaign");
        fs::rename(&path, &moved).unwrap();
        let loaded = read_campaign(&moved).unwrap();
        assert_eq!(serde_json::to_value(loaded).unwrap(), expected);
        let db = Connection::open(moved.join("campaign.sqlite")).unwrap();
        let stored: String = db
            .query_row("SELECT record_json FROM map_record", [], |row| row.get(0))
            .unwrap();
        assert!(stored.contains("assets/"));
        assert!(!stored.contains("data:image"));
    }

    #[test]
    fn maps_validate_links_and_positions_before_changing_saved_campaign() {
        let folder = tempfile::tempdir().unwrap();
        let path = folder.path().join("atlas.campaign");
        let expected = serde_json::to_value(atlas_example()).unwrap();
        write_campaign(&path, atlas_example()).unwrap();
        for invalid in 0..5 {
            let mut campaign = atlas_example();
            match invalid {
                0 => campaign.maps[0].pins[0].x = 1.5,
                1 => campaign.maps[0].pins[0].destination_map_id = Some("missing".into()),
                2 => campaign.maps[0].location_ids.push("missing".into()),
                3 => campaign.maps[0].width = 0,
                _ => {
                    campaign.maps[0].party = Some(MapPoint {
                        x: f64::NAN,
                        y: 0.5,
                    })
                }
            }
            assert!(write_campaign(&path, campaign).is_err());
            assert_eq!(
                serde_json::to_value(read_campaign(&path).unwrap()).unwrap(),
                expected
            );
        }
    }

    #[test]
    fn version_four_packages_load_without_maps_and_upgrade_on_save() {
        let folder = tempfile::tempdir().unwrap();
        let path = folder.path().join("legacy.campaign");
        write_campaign(&path, example()).unwrap();
        let db = Connection::open(path.join("campaign.sqlite")).unwrap();
        db.execute_batch("DROP TABLE map_record; PRAGMA user_version=4;")
            .unwrap();
        drop(db);
        let campaign = read_campaign(&path).unwrap();
        assert!(campaign.maps.is_empty());
        write_campaign(&path, campaign).unwrap();
        let db = Connection::open(path.join("campaign.sqlite")).unwrap();
        assert!(table_exists(&db, "map_record").unwrap());
        assert_eq!(
            db.pragma_query_value(None, "user_version", |row| row.get::<_, i32>(0))
                .unwrap(),
            5
        );
    }
}

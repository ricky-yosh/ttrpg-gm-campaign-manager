use serde::{Deserialize, Serialize};
use serde_json::Value;
use std::collections::HashMap;

mod assets;
mod commands;
mod migrations;
mod repository;
mod service;
mod validation;

use assets::{
    transform_faction_image, transform_images, transform_location_image,
    transform_presentation_images,
};
pub(crate) use commands::{open_campaign, save_campaign, update_npc};
use migrations::ensure_schema;
#[cfg(test)]
use repository::table_exists;
pub(crate) use repository::CampaignRepository;
#[cfg(test)]
use repository::{read_campaign, write_campaign};

#[derive(Debug, Serialize, Deserialize)]
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
    factions: Vec<Faction>,
    workspace: Option<Workspace>,
    section: Option<String>,
    sidebar: Sidebar,
}

#[derive(Debug, Serialize, Deserialize)]
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

#[derive(Debug, Clone, Serialize, Deserialize)]
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

impl Default for NpcPresentation {
    fn default() -> Self {
        Self {
            relationships: Vec::new(),
            locations: Vec::new(),
            factions: Vec::new(),
            banner: None,
            portrait: None,
            player_description: String::new(),
            gm_reference: NpcGmReference::default(),
            statblock: NpcStatblock::default(),
        }
    }
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

#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct Location {
    id: String,
    name: String,
    image: Option<NpcImage>,
    public_description: String,
    gm_notes: String,
}

#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct Faction {
    id: String,
    name: String,
    image: Option<NpcImage>,
    description: String,
    gm_notes: String,
}

#[derive(Debug, Serialize, Deserialize)]
struct Sidebar {
    width: f64,
    open: bool,
}
#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct Workspace {
    layout: Value,
    panels: HashMap<String, Value>,
    next_id: u32,
    sidebar_width: f64,
    collapsed: bool,
    history: NavigationHistory,
}
#[derive(Debug, Serialize, Deserialize)]
struct NavigationHistory {
    #[serde(deserialize_with = "deserialize_destinations")]
    entries: Vec<Destination>,
    index: i32,
}
#[derive(Debug, Serialize, Deserialize)]
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
    Map {
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

#[cfg(test)]
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
            3
        );
        assert!(table_exists(&db, "location").unwrap());
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
            3
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
}

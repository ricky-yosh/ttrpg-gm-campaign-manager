use super::*;
use std::collections::HashSet;

fn valid_image(image: &NpcImage) -> bool {
    image.kind == "img" && !image.url.trim().is_empty()
}

pub(super) fn validate_layout(layout: &Value, components: &[&str]) -> Result<(), String> {
    let grid = layout.get("grid").ok_or("Workspace has no grid.")?;
    if !grid["width"].is_number()
        || !grid["height"].is_number()
        || !matches!(
            grid["orientation"].as_str(),
            Some("HORIZONTAL" | "VERTICAL")
        )
    {
        return Err("Invalid workspace grid.".into());
    }
    let panels = layout["panels"]
        .as_object()
        .ok_or("Workspace has no panels.")?;
    for (id, panel) in panels {
        if panel["id"].as_str() != Some(id)
            || !panel["contentComponent"]
                .as_str()
                .is_some_and(|component| components.contains(&component))
        {
            return Err("Unknown workspace panel.".into());
        }
    }
    fn visit(node: &Value, panels: &serde_json::Map<String, Value>) -> Result<(), String> {
        match node["type"].as_str() {
            Some("branch") => {
                for child in node["data"].as_array().ok_or("Invalid workspace branch.")? {
                    visit(child, panels)?;
                }
            }
            Some("leaf") => {
                if !node["data"]["id"].is_string() {
                    return Err("Invalid workspace group.".into());
                }
                for id in node["data"]["views"]
                    .as_array()
                    .ok_or("Invalid workspace tabs.")?
                {
                    if !id.as_str().is_some_and(|id| panels.contains_key(id)) {
                        return Err("Workspace references a missing tab.".into());
                    }
                }
            }
            _ => return Err("Invalid workspace layout.".into()),
        }
        Ok(())
    }
    visit(&grid["root"], panels)
}

impl Campaign {
    pub(super) fn validate(&self) -> Result<(), String> {
        if self.format != "ttrpg-campaign" || self.schema_version != 1 {
            return Err("Unsupported campaign format or version. No files were changed.".into());
        }
        if self.id.is_empty() || self.name.trim().is_empty() {
            return Err("Campaign ID and name are required.".into());
        }
        if !(200.0..=400.0).contains(&self.sidebar.width) {
            return Err("Invalid campaign sidebar width.".into());
        }
        if let Some(workspace) = &self.workspace {
            if workspace.next_id == 0
                || !(160.0..=320.0).contains(&workspace.sidebar_width)
                || workspace.history.entries.len() > 100
                || workspace.history.index < -1
                || workspace.history.index >= workspace.history.entries.len() as i32
            {
                return Err("Invalid workspace state.".into());
            }
            validate_layout(&workspace.layout, &["workspace"])?;
            let panel_ids = workspace.layout["panels"]
                .as_object()
                .ok_or("Workspace has no panels.")?;
            for id in panel_ids.keys() {
                let layout = workspace
                    .panels
                    .get(id)
                    .ok_or("Missing workspace contents.")?;
                validate_layout(
                    layout,
                    &[
                        "character",
                        "map",
                        "mapLibrary",
                        "location",
                        "faction",
                        "thread",
                        "threads",
                        "item",
                        "items",
                        "inventory",
                    ],
                )?;
            }
        }
        items::validate_items(&self.items, &self.item_fields)?;
        const MAX_SAFE_INTEGER: u64 = 9_007_199_254_740_991;
        if self.inventory.gold > MAX_SAFE_INTEGER {
            return Err("Gold exceeds the supported amount.".into());
        }
        let mut inventory_ids = HashSet::new();
        for entry in &self.inventory.entries {
            if entry.id.trim().is_empty()
                || !inventory_ids.insert(&entry.id)
                || entry.name.trim().is_empty()
            {
                return Err("Inventory entries need unique IDs and nonempty names.".into());
            }
            if !["item", "material"].contains(&entry.kind.as_str())
                || entry.quantity == 0
                || entry.quantity > MAX_SAFE_INTEGER
            {
                return Err(
                    "Inventory entries need a category and a positive whole quantity.".into(),
                );
            }
        }
        let mut ids = HashSet::new();
        let mut location_ids = HashSet::new();
        for location in &self.locations {
            if location.id.trim().is_empty()
                || location.name.trim().is_empty()
                || !location_ids.insert(&location.id)
            {
                return Err("Locations must have unique IDs and nonempty names.".into());
            }
            if [location.image.as_ref(), location.banner.as_ref()]
                .into_iter()
                .flatten()
                .any(|image| !valid_image(image))
            {
                return Err("Location images must use type 'img' and an imported URL.".into());
            }
            for links in [&location.associated_npcs, &location.associated_factions] {
                let mut targets = HashSet::new();
                for link in links {
                    if link.target_id.trim().is_empty() || !targets.insert(&link.target_id) {
                        return Err(
                            "Location associations need unique, nonempty target IDs.".into()
                        );
                    }
                }
            }
        }
        let locations: std::collections::HashMap<_, _> = self
            .locations
            .iter()
            .map(|location| (location.id.as_str(), location))
            .collect();
        for location in &self.locations {
            if !["unknown", "known", "visited"].contains(&location.party_knowledge.as_str()) {
                return Err("Invalid location party knowledge.".into());
            }
            let mut seen = HashSet::from([location.id.as_str()]);
            let mut parent_id = location.parent_id.as_deref();
            while let Some(id) = parent_id {
                if !seen.insert(id) {
                    return Err("Location parents cannot form a cycle.".into());
                }
                let parent = locations.get(id).ok_or("Location parent is unavailable.")?;
                parent_id = parent.parent_id.as_deref();
            }
        }
        let map_ids: HashSet<_> = self.maps.iter().map(|map| map.id.as_str()).collect();
        if map_ids.len() != self.maps.len() {
            return Err("Map IDs must be unique.".into());
        }
        let valid_point = |x: f64, y: f64| {
            x.is_finite() && y.is_finite() && (0.0..=1.0).contains(&x) && (0.0..=1.0).contains(&y)
        };
        for map in &self.maps {
            if map.id.trim().is_empty()
                || map.name.trim().is_empty()
                || map.width == 0
                || map.height == 0
                || !["World", "Region", "City", "Building", "Dungeon", "Battle"]
                    .contains(&map.kind.as_str())
                || !valid_image(&map.image)
            {
                return Err("Invalid map identity, kind, dimensions, or image.".into());
            }
            let mut attached = HashSet::new();
            if map
                .location_ids
                .iter()
                .any(|id| !locations.contains_key(id.as_str()) || !attached.insert(id))
            {
                return Err("Map attachments must reference unique existing locations.".into());
            }
            let mut pins = HashSet::new();
            for pin in &map.pins {
                if pin.id.trim().is_empty()
                    || !pins.insert(&pin.id)
                    || !valid_point(pin.x, pin.y)
                    || !locations.contains_key(pin.location_id.as_str())
                    || pin
                        .destination_map_id
                        .as_ref()
                        .is_some_and(|id| id == &map.id || !map_ids.contains(id.as_str()))
                {
                    return Err("Invalid map pin or linked destination.".into());
                }
            }
            if map
                .party
                .as_ref()
                .is_some_and(|point| !valid_point(point.x, point.y))
            {
                return Err("Invalid party marker position.".into());
            }
        }
        let mut thread_ids = HashSet::new();
        for thread in &self.threads {
            if thread.id.trim().is_empty()
                || thread.title.trim().is_empty()
                || !thread_ids.insert(&thread.id)
            {
                return Err("Story threads need unique IDs and nonempty titles.".into());
            }
            if !["idea", "active", "onHold", "resolved"].contains(&thread.status.as_str()) {
                return Err("Invalid story thread status.".into());
            }
            for links in [&thread.people, &thread.locations, &thread.factions] {
                let mut targets = HashSet::new();
                for link in links {
                    if link.target_id.trim().is_empty() || !targets.insert(&link.target_id) {
                        return Err("Thread links need unique, nonempty target IDs.".into());
                    }
                }
            }
            for document in [&thread.current_situation, &thread.gm_possibilities] {
                if document.is_empty() {
                    return Err("Thread notes need at least one block.".into());
                }
                for node in document {
                    validate_node(node)?;
                }
            }
        }
        let mut faction_ids = HashSet::new();
        for faction in &self.factions {
            if faction.id.trim().is_empty()
                || faction.name.trim().is_empty()
                || !faction_ids.insert(&faction.id)
            {
                return Err("Factions must have unique IDs and nonempty names.".into());
            }
            if faction
                .image
                .as_ref()
                .is_some_and(|image| !valid_image(image))
            {
                return Err("Faction images must use type 'img' and an imported URL.".into());
            }
        }
        for npc in &self.npcs {
            let mut location_targets = HashSet::new();
            for link in &npc.presentation.locations {
                if link.target_id.trim().is_empty() || !location_targets.insert(&link.target_id) {
                    return Err("NPC location links must have unique, nonempty target IDs.".into());
                }
            }
            let mut faction_targets = HashSet::new();
            for link in &npc.presentation.factions {
                if link.target_id.trim().is_empty() || !faction_targets.insert(&link.target_id) {
                    return Err("NPC faction links must have unique, nonempty target IDs.".into());
                }
            }
            if npc.id.is_empty() || npc.name.trim().is_empty() || !ids.insert(&npc.id) {
                return Err("NPCs must have unique IDs and nonempty names.".into());
            }
            let mut targets = HashSet::new();
            for relationship in &npc.presentation.relationships {
                if relationship.target_id.trim().is_empty()
                    || relationship.target_id == npc.id
                    || !targets.insert(&relationship.target_id)
                {
                    return Err("NPC relationships must have unique, nonempty target IDs and cannot link to themselves.".into());
                }
                // Missing targets are retained so deleting a record does not invalidate a campaign.
            }
            if npc.notes.is_empty() {
                return Err("NPC notes need at least one block.".into());
            }
            for node in &npc.notes {
                validate_node(node)?;
            }
            if npc.presentation.statblock.field_set_id.is_empty()
                || npc.presentation.statblock.field_set_version == 0
            {
                return Err("NPC statblock field set is invalid.".into());
            }
            for image in [
                npc.presentation.banner.as_ref(),
                npc.presentation.portrait.as_ref(),
                npc.presentation.statblock.token_image.as_ref(),
            ]
            .into_iter()
            .flatten()
            {
                if !valid_image(image) {
                    return Err(
                        "NPC presentation images must use type 'img' and an imported URL.".into(),
                    );
                }
            }
        }
        Ok(())
    }
}

pub(super) fn validate_node(node: &Value) -> Result<(), String> {
    if node.get("text").and_then(Value::as_str).is_some() {
        return Ok(());
    }
    let kind = node
        .get("type")
        .and_then(Value::as_str)
        .ok_or("Invalid note block.")?;
    if kind == "img" {
        let url = node.get("url").and_then(Value::as_str).unwrap_or("");
        if url.trim().is_empty() {
            return Err("Note images must have an imported URL.".into());
        }
    }
    let children = node
        .get("children")
        .and_then(Value::as_array)
        .ok_or("Note block is missing children.")?;
    if children.is_empty() {
        return Err("Note block has no children.".into());
    }
    for child in children {
        validate_node(child)?;
    }
    Ok(())
}

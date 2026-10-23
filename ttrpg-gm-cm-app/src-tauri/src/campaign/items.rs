use super::{transform_images, NpcImage};
use serde::{Deserialize, Serialize};
use serde_json::Value;
use std::{
    collections::{HashMap, HashSet},
    path::Path,
};

#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub(super) struct CampaignItem {
    id: String,
    name: String,
    image: Option<NpcImage>,
    description: String,
    gm_notes: String,
    values: HashMap<String, Value>,
}

#[derive(Debug, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub(super) struct ItemFieldDefinition {
    id: String,
    label: String,
    kind: String,
    options: Vec<ItemChoice>,
}

#[derive(Debug, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
struct ItemChoice {
    id: String,
    label: String,
}

pub(super) fn validate_items(
    items: &[CampaignItem],
    fields: &[ItemFieldDefinition],
) -> Result<(), String> {
    let mut definitions = HashMap::new();
    for field in fields {
        if field.id.trim().is_empty()
            || field.label.trim().is_empty()
            || definitions.insert(field.id.as_str(), field).is_some()
            || !["text", "number", "checkbox", "choice"].contains(&field.kind.as_str())
        {
            return Err("Item fields need unique IDs, labels, and a supported type.".into());
        }
        if field.kind == "choice" {
            let mut ids = HashSet::new();
            let mut labels = HashSet::new();
            if field.options.is_empty()
                || field.options.iter().any(|option| {
                    option.id.trim().is_empty()
                        || option.label.trim().is_empty()
                        || !ids.insert(&option.id)
                        || !labels.insert(option.label.trim().to_lowercase())
                })
            {
                return Err("Item choices need unique IDs and distinct, nonempty labels.".into());
            }
        } else if !field.options.is_empty() {
            return Err("Only choice fields can have options.".into());
        }
    }
    let mut ids = HashSet::new();
    for item in items {
        if item.id.trim().is_empty() || item.name.trim().is_empty() || !ids.insert(&item.id) {
            return Err("Items need unique IDs and nonempty names.".into());
        }
        if item
            .image
            .as_ref()
            .is_some_and(|image| image.kind != "img" || image.url.is_empty())
        {
            return Err("Item images must use type 'img' and an imported image URL.".into());
        }
        for (id, value) in &item.values {
            let field = definitions
                .get(id.as_str())
                .ok_or("Item property refers to an unavailable field.")?;
            let valid = value.is_null()
                || match field.kind.as_str() {
                    "text" => value.is_string(),
                    "number" => value.as_f64().is_some_and(f64::is_finite),
                    "checkbox" => value.is_boolean(),
                    "choice" => value
                        .as_str()
                        .is_some_and(|id| field.options.iter().any(|option| option.id == id)),
                    _ => false,
                };
            if !valid {
                return Err(format!("Invalid value for item field {}.", field.label));
            }
        }
    }
    Ok(())
}

pub(super) fn transform_item_image(
    item: &mut CampaignItem,
    folder: &Path,
    saving: bool,
) -> Result<(), String> {
    if let Some(image) = &mut item.image {
        let mut value = serde_json::to_value(&*image).map_err(|e| e.to_string())?;
        transform_images(&mut value, folder, saving)?;
        *image = serde_json::from_value(value).map_err(|e| e.to_string())?;
    }
    Ok(())
}

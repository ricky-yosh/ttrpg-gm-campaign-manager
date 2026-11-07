use super::*;
use base64::{engine::general_purpose::STANDARD, Engine};
use sha2::{Digest, Sha256};
use std::{fs, io::Write, path::Path};

#[cfg(feature = "legacy-sqlite")]
pub(super) fn transform_location_image(
    location: &mut Location,
    folder: &Path,
    saving: bool,
) -> Result<(), String> {
    let mut value = serde_json::to_value(&*location).map_err(|e| e.to_string())?;
    transform_images(&mut value, folder, saving)?;
    *location = serde_json::from_value(value).map_err(|e| e.to_string())?;
    Ok(())
}

#[cfg(feature = "legacy-sqlite")]
pub(super) fn transform_faction_image(
    faction: &mut Faction,
    folder: &Path,
    saving: bool,
) -> Result<(), String> {
    let mut value = serde_json::to_value(&*faction).map_err(|e| e.to_string())?;
    transform_images(&mut value, folder, saving)?;
    *faction = serde_json::from_value(value).map_err(|e| e.to_string())?;
    Ok(())
}

#[cfg(feature = "legacy-sqlite")]
pub(super) fn transform_presentation_images(
    presentation: &mut NpcPresentation,
    folder: &Path,
    saving: bool,
) -> Result<(), String> {
    let mut value = serde_json::to_value(&*presentation).map_err(|e| e.to_string())?;
    transform_images(&mut value, folder, saving)?;
    *presentation = serde_json::from_value(value).map_err(|e| e.to_string())?;
    Ok(())
}

fn image_type(mime: &str) -> Result<&'static str, String> {
    match mime {
        "image/png" => Ok("png"),
        "image/jpeg" => Ok("jpg"),
        "image/gif" => Ok("gif"),
        "image/webp" => Ok("webp"),
        "image/svg+xml" => Ok("svg"),
        "image/avif" => Ok("avif"),
        _ => Err(format!("Unsupported image type: {mime}")),
    }
}

fn asset_file<'a>(url: &'a str, folder: &Path) -> Result<(std::path::PathBuf, &'a str), String> {
    let filename = url
        .strip_prefix("assets/")
        .ok_or("Images must be imported files, not external URLs.")?;
    let (hash, extension) = filename.split_once('.').ok_or("Invalid image path.")?;
    if hash.len() != 64 || !hash.bytes().all(|b| b.is_ascii_hexdigit()) {
        return Err("Invalid image path.".into());
    }
    let mime = match extension {
        "png" => "image/png",
        "jpg" => "image/jpeg",
        "gif" => "image/gif",
        "webp" => "image/webp",
        "svg" => "image/svg+xml",
        "avif" => "image/avif",
        _ => return Err("Invalid image extension.".into()),
    };
    let file = folder.join("assets").join(filename);
    // A moved campaign must never resolve an asset outside its own folder through a symlink.
    let root = folder.canonicalize().map_err(|e| e.to_string())?;
    let canonical = file
        .canonicalize()
        .map_err(|e| format!("Missing or unreadable image {filename}: {e}"))?;
    if !canonical.starts_with(&root) {
        return Err("Image resolves outside the campaign folder.".into());
    }
    Ok((canonical, mime))
}

pub(super) fn transform_images(
    node: &mut Value,
    folder: &Path,
    saving: bool,
) -> Result<(), String> {
    if let Some(object) = node.as_object_mut() {
        if object.get("type").and_then(Value::as_str) == Some("img") {
            let url = object
                .get("url")
                .and_then(Value::as_str)
                .ok_or("Image has no URL.")?
                .to_owned();
            if saving && url.starts_with("data:") {
                let (header, encoded) = url.split_once(',').ok_or("Invalid image data.")?;
                let mime = header
                    .strip_prefix("data:")
                    .and_then(|s| s.strip_suffix(";base64"))
                    .ok_or("Invalid image encoding.")?;
                let extension = image_type(mime)?;
                let bytes = STANDARD.decode(encoded).map_err(|e| e.to_string())?;
                if bytes.is_empty() || bytes.len() > 10 * 1024 * 1024 {
                    return Err("Images must be between 1 byte and 10 MB.".into());
                }
                let filename = format!("{:x}.{extension}", Sha256::digest(&bytes));
                let asset = folder.join("assets").join(&filename);
                if !asset.exists() {
                    atomic_write(&asset, &bytes)?;
                }
                // Also verify an existing asset before committing a reference to it.
                let (file, _) = asset_file(&format!("assets/{filename}"), folder)?;
                if fs::read(file).map_err(|e| e.to_string())? != bytes {
                    return Err("Campaign image hash mismatch.".into());
                }
                object.insert("url".into(), Value::String(format!("assets/{filename}")));
            } else {
                let (file, mime) = asset_file(&url, folder)?;
                let bytes = fs::read(file).map_err(|e| e.to_string())?;
                let expected = format!("assets/{:x}.{}", Sha256::digest(&bytes), image_type(mime)?);
                if expected != url {
                    return Err(format!("Image hash mismatch: {url}"));
                }
                if !saving {
                    object.insert(
                        "url".into(),
                        Value::String(format!("data:{mime};base64,{}", STANDARD.encode(bytes))),
                    );
                }
            }
        }
        for value in object.values_mut() {
            transform_images(value, folder, saving)?;
        }
    } else if let Some(array) = node.as_array_mut() {
        for value in array {
            transform_images(value, folder, saving)?;
        }
    }
    Ok(())
}

fn atomic_write(path: &Path, bytes: &[u8]) -> Result<(), String> {
    let parent = path.parent().ok_or("Choose a campaign package folder.")?;
    let mut temporary = tempfile::NamedTempFile::new_in(parent).map_err(|e| e.to_string())?;
    temporary.write_all(bytes).map_err(|e| e.to_string())?;
    temporary.as_file().sync_all().map_err(|e| e.to_string())?;
    temporary.persist(path).map_err(|e| e.to_string())?;
    Ok(())
}

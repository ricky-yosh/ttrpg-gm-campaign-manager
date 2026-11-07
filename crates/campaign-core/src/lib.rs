//! UI-independent campaign model, application session, and local persistence.
// Keep one source of domain rules while the existing desktop adapter migrates.
// This module contains no Tauri imports; desktop commands stay in their host.
#[path = "../../../ttrpg-gm-cm-app/src-tauri/src/campaign/mod.rs"]
pub mod campaign;

// The desktop host retains its existing snapshot/save orchestration while both
// hosts share the UI-independent model, validation, assets, and history.
#[path = "campaign/commands.rs"]
mod commands;
pub(crate) use campaign_core::campaign::*;
pub(crate) use commands::{open_campaign, redo_npc, save_campaign, undo_npc, update_npc};

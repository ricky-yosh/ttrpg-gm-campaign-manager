use tauri::{
    menu::{Menu, MenuItem, MenuItemKind},
    App, Manager, State,
};

pub struct HistoryMenuState {
    undo: MenuItem<tauri::Wry>,
    redo: MenuItem<tauri::Wry>,
}

pub fn setup(app: &mut App) -> tauri::Result<()> {
    let menu = Menu::default(app.handle())?;
    let edit = menu
        .items()?
        .into_iter()
        .find_map(|item| match item {
            MenuItemKind::Submenu(submenu) if submenu.text().ok().as_deref() == Some("Edit") => {
                Some(submenu)
            }
            _ => None,
        })
        .expect("Tauri's default menu must contain Edit");
    // Undo and Redo always route through the frontend dispatcher.
    edit.remove_at(0)?;
    edit.remove_at(0)?;
    let undo = MenuItem::with_id(app, "history-undo", "Undo", false, Some("CmdOrCtrl+Z"))?;
    let redo = MenuItem::with_id(
        app,
        "history-redo",
        "Redo",
        false,
        Some("CmdOrCtrl+Shift+Z"),
    )?;
    edit.insert_items(&[&undo, &redo], 0)?;
    app.set_menu(menu)?;
    app.manage(HistoryMenuState { undo, redo });
    Ok(())
}

#[tauri::command]
pub fn set_history_menu(
    state: State<'_, HistoryMenuState>,
    undo_label: Option<String>,
    redo_label: Option<String>,
) -> Result<(), String> {
    let update = || -> tauri::Result<()> {
        state.undo.set_text(
            undo_label
                .as_ref()
                .map(|label| format!("Undo {label}"))
                .unwrap_or_else(|| "Undo".into()),
        )?;
        state.redo.set_text(
            redo_label
                .as_ref()
                .map(|label| format!("Redo {label}"))
                .unwrap_or_else(|| "Redo".into()),
        )?;
        state.undo.set_enabled(undo_label.is_some())?;
        state.redo.set_enabled(redo_label.is_some())?;
        Ok(())
    };
    update().map_err(|error| error.to_string())
}

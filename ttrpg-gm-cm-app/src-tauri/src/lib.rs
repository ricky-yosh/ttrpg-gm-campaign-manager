mod campaign;
mod images;
use campaign::{open_campaign, save_campaign};
use std::sync::Mutex;
use tauri::{Manager, State};

struct OpenedCampaigns(Mutex<Vec<String>>);

#[tauri::command]
fn take_opened_campaigns(state: State<'_, OpenedCampaigns>) -> Vec<String> {
    std::mem::take(&mut *state.0.lock().expect("opened campaign state poisoned"))
}

// Learn more about Tauri commands at https://tauri.app/develop/calling-rust/
#[tauri::command]
fn greet(name: &str) -> String {
    format!("Hello, {}! You've been greeted from Rust!", name)
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .manage(OpenedCampaigns(Mutex::new(Vec::new())))
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_dialog::init())
        .invoke_handler(tauri::generate_handler![
            greet,
            open_campaign,
            save_campaign,
            images::convert_image_to_webp,
            take_opened_campaigns
        ])
        .build(tauri::generate_context!())
        .expect("error while building tauri application")
        .run(|app, event| {
            #[cfg(target_os = "macos")]
            if let tauri::RunEvent::Opened { urls } = event {
                use tauri::Emitter;

                let paths = urls
                    .into_iter()
                    .filter_map(|url| url.to_file_path().ok())
                    .filter_map(|path| path.to_str().map(str::to_owned))
                    .collect::<Vec<_>>();
                app.state::<OpenedCampaigns>()
                    .0
                    .lock()
                    .expect("opened campaign state poisoned")
                    .extend(paths.clone());
                let _ = app.emit("campaign-open-requested", paths);
            }

            #[cfg(not(target_os = "macos"))]
            let _ = (app, event);
        });
}

mod commands;

use commands::hotkeys::{register_hotkeys, update_hotkeys};
use commands::overlay::{get_overlay_position, hide_overlay, set_overlay_position, show_overlay};
use commands::soundboard::{delete_soundboard_file, save_soundboard_file};
use commands::sysinfo::{get_app_resource_usage, SysinfoState};
use commands::tray::{setup_tray, update_tray_icon};
use tauri::Manager;

// Learn more about Tauri commands at https://tauri.app/develop/calling-rust/
#[tauri::command]
fn greet(name: &str) -> String {
    format!("Hello, {}! You've been greeted from Rust!", name)
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_global_shortcut::Builder::new().build())
        .plugin(tauri_plugin_log::Builder::new().build())
        .manage(SysinfoState::default())
        .setup(|app| {
            let handle = app.handle().clone();
            setup_tray(handle.clone())?;
            register_hotkeys(handle);
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            greet,
            show_overlay,
            hide_overlay,
            set_overlay_position,
            get_overlay_position,
            update_tray_icon,
            get_app_resource_usage,
            update_hotkeys,
            save_soundboard_file,
            delete_soundboard_file
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}

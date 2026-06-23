use serde::Deserialize;
use tauri::{AppHandle, Emitter};
use tauri_plugin_global_shortcut::{GlobalShortcutExt, ShortcutState};

const HOTKEY_BINDINGS: &[(&str, &str)] = &[
    ("ctrl+shift+m", "hotkey-mute"),
    ("ctrl+shift+d", "hotkey-deafen"),
    ("ctrl+shift+o", "hotkey-overlay-toggle"),
    ("ctrl+shift+l", "hotkey-overlay-mode"),
    ("ctrl+shift+1", "hotkey-soundboard-1"),
    ("ctrl+shift+2", "hotkey-soundboard-2"),
    ("ctrl+shift+3", "hotkey-soundboard-3"),
    ("ctrl+shift+4", "hotkey-soundboard-4"),
    ("ctrl+shift+5", "hotkey-soundboard-5"),
];

#[derive(Deserialize)]
pub struct HotkeyMap {
    pub mute: String,
    pub deafen: String,
    #[serde(rename = "overlayToggle")]
    pub overlay_toggle: String,
    #[serde(rename = "overlayMode")]
    pub overlay_mode: String,
    pub soundboard1: String,
    pub soundboard2: String,
    pub soundboard3: String,
    pub soundboard4: String,
    pub soundboard5: String,
}

fn register_bindings(app: &AppHandle, bindings: &[(&str, &str)]) {
    for (shortcut, event_name) in bindings {
        let event_name = event_name.to_string();
        let app_handle = app.clone();
        let shortcut = *shortcut;

        let result = app
            .global_shortcut()
            .on_shortcut(shortcut, move |_app, _shortcut, event| {
                if event.state() == ShortcutState::Pressed {
                    let _ = app_handle.emit(&event_name, ());
                }
            });

        if let Err(error) = result {
            eprintln!("wisp: failed to register hotkey '{shortcut}': {error}");
        }
    }
}

pub fn register_hotkeys(app: AppHandle) {
    register_bindings(&app, HOTKEY_BINDINGS);
}

#[tauri::command]
pub fn update_hotkeys(app: AppHandle, hotkeys: HotkeyMap) -> Result<(), String> {
    app.global_shortcut()
        .unregister_all()
        .map_err(|error| error.to_string())?;

    let bindings: Vec<(&str, &str)> = vec![
        (hotkeys.mute.as_str(), "hotkey-mute"),
        (hotkeys.deafen.as_str(), "hotkey-deafen"),
        (hotkeys.overlay_toggle.as_str(), "hotkey-overlay-toggle"),
        (hotkeys.overlay_mode.as_str(), "hotkey-overlay-mode"),
        (hotkeys.soundboard1.as_str(), "hotkey-soundboard-1"),
        (hotkeys.soundboard2.as_str(), "hotkey-soundboard-2"),
        (hotkeys.soundboard3.as_str(), "hotkey-soundboard-3"),
        (hotkeys.soundboard4.as_str(), "hotkey-soundboard-4"),
        (hotkeys.soundboard5.as_str(), "hotkey-soundboard-5"),
    ];

    register_bindings(&app, &bindings);

    Ok(())
}

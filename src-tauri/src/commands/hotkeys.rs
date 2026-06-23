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

pub fn register_hotkeys(app: AppHandle) {
    for (shortcut, event_name) in HOTKEY_BINDINGS {
        let event_name = event_name.to_string();
        let app_handle = app.clone();

        let result = app
            .global_shortcut()
            .on_shortcut(*shortcut, move |_app, _shortcut, event| {
                if event.state() == ShortcutState::Pressed {
                    let _ = app_handle.emit(&event_name, ());
                }
            });

        if let Err(error) = result {
            eprintln!("wisp: failed to register hotkey '{shortcut}': {error}");
        }
    }
}

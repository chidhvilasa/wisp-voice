use crate::commands::topmost::{start_topmost_enforcement, stop_topmost_enforcement};
use serde::{Deserialize, Serialize};
use std::fs;
use std::path::PathBuf;
use tauri::{AppHandle, Emitter, Manager, PhysicalPosition, Position, WebviewWindow};

const OVERLAY_WINDOW_LABEL: &str = "overlay";
const OVERLAY_POSITION_FILE: &str = "overlay_pos.json";
const DEFAULT_X: i32 = 20;
const DEFAULT_Y: i32 = 20;

#[derive(Serialize, Deserialize)]
struct OverlayPosition {
    x: i32,
    y: i32,
}

fn overlay_window(app: &AppHandle) -> Result<WebviewWindow, String> {
    app.get_webview_window(OVERLAY_WINDOW_LABEL).ok_or_else(|| {
        let message = "overlay window not found".to_string();
        eprintln!("[wisp:overlay] {message}");
        message
    })
}

fn overlay_position_path(app: &AppHandle) -> Result<PathBuf, String> {
    let dir = app.path().app_data_dir().map_err(|e| e.to_string())?;
    if !dir.exists() {
        fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    }
    Ok(dir.join(OVERLAY_POSITION_FILE))
}

#[tauri::command]
pub fn show_overlay(app: AppHandle) -> Result<(), String> {
    let window = overlay_window(&app)?;

    match window.url() {
        Ok(mut url) => {
            url.set_path("/index.html");
            url.set_fragment(Some("/overlay"));
            if let Err(e) = window.navigate(url) {
                eprintln!("[wisp:overlay] failed to navigate overlay window: {e}");
            }
        }
        Err(e) => eprintln!("[wisp:overlay] failed to resolve overlay window URL: {e}"),
    }

    window.show().map_err(|e| {
        eprintln!("[wisp:overlay] failed to show overlay window: {e}");
        e.to_string()
    })?;

    // Windows in particular can drop always-on-top z-order once a window has
    // been hidden/shown again, so re-assert it every time the overlay is
    // revealed rather than relying solely on the one-time config value.
    if let Err(e) = window.set_always_on_top(true) {
        eprintln!("[wisp:overlay] failed to set always-on-top: {e}");
    }

    // The overlay's React tree may have mounted earlier (while the window
    // was still hidden/loading) and missed whatever state events fired
    // before it was ready to listen. Emitting this once the window is
    // actually visible lets Overlay.tsx re-fetch current state on demand
    // instead of depending on having caught every prior event.
    let _ = window.emit_to(OVERLAY_WINDOW_LABEL, "overlay-ready", ());

    // Tauri's alwaysOnTop alone doesn't reliably beat other windows fighting
    // for topmost status (this is most visible on Windows against games in
    // Borderless/Windowed mode). Keep re-asserting topmost via SetWindowPos
    // on a timer for as long as the overlay stays visible.
    if let Err(e) = start_topmost_enforcement(app.clone()) {
        eprintln!("[wisp:overlay] failed to start topmost enforcement: {e}");
    }

    Ok(())
}

#[tauri::command]
pub fn hide_overlay(app: AppHandle) -> Result<(), String> {
    let window = overlay_window(&app)?;
    window.hide().map_err(|e| e.to_string())?;
    stop_topmost_enforcement();
    Ok(())
}

#[tauri::command]
pub fn set_overlay_position(app: AppHandle, x: i32, y: i32) -> Result<(), String> {
    let window = overlay_window(&app)?;
    // x/y arrive as physical pixels (Tauri's JS `currentMonitor()` reports
    // PhysicalPosition/PhysicalSize), so they must be applied as a physical
    // position. Using a logical position here would scale them again by the
    // monitor's DPI factor, which is barely noticeable near the top-left
    // origin but throws far corners off-screen on scaled displays.
    window
        .set_position(Position::Physical(PhysicalPosition::new(x, y)))
        .map_err(|e| e.to_string())?;

    let path = overlay_position_path(&app)?;
    let json = serde_json::to_string(&OverlayPosition { x, y }).map_err(|e| e.to_string())?;
    fs::write(path, json).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn get_overlay_position(app: AppHandle) -> (i32, i32) {
    let path = match overlay_position_path(&app) {
        Ok(path) => path,
        Err(_) => return (DEFAULT_X, DEFAULT_Y),
    };

    if !path.exists() {
        return (DEFAULT_X, DEFAULT_Y);
    }

    fs::read_to_string(&path)
        .ok()
        .and_then(|contents| serde_json::from_str::<OverlayPosition>(&contents).ok())
        .map(|position| (position.x, position.y))
        .unwrap_or((DEFAULT_X, DEFAULT_Y))
}

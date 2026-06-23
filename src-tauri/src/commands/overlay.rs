use serde::{Deserialize, Serialize};
use std::fs;
use std::path::PathBuf;
use tauri::{AppHandle, LogicalPosition, Manager, Position, WebviewWindow};

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
    app.get_webview_window(OVERLAY_WINDOW_LABEL)
        .ok_or_else(|| "overlay window not found".to_string())
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
    window.show().map_err(|e| e.to_string())
}

#[tauri::command]
pub fn hide_overlay(app: AppHandle) -> Result<(), String> {
    let window = overlay_window(&app)?;
    window.hide().map_err(|e| e.to_string())
}

#[tauri::command]
pub fn set_overlay_position(app: AppHandle, x: i32, y: i32) -> Result<(), String> {
    let window = overlay_window(&app)?;
    window
        .set_position(Position::Logical(LogicalPosition::new(
            f64::from(x),
            f64::from(y),
        )))
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

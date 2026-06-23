use base64::{engine::general_purpose, Engine as _};
use std::fs;
use std::path::PathBuf;
use tauri::{AppHandle, Manager};

#[tauri::command]
pub fn save_soundboard_file(
    app: AppHandle,
    index: u8,
    data: String,
    filename: String,
) -> Result<String, String> {
    let bytes = general_purpose::STANDARD
        .decode(data)
        .map_err(|error| error.to_string())?;

    let dir = app.path().app_data_dir().map_err(|error| error.to_string())?;
    fs::create_dir_all(&dir).map_err(|error| error.to_string())?;

    let safe_filename = filename.replace(['/', '\\'], "_");
    let path: PathBuf = dir.join(format!("soundboard_{index}_{safe_filename}"));

    fs::write(&path, bytes).map_err(|error| error.to_string())?;

    Ok(path.to_string_lossy().to_string())
}

#[tauri::command]
pub fn delete_soundboard_file(path: String) -> Result<(), String> {
    let path = PathBuf::from(path);
    if path.exists() {
        fs::remove_file(&path).map_err(|error| error.to_string())?;
    }
    Ok(())
}

use serde::Serialize;
use std::sync::Mutex;
use sysinfo::System;
use tauri::State;

#[derive(Default)]
pub struct SysinfoState(Mutex<System>);

#[derive(Serialize)]
pub struct ResourceUsage {
    cpu_percent: f32,
    ram_mb: u64,
}

#[tauri::command]
pub fn get_app_resource_usage(state: State<SysinfoState>) -> Result<ResourceUsage, String> {
    let pid = sysinfo::get_current_pid().map_err(|err| err.to_string())?;
    let mut system = state.0.lock().map_err(|err| err.to_string())?;
    system.refresh_processes(sysinfo::ProcessesToUpdate::Some(&[pid]), true);

    let process = system
        .process(pid)
        .ok_or_else(|| "Current process not found".to_string())?;

    Ok(ResourceUsage {
        cpu_percent: process.cpu_usage(),
        ram_mb: process.memory() / (1024 * 1024),
    })
}

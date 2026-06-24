use serde::Serialize;
use std::collections::HashSet;
use std::sync::{Arc, Mutex, OnceLock};
use std::thread;
use std::time::Duration;
use sysinfo::{Pid, System};
use tauri::State;

/// A full system-wide process scan (needed to discover new/exited WebView2
/// helper processes) costs far more than refreshing a known set of PIDs.
/// Doing it inline on the polled command would occasionally make a 2s poll
/// tick spike well past the app's CPU budget, so it instead runs on its own
/// background thread on a slow, independent cadence and just publishes the
/// discovered PID set for the hot path to read.
const REDISCOVERY_INTERVAL: Duration = Duration::from_secs(60);

#[derive(Default)]
pub struct SysinfoState {
    system: Mutex<System>,
    known_pids: Arc<Mutex<HashSet<Pid>>>,
    discovery_started: OnceLock<()>,
}

#[derive(Serialize)]
pub struct ResourceUsage {
    cpu_percent: f32,
    ram_mb: u64,
}

/// Walks the process table to find every descendant of `root` (the WebView2
/// renderer/gpu/network/crashpad helper processes on Windows), so the
/// reported totals match what Task Manager groups under the app's name
/// instead of just the slim Rust host process.
fn discover_process_tree(system: &System, root: Pid) -> HashSet<Pid> {
    let mut tree = HashSet::new();
    tree.insert(root);

    loop {
        let mut added = false;
        for (pid, process) in system.processes() {
            if tree.contains(pid) {
                continue;
            }
            if let Some(parent) = process.parent() {
                if tree.contains(&parent) {
                    tree.insert(*pid);
                    added = true;
                }
            }
        }
        if !added {
            break;
        }
    }

    tree
}

fn ensure_discovery_thread(state: &SysinfoState, root: Pid) {
    if state.discovery_started.set(()).is_err() {
        return;
    }
    let known_pids = Arc::clone(&state.known_pids);
    thread::spawn(move || {
        let mut system = System::new();
        loop {
            system.refresh_processes(sysinfo::ProcessesToUpdate::All, true);
            let tree = discover_process_tree(&system, root);
            if let Ok(mut guard) = known_pids.lock() {
                *guard = tree;
            }
            thread::sleep(REDISCOVERY_INTERVAL);
        }
    });
}

#[tauri::command]
pub fn get_app_resource_usage(state: State<SysinfoState>) -> Result<ResourceUsage, String> {
    let pid = sysinfo::get_current_pid().map_err(|err| err.to_string())?;
    ensure_discovery_thread(&state, pid);

    let mut system = state.system.lock().map_err(|err| err.to_string())?;
    let known_pids = state.known_pids.lock().map_err(|err| err.to_string())?;

    let pids: Vec<Pid> = if known_pids.is_empty() {
        vec![pid]
    } else {
        known_pids.iter().copied().collect()
    };
    system.refresh_processes(sysinfo::ProcessesToUpdate::Some(&pids), true);

    if system.process(pid).is_none() {
        return Err("Current process not found".to_string());
    }

    let mut cpu_percent = 0.0f32;
    let mut ram_bytes = 0u64;
    for tree_pid in &pids {
        if let Some(process) = system.process(*tree_pid) {
            cpu_percent += process.cpu_usage();
            ram_bytes += process.memory();
        }
    }

    Ok(ResourceUsage {
        cpu_percent,
        ram_mb: ram_bytes / (1024 * 1024),
    })
}

use std::sync::atomic::{AtomicBool, AtomicIsize, Ordering};
use std::thread;
use std::time::Duration;
use tauri::{AppHandle, Manager};

const OVERLAY_WINDOW_LABEL: &str = "overlay";
const ENFORCEMENT_INTERVAL_MS: u64 = 1000;

// Tracks whether an enforcement loop should keep running, and the hwnd it
// should act on. A single background thread is reused across
// start/stop/start cycles rather than spawning a fresh one each time the
// overlay is toggled.
static ENFORCEMENT_RUNNING: AtomicBool = AtomicBool::new(false);
static ENFORCEMENT_HWND: AtomicIsize = AtomicIsize::new(0);
static THREAD_SPAWNED: AtomicBool = AtomicBool::new(false);

#[cfg(windows)]
pub fn force_topmost(hwnd: isize) {
    use windows::Win32::Foundation::HWND;
    use windows::Win32::UI::WindowsAndMessaging::{
        SetWindowPos, HWND_TOPMOST, SWP_NOACTIVATE, SWP_NOMOVE, SWP_NOSIZE,
    };
    unsafe {
        let _ = SetWindowPos(
            HWND(hwnd as *mut _),
            HWND_TOPMOST,
            0,
            0,
            0,
            0,
            SWP_NOMOVE | SWP_NOSIZE | SWP_NOACTIVATE,
        );
    }
}

#[cfg(not(windows))]
pub fn force_topmost(_hwnd: isize) {}

fn ensure_loop_thread_running() {
    if THREAD_SPAWNED
        .compare_exchange(false, true, Ordering::SeqCst, Ordering::SeqCst)
        .is_err()
    {
        return;
    }

    thread::spawn(|| loop {
        thread::sleep(Duration::from_millis(ENFORCEMENT_INTERVAL_MS));
        if !ENFORCEMENT_RUNNING.load(Ordering::SeqCst) {
            continue;
        }
        let hwnd = ENFORCEMENT_HWND.load(Ordering::SeqCst);
        if hwnd != 0 {
            force_topmost(hwnd);
        }
    });
}

#[tauri::command]
pub fn start_topmost_enforcement(app: AppHandle) -> Result<(), String> {
    let window = app
        .get_webview_window(OVERLAY_WINDOW_LABEL)
        .ok_or_else(|| "overlay window not found".to_string())?;

    #[cfg(windows)]
    {
        let hwnd = window.hwnd().map_err(|e| e.to_string())?;
        ENFORCEMENT_HWND.store(hwnd.0 as isize, Ordering::SeqCst);
        // Apply once immediately rather than waiting for the first tick.
        force_topmost(hwnd.0 as isize);
    }
    #[cfg(not(windows))]
    {
        let _ = &window;
    }

    ENFORCEMENT_RUNNING.store(true, Ordering::SeqCst);
    ensure_loop_thread_running();
    Ok(())
}

#[tauri::command]
pub fn stop_topmost_enforcement() {
    ENFORCEMENT_RUNNING.store(false, Ordering::SeqCst);
}

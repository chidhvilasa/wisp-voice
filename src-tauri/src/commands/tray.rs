use tauri::{
    menu::{CheckMenuItem, Menu, MenuItem, PredefinedMenuItem},
    tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent},
    AppHandle, Emitter, Manager, Wry,
};

const TRAY_ID: &str = "wisp-tray";

struct TrayMenuHandles {
    mute_item: CheckMenuItem<Wry>,
    deafen_item: CheckMenuItem<Wry>,
}

pub fn setup_tray(app: AppHandle) -> tauri::Result<()> {
    let open_item = MenuItem::with_id(&app, "open", "Open Wisp", true, None::<&str>)?;
    let mute_item = CheckMenuItem::with_id(&app, "mute", "Mute", true, false, None::<&str>)?;
    let deafen_item = CheckMenuItem::with_id(&app, "deafen", "Deafen", true, false, None::<&str>)?;
    let leave_item = MenuItem::with_id(&app, "leave", "Leave Room", true, None::<&str>)?;
    let quit_item = MenuItem::with_id(&app, "quit", "Quit", true, None::<&str>)?;
    let separator_top = PredefinedMenuItem::separator(&app)?;
    let separator_bottom = PredefinedMenuItem::separator(&app)?;

    let menu = Menu::with_items(
        &app,
        &[
            &open_item,
            &mute_item,
            &deafen_item,
            &separator_top,
            &leave_item,
            &separator_bottom,
            &quit_item,
        ],
    )?;

    TrayIconBuilder::with_id(TRAY_ID)
        .menu(&menu)
        .tooltip("Wisp")
        .icon(app.default_window_icon().cloned().expect("default window icon must be set"))
        .on_menu_event(|app, event| match event.id().as_ref() {
            "open" => {
                if let Some(window) = app.get_webview_window("main") {
                    let _ = window.show();
                    let _ = window.set_focus();
                }
            }
            "mute" => {
                let _ = app.emit("tray-toggle-mute", ());
            }
            "deafen" => {
                let _ = app.emit("tray-toggle-deafen", ());
            }
            "leave" => {
                let _ = app.emit("tray-leave-room", ());
            }
            "quit" => {
                app.exit(0);
            }
            _ => {}
        })
        .on_tray_icon_event(|tray, event| {
            if let TrayIconEvent::Click {
                button: MouseButton::Left,
                button_state: MouseButtonState::Up,
                ..
            } = event
            {
                let app = tray.app_handle();
                if let Some(window) = app.get_webview_window("main") {
                    let _ = window.show();
                    let _ = window.set_focus();
                }
            }
        })
        .build(&app)?;

    app.manage(TrayMenuHandles {
        mute_item,
        deafen_item,
    });

    Ok(())
}

#[tauri::command]
pub fn update_tray_icon(app: AppHandle, muted: bool, deafened: bool) -> Result<(), String> {
    if let Some(handles) = app.try_state::<TrayMenuHandles>() {
        handles.mute_item.set_checked(muted).map_err(|error| error.to_string())?;
        handles
            .deafen_item
            .set_checked(deafened)
            .map_err(|error| error.to_string())?;
    }

    let mut tooltip = String::from("Wisp");
    if muted {
        tooltip.push_str(" (Muted)");
    }
    if deafened {
        tooltip.push_str(" (Deafened)");
    }

    if let Some(tray) = app.tray_by_id(TRAY_ID) {
        tray.set_tooltip(Some(tooltip.as_str())).map_err(|error| error.to_string())?;
    }

    Ok(())
}

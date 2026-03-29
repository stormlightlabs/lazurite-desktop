use tauri::{
    menu::{Menu, MenuItem},
    tray::{MouseButton, TrayIconBuilder, TrayIconEvent},
    AppHandle, Emitter, Manager, WebviewWindow,
};
use tauri_plugin_global_shortcut::{Code, GlobalShortcutExt, Modifiers, Shortcut};

const COMPOSER_OPEN_EVENT: &str = "composer:open";
const MENU_NEW_POST: &str = "new_post";
const MENU_TOGGLE_WINDOW: &str = "toggle_window";
const MENU_QUIT: &str = "quit";

pub fn setup_tray(app: &AppHandle) -> Result<(), Box<dyn std::error::Error>> {
    let new_post_i = MenuItem::with_id(app, MENU_NEW_POST, "New Post…", true, None::<&str>)?;
    let toggle_window_i = MenuItem::with_id(app, MENU_TOGGLE_WINDOW, "Show / Hide", true, None::<&str>)?;
    let quit_i = MenuItem::with_id(app, MENU_QUIT, "Quit", true, None::<&str>)?;

    let menu = Menu::with_items(app, &[&new_post_i, &toggle_window_i, &quit_i])?;

    let tray = TrayIconBuilder::new()
        .icon(app.default_window_icon().unwrap().clone())
        .menu(&menu)
        .show_menu_on_left_click(false)
        .on_menu_event(|app, event| match event.id().as_ref() {
            MENU_NEW_POST => {
                show_window_and_emit(app, COMPOSER_OPEN_EVENT);
            }
            MENU_TOGGLE_WINDOW => {
                toggle_window_visibility(app);
            }
            MENU_QUIT => {
                app.exit(0);
            }
            _ => {}
        })
        .on_tray_icon_event(|tray, event| {
            if let TrayIconEvent::Click { button: MouseButton::Left, .. } = event {
                toggle_window_visibility(tray.app_handle());
            }
        })
        .build(app)?;

    app.manage(tray);

    Ok(())
}

pub fn setup_global_shortcut(app: &AppHandle) -> Result<(), Box<dyn std::error::Error>> {
    let shortcut = Shortcut::new(Some(Modifiers::CONTROL | Modifiers::SHIFT), Code::KeyN);

    app.global_shortcut().on_shortcut(shortcut, |app, _shortcut, _event| {
        show_window_and_emit(app, COMPOSER_OPEN_EVENT);
    })?;

    Ok(())
}

fn toggle_window_visibility(app: &AppHandle) {
    if let Some(window) = app.get_webview_window("main") {
        if is_window_visible(&window) {
            let _ = window.hide();
        } else {
            let _ = window.unminimize();
            let _ = window.show();
            let _ = window.set_focus();
        }
    }
}

fn is_window_visible(window: &WebviewWindow) -> bool {
    window.is_visible().unwrap_or(false) && !window.is_minimized().unwrap_or(false)
}

fn show_window_and_emit(app: &AppHandle, event: &str) {
    if let Some(window) = app.get_webview_window("main") {
        let _ = window.unminimize();
        let _ = window.show();
        let _ = window.set_focus();
    }

    let _ = app.emit(event, ());
}

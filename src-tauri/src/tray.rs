use crate::error::{AppError, Result as AppResult};
use crate::settings;
use crate::state::AppState;
use std::sync::Mutex;
use tauri::{
    image::Image,
    menu::{Menu, MenuItem},
    tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent},
    AppHandle, Manager, WebviewUrl, WebviewWindow, WebviewWindowBuilder,
};
use tauri_plugin_global_shortcut::{GlobalShortcutExt, Shortcut, ShortcutState};
use tauri_plugin_log::log;

const COMPOSER_WINDOW_LABEL: &str = "composer";
const APP_INDEX_PATH: &str = "index.html";
const COMPOSER_HASH_ROUTE: &str = "#/composer";
const COMPOSER_INIT_SCRIPT: &str = r#"
if (window.location.hash !== '#/composer') {
    window.location.replace(`${window.location.pathname}${window.location.search}#/composer`);
}
"#;
const MAIN_WINDOW_LABEL: &str = "main";
const MENU_NEW_POST: &str = "new_post";
const MENU_TOGGLE_WINDOW: &str = "toggle_window";
const MENU_QUIT: &str = "quit";
const DEFAULT_GLOBAL_SHORTCUT: &str = "Ctrl+Shift+N";

#[derive(Default)]
struct ComposerShortcutState {
    current_shortcut: Mutex<Option<String>>,
}

pub fn setup_tray(app: &AppHandle) -> std::result::Result<(), Box<dyn std::error::Error>> {
    let new_post_i = MenuItem::with_id(app, MENU_NEW_POST, "New Post…", true, None::<&str>)?;
    let toggle_window_i = MenuItem::with_id(app, MENU_TOGGLE_WINDOW, "Show / Hide", true, None::<&str>)?;
    let quit_i = MenuItem::with_id(app, MENU_QUIT, "Quit", true, None::<&str>)?;

    let menu = Menu::with_items(app, &[&new_post_i, &toggle_window_i, &quit_i])?;
    let tray_icon = Image::from_bytes(include_bytes!("../../public/tray-icon.png"))?;

    let tray = TrayIconBuilder::new()
        .icon(tray_icon)
        .menu(&menu)
        .show_menu_on_left_click(false)
        .on_menu_event(|app, event| match event.id().as_ref() {
            MENU_NEW_POST => {
                let _ = open_composer_window(app);
            }
            MENU_TOGGLE_WINDOW => toggle_window_visibility(app),
            MENU_QUIT => app.exit(0),
            _ => {}
        })
        .on_tray_icon_event(|tray, event| {
            if let TrayIconEvent::Click { button: MouseButton::Left, button_state: MouseButtonState::Up, .. } = event {
                let _ = open_composer_window(tray.app_handle());
            }
        })
        .build(app)?;

    app.manage(tray);

    Ok(())
}

pub fn setup_global_shortcut(app: &AppHandle) -> std::result::Result<(), Box<dyn std::error::Error>> {
    app.manage(ComposerShortcutState::default());
    sync_global_shortcut(app)?;
    Ok(())
}

pub fn sync_global_shortcut(app: &AppHandle) -> AppResult<()> {
    let configured_shortcut = app
        .try_state::<AppState>()
        .and_then(|state| {
            settings::get_settings(&state)
                .ok()
                .map(|settings| settings.global_shortcut)
        })
        .unwrap_or_else(|| DEFAULT_GLOBAL_SHORTCUT.to_string());

    update_global_shortcut(app, &configured_shortcut)
}

pub fn update_global_shortcut(app: &AppHandle, shortcut: &str) -> AppResult<()> {
    let shortcut = shortcut.trim();
    if shortcut.is_empty() {
        return Err(AppError::validation("global shortcut must not be empty"));
    }

    let parsed_shortcut: Shortcut = shortcut
        .parse()
        .map_err(|error| AppError::validation(format!("invalid global shortcut '{shortcut}': {error}")))?;

    let shortcut_state = app.state::<ComposerShortcutState>();
    let mut current_shortcut = shortcut_state
        .current_shortcut
        .lock()
        .map_err(|_| AppError::StatePoisoned("composer_shortcut"))?;

    if current_shortcut.as_deref() == Some(shortcut) {
        return Ok(());
    }

    if let Some(existing_shortcut) = current_shortcut.as_ref() {
        let existing_shortcut = existing_shortcut
            .parse::<Shortcut>()
            .map_err(|error| AppError::validation(format!("invalid registered global shortcut: {error}")))?;
        app.global_shortcut().unregister(existing_shortcut).map_err(|error| {
            AppError::validation(format!(
                "failed to unregister existing global shortcut '{}': {error}",
                current_shortcut.as_deref().unwrap_or_default()
            ))
        })?;
    }

    app.global_shortcut()
        .on_shortcut(parsed_shortcut, |app, _, event| {
            if event.state == ShortcutState::Pressed {
                let _ = open_composer_window(app);
            }
        })
        .map_err(|error| AppError::validation(format!("failed to register global shortcut '{shortcut}': {error}")))?;

    log::info!("registered global composer shortcut: {shortcut}");
    *current_shortcut = Some(shortcut.to_string());
    Ok(())
}

fn toggle_window_visibility(app: &AppHandle) {
    if let Some(window) = app.get_webview_window(MAIN_WINDOW_LABEL) {
        if is_window_visible(&window) {
            let _ = window.hide();
        } else {
            show_window(&window);
        }
    }
}

fn is_window_visible(window: &WebviewWindow) -> bool {
    window.is_visible().unwrap_or(false) && !window.is_minimized().unwrap_or(false)
}

fn open_composer_window(app: &AppHandle) -> std::result::Result<(), Box<dyn std::error::Error>> {
    if let Some(window) = app.get_webview_window(COMPOSER_WINDOW_LABEL) {
        route_window_to_composer(&window);
        show_window(&window);
        return Ok(());
    }

    let window = WebviewWindowBuilder::new(app, COMPOSER_WINDOW_LABEL, WebviewUrl::App(APP_INDEX_PATH.into()))
        .initialization_script(COMPOSER_INIT_SCRIPT)
        .title("New Post")
        .inner_size(720.0, 640.0)
        .min_inner_size(560.0, 420.0)
        .resizable(true)
        .center()
        .build()?;

    show_window(&window);

    Ok(())
}

fn route_window_to_composer(window: &WebviewWindow) {
    let _ = window.eval(format!(
        "if (window.location.hash !== '{COMPOSER_HASH_ROUTE}') {{ window.location.hash = '/composer'; }}"
    ));
}

fn show_window(window: &WebviewWindow) {
    let _ = window.unminimize();
    let _ = window.show();
    let _ = window.set_focus();
}

use tauri::{
    image::Image,
    menu::{Menu, MenuItem},
    tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent},
    AppHandle, Manager, WebviewUrl, WebviewWindow, WebviewWindowBuilder,
};
use tauri_plugin_global_shortcut::{Code, GlobalShortcutExt, Modifiers, Shortcut, ShortcutState};

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

pub fn setup_tray(app: &AppHandle) -> Result<(), Box<dyn std::error::Error>> {
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

pub fn setup_global_shortcut(app: &AppHandle) -> Result<(), Box<dyn std::error::Error>> {
    let shortcut = Shortcut::new(Some(Modifiers::CONTROL | Modifiers::SHIFT), Code::KeyN);

    app.global_shortcut().on_shortcut(shortcut, |app, _, event| {
        if event.state == ShortcutState::Pressed {
            let _ = open_composer_window(app);
        }
    })?;

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

fn open_composer_window(app: &AppHandle) -> Result<(), Box<dyn std::error::Error>> {
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

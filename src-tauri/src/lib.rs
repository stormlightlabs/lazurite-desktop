mod auth;
mod commands;
mod db;
mod error;
mod state;

use auth::emit_at_uri_navigation;
use commands::{get_app_bootstrap, list_accounts, login, logout, set_active_account, switch_account};
use db::initialize_database;
use state::AppState;
use tauri::Manager;
use tauri_plugin_deep_link::DeepLinkExt;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .setup(|app| {
            let db_pool =
                initialize_database(app.handle()).expect("database initialization should succeed during startup");
            let app_state = tauri::async_runtime::block_on(AppState::bootstrap(db_pool))
                .expect("application state should be bootstrapped from database");

            app.manage(app_state);

            let app_handle = app.handle().clone();
            app.deep_link().on_open_url(move |event| {
                for url in event.urls() {
                    let _ = emit_at_uri_navigation(&app_handle, url.as_str());
                }
            });

            if let Some(urls) = app.deep_link().get_current()? {
                for url in urls {
                    emit_at_uri_navigation(app.handle(), url.as_str())?;
                }
            }

            Ok(())
        })
        .plugin(tauri_plugin_notification::init())
        .plugin(
            tauri_plugin_log::Builder::new()
                .level(tauri_plugin_log::log::LevelFilter::Info)
                .build(),
        )
        .plugin(tauri_plugin_deep_link::init())
        .plugin(tauri_plugin_opener::init())
        .invoke_handler(tauri::generate_handler![
            get_app_bootstrap,
            list_accounts,
            login,
            logout,
            switch_account,
            set_active_account
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}

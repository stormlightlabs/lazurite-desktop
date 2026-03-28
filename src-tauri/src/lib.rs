mod commands;
mod db;
mod error;
mod state;

use commands::{get_app_bootstrap, list_accounts, set_active_account};
use db::initialize_database;
use state::AppState;
use tauri::Manager;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .setup(|app| {
            let db_pool =
                initialize_database(app.handle()).expect("database initialization should succeed during startup");
            let app_state =
                AppState::bootstrap(db_pool).expect("application state should be bootstrapped from database");

            app.manage(app_state);
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
            set_active_account
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}

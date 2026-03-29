mod auth;
mod commands;
mod db;
mod error;
mod feed;
mod state;
mod tray;

use auth::emit_at_uri_navigation;
use commands as cmd;
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

            #[cfg(not(any(target_os = "android", target_os = "ios")))]
            {
                tray::setup_tray(app.handle())?;
                tray::setup_global_shortcut(app.handle())?;
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
        .plugin(tauri_plugin_global_shortcut::Builder::new().build())
        .invoke_handler(tauri::generate_handler![
            cmd::get_app_bootstrap,
            cmd::list_accounts,
            cmd::login,
            cmd::logout,
            cmd::switch_account,
            cmd::set_active_account,
            cmd::search_login_suggestions,
            cmd::get_preferences,
            cmd::get_feed_generators,
            cmd::get_timeline,
            cmd::get_feed,
            cmd::get_list_feed,
            cmd::get_post_thread,
            cmd::get_author_feed,
            cmd::create_post,
            cmd::like_post,
            cmd::unlike_post,
            cmd::repost,
            cmd::unrepost,
            cmd::update_saved_feeds,
            cmd::update_feed_view_pref
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}

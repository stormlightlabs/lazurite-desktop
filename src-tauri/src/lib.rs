mod auth;
mod commands;
mod db;
mod error;
mod explorer;
mod feed;
mod notifications;
mod search;
mod state;
mod tray;

use commands as cmd;
use db::initialize_database;
use state::AppState;
use tauri::Manager;
use tauri_plugin_deep_link::DeepLinkExt;
use tauri_plugin_log::log;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .setup(|app| {
            let db_pool =
                initialize_database(app.handle()).expect("database initialization should succeed during startup");
            let app_state = tauri::async_runtime::block_on(AppState::bootstrap(db_pool))
                .expect("application state should be bootstrapped from database");

            app.manage(app_state);

            AppState::spawn_token_refresh_task(app.handle().clone());
            notifications::spawn_notification_poll_task(app.handle().clone());

            let app_handle = app.handle().clone();
            app.deep_link().on_open_url(move |event| {
                for url in event.urls() {
                    let raw = url.to_string();
                    let handle = app_handle.clone();
                    tauri::async_runtime::spawn(async move {
                        if let Err(error) = explorer::emit_explorer_navigation(&handle, &raw).await {
                            log::error!("failed to resolve deep-link explorer target for {raw}: {error}");
                        }
                    });
                }
            });

            if let Some(urls) = app.deep_link().get_current()? {
                for url in urls {
                    let raw = url.to_string();
                    tauri::async_runtime::block_on(explorer::emit_explorer_navigation(app.handle(), &raw))?;
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
            cmd::update_feed_view_pref,
            cmd::list_notifications,
            cmd::update_seen,
            cmd::get_unread_count,
            cmd::explorer::resolve_input,
            cmd::explorer::describe_server,
            cmd::explorer::describe_repo,
            cmd::explorer::list_records,
            cmd::explorer::get_record,
            cmd::explorer::export_repo_car,
            cmd::explorer::query_labels,
            cmd::search::search_posts_network,
            cmd::search::search_actors,
            cmd::search::search_starter_packs,
            cmd::search::sync_posts,
            cmd::search::get_sync_status,
            cmd::search::embed_pending_posts,
            cmd::search::reindex_embeddings,
            cmd::search::set_embeddings_enabled
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}

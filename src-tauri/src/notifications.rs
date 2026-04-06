use super::auth::LazuriteOAuthSession;
use super::error::{log_error_chain, log_warn_chain, AppError, Result};
use super::settings::{self, AppSettings};
use super::state::AppState;
use jacquard::api::app_bsky::notification::get_unread_count::GetUnreadCount;
use jacquard::api::app_bsky::notification::list_notifications::ListNotifications;
use jacquard::api::app_bsky::notification::update_seen::UpdateSeen;
use jacquard::types::datetime::Datetime;
use jacquard::xrpc::XrpcClient;
use std::collections::VecDeque;
use std::sync::Arc;
use std::time::Duration;
use tauri::{AppHandle, Emitter, Manager};
use tauri_plugin_log::log;
use tauri_plugin_notification::NotificationExt;

pub const NOTIFICATIONS_UNREAD_COUNT_EVENT: &str = "notifications:unread-count";

const MAIN_WINDOW_LABEL: &str = "main";
const POLL_INITIAL_DELAY: Duration = Duration::from_secs(5);
const POLL_INTERVAL: Duration = Duration::from_secs(30);
const MAX_SYSTEM_NOTIFICATIONS: usize = 3;
const MAX_TRACKED_NOTIFICATION_URIS: usize = 128;

async fn get_session(state: &AppState) -> Result<Arc<LazuriteOAuthSession>> {
    let did = state
        .active_session
        .read()
        .map_err(|error| {
            log::error!("active_session poisoned: {error}");
            AppError::StatePoisoned("active_session")
        })?
        .as_ref()
        .ok_or_else(|| {
            log::error!("no active account");
            AppError::Validation("no active account".into())
        })?
        .did
        .clone();

    state
        .sessions
        .read()
        .map_err(|error| {
            log::error!("sessions poisoned: {error}");
            AppError::StatePoisoned("sessions")
        })?
        .get(&did)
        .cloned()
        .ok_or_else(|| {
            log::error!("session not found for active account");
            AppError::Validation("session not found for active account".into())
        })
}

fn active_session_did(state: &AppState) -> Result<Option<String>> {
    Ok(state
        .active_session
        .read()
        .map_err(|error| {
            log::error!("active_session poisoned: {error}");
            AppError::StatePoisoned("active_session")
        })?
        .as_ref()
        .map(|session| session.did.clone()))
}

pub async fn list_notifications(cursor: Option<String>, state: &AppState) -> Result<serde_json::Value> {
    let session = get_session(state).await?;
    let mut req = ListNotifications::new().limit(50i64);
    if let Some(c) = &cursor {
        req = req.cursor(Some(c.as_str().into()));
    }

    let output = session
        .send(req.build())
        .await
        .map_err(|error| {
            log_error_chain("listNotifications error", &error);
            AppError::validation("listNotifications error")
        })?
        .into_output()
        .map_err(|error| {
            log_error_chain("listNotifications output error", &error);
            AppError::validation("listNotifications output error")
        })?;

    serde_json::to_value(&output).map_err(AppError::from)
}

pub async fn update_seen(state: &AppState) -> Result<()> {
    let session = get_session(state).await?;

    let response = session
        .send(UpdateSeen::new().seen_at(Datetime::now()).build())
        .await
        .map_err(|error| {
            log_error_chain("updateSeen error", &error);
            AppError::validation("updateSeen error")
        })?;

    if response.status().is_success() {
        return Ok(());
    }

    response.into_output().map_err(|error| {
        log_error_chain("updateSeen output error", &error);
        AppError::validation("updateSeen output error")
    })?;

    Ok(())
}

pub async fn get_unread_count(state: &AppState) -> Result<i64> {
    let session = get_session(state).await?;

    let output = session
        .send(GetUnreadCount::new().build())
        .await
        .map_err(|error| {
            log_warn_chain("getUnreadCount error", &error);
            AppError::Validation("getUnreadCount error".into())
        })?
        .into_output()
        .map_err(|error| {
            log_warn_chain("getUnreadCount output error", &error);
            AppError::Validation("getUnreadCount output error".into())
        })?;

    Ok(output.count)
}

/// Returns a human-readable system notification body for a mention notification,
/// or `None` if the reason is not one that warrants a system notification.
pub fn mention_notification_body(reason: &str, handle: &str) -> Option<String> {
    match reason {
        "mention" => Some(format!("@{handle} mentioned you")),
        "reply" => Some(format!("@{handle} replied to you")),
        "quote" => Some(format!("@{handle} quoted your post")),
        _ => None,
    }
}

fn is_main_window_focused(app: &AppHandle) -> bool {
    app.get_webview_window(MAIN_WINDOW_LABEL)
        .and_then(|w| w.is_focused().ok())
        .unwrap_or(false)
}

fn load_notification_settings(state: &AppState) -> AppSettings {
    match settings::get_settings(state) {
        Ok(settings) => settings,
        Err(error) => {
            log::warn!("failed to load notification settings, using defaults: {error}");
            AppSettings::default()
        }
    }
}

pub fn clear_unread_badge(app: &AppHandle) {
    if let Some(window) = app.get_webview_window(MAIN_WINDOW_LABEL) {
        if let Err(error) = window.set_badge_count(None) {
            log::debug!("failed to clear unread badge: {error}");
        }
    }
}

fn sync_unread_badge(app: &AppHandle, badge_enabled: bool, count: i64) {
    let badge_count = if badge_enabled && count > 0 { Some(count) } else { None };

    if let Some(window) = app.get_webview_window(MAIN_WINDOW_LABEL) {
        if let Err(error) = window.set_badge_count(badge_count) {
            log::debug!("failed to update unread badge: {error}");
        }
    }
}

fn collect_new_mention_notifications(
    notifications_value: &serde_json::Value, notified_uris: &VecDeque<String>,
) -> Vec<(String, String)> {
    let Some(notifications) = notifications_value.get("notifications").and_then(|v| v.as_array()) else {
        return Vec::new();
    };

    let mut new_mentions = Vec::new();

    for notification in notifications {
        if new_mentions.len() >= MAX_SYSTEM_NOTIFICATIONS {
            break;
        }

        let is_read = notification.get("isRead").and_then(|v| v.as_bool()).unwrap_or(true);
        if is_read {
            continue;
        }

        let reason = notification.get("reason").and_then(|v| v.as_str()).unwrap_or("");
        let handle = notification
            .get("author")
            .and_then(|v| v.get("handle"))
            .and_then(|v| v.as_str())
            .unwrap_or("someone");

        let Some(body) = mention_notification_body(reason, handle) else {
            continue;
        };

        let Some(uri) = notification.get("uri").and_then(|v| v.as_str()) else {
            continue;
        };

        if notified_uris.iter().any(|existing| existing == uri) {
            continue;
        }

        new_mentions.push((uri.to_owned(), body));
    }

    new_mentions
}

fn remember_notified_uri(notified_uris: &mut VecDeque<String>, uri: String) {
    if notified_uris.iter().any(|existing| existing == &uri) {
        return;
    }

    notified_uris.push_front(uri);

    while notified_uris.len() > MAX_TRACKED_NOTIFICATION_URIS {
        notified_uris.pop_back();
    }
}

fn send_mention_system_notifications(
    app: &AppHandle, notifications_value: &serde_json::Value, notified_uris: &mut VecDeque<String>,
) {
    for (uri, body) in collect_new_mention_notifications(notifications_value, notified_uris) {
        match app.notification().builder().title("Lazurite").body(body).show() {
            Ok(_) => remember_notified_uri(notified_uris, uri),
            Err(error) => log::warn!("failed to show system notification: {error}"),
        }
    }
}

/// Spawns a background task that polls for new notifications every 30 seconds
/// and emits a `notifications:unread-count` event when the count changes.
/// System notifications are shown for new mentions when the app is not focused.
pub fn spawn_notification_poll_task(app: AppHandle) {
    tauri::async_runtime::spawn(async move {
        tokio::time::sleep(POLL_INITIAL_DELAY).await;

        let mut last_count: i64 = -1;
        let mut last_did: Option<String> = None;
        let mut notified_uris = VecDeque::new();

        loop {
            let state = app.state::<AppState>();

            let active_did = match active_session_did(&state) {
                Ok(value) => value,
                Err(error) => {
                    log::warn!("notification poll failed to read active session: {error}");
                    tokio::time::sleep(POLL_INTERVAL).await;
                    continue;
                }
            };

            if active_did.is_none() {
                last_count = -1;
                last_did = None;
                notified_uris.clear();
                clear_unread_badge(&app);
                tokio::time::sleep(POLL_INTERVAL).await;
                continue;
            }

            if active_did != last_did {
                last_count = -1;
                last_did = active_did;
                notified_uris.clear();
            }

            let notification_settings = load_notification_settings(&state);

            match get_unread_count(&state).await {
                Ok(count) => {
                    sync_unread_badge(&app, notification_settings.notifications_badge, count);

                    if last_count >= 0 && count > last_count {
                        log::info!("new notifications: unread count increased from {last_count} to {count}");
                        let _ = app.emit(NOTIFICATIONS_UNREAD_COUNT_EVENT, count);

                        if notification_settings.notifications_desktop && !is_main_window_focused(&app) {
                            if let Ok(value) = list_notifications(None, &state).await {
                                send_mention_system_notifications(&app, &value, &mut notified_uris);
                            }
                        }
                    } else if last_count != count {
                        let _ = app.emit(NOTIFICATIONS_UNREAD_COUNT_EVENT, count);
                    }

                    last_count = count;
                }
                Err(_) => {
                    log::debug!("notification poll skipped");
                }
            }

            tokio::time::sleep(POLL_INTERVAL).await;
        }
    });
}

#[cfg(test)]
mod tests {
    use super::{collect_new_mention_notifications, mention_notification_body, remember_notified_uri};
    use serde_json::json;
    use std::collections::VecDeque;

    #[test]
    fn mention_reason_formats_correctly() {
        let body = mention_notification_body("mention", "alice.bsky.social").unwrap();
        assert_eq!(body, "@alice.bsky.social mentioned you");
    }

    #[test]
    fn reply_reason_formats_correctly() {
        let body = mention_notification_body("reply", "bob.bsky.social").unwrap();
        assert_eq!(body, "@bob.bsky.social replied to you");
    }

    #[test]
    fn quote_reason_formats_correctly() {
        let body = mention_notification_body("quote", "carol.bsky.social").unwrap();
        assert_eq!(body, "@carol.bsky.social quoted your post");
    }

    #[test]
    fn non_mention_reasons_return_none() {
        assert!(mention_notification_body("like", "alice.bsky.social").is_none());
        assert!(mention_notification_body("repost", "alice.bsky.social").is_none());
        assert!(mention_notification_body("follow", "alice.bsky.social").is_none());
        assert!(mention_notification_body("starterpack-joined", "alice.bsky.social").is_none());
    }

    #[test]
    fn only_new_mention_notifications_are_collected() {
        let mut notified_uris = VecDeque::new();
        remember_notified_uri(&mut notified_uris, "at://notification/1".into());

        let notifications = json!({
            "notifications": [
                {
                    "author": { "handle": "alice.bsky.social" },
                    "isRead": false,
                    "reason": "mention",
                    "uri": "at://notification/1"
                },
                {
                    "author": { "handle": "bob.bsky.social" },
                    "isRead": false,
                    "reason": "reply",
                    "uri": "at://notification/2"
                },
                {
                    "author": { "handle": "carol.bsky.social" },
                    "isRead": true,
                    "reason": "quote",
                    "uri": "at://notification/3"
                }
            ]
        });

        let new_mentions = collect_new_mention_notifications(&notifications, &notified_uris);

        assert_eq!(
            new_mentions,
            vec![("at://notification/2".into(), "@bob.bsky.social replied to you".into())]
        );
    }

    #[test]
    fn remembering_notified_uris_avoids_duplicates() {
        let mut notified_uris = VecDeque::new();

        remember_notified_uri(&mut notified_uris, "at://notification/1".into());
        remember_notified_uri(&mut notified_uris, "at://notification/1".into());

        assert_eq!(notified_uris.len(), 1);
        assert_eq!(notified_uris.front().map(String::as_str), Some("at://notification/1"));
    }
}

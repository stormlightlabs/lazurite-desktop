use super::auth::LazuriteOAuthSession;
use super::error::{AppError, Result};
use super::state::AppState;
use jacquard::api::app_bsky::notification::get_unread_count::GetUnreadCount;
use jacquard::api::app_bsky::notification::list_notifications::ListNotifications;
use jacquard::api::app_bsky::notification::update_seen::UpdateSeen;
use jacquard::types::datetime::Datetime;
use jacquard::xrpc::XrpcClient;
use std::sync::Arc;
use tauri_plugin_log::log;

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
            log::error!("listNotifications error: {error}");
            AppError::validation("listNotifications error")
        })?
        .into_output()
        .map_err(|error| {
            log::error!("listNotifications output error: {error}");
            AppError::validation("listNotifications output error")
        })?;

    serde_json::to_value(&output).map_err(AppError::from)
}

pub async fn update_seen(state: &AppState) -> Result<()> {
    let session = get_session(state).await?;

    session
        .send(UpdateSeen::new().seen_at(Datetime::now()).build())
        .await
        .map_err(|error| {
            log::error!("updateSeen error: {error}");
            AppError::validation("updateSeen error")
        })?
        .into_output()
        .map_err(|error| {
            log::error!("updateSeen output error: {error}");
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
            log::error!("getUnreadCount error: {error}");
            AppError::validation("getUnreadCount error")
        })?
        .into_output()
        .map_err(|error| {
            log::error!("getUnreadCount output error: {error}");
            AppError::validation("getUnreadCount output error")
        })?;

    Ok(output.count)
}

use super::auth::LazuriteOAuthSession;
use super::error::{AppError, Result};
use super::state::AppState;
use jacquard::api::chat_bsky::convo::get_convo_for_members::GetConvoForMembers;
use jacquard::api::chat_bsky::convo::get_messages::GetMessages;
use jacquard::api::chat_bsky::convo::list_convos::ListConvos;
use jacquard::api::chat_bsky::convo::send_message::SendMessage;
use jacquard::api::chat_bsky::convo::update_read::UpdateRead;
use jacquard::api::chat_bsky::convo::MessageInput;
use jacquard::common::error::{ClientError, ClientErrorKind};
use jacquard::oauth::authstore::ClientAuthStore;
use jacquard::oauth::scopes::{Scope, TransitionScope};
use jacquard::types::did::Did;
use jacquard::xrpc::{CallOptions, XrpcClient};
use jacquard::IntoStatic;
use reqwest::StatusCode;
use serde_json::Value;
use std::sync::Arc;
use tauri_plugin_log::log;

const CHAT_PROXY: &str = "did:web:api.bsky.chat#bsky_chat";
const CHAT_SCOPE_MISSING_MESSAGE: &str =
    "This account was authenticated without DM access. Sign out and sign back in to enable messages.";

async fn get_session(state: &AppState) -> Result<Arc<LazuriteOAuthSession>> {
    let did = active_did(state)?;

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

fn active_did(state: &AppState) -> Result<String> {
    Ok(state
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
        .clone())
}

async fn ensure_chat_scope(state: &AppState) -> Result<()> {
    let did = active_did(state)?;
    let parsed_did = Did::new(&did).map_err(|_| AppError::validation("invalid active account DID"))?;
    let account = state.auth_store.get_account(&did)?.ok_or_else(|| {
        log::error!("active account missing from auth store");
        AppError::validation("no active account")
    })?;
    let session_id = account.session_id.ok_or_else(|| {
        log::error!("active account missing session id");
        AppError::validation("no active account session")
    })?;
    let session_data = state
        .auth_store
        .get_session(&parsed_did, &session_id)
        .await
        .map_err(AppError::from)?
        .ok_or_else(|| {
            log::error!("persisted session missing for active account");
            AppError::validation("no active account session")
        })?;

    if session_data
        .scopes
        .iter()
        .any(|scope| matches!(scope, Scope::Transition(TransitionScope::ChatBsky)))
    {
        return Ok(());
    }

    log::warn!("active session is missing transition:chat.bsky scope");
    Err(AppError::validation(CHAT_SCOPE_MISSING_MESSAGE))
}

fn chat_opts() -> CallOptions<'static> {
    CallOptions { atproto_proxy: Some(CHAT_PROXY.into()), ..Default::default() }
}

fn map_chat_error(error: &ClientError, default_message: &'static str, context: &'static str) -> AppError {
    if let ClientErrorKind::Http { status } = error.kind() {
        if *status == StatusCode::FORBIDDEN {
            log::warn!("{context} forbidden, likely missing DM scope");
            return AppError::validation(CHAT_SCOPE_MISSING_MESSAGE);
        }
    }

    log::error!("{context}: {error}");
    AppError::validation(default_message)
}

pub async fn list_convos(cursor: Option<String>, limit: Option<u32>, state: &AppState) -> Result<Value> {
    ensure_chat_scope(state).await?;
    let session = get_session(state).await?;
    let mut req = ListConvos::new().limit(limit.map(|n| n as i64));
    if let Some(c) = &cursor {
        req = req.cursor(Some(c.as_str().into()));
    }

    let output = session
        .send_with_opts(req.build(), chat_opts())
        .await
        .map_err(|error| map_chat_error(&error, "Could not load conversations.", "listConvos error"))?
        .into_output()
        .map_err(|error| {
            log::error!("listConvos output error: {error}");
            AppError::validation("Could not load conversations.")
        })?;

    serde_json::to_value(&output).map_err(AppError::from)
}

pub async fn get_convo_for_members(members: Vec<String>, state: &AppState) -> Result<Value> {
    if members.is_empty() {
        return Err(AppError::validation("members must not be empty"));
    }

    ensure_chat_scope(state).await?;
    let session = get_session(state).await?;
    let dids: Result<Vec<Did<'static>>> = members
        .iter()
        .map(|m| {
            Did::new(m.trim())
                .map(|d| d.into_static())
                .map_err(|_| AppError::validation("invalid DID in members list"))
        })
        .collect();
    let req = GetConvoForMembers::new().members(dids?).build();

    let output = session
        .send_with_opts(req, chat_opts())
        .await
        .map_err(|error| map_chat_error(&error, "Could not open this conversation.", "getConvoForMembers error"))?
        .into_output()
        .map_err(|error| {
            log::error!("getConvoForMembers output error: {error}");
            AppError::validation("Could not open this conversation.")
        })?;

    serde_json::to_value(&output).map_err(AppError::from)
}

pub async fn get_messages(
    convo_id: String, cursor: Option<String>, limit: Option<u32>, state: &AppState,
) -> Result<Value> {
    if convo_id.is_empty() {
        return Err(AppError::validation("convo_id must not be empty"));
    }

    ensure_chat_scope(state).await?;
    let session = get_session(state).await?;
    let mut req = GetMessages::new()
        .convo_id(convo_id.as_str())
        .limit(limit.map(|n| n as i64));
    if let Some(c) = &cursor {
        req = req.cursor(Some(c.as_str().into()));
    }

    let output = session
        .send_with_opts(req.build(), chat_opts())
        .await
        .map_err(|error| map_chat_error(&error, "Could not load messages.", "getMessages error"))?
        .into_output()
        .map_err(|error| {
            log::error!("getMessages output error: {error}");
            AppError::validation("Could not load messages.")
        })?;

    serde_json::to_value(&output).map_err(AppError::from)
}

pub async fn send_message(convo_id: String, text: String, state: &AppState) -> Result<Value> {
    if convo_id.is_empty() {
        return Err(AppError::validation("convo_id must not be empty"));
    }
    if text.trim().is_empty() {
        return Err(AppError::validation("message text must not be empty"));
    }

    ensure_chat_scope(state).await?;
    let session = get_session(state).await?;
    let msg = MessageInput { text: text.into(), facets: None, embed: None, ..Default::default() };
    let req = SendMessage::new().convo_id(convo_id.as_str()).message(msg).build();

    let output = session
        .send_with_opts(req, chat_opts())
        .await
        .map_err(|error| map_chat_error(&error, "Could not send this message.", "sendMessage error"))?
        .into_output()
        .map_err(|error| {
            log::error!("sendMessage output error: {error}");
            AppError::validation("Could not send this message.")
        })?;

    serde_json::to_value(&output).map_err(AppError::from)
}

pub async fn update_read(convo_id: String, message_id: Option<String>, state: &AppState) -> Result<()> {
    if convo_id.is_empty() {
        return Err(AppError::validation("convo_id must not be empty"));
    }

    ensure_chat_scope(state).await?;
    let session = get_session(state).await?;
    let req = UpdateRead {
        convo_id: convo_id.as_str().into(),
        message_id: message_id.as_deref().map(|s| s.into()),
        ..Default::default()
    };

    session
        .send_with_opts(req, chat_opts())
        .await
        .map_err(|error| {
            map_chat_error(
                &error,
                "Could not update the read status for this conversation.",
                "updateRead error",
            )
        })?
        .into_output()
        .map_err(|error| {
            log::error!("updateRead output error: {error}");
            AppError::validation("Could not update the read status for this conversation.")
        })?;

    Ok(())
}

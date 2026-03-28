use super::auth::{self, LoginSuggestion};
use super::error::AppError;
use super::feed::{self, CreateRecordResult, EmbedInput, ReplyRefInput, UserPreferences};
use super::state::{AccountSummary, AppBootstrap, AppState};
use serde_json::Value;
use tauri::{AppHandle, State};

#[tauri::command]
pub fn get_app_bootstrap(state: State<'_, AppState>) -> Result<AppBootstrap, AppError> {
    state.snapshot()
}

#[tauri::command]
pub fn list_accounts(state: State<'_, AppState>) -> Result<Vec<AccountSummary>, AppError> {
    state.accounts()
}

#[tauri::command]
pub async fn login(handle: String, app: AppHandle, state: State<'_, AppState>) -> Result<AccountSummary, AppError> {
    state.login(&app, handle).await
}

#[tauri::command]
pub async fn logout(did: String, app: AppHandle, state: State<'_, AppState>) -> Result<(), AppError> {
    state.logout(&app, &did).await
}

#[tauri::command]
pub async fn switch_account(did: String, app: AppHandle, state: State<'_, AppState>) -> Result<(), AppError> {
    state.switch_account(&app, &did).await
}

#[tauri::command]
pub async fn set_active_account(did: String, app: AppHandle, state: State<'_, AppState>) -> Result<(), AppError> {
    state.switch_account(&app, &did).await
}

#[tauri::command]
pub async fn search_login_suggestions(query: String) -> Result<Vec<LoginSuggestion>, AppError> {
    auth::search_login_suggestions(&query).await
}

#[tauri::command]
pub async fn get_preferences(state: State<'_, AppState>) -> Result<UserPreferences, AppError> {
    feed::get_preferences(&state).await
}

#[tauri::command]
pub async fn get_feed_generators(uris: Vec<String>, state: State<'_, AppState>) -> Result<Value, AppError> {
    feed::get_feed_generators(uris, &state).await
}

#[tauri::command]
pub async fn get_timeline(cursor: Option<String>, limit: u32, state: State<'_, AppState>) -> Result<Value, AppError> {
    feed::get_timeline(cursor, limit, &state).await
}

#[tauri::command]
pub async fn get_feed(
    uri: String, cursor: Option<String>, limit: u32, state: State<'_, AppState>,
) -> Result<Value, AppError> {
    feed::get_feed(uri, cursor, limit, &state).await
}

#[tauri::command]
pub async fn get_list_feed(
    uri: String, cursor: Option<String>, limit: u32, state: State<'_, AppState>,
) -> Result<Value, AppError> {
    feed::get_list_feed(uri, cursor, limit, &state).await
}

#[tauri::command]
pub async fn get_post_thread(uri: String, state: State<'_, AppState>) -> Result<Value, AppError> {
    feed::get_post_thread(uri, &state).await
}

#[tauri::command]
pub async fn get_author_feed(
    did: String, cursor: Option<String>, state: State<'_, AppState>,
) -> Result<Value, AppError> {
    feed::get_author_feed(did, cursor, &state).await
}

#[tauri::command]
pub async fn create_post(
    text: String, reply_to: Option<ReplyRefInput>, embed: Option<EmbedInput>, state: State<'_, AppState>,
) -> Result<CreateRecordResult, AppError> {
    feed::create_post(text, reply_to, embed, &state).await
}

#[tauri::command]
pub async fn like_post(uri: String, cid: String, state: State<'_, AppState>) -> Result<CreateRecordResult, AppError> {
    feed::like_post(uri, cid, &state).await
}

#[tauri::command]
pub async fn unlike_post(like_uri: String, state: State<'_, AppState>) -> Result<(), AppError> {
    feed::unlike_post(like_uri, &state).await
}

#[tauri::command]
pub async fn repost(uri: String, cid: String, state: State<'_, AppState>) -> Result<CreateRecordResult, AppError> {
    feed::repost(uri, cid, &state).await
}

#[tauri::command]
pub async fn unrepost(repost_uri: String, state: State<'_, AppState>) -> Result<(), AppError> {
    feed::unrepost(repost_uri, &state).await
}

#![allow(clippy::needless_pass_by_value)]
use super::auth::{self, LoginSuggestion};
use super::conversations;
use super::error::Result;
use super::feed::{self, CreateRecordResult, EmbedInput, FeedViewPrefItem, ReplyRefInput, UserPreferences};
use super::notifications;
use super::state::{AccountSummary, AppBootstrap, AppState};
use serde_json::Value;
use tauri::AppHandle;

pub mod columns;
pub mod diagnostics;
pub mod drafts;
pub mod explorer;
pub mod media;
pub mod moderation;
pub mod search;
pub mod settings;

type State<'a> = tauri::State<'a, AppState>;

#[tauri::command]
pub fn get_app_bootstrap(state: State<'_>) -> Result<AppBootstrap> {
    state.snapshot()
}

#[tauri::command]
pub fn list_accounts(state: State<'_>) -> Result<Vec<AccountSummary>> {
    state.accounts()
}

#[tauri::command]
pub async fn login(handle: String, app: AppHandle, state: State<'_>) -> Result<AccountSummary> {
    state.login(&app, handle).await
}

#[tauri::command]
pub async fn logout(did: String, app: AppHandle, state: State<'_>) -> Result<()> {
    state.logout(&app, &did).await
}

#[tauri::command]
pub async fn switch_account(did: String, app: AppHandle, state: State<'_>) -> Result<()> {
    state.switch_account(&app, &did).await
}

#[tauri::command]
pub async fn set_active_account(did: String, app: AppHandle, state: State<'_>) -> Result<()> {
    state.switch_account(&app, &did).await
}

#[tauri::command]
pub async fn search_login_suggestions(query: String) -> Result<Vec<LoginSuggestion>> {
    auth::search_login_suggestions(&query).await
}

#[tauri::command]
pub async fn get_preferences(state: State<'_>) -> Result<UserPreferences> {
    feed::get_preferences(&state).await
}

#[tauri::command]
pub async fn get_profile(actor: String, state: State<'_>) -> Result<Value> {
    feed::get_profile(actor, &state).await
}

#[tauri::command]
pub async fn get_feed_generators(uris: Vec<String>, state: State<'_>) -> Result<Value> {
    feed::get_feed_generators(uris, &state).await
}

#[tauri::command]
pub async fn get_timeline(cursor: Option<String>, limit: u32, state: State<'_>) -> Result<Value> {
    feed::get_timeline(cursor, limit, &state).await
}

#[tauri::command]
pub async fn get_feed(uri: String, cursor: Option<String>, limit: u32, state: State<'_>) -> Result<Value> {
    feed::get_feed(uri, cursor, limit, &state).await
}

#[tauri::command]
pub async fn get_list_feed(uri: String, cursor: Option<String>, limit: u32, state: State<'_>) -> Result<Value> {
    feed::get_list_feed(uri, cursor, limit, &state).await
}

#[tauri::command]
pub async fn get_post_thread(uri: String, state: State<'_>) -> Result<Value> {
    feed::get_post_thread(uri, &state).await
}

#[tauri::command]
pub async fn get_author_feed(
    actor: String, cursor: Option<String>, limit: Option<u32>, state: State<'_>,
) -> Result<Value> {
    feed::get_author_feed(actor, cursor, limit, &state).await
}

#[tauri::command]
pub async fn get_actor_likes(
    actor: String, cursor: Option<String>, limit: Option<u32>, state: State<'_>,
) -> Result<Value> {
    feed::get_actor_likes(actor, cursor, limit, &state).await
}

#[tauri::command]
pub async fn create_post(
    text: String, reply_to: Option<ReplyRefInput>, embed: Option<EmbedInput>, state: State<'_>,
) -> Result<CreateRecordResult> {
    feed::create_post(text, reply_to, embed, &state).await
}

#[tauri::command]
pub async fn like_post(uri: String, cid: String, state: State<'_>) -> Result<CreateRecordResult> {
    feed::like_post(uri, cid, &state).await
}

#[tauri::command]
pub async fn unlike_post(like_uri: String, state: State<'_>) -> Result<()> {
    feed::unlike_post(like_uri, &state).await
}

#[tauri::command]
pub async fn repost(uri: String, cid: String, state: State<'_>) -> Result<CreateRecordResult> {
    feed::repost(uri, cid, &state).await
}

#[tauri::command]
pub async fn unrepost(repost_uri: String, state: State<'_>) -> Result<()> {
    feed::unrepost(repost_uri, &state).await
}

#[tauri::command]
pub async fn bookmark_post(uri: String, cid: String, state: State<'_>) -> Result<()> {
    feed::bookmark_post(uri, cid, &state).await
}

#[tauri::command]
pub async fn remove_bookmark(uri: String, state: State<'_>) -> Result<()> {
    feed::remove_bookmark(uri, &state).await
}

#[tauri::command]
pub async fn follow_actor(did: String, state: State<'_>) -> Result<CreateRecordResult> {
    feed::follow_actor(did, &state).await
}

#[tauri::command]
pub async fn unfollow_actor(follow_uri: String, state: State<'_>) -> Result<()> {
    feed::unfollow_actor(follow_uri, &state).await
}

#[tauri::command]
pub async fn get_followers(
    actor: String, cursor: Option<String>, limit: Option<u32>, state: State<'_>,
) -> Result<Value> {
    feed::get_followers(actor, cursor, limit, &state).await
}

#[tauri::command]
pub async fn get_follows(actor: String, cursor: Option<String>, limit: Option<u32>, state: State<'_>) -> Result<Value> {
    feed::get_follows(actor, cursor, limit, &state).await
}

#[tauri::command]
pub async fn update_saved_feeds(feeds: Vec<feed::SavedFeedItem>, state: State<'_>) -> Result<()> {
    feed::update_saved_feeds(feed::UpdateSavedFeedsInput { feeds }, &state).await
}

#[tauri::command]
pub async fn update_feed_view_pref(pref: FeedViewPrefItem, state: State<'_>) -> Result<()> {
    feed::update_feed_view_pref(pref, &state).await
}

#[tauri::command]
pub async fn list_notifications(cursor: Option<String>, state: State<'_>) -> Result<Value> {
    notifications::list_notifications(cursor, &state).await
}

#[tauri::command]
pub async fn update_seen(state: State<'_>) -> Result<()> {
    notifications::update_seen(&state).await
}

#[tauri::command]
pub async fn get_unread_count(state: State<'_>) -> Result<i64> {
    notifications::get_unread_count(&state).await
}

#[tauri::command]
pub async fn list_convos(cursor: Option<String>, limit: Option<u32>, state: State<'_>) -> Result<Value> {
    conversations::list_convos(cursor, limit, &state).await
}

#[tauri::command]
pub async fn get_convo_for_members(members: Vec<String>, state: State<'_>) -> Result<Value> {
    conversations::get_convo_for_members(members, &state).await
}

#[tauri::command]
pub async fn get_messages(
    convo_id: String, cursor: Option<String>, limit: Option<u32>, state: State<'_>,
) -> Result<Value> {
    conversations::get_messages(convo_id, cursor, limit, &state).await
}

#[tauri::command]
pub async fn send_message(convo_id: String, text: String, state: State<'_>) -> Result<Value> {
    conversations::send_message(convo_id, text, &state).await
}

#[tauri::command]
pub async fn update_read(convo_id: String, message_id: Option<String>, state: State<'_>) -> Result<()> {
    conversations::update_read(convo_id, message_id, &state).await
}

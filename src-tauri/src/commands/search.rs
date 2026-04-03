#![allow(clippy::needless_pass_by_value)]
use crate::search::{self, PostResult, SavedPostsPage, SyncStatus};
use crate::{error::Result, state::AppState};
use serde_json::Value;
use tauri::{AppHandle, State};

#[tauri::command]
pub async fn search_posts_network(
    query: String, sort: Option<String>, limit: Option<u32>, cursor: Option<String>, state: State<'_, AppState>,
) -> Result<Value> {
    search::search_posts_network(query, sort, limit, cursor, &state).await
}

#[tauri::command]
pub fn search_posts(
    query: String, mode: String, limit: u32, app: AppHandle, state: State<'_, AppState>,
) -> Result<Vec<PostResult>> {
    search::search_posts(&query, &mode, limit, &app, &state)
}

#[tauri::command]
pub async fn search_actors(
    query: String, limit: Option<u32>, cursor: Option<String>, state: State<'_, AppState>,
) -> Result<Value> {
    search::search_actors(query, limit, cursor, &state).await
}

#[tauri::command]
pub async fn search_starter_packs(
    query: String, limit: Option<u32>, cursor: Option<String>, state: State<'_, AppState>,
) -> Result<Value> {
    search::search_starter_packs(query, limit, cursor, &state).await
}

#[tauri::command]
pub async fn sync_posts(did: String, source: String, state: State<'_, AppState>) -> Result<SyncStatus> {
    search::sync_posts(did, source, &state).await
}

#[tauri::command]
pub fn get_sync_status(did: String, state: State<'_, AppState>) -> Result<Vec<SyncStatus>> {
    search::get_sync_status(&did, &state)
}

#[tauri::command]
pub fn list_saved_posts(
    source: String, limit: u32, offset: u32, query: Option<String>, state: State<'_, AppState>,
) -> Result<SavedPostsPage> {
    search::list_saved_posts(&source, limit, offset, query.as_deref(), &state)
}

#[tauri::command]
pub fn embed_pending_posts(app: AppHandle, state: State<'_, AppState>) -> Result<usize> {
    search::embed_pending_posts(&app, &state)
}

#[tauri::command]
pub fn reindex_embeddings(app: AppHandle, state: State<'_, AppState>) -> Result<usize> {
    search::reindex_embeddings(&app, &state)
}

#[tauri::command]
pub fn set_embeddings_enabled(enabled: bool, state: State<'_, AppState>) -> Result<()> {
    search::set_embeddings_enabled(enabled, &state)
}

#[tauri::command]
pub fn get_embeddings_enabled(state: State<'_, AppState>) -> Result<bool> {
    search::get_embeddings_enabled(&state)
}

#[tauri::command]
pub fn get_embeddings_config(app: AppHandle, state: State<'_, AppState>) -> Result<search::EmbeddingsConfig> {
    search::get_embeddings_config(&app, &state)
}

#[tauri::command]
pub fn prepare_embeddings_model(app: AppHandle, state: State<'_, AppState>) -> Result<search::EmbeddingsConfig> {
    search::prepare_embeddings_model(&app, &state)
}

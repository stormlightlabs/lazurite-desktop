#![allow(clippy::needless_pass_by_value)]

use super::super::error::AppError;
use super::super::search::{self, PostResult, SyncStatus};
use super::super::state::AppState;
use serde_json::Value;
use tauri::{AppHandle, State};

#[tauri::command]
pub async fn search_posts_network(
    query: String, sort: Option<String>, limit: Option<u32>, cursor: Option<String>, state: State<'_, AppState>,
) -> Result<Value, AppError> {
    search::search_posts_network(query, sort, limit, cursor, &state).await
}

#[tauri::command]
pub fn search_posts(
    query: String, mode: String, limit: u32, app: AppHandle, state: State<'_, AppState>,
) -> Result<Vec<PostResult>, AppError> {
    search::search_posts(query, mode, limit, &app, &state)
}

#[tauri::command]
pub async fn search_actors(
    query: String, limit: Option<u32>, cursor: Option<String>, state: State<'_, AppState>,
) -> Result<Value, AppError> {
    search::search_actors(query, limit, cursor, &state).await
}

#[tauri::command]
pub async fn search_starter_packs(
    query: String, limit: Option<u32>, cursor: Option<String>, state: State<'_, AppState>,
) -> Result<Value, AppError> {
    search::search_starter_packs(query, limit, cursor, &state).await
}

#[tauri::command]
pub async fn sync_posts(did: String, source: String, state: State<'_, AppState>) -> Result<SyncStatus, AppError> {
    search::sync_posts(did, source, &state).await
}

#[tauri::command]
pub fn get_sync_status(did: String, state: State<'_, AppState>) -> Result<Vec<SyncStatus>, AppError> {
    search::get_sync_status(&did, &state)
}

#[tauri::command]
pub fn embed_pending_posts(app: AppHandle, state: State<'_, AppState>) -> Result<usize, AppError> {
    search::embed_pending_posts(&app, &state)
}

#[tauri::command]
pub fn reindex_embeddings(app: AppHandle, state: State<'_, AppState>) -> Result<usize, AppError> {
    search::reindex_embeddings(&app, &state)
}

#[tauri::command]
pub fn set_embeddings_enabled(enabled: bool, state: State<'_, AppState>) -> Result<(), AppError> {
    search::set_embeddings_enabled(enabled, &state)
}

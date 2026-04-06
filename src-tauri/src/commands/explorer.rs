use crate::error::AppError;
use crate::explorer;
use std::collections::HashMap;
use tauri::AppHandle;

#[tauri::command]
pub async fn resolve_input(input: String) -> Result<explorer::ResolvedExplorerInput, AppError> {
    explorer::resolve_input(input).await
}

#[tauri::command]
pub async fn describe_server(pds_url: String) -> Result<explorer::ExplorerServerView, AppError> {
    explorer::describe_server(pds_url).await
}

#[tauri::command]
pub async fn describe_repo(did: String) -> Result<serde_json::Value, AppError> {
    explorer::describe_repo(did).await
}

#[tauri::command]
pub async fn list_records(
    did: String, collection: String, cursor: Option<String>,
) -> Result<serde_json::Value, AppError> {
    explorer::list_records(did, collection, cursor).await
}

#[tauri::command]
pub async fn get_record(did: String, collection: String, rkey: String) -> Result<serde_json::Value, AppError> {
    explorer::get_record(did, collection, rkey).await
}

#[tauri::command]
pub async fn export_repo_car(did: String, app: AppHandle) -> Result<explorer::RepoCarExport, AppError> {
    explorer::export_repo_car(did, &app).await
}

#[tauri::command]
pub async fn query_labels(uri: String) -> Result<serde_json::Value, AppError> {
    explorer::query_labels(uri).await
}

#[tauri::command]
pub async fn get_lexicon_favicons(
    collections: Vec<String>, app: AppHandle,
) -> Result<HashMap<String, Option<String>>, AppError> {
    explorer::get_lexicon_favicons(collections, &app).await
}

#[tauri::command]
pub async fn clear_lexicon_favicon_cache(app: AppHandle) -> Result<(), AppError> {
    explorer::clear_lexicon_favicon_cache(&app)
}

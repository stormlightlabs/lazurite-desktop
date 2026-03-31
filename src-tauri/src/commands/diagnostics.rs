#![allow(clippy::needless_pass_by_value)]

use crate::diagnostics;
use crate::error::AppError;
use crate::state::AppState;
use tauri::State;

#[tauri::command]
pub async fn get_account_lists(
    did: String, state: State<'_, AppState>,
) -> Result<diagnostics::AccountListsResult, AppError> {
    diagnostics::get_account_lists(did, &state).await
}

#[tauri::command]
pub async fn get_account_labels(did: String) -> Result<diagnostics::AccountLabelsResult, AppError> {
    diagnostics::get_account_labels(did).await
}

#[tauri::command]
pub async fn get_account_blocked_by(
    did: String, limit: Option<u32>, cursor: Option<String>, state: State<'_, AppState>,
) -> Result<diagnostics::AccountBlockedByResult, AppError> {
    diagnostics::get_account_blocked_by(did, limit, cursor, &state).await
}

#[tauri::command]
pub async fn get_account_blocking(
    did: String, cursor: Option<String>,
) -> Result<diagnostics::AccountBlockingResult, AppError> {
    diagnostics::get_account_blocking(did, cursor).await
}

#[tauri::command]
pub async fn get_account_starter_packs(
    did: String, state: State<'_, AppState>,
) -> Result<diagnostics::AccountStarterPacksResult, AppError> {
    diagnostics::get_account_starter_packs(did, &state).await
}

#[tauri::command]
pub async fn get_record_backlinks(
    uri: String, state: State<'_, AppState>,
) -> Result<diagnostics::RecordBacklinksResult, AppError> {
    diagnostics::get_record_backlinks(uri, &state).await
}

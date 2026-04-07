#![allow(clippy::needless_pass_by_value)]

use crate::drafts::{self, Draft, DraftInput};
use crate::error::AppError;
use crate::feed::CreateRecordResult;
use crate::state::AppState;
use tauri::State;

#[tauri::command]
pub fn list_drafts(account_did: String, state: State<'_, AppState>) -> Result<Vec<Draft>, AppError> {
    drafts::list_drafts(&account_did, &state)
}

#[tauri::command]
pub fn get_draft(id: String, state: State<'_, AppState>) -> Result<Draft, AppError> {
    drafts::get_draft(&id, &state)
}

#[tauri::command]
pub fn save_draft(input: DraftInput, state: State<'_, AppState>) -> Result<Draft, AppError> {
    drafts::save_draft(&input, &state)
}

#[tauri::command]
pub fn delete_draft(id: String, state: State<'_, AppState>) -> Result<(), AppError> {
    drafts::delete_draft(&id, &state)
}

#[tauri::command]
pub async fn submit_draft(id: String, state: State<'_, AppState>) -> Result<CreateRecordResult, AppError> {
    drafts::submit_draft(id, &state).await
}

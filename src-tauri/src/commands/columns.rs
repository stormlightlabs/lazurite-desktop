#![allow(clippy::needless_pass_by_value)]

use crate::columns::{self, Column};
use crate::error::AppError;
use crate::state::AppState;
use tauri::State;

#[tauri::command]
pub fn get_columns(account_did: String, state: State<'_, AppState>) -> Result<Vec<Column>, AppError> {
    columns::get_columns(&account_did, &state)
}

#[tauri::command]
pub fn add_column(
    account_did: String, kind: String, config: String, position: Option<u32>, state: State<'_, AppState>,
) -> Result<Column, AppError> {
    columns::add_column(&account_did, &kind, &config, position, &state)
}

#[tauri::command]
pub fn remove_column(id: String, state: State<'_, AppState>) -> Result<(), AppError> {
    columns::remove_column(&id, &state)
}

#[tauri::command]
pub fn reorder_columns(ids: Vec<String>, state: State<'_, AppState>) -> Result<(), AppError> {
    columns::reorder_columns(&ids, &state)
}

#[tauri::command]
pub fn update_column(
    id: String, config: Option<String>, width: Option<String>, state: State<'_, AppState>,
) -> Result<Column, AppError> {
    columns::update_column(&id, config.as_deref(), width.as_deref(), &state)
}

use tauri::State;

use crate::error::AppError;
use crate::state::{AccountSummary, AppBootstrap, AppState};

#[tauri::command]
pub fn get_app_bootstrap(state: State<'_, AppState>) -> Result<AppBootstrap, AppError> {
    state.snapshot()
}

#[tauri::command]
pub fn list_accounts(state: State<'_, AppState>) -> Result<Vec<AccountSummary>, AppError> {
    state.accounts()
}

#[tauri::command]
pub fn set_active_account(did: String, state: State<'_, AppState>) -> Result<(), AppError> {
    state.set_active_account(&did)
}

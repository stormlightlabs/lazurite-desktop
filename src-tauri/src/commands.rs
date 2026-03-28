use super::error::AppError;
use super::state::{AccountSummary, AppBootstrap, AppState};
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

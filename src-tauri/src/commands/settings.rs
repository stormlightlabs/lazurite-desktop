#![allow(clippy::needless_pass_by_value)]

use crate::error::AppError;
use crate::settings::{self, AppSettings, CacheSize, LogEntry};
use crate::state::AppState;
use tauri::{AppHandle, State};

#[tauri::command]
pub fn get_settings(state: State<'_, AppState>) -> Result<AppSettings, AppError> {
    settings::get_settings(&state)
}

#[tauri::command]
pub fn get_constellation_url(state: State<'_, AppState>) -> Result<String, AppError> {
    settings::get_constellation_url(&state)
}

#[tauri::command]
pub fn update_setting(key: String, value: String, app: AppHandle, state: State<'_, AppState>) -> Result<(), AppError> {
    settings::update_setting(&key, &value, &state, &app)
}

#[tauri::command]
pub fn set_constellation_url(url: String, app: AppHandle, state: State<'_, AppState>) -> Result<(), AppError> {
    settings::set_constellation_url(&url, &state, &app)
}

#[tauri::command]
pub fn get_cache_size(state: State<'_, AppState>) -> Result<CacheSize, AppError> {
    settings::get_cache_size(&state)
}

#[tauri::command]
pub fn clear_cache(scope: String, state: State<'_, AppState>) -> Result<(), AppError> {
    settings::clear_cache(&scope, &state)
}

#[tauri::command]
pub fn export_data(format: String, path: String, state: State<'_, AppState>) -> Result<(), AppError> {
    settings::export_data(&format, &path, &state)
}

#[tauri::command]
pub fn reset_app(app: AppHandle, state: State<'_, AppState>) -> Result<(), AppError> {
    settings::reset_app(&state, &app)
}

#[tauri::command]
pub fn get_log_entries(
    limit: u32, level: Option<String>, app: AppHandle, state: State<'_, AppState>,
) -> Result<Vec<LogEntry>, AppError> {
    let _ = state; // AppState not needed; AppHandle provides log dir
    settings::get_log_entries(limit, level.as_deref(), &app)
}

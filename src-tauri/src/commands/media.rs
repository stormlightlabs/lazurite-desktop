#![allow(clippy::needless_pass_by_value)]

use crate::error::Result;
use crate::media::{self, DownloadResult};
use crate::state::AppState;
use tauri::{AppHandle, Emitter, State};

#[tauri::command]
pub fn get_download_directory(state: State<'_, AppState>) -> Result<String> {
    media::get_download_directory(&state)
}

#[tauri::command]
pub fn set_download_directory(path: String, state: State<'_, AppState>) -> Result<()> {
    media::set_download_directory(&path, &state)
}

#[tauri::command]
pub async fn download_image(
    url: String, filename: Option<String>, state: State<'_, AppState>,
) -> Result<DownloadResult> {
    media::download_image(&url, filename.as_deref(), &state).await
}

#[tauri::command]
pub async fn download_video(
    url: String, filename: Option<String>, app: AppHandle, state: State<'_, AppState>,
) -> Result<DownloadResult> {
    media::download_video(&url, filename.as_deref(), &state, |progress| {
        app.emit("download-progress", &progress)?;
        Ok(())
    })
    .await
}

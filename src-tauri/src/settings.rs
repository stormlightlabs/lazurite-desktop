use super::auth;
use super::db;
use super::error::{AppError, Result};
use super::notifications;
use super::state::AppState;
use super::tray;
use reqwest::Url;
use rusqlite::{params, Connection};
use serde::Serialize;
use std::fs;
use std::io::{BufRead, BufReader};
use std::path::{Path, PathBuf};
use tauri::{AppHandle, Manager};
use tauri_plugin_global_shortcut::Shortcut;
use tauri_plugin_log::log;

const APP_DEFAULT_THEME: &str = "auto";
const APP_DEFAULT_TIMELINE_REFRESH_SECS: u32 = 60;
const APP_DEFAULT_CONSTELLATION_URL: &str = "https://constellation.microcosm.blue";
const APP_DEFAULT_SPACEDUST_URL: &str = "https://spacedust.microcosm.blue";
const APP_DEFAULT_GLOBAL_SHORTCUT: &str = "Ctrl+Shift+N";

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum SettingsKey {
    Theme,
    TimelineRefreshSecs,
    NotificationsDesktop,
    NotificationsBadge,
    NotificationsSound,
    EmbeddingsEnabled,
    ConstellationUrl,
    SpacedustUrl,
    SpacedustInstant,
    SpacedustEnabled,
    GlobalShortcut,
}

impl SettingsKey {
    fn as_str(&self) -> &'static str {
        match self {
            SettingsKey::Theme => "theme",
            SettingsKey::TimelineRefreshSecs => "timeline_refresh_secs",
            SettingsKey::NotificationsDesktop => "notifications_desktop",
            SettingsKey::NotificationsBadge => "notifications_badge",
            SettingsKey::NotificationsSound => "notifications_sound",
            SettingsKey::EmbeddingsEnabled => "embeddings_enabled",
            SettingsKey::ConstellationUrl => "constellation_url",
            SettingsKey::SpacedustUrl => "spacedust_url",
            SettingsKey::SpacedustInstant => "spacedust_instant",
            SettingsKey::SpacedustEnabled => "spacedust_enabled",
            SettingsKey::GlobalShortcut => "global_shortcut",
        }
    }

    pub fn from_str(s: &str) -> Option<Self> {
        match s {
            "theme" => Some(Self::Theme),
            "timeline_refresh_secs" => Some(Self::TimelineRefreshSecs),
            "notifications_desktop" => Some(Self::NotificationsDesktop),
            "notifications_badge" => Some(Self::NotificationsBadge),
            "notifications_sound" => Some(Self::NotificationsSound),
            "embeddings_enabled" => Some(Self::EmbeddingsEnabled),
            "constellation_url" => Some(Self::ConstellationUrl),
            "spacedust_url" => Some(Self::SpacedustUrl),
            "spacedust_instant" => Some(Self::SpacedustInstant),
            "spacedust_enabled" => Some(Self::SpacedustEnabled),
            "global_shortcut" => Some(Self::GlobalShortcut),
            _ => None,
        }
    }

    fn valid_keys() -> &'static [Self] {
        &[
            Self::Theme,
            Self::TimelineRefreshSecs,
            Self::NotificationsDesktop,
            Self::NotificationsBadge,
            Self::NotificationsSound,
            Self::EmbeddingsEnabled,
            Self::ConstellationUrl,
            Self::SpacedustUrl,
            Self::SpacedustInstant,
            Self::SpacedustEnabled,
            Self::GlobalShortcut,
        ]
    }
}

impl std::fmt::Display for SettingsKey {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        self.as_str().fmt(f)
    }
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AppSettings {
    pub theme: String,
    pub timeline_refresh_secs: u32,
    pub notifications_desktop: bool,
    pub notifications_badge: bool,
    pub notifications_sound: bool,
    pub embeddings_enabled: bool,
    pub constellation_url: String,
    pub spacedust_url: String,
    pub spacedust_instant: bool,
    pub spacedust_enabled: bool,
    pub global_shortcut: String,
}

impl Default for AppSettings {
    fn default() -> Self {
        Self {
            theme: APP_DEFAULT_THEME.to_string(),
            timeline_refresh_secs: APP_DEFAULT_TIMELINE_REFRESH_SECS,
            notifications_desktop: true,
            notifications_badge: true,
            notifications_sound: false,
            embeddings_enabled: true,
            constellation_url: APP_DEFAULT_CONSTELLATION_URL.to_string(),
            spacedust_url: APP_DEFAULT_SPACEDUST_URL.to_string(),
            spacedust_instant: false,
            spacedust_enabled: false,
            global_shortcut: APP_DEFAULT_GLOBAL_SHORTCUT.to_string(),
        }
    }
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CacheSize {
    pub feeds_bytes: u64,
    pub embeddings_bytes: u64,
    pub fts_bytes: u64,
    pub total_bytes: u64,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct LogEntry {
    pub timestamp: Option<String>,
    pub level: String,
    pub target: Option<String>,
    pub message: String,
}

fn parse_bool(value: &str) -> bool {
    value != "0" && !value.eq_ignore_ascii_case("false")
}

fn normalize_bool_value(value: &str, key: &SettingsKey) -> Result<String> {
    let trimmed = value.trim();
    match trimmed {
        "1" => Ok("1".to_string()),
        "0" => Ok("0".to_string()),
        _ if trimmed.eq_ignore_ascii_case("true") => Ok("1".to_string()),
        _ if trimmed.eq_ignore_ascii_case("false") => Ok("0".to_string()),
        _ => Err(AppError::validation(format!(
            "setting '{key}' must be a boolean ('0'/'1' or 'true'/'false')"
        ))),
    }
}

fn validate_refresh_interval(value: &str) -> Result<String> {
    let trimmed = value.trim();
    let seconds: u32 = trimmed
        .parse()
        .map_err(|_| AppError::validation("timeline_refresh_secs must be one of 0, 30, 60, 120, 300"))?;

    match seconds {
        0 | 30 | 60 | 120 | 300 => Ok(seconds.to_string()),
        _ => Err(AppError::validation(
            "timeline_refresh_secs must be one of 0, 30, 60, 120, 300",
        )),
    }
}

fn validate_url_setting(key: &SettingsKey, value: &str) -> Result<String> {
    let trimmed = value.trim();
    let parsed = Url::parse(trimmed)
        .map_err(|error| AppError::validation(format!("setting '{key}' must be a valid URL: {error}")))?;

    match parsed.scheme() {
        "http" | "https" => {}
        _ => return Err(AppError::validation(format!("setting '{key}' must use http or https"))),
    }

    if parsed.host_str().is_none() {
        return Err(AppError::validation(format!("setting '{key}' must include a host")));
    }

    if parsed.fragment().is_some() {
        return Err(AppError::validation(format!(
            "setting '{key}' must not include a fragment"
        )));
    }

    Ok(parsed.to_string())
}

fn validate_global_shortcut_value(value: &str) -> Result<String> {
    let trimmed = value.trim();
    if trimmed.is_empty() {
        return Err(AppError::validation("global_shortcut must not be empty"));
    }

    trimmed
        .parse::<Shortcut>()
        .map_err(|error| AppError::validation(format!("invalid global_shortcut: {error}")))?;

    Ok(trimmed.to_string())
}

fn validate_and_normalize_setting(key: SettingsKey, value: &str) -> Result<String> {
    match key {
        SettingsKey::Theme => {
            let theme = value.trim();
            match theme {
                "light" | "dark" | "auto" => Ok(theme.to_string()),
                _ => Err(AppError::validation("theme must be 'light', 'dark', or 'auto'")),
            }
        }
        SettingsKey::TimelineRefreshSecs => validate_refresh_interval(value),
        SettingsKey::NotificationsDesktop
        | SettingsKey::NotificationsBadge
        | SettingsKey::NotificationsSound
        | SettingsKey::EmbeddingsEnabled
        | SettingsKey::SpacedustInstant
        | SettingsKey::SpacedustEnabled => normalize_bool_value(value, &key),
        SettingsKey::ConstellationUrl | SettingsKey::SpacedustUrl => validate_url_setting(&key, value),
        SettingsKey::GlobalShortcut => validate_global_shortcut_value(value),
    }
}

fn apply_setting_to_snapshot(settings: &mut AppSettings, key: SettingsKey, value: String) {
    match key {
        SettingsKey::Theme => settings.theme = value,
        SettingsKey::TimelineRefreshSecs => {
            if let Ok(seconds) = value.parse::<u32>() {
                settings.timeline_refresh_secs = seconds;
            }
        }
        SettingsKey::NotificationsDesktop => settings.notifications_desktop = parse_bool(&value),
        SettingsKey::NotificationsBadge => settings.notifications_badge = parse_bool(&value),
        SettingsKey::NotificationsSound => settings.notifications_sound = parse_bool(&value),
        SettingsKey::EmbeddingsEnabled => settings.embeddings_enabled = parse_bool(&value),
        SettingsKey::ConstellationUrl => settings.constellation_url = value,
        SettingsKey::SpacedustUrl => settings.spacedust_url = value,
        SettingsKey::SpacedustInstant => settings.spacedust_instant = parse_bool(&value),
        SettingsKey::SpacedustEnabled => settings.spacedust_enabled = parse_bool(&value),
        SettingsKey::GlobalShortcut => settings.global_shortcut = value,
    }
}

fn db_get_all_settings(conn: &Connection) -> Result<AppSettings> {
    let mut stmt = conn.prepare("SELECT key, value FROM app_settings")?;
    let rows = stmt.query_map([], |row| Ok((row.get::<_, String>(0)?, row.get::<_, String>(1)?)))?;

    let mut settings = AppSettings::default();
    for row in rows {
        let (key, value) = row?;
        let Some(key) = SettingsKey::from_str(&key) else {
            continue;
        };

        match validate_and_normalize_setting(key, &value) {
            Ok(normalized_value) => apply_setting_to_snapshot(&mut settings, key, normalized_value),
            Err(error) => {
                log::warn!("ignoring invalid persisted setting '{}': {}", key, error);
            }
        }
    }

    Ok(settings)
}

fn db_upsert_setting(conn: &Connection, key: &SettingsKey, value: &str) -> Result<()> {
    conn.execute(
        "INSERT INTO app_settings(key, value) VALUES(?1, ?2)
         ON CONFLICT(key) DO UPDATE SET value = excluded.value",
        params![key.as_str(), value],
    )?;
    Ok(())
}

fn db_get_cache_size(conn: &Connection) -> Result<CacheSize> {
    let feeds_bytes: u64 = conn
        .query_row(
            "SELECT COALESCE(SUM(
                LENGTH(uri) + LENGTH(cid) + LENGTH(author_did)
                + LENGTH(COALESCE(author_handle,''))
                + LENGTH(COALESCE(text,''))
                + LENGTH(COALESCE(json_record,''))
             ), 0) FROM posts",
            [],
            |row| row.get::<_, i64>(0),
        )
        .unwrap_or(0) as u64;

    let embedding_count: u64 = conn
        .query_row("SELECT COUNT(*) FROM posts_vec", [], |row| row.get::<_, i64>(0))
        .unwrap_or(0) as u64;
    let embeddings_bytes = embedding_count * (768 * 4);

    let fts_text_bytes: u64 = conn
        .query_row(
            "SELECT COALESCE(SUM(LENGTH(COALESCE(text,''))), 0) FROM posts",
            [],
            |row| row.get::<_, i64>(0),
        )
        .unwrap_or(0) as u64;

    let fts_bytes = fts_text_bytes * 2 / 5;

    let total_bytes = feeds_bytes + embeddings_bytes + fts_bytes;

    Ok(CacheSize { feeds_bytes, embeddings_bytes, fts_bytes, total_bytes })
}

/// NOTE: When scope is set to fts, it rebuilds the index rather than leaving it empty.
/// This preserves search correctness but we need to determine if the goal is disk reclamation
/// rather than reindex/defrag behavior.
fn db_clear_cache(conn: &Connection, scope: &str) -> Result<()> {
    match scope {
        "all" => {
            conn.execute("DELETE FROM posts", [])?;
            conn.execute("DELETE FROM posts_vec", [])?;
            conn.execute("DELETE FROM sync_state", [])?;
        }
        "feeds" => {
            conn.execute("DELETE FROM posts", [])?;
            conn.execute("DELETE FROM sync_state", [])?;
        }
        "embeddings" => {
            conn.execute("DELETE FROM posts_vec", [])?;
        }
        "fts" => {
            conn.execute_batch(
                "INSERT INTO posts_fts(posts_fts) VALUES('delete-all');
                 INSERT INTO posts_fts(posts_fts) VALUES('rebuild');",
            )?;
        }
        _ => {}
    }
    conn.execute_batch("PRAGMA wal_checkpoint(TRUNCATE); VACUUM;")?;
    Ok(())
}

fn export_posts_as_json(conn: &Connection, source: &str) -> Result<Vec<serde_json::Value>> {
    let mut stmt = conn.prepare(
        "SELECT storage_key, owner_did, uri, cid, author_did, author_handle, text, created_at, source
         FROM posts
         WHERE source = ?1
         ORDER BY created_at DESC, uri DESC",
    )?;

    let rows = stmt.query_map(params![source], |row| {
        Ok(serde_json::json!({
            "storageKey":   row.get::<_, Option<String>>(0)?,
            "ownerDid":     row.get::<_, Option<String>>(1)?,
            "uri":          row.get::<_, Option<String>>(2)?,
            "cid":          row.get::<_, Option<String>>(3)?,
            "authorDid":    row.get::<_, Option<String>>(4)?,
            "authorHandle": row.get::<_, Option<String>>(5)?,
            "text":         row.get::<_, Option<String>>(6)?,
            "createdAt":    row.get::<_, Option<String>>(7)?,
            "source":       row.get::<_, Option<String>>(8)?,
        }))
    })?;

    rows.collect::<rusqlite::Result<Vec<_>>>().map_err(AppError::from)
}

fn db_export_json(conn: &Connection, path: &str) -> Result<()> {
    let likes = export_posts_as_json(conn, "like")?;
    let bookmarks = export_posts_as_json(conn, "bookmark")?;
    let mut settings_stmt = conn.prepare("SELECT key, value FROM app_settings")?;
    let settings: serde_json::Map<String, serde_json::Value> = settings_stmt
        .query_map([], |row| Ok((row.get::<_, String>(0)?, row.get::<_, String>(1)?)))?
        .filter_map(|r| r.ok())
        .map(|(k, v)| (k, serde_json::Value::String(v)))
        .collect();

    let export = serde_json::json!({ "likes": likes, "bookmarks": bookmarks, "settings": settings });
    fs::write(path, serde_json::to_string_pretty(&export)?)?;
    Ok(())
}

fn db_export_csv(conn: &Connection, path: &str) -> Result<()> {
    let mut stmt = conn.prepare(
        "SELECT storage_key, owner_did, uri, cid, author_did, author_handle, text, created_at, source
         FROM posts
         WHERE source IN ('like', 'bookmark')
         ORDER BY created_at DESC, uri DESC",
    )?;

    let mut out =
        String::from("recordType,source,storageKey,ownerDid,uri,cid,authorDid,authorHandle,text,createdAt,key,value\n");
    let rows = stmt.query_map([], |row| {
        Ok([
            "post".to_string(),
            row.get::<_, Option<String>>(8)?.unwrap_or_default(),
            row.get::<_, Option<String>>(0)?.unwrap_or_default(),
            row.get::<_, Option<String>>(1)?.unwrap_or_default(),
            row.get::<_, Option<String>>(2)?.unwrap_or_default(),
            row.get::<_, Option<String>>(3)?.unwrap_or_default(),
            row.get::<_, Option<String>>(4)?.unwrap_or_default(),
            row.get::<_, Option<String>>(5)?.unwrap_or_default(),
            row.get::<_, Option<String>>(6)?.unwrap_or_default(),
            row.get::<_, Option<String>>(7)?.unwrap_or_default(),
            String::new(),
            String::new(),
        ])
    })?;

    for row in rows {
        let cols = row?;
        let line: Vec<String> = cols.iter().map(|c| csv_escape(c)).collect();
        out.push_str(&line.join(","));
        out.push('\n');
    }

    let mut settings_stmt = conn.prepare("SELECT key, value FROM app_settings ORDER BY key ASC")?;
    let settings_rows = settings_stmt.query_map([], |row| {
        Ok([
            "setting".to_string(),
            String::new(),
            String::new(),
            String::new(),
            String::new(),
            String::new(),
            String::new(),
            String::new(),
            String::new(),
            String::new(),
            row.get::<_, String>(0)?,
            row.get::<_, String>(1)?,
        ])
    })?;

    for row in settings_rows {
        let cols = row?;
        let line: Vec<String> = cols.iter().map(|c| csv_escape(c)).collect();
        out.push_str(&line.join(","));
        out.push('\n');
    }

    fs::write(path, out)?;
    Ok(())
}

fn csv_escape(s: &str) -> String {
    if s.contains(',') || s.contains('"') || s.contains('\n') || s.contains('\r') {
        format!("\"{}\"", s.replace('"', "\"\""))
    } else {
        s.to_string()
    }
}

fn db_reset_app(conn: &Connection) -> Result<()> {
    db::reset_database(conn)
}

/// Parse a single log line emitted by tauri-plugin-log v2.
///
/// Expected format: `YYYY-MM-DDTHH:MM:SS.ffffffZ LEVEL target: message`
fn parse_log_line(line: &str) -> LogEntry {
    let mut parts = line.splitn(3, ' ');
    let timestamp_token = parts.next().unwrap_or("");
    let level_token = parts.next().unwrap_or("").to_uppercase();
    let rest = parts.next().unwrap_or("").to_string();

    let is_valid_level = matches!(level_token.as_str(), "TRACE" | "DEBUG" | "INFO" | "WARN" | "ERROR");

    if is_valid_level {
        let timestamp = Some(timestamp_token.to_string());
        if let Some(colon_pos) = rest.find(": ") {
            let candidate_target = &rest[..colon_pos];
            if !candidate_target.contains(char::is_whitespace) {
                return LogEntry {
                    timestamp,
                    level: level_token,
                    target: Some(candidate_target.to_string()),
                    message: rest[colon_pos + 2..].to_string(),
                };
            }
        }
        return LogEntry { timestamp, level: level_token, target: None, message: rest };
    }

    LogEntry { timestamp: None, level: "INFO".to_string(), target: None, message: line.to_string() }
}

fn validate_export_target(path: &str) -> Result<()> {
    let trimmed = path.trim();
    if trimmed.is_empty() {
        return Err(AppError::validation("export path must not be empty"));
    }

    let export_path = Path::new(trimmed);
    let Some(parent) = export_path.parent() else {
        return Err(AppError::validation("export path must include a parent directory"));
    };

    if !parent.exists() {
        return Err(AppError::validation(format!(
            "export path parent directory does not exist: {}",
            parent.display()
        )));
    }

    Ok(())
}

fn normalize_log_level_filter(level: Option<&str>) -> Result<Option<String>> {
    let Some(level) = level.map(str::trim).filter(|level| !level.is_empty()) else {
        return Ok(None);
    };

    let normalized = level.to_ascii_uppercase();
    match normalized.as_str() {
        "ALL" => Ok(None),
        "TRACE" | "DEBUG" | "INFO" | "WARN" | "ERROR" => Ok(Some(normalized)),
        _ => Err(AppError::validation(format!("invalid log level filter: {level}"))),
    }
}

fn collect_log_files(app: &AppHandle, log_dir: &Path) -> Result<Vec<PathBuf>> {
    let app_name = app.package_info().name.as_str();
    let mut log_files = fs::read_dir(log_dir)?
        .filter_map(|entry| entry.ok())
        .map(|entry| entry.path())
        .filter(|path| path.is_file())
        .filter(|path| {
            path.file_name()
                .and_then(|name| name.to_str())
                .map(|name| name.starts_with(app_name) && name.ends_with(".log"))
                .unwrap_or(false)
        })
        .collect::<Vec<_>>();

    log_files.sort_by_key(|path| path.metadata().and_then(|metadata| metadata.modified()).ok());

    Ok(log_files)
}

fn apply_post_persist_side_effects(key: SettingsKey, value: &str, app: &AppHandle) {
    match key {
        SettingsKey::NotificationsBadge if value == "0" => notifications::clear_unread_badge(app),
        _ => {}
    }
}

pub fn get_settings(state: &AppState) -> Result<AppSettings> {
    let conn = state.auth_store.lock_connection()?;
    db_get_all_settings(&conn)
}

pub fn get_constellation_url(state: &AppState) -> Result<String> {
    Ok(get_settings(state)?.constellation_url)
}

pub fn update_setting(key: &str, value: &str, state: &AppState, app: &AppHandle) -> Result<()> {
    let valid_key = match SettingsKey::from_str(key) {
        Some(valid_key) if SettingsKey::valid_keys().contains(&valid_key) => valid_key,
        _ => return Err(AppError::Validation(format!("Unknown setting key: {key}"))),
    };
    let normalized_value = validate_and_normalize_setting(valid_key, value)?;

    if valid_key == SettingsKey::GlobalShortcut {
        tray::update_global_shortcut(app, &normalized_value)?;
    }

    let conn = state.auth_store.lock_connection()?;
    db_upsert_setting(&conn, &valid_key, &normalized_value)?;
    drop(conn);

    apply_post_persist_side_effects(valid_key, &normalized_value, app);
    Ok(())
}

pub fn set_constellation_url(url: &str, state: &AppState, app: &AppHandle) -> Result<()> {
    update_setting(SettingsKey::ConstellationUrl.as_str(), url, state, app)
}

pub fn get_cache_size(state: &AppState) -> Result<CacheSize> {
    let conn = state.auth_store.lock_connection()?;
    db_get_cache_size(&conn)
}

pub fn clear_cache(scope: &str, state: &AppState) -> Result<()> {
    match scope {
        "all" | "feeds" | "embeddings" | "fts" => {}
        _ => return Err(AppError::validation(format!("invalid cache scope: {scope}"))),
    }
    let conn = state.auth_store.lock_connection()?;
    db_clear_cache(&conn, scope)
}

pub fn export_data(format: &str, path: &str, state: &AppState) -> Result<()> {
    match format {
        "json" | "csv" => {}
        _ => return Err(AppError::validation(format!("invalid export format: {format}"))),
    }
    validate_export_target(path)?;
    log::info!("exporting data as {format} to {path}");
    let conn = state.auth_store.lock_connection()?;
    match format {
        "json" => db_export_json(&conn, path),
        "csv" => db_export_csv(&conn, path),
        _ => unreachable!(),
    }
}

pub fn reset_app(state: &AppState, app: &AppHandle) -> Result<()> {
    log::warn!("resetting app — all user data will be erased");
    let conn = state.auth_store.lock_connection()?;
    db_reset_app(&conn)?;
    drop(conn);

    state.clear_runtime_state()?;
    notifications::clear_unread_badge(app);
    tray::sync_global_shortcut(app)?;
    auth::emit_account_switch(app, None)?;
    Ok(())
}

pub fn get_log_entries(limit: u32, level: Option<&str>, app: &AppHandle) -> Result<Vec<LogEntry>> {
    let log_dir = app
        .path()
        .app_log_dir()
        .map_err(|e| AppError::PathResolve(e.to_string()))?;
    let level_filter = normalize_log_level_filter(level)?;
    let log_files = collect_log_files(app, &log_dir)?;

    if log_files.is_empty() {
        return Ok(vec![]);
    }
    let mut entries: Vec<LogEntry> = Vec::new();

    for log_file in log_files {
        let file = fs::File::open(&log_file)?;
        let reader = BufReader::new(file);

        for line in reader.lines() {
            let line = line?;
            if line.trim().is_empty() {
                continue;
            }
            let entry = parse_log_line(&line);
            if let Some(filter) = level_filter.as_deref() {
                if entry.level != filter {
                    continue;
                }
            }
            entries.push(entry);
        }
    }

    entries.reverse();
    entries.truncate(limit as usize);
    Ok(entries)
}

#[cfg(test)]
mod tests {
    use super::*;
    use rusqlite::{ffi::sqlite3_auto_extension, Connection};
    use sqlite_vec::sqlite3_vec_init;
    use std::time::{SystemTime, UNIX_EPOCH};

    fn settings_db() -> Connection {
        let conn = Connection::open_in_memory().expect("in-memory db should open");
        conn.execute_batch(include_str!("migrations/006_app_settings.sql"))
            .expect("settings migration should apply");
        conn
    }

    fn full_db() -> Connection {
        unsafe {
            sqlite3_auto_extension(Some(std::mem::transmute(sqlite3_vec_init as *const ())));
        }

        let conn = Connection::open_in_memory().expect("in-memory db should open");
        conn.execute_batch(include_str!("migrations/001_initial.sql"))
            .expect("migration 001 should apply");
        conn.execute_batch(include_str!("migrations/002_auth_storage.sql"))
            .expect("migration 002 should apply");
        conn.execute_batch(include_str!("migrations/003_oauth_sessions_without_fk.sql"))
            .expect("migration 003 should apply");
        conn.execute_batch(include_str!("migrations/004_account_avatars.sql"))
            .expect("migration 004 should apply");
        conn.execute_batch(include_str!("migrations/005_sync_state.sql"))
            .expect("migration 005 should apply");
        conn.execute_batch(include_str!("migrations/006_app_settings.sql"))
            .expect("migration 006 should apply");
        conn.execute_batch(include_str!("migrations/007_search_owner_scope.sql"))
            .expect("migration 007 should apply");
        conn
    }

    fn temp_export_path(extension: &str) -> PathBuf {
        let timestamp = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .expect("system clock should be after unix epoch")
            .as_nanos();
        std::env::temp_dir().join(format!("lazurite-settings-test-{timestamp}.{extension}"))
    }

    #[test]
    fn get_settings_returns_defaults_when_table_is_empty() {
        let conn = Connection::open_in_memory().expect("in-memory db should open");
        conn.execute_batch("CREATE TABLE app_settings (key TEXT PRIMARY KEY, value TEXT NOT NULL);")
            .expect("schema should apply");

        let settings = db_get_all_settings(&conn).expect("get_settings should succeed");
        assert_eq!(settings.theme, "auto");
        assert_eq!(settings.timeline_refresh_secs, 60);
        assert!(settings.notifications_desktop);
        assert!(settings.notifications_badge);
        assert!(!settings.notifications_sound);
        assert!(settings.embeddings_enabled);
        assert_eq!(settings.constellation_url, "https://constellation.microcosm.blue");
        assert_eq!(settings.spacedust_url, "https://spacedust.microcosm.blue");
        assert!(!settings.spacedust_instant);
        assert!(!settings.spacedust_enabled);
        assert_eq!(settings.global_shortcut, "Ctrl+Shift+N");
    }

    #[test]
    fn migration_006_seeds_embeddings_enabled() {
        let conn = settings_db();
        let settings = db_get_all_settings(&conn).expect("get_settings should succeed");
        assert!(
            settings.embeddings_enabled,
            "embeddings_enabled should default to true from seed"
        );
    }

    #[test]
    fn upsert_setting_stores_and_overwrites_value() {
        let conn = settings_db();

        db_upsert_setting(&conn, &SettingsKey::Theme, "dark").expect("upsert should succeed");
        let s = db_get_all_settings(&conn).expect("get_settings should succeed");
        assert_eq!(s.theme, "dark");

        db_upsert_setting(&conn, &SettingsKey::Theme, "light").expect("second upsert should succeed");
        let s2 = db_get_all_settings(&conn).expect("get_settings should succeed");
        assert_eq!(s2.theme, "light");
    }

    #[test]
    fn upsert_integer_setting_roundtrips() {
        let conn = settings_db();
        db_upsert_setting(&conn, &SettingsKey::TimelineRefreshSecs, "120").expect("upsert should succeed");
        let s = db_get_all_settings(&conn).expect("get_settings should succeed");
        assert_eq!(s.timeline_refresh_secs, 120);
    }

    #[test]
    fn upsert_boolean_setting_roundtrips() {
        let conn = settings_db();
        db_upsert_setting(&conn, &SettingsKey::NotificationsSound, "1").expect("upsert should succeed");
        let s = db_get_all_settings(&conn).expect("get_settings should succeed");
        assert!(s.notifications_sound);

        db_upsert_setting(&conn, &SettingsKey::NotificationsSound, "0").expect("upsert should succeed");
        let s2 = db_get_all_settings(&conn).expect("get_settings should succeed");
        assert!(!s2.notifications_sound);
    }

    #[test]
    fn unknown_setting_key_is_ignored_on_read() {
        let conn = settings_db();
        conn.execute(
            "INSERT INTO app_settings(key, value) VALUES('unknown_key', 'some_value')",
            [],
        )
        .expect("insert should succeed");

        let result = db_get_all_settings(&conn);
        assert!(result.is_ok());
    }

    #[test]
    fn update_setting_rejects_unknown_key() {
        let unknown = SettingsKey::from_str("nonexistent");
        assert!(unknown.is_none(), "from_str should return None for unknown key");
    }

    #[test]
    fn invalid_theme_value_is_rejected() {
        let error = validate_and_normalize_setting(SettingsKey::Theme, "midnight").expect_err("theme should reject");
        assert!(error.to_string().contains("theme"));
    }

    #[test]
    fn boolean_values_are_normalized_to_zero_or_one() {
        let normalized =
            validate_and_normalize_setting(SettingsKey::NotificationsDesktop, "true").expect("bool should normalize");
        assert_eq!(normalized, "1");

        let normalized =
            validate_and_normalize_setting(SettingsKey::NotificationsDesktop, "0").expect("bool should normalize");
        assert_eq!(normalized, "0");
    }

    #[test]
    fn invalid_refresh_interval_is_rejected() {
        let error = validate_and_normalize_setting(SettingsKey::TimelineRefreshSecs, "45")
            .expect_err("refresh interval should reject unsupported values");
        assert!(error.to_string().contains("timeline_refresh_secs"));
    }

    #[test]
    fn urls_are_validated_and_normalized() {
        let normalized = validate_and_normalize_setting(SettingsKey::ConstellationUrl, "https://example.com")
            .expect("url should validate");
        assert_eq!(normalized, "https://example.com/");
    }

    #[test]
    fn global_shortcut_values_are_validated() {
        let normalized = validate_and_normalize_setting(SettingsKey::GlobalShortcut, "Ctrl+Shift+N")
            .expect("shortcut should validate");
        assert_eq!(normalized, "Ctrl+Shift+N");

        let error = validate_and_normalize_setting(SettingsKey::GlobalShortcut, "not-a-shortcut")
            .expect_err("invalid shortcut should reject");
        assert!(error.to_string().contains("global_shortcut"));
    }

    #[test]
    fn all_valid_keys_are_recognized() {
        for key in SettingsKey::valid_keys() {
            assert!(SettingsKey::valid_keys().contains(key), "{key} should be in VALID_KEYS");
        }
    }

    #[test]
    fn cache_size_is_zero_on_empty_db() {
        let conn = full_db();
        let size = db_get_cache_size(&conn).expect("get_cache_size should succeed");
        assert_eq!(size.feeds_bytes, 0);
        assert_eq!(size.embeddings_bytes, 0);
        assert_eq!(size.fts_bytes, 0);
        assert_eq!(size.total_bytes, 0);
    }

    #[test]
    fn cache_size_grows_after_post_insert() {
        let conn = full_db();

        conn.execute(
            "INSERT INTO posts(storage_key, owner_did, uri, cid, author_did, text, source)
             VALUES('k1','did:plc:owner','at://did/post/1','cid1','did:plc:author','Hello world','timeline')",
            [],
        )
        .expect("post insert should succeed");

        let size = db_get_cache_size(&conn).expect("get_cache_size should succeed");
        assert!(
            size.feeds_bytes > 0,
            "feeds_bytes should be non-zero after inserting a post"
        );
    }

    #[test]
    fn clear_cache_feeds_removes_all_posts() {
        let conn = full_db();
        conn.execute(
            "INSERT INTO posts(storage_key, owner_did, uri, cid, author_did, source)
             VALUES('k1','did:plc:owner','at://uri','cid1','did:plc:author','timeline')",
            [],
        )
        .expect("insert should succeed");

        db_clear_cache(&conn, "feeds").expect("clear_cache feeds should succeed");

        let count: i64 = conn
            .query_row("SELECT COUNT(*) FROM posts", [], |r| r.get(0))
            .expect("count should succeed");
        assert_eq!(count, 0);
    }

    #[test]
    fn clear_cache_invalid_scope_errors() {
        let bad_scope = "nonexistent";
        assert!(!["all", "feeds", "embeddings", "fts"].contains(&bad_scope));
    }

    #[test]
    fn reset_app_clears_all_user_tables() {
        let conn = full_db();

        conn.execute(
            "INSERT INTO accounts(did, handle, pds_url, active) VALUES('did:plc:x','user','https://pds.example.com',1)",
            [],
        )
        .expect("account insert should succeed");
        conn.execute(
            "INSERT INTO posts(storage_key, owner_did, uri, cid, author_did, source)
             VALUES('k1','did:plc:x','at://uri','cid1','did:plc:x','timeline')",
            [],
        )
        .expect("post insert should succeed");
        conn.execute("INSERT INTO sync_state(did, source) VALUES('did:plc:x','timeline')", [])
            .expect("sync_state insert should succeed");

        db_reset_app(&conn).expect("reset_app should succeed");

        let post_count: i64 = conn.query_row("SELECT COUNT(*) FROM posts", [], |r| r.get(0)).unwrap();
        let account_count: i64 = conn
            .query_row("SELECT COUNT(*) FROM accounts", [], |r| r.get(0))
            .unwrap();
        let sync_count: i64 = conn
            .query_row("SELECT COUNT(*) FROM sync_state", [], |r| r.get(0))
            .unwrap();

        assert_eq!(post_count, 0, "posts should be empty after reset");
        assert_eq!(account_count, 0, "accounts should be empty after reset");
        assert_eq!(sync_count, 0, "sync_state should be empty after reset");
    }

    #[test]
    fn reset_app_re_seeds_embeddings_enabled() {
        let conn = full_db();

        conn.execute("UPDATE app_settings SET value='0' WHERE key='embeddings_enabled'", [])
            .expect("update should succeed");
        db_reset_app(&conn).expect("reset_app should succeed");

        let val: Option<String> = conn
            .query_row(
                "SELECT value FROM app_settings WHERE key='embeddings_enabled'",
                [],
                |r| r.get(0),
            )
            .unwrap();
        assert_eq!(
            val.as_deref(),
            Some("1"),
            "embeddings_enabled should be re-seeded to '1'"
        );
    }

    #[test]
    fn export_json_only_includes_user_owned_search_sources_and_settings() {
        let conn = full_db();
        let export_path = temp_export_path("json");

        conn.execute(
            "INSERT INTO posts(storage_key, owner_did, uri, cid, author_did, source)
             VALUES('like-key','did:plc:alice','at://did/post/1','cid1','did:plc:author','like')",
            [],
        )
        .expect("like insert should succeed");
        conn.execute(
            "INSERT INTO posts(storage_key, owner_did, uri, cid, author_did, source)
             VALUES('bookmark-key','did:plc:alice','at://did/post/2','cid2','did:plc:author','bookmark')",
            [],
        )
        .expect("bookmark insert should succeed");
        conn.execute(
            "INSERT INTO posts(storage_key, owner_did, uri, cid, author_did, source)
             VALUES('timeline-key','did:plc:alice','at://did/post/3','cid3','did:plc:author','timeline')",
            [],
        )
        .expect("timeline insert should succeed");
        conn.execute("INSERT INTO app_settings(key, value) VALUES('theme', 'dark')", [])
            .expect("settings insert should succeed");

        db_export_json(&conn, export_path.to_str().expect("path should be utf-8")).expect("json export should work");

        let exported = fs::read_to_string(&export_path).expect("export file should read");
        let parsed: serde_json::Value = serde_json::from_str(&exported).expect("json should parse");

        assert_eq!(parsed["likes"].as_array().map(Vec::len), Some(1));
        assert_eq!(parsed["bookmarks"].as_array().map(Vec::len), Some(1));
        assert_eq!(parsed["settings"]["theme"].as_str(), Some("dark"));

        let _ = fs::remove_file(export_path);
    }

    #[test]
    fn export_csv_includes_settings_rows() {
        let conn = full_db();
        let export_path = temp_export_path("csv");

        conn.execute(
            "INSERT INTO posts(storage_key, owner_did, uri, cid, author_did, source)
             VALUES('like-key','did:plc:alice','at://did/post/1','cid1','did:plc:author','like')",
            [],
        )
        .expect("like insert should succeed");
        conn.execute("INSERT INTO app_settings(key, value) VALUES('theme', 'dark')", [])
            .expect("settings insert should succeed");

        db_export_csv(&conn, export_path.to_str().expect("path should be utf-8")).expect("csv export should work");

        let exported = fs::read_to_string(&export_path).expect("export file should read");
        assert!(exported.contains("recordType,source,storageKey"));
        assert!(exported.contains("post,like,like-key"));
        assert!(exported.contains("setting,,,,,,,,,,theme,dark"));

        let _ = fs::remove_file(export_path);
    }

    #[test]
    fn csv_escape_leaves_simple_strings_unchanged() {
        assert_eq!(csv_escape("hello"), "hello");
        assert_eq!(csv_escape(""), "");
    }

    #[test]
    fn csv_escape_wraps_strings_with_commas() {
        assert_eq!(csv_escape("hello,world"), "\"hello,world\"");
    }

    #[test]
    fn csv_escape_doubles_internal_quotes() {
        assert_eq!(csv_escape("say \"hi\""), "\"say \"\"hi\"\"\"");
    }

    #[test]
    fn csv_escape_wraps_strings_with_newlines() {
        assert_eq!(csv_escape("line1\nline2"), "\"line1\nline2\"");
    }

    #[test]
    fn parse_log_line_handles_well_formed_line() {
        let line = "2024-01-15T10:30:00.000000Z INFO lazurite_desktop_lib::auth: session restored";
        let entry = parse_log_line(line);
        assert_eq!(entry.timestamp.as_deref(), Some("2024-01-15T10:30:00.000000Z"));
        assert_eq!(entry.level, "INFO");
        assert_eq!(entry.target.as_deref(), Some("lazurite_desktop_lib::auth"));
        assert_eq!(entry.message, "session restored");
    }

    #[test]
    fn parse_log_line_normalises_level_to_uppercase() {
        let line = "2024-01-15T10:30:00Z warn some::target: something happened";
        let entry = parse_log_line(line);
        assert_eq!(entry.level, "WARN");
    }

    #[test]
    fn parse_log_line_falls_back_on_unrecognised_format() {
        let line = "not a valid log line at all";
        let entry = parse_log_line(line);
        assert_eq!(entry.level, "INFO");
        assert_eq!(entry.message, line);
    }

    #[test]
    fn parse_log_line_handles_missing_target() {
        let line = "2024-01-15T10:30:00Z ERROR something went wrong";
        let entry = parse_log_line(line);
        assert_eq!(entry.level, "ERROR");
        assert!(entry.target.is_none());
        assert_eq!(entry.message, "something went wrong");
    }

    #[test]
    fn parse_log_line_keeps_colon_messages_when_no_target_is_present() {
        let line = "2024-01-15T10:30:00Z WARN failed to parse payload: invalid json";
        let entry = parse_log_line(line);
        assert_eq!(entry.level, "WARN");
        assert!(entry.target.is_none());
        assert_eq!(entry.message, "failed to parse payload: invalid json");
    }

    #[test]
    fn parse_bool_treats_zero_and_false_as_false() {
        assert!(!parse_bool("0"));
        assert!(!parse_bool("false"));
        assert!(!parse_bool("FALSE"));
        assert!(!parse_bool("False"));
    }

    #[test]
    fn parse_bool_treats_other_values_as_true() {
        assert!(parse_bool("1"));
        assert!(parse_bool("true"));
        assert!(parse_bool("yes"));
        assert!(parse_bool("TRUE"));
    }

    #[test]
    fn collect_log_files_filters_to_matching_log_prefix() {
        let temp_dir = std::env::temp_dir().join(format!(
            "lazurite-log-files-{}",
            SystemTime::now()
                .duration_since(UNIX_EPOCH)
                .expect("system clock should be after unix epoch")
                .as_nanos()
        ));
        fs::create_dir_all(&temp_dir).expect("temp dir should create");
        fs::write(temp_dir.join("lazurite-desktop.log"), "line").expect("log file should write");
        fs::write(temp_dir.join("lazurite-desktop.1.log"), "line").expect("rotated log should write");
        fs::write(temp_dir.join("different-app.log"), "line").expect("foreign log should write");

        let app_name = "lazurite-desktop";
        let mut log_files = fs::read_dir(&temp_dir)
            .expect("temp dir should read")
            .filter_map(|entry| entry.ok())
            .map(|entry| entry.path())
            .filter(|path| {
                path.file_name()
                    .and_then(|name| name.to_str())
                    .map(|name| name.starts_with(app_name) && name.ends_with(".log"))
                    .unwrap_or(false)
            })
            .collect::<Vec<_>>();
        log_files.sort();

        assert_eq!(log_files.len(), 2);

        let _ = fs::remove_dir_all(temp_dir);
    }
}

use super::auth::LazuriteOAuthSession;
use super::error::{AppError, Result};
use super::state::AppState;
use fastembed::{EmbeddingModel, TextEmbedding, TextInitOptions};
use hf_hub::api::{sync::ApiBuilder, Progress};
use hf_hub::Cache;
use jacquard::api::app_bsky::actor::search_actors::SearchActors;
use jacquard::api::app_bsky::bookmark::get_bookmarks::GetBookmarks;
use jacquard::api::app_bsky::feed::get_actor_likes::GetActorLikes;
use jacquard::api::app_bsky::feed::search_posts::SearchPosts;
use jacquard::api::app_bsky::graph::search_starter_packs::SearchStarterPacks;
use jacquard::types::did::Did;
use jacquard::types::ident::AtIdentifier;
use jacquard::xrpc::XrpcClient;
use rusqlite::{params, Connection, OptionalExtension};
use serde::Serialize;
use std::collections::HashMap;
use std::path::{Path, PathBuf};
use std::sync::{Arc, LazyLock, Mutex};
use std::time::{Duration, Instant};
use tauri::{AppHandle, Manager};
use tauri_plugin_log::log;

const DEFAULT_RRF_K: f64 = 60.0;
const EMBEDDING_MODEL_NAME: &str = "nomic-embed-text-v1.5";
const EMBEDDING_MODEL_REPO: &str = "nomic-ai/nomic-embed-text-v1.5";
const EMBEDDING_MODEL_FILE: &str = "onnx/model.onnx";
const EMBEDDING_TOKENIZER_FILES: &[&str] = &[
    "config.json",
    "special_tokens_map.json",
    "tokenizer.json",
    "tokenizer_config.json",
];
const EMBEDDING_DIMENSIONS: i64 = 768;
const SEARCH_SYNC_CHECK_INTERVAL: Duration = Duration::from_secs(5);
const SEARCH_SYNC_INTERVAL: Duration = Duration::from_secs(15 * 60);
static EMBEDDINGS_DOWNLOAD_STATE: LazyLock<Mutex<EmbeddingsDownloadState>> =
    LazyLock::new(|| Mutex::new(EmbeddingsDownloadState::default()));

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SyncStatus {
    pub did: String,
    pub source: String,
    pub post_count: i64,
    pub cursor: Option<String>,
    pub last_synced_at: Option<String>,
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PostResult {
    pub uri: String,
    pub cid: String,
    pub author_did: String,
    pub author_handle: Option<String>,
    pub text: Option<String>,
    pub created_at: Option<String>,
    pub source: String,
    pub score: f64,
    pub keyword_match: bool,
    pub semantic_match: bool,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
enum SearchMode {
    Keyword,
    Semantic,
    Hybrid,
}

#[derive(Clone, Debug)]
struct SearchRow {
    storage_key: String,
    post: PostResult,
}

#[derive(Clone, Debug, Default)]
struct EmbeddingsDownloadState {
    active: bool,
    current_file: Option<String>,
    downloaded_files: usize,
    total_files: usize,
    current_bytes: usize,
    current_total_bytes: usize,
    started_at: Option<Instant>,
    last_error: Option<String>,
}

struct ModelDownloadProgress {
    file_index: usize,
    total_files: usize,
}

impl ModelDownloadProgress {
    fn new(file_index: usize, total_files: usize) -> Self {
        Self { file_index, total_files }
    }
}

impl Progress for ModelDownloadProgress {
    fn init(&mut self, size: usize, filename: &str) {
        if let Ok(mut state) = EMBEDDINGS_DOWNLOAD_STATE.lock() {
            state.active = true;
            state.current_file = Some(filename.to_owned());
            state.downloaded_files = self.file_index;
            state.total_files = self.total_files;
            state.current_bytes = 0;
            state.current_total_bytes = size;
            state.started_at = Some(Instant::now());
            state.last_error = None;
        }
    }

    fn update(&mut self, size: usize) {
        if let Ok(mut state) = EMBEDDINGS_DOWNLOAD_STATE.lock() {
            state.current_bytes = state.current_bytes.saturating_add(size);
        }
    }

    fn finish(&mut self) {
        if let Ok(mut state) = EMBEDDINGS_DOWNLOAD_STATE.lock() {
            state.downloaded_files = self.file_index + 1;
            state.current_bytes = state.current_total_bytes;
        }
    }
}

fn validate_query(query: &str) -> Result<()> {
    if query.trim().is_empty() {
        return Err(AppError::validation("search query must not be empty"));
    }
    Ok(())
}

fn validate_limit(limit: u32) -> Result<usize> {
    match limit {
        0 => Err(AppError::validation("search limit must be greater than zero")),
        _ => Ok(limit as usize),
    }
}

fn validate_search_mode(mode: &str) -> Result<SearchMode> {
    match mode {
        "keyword" => Ok(SearchMode::Keyword),
        "semantic" => Ok(SearchMode::Semantic),
        "hybrid" => Ok(SearchMode::Hybrid),
        _ => Err(AppError::validation(
            "search mode must be 'keyword', 'semantic', or 'hybrid'",
        )),
    }
}

fn validate_source(source: &str) -> Result<()> {
    match source {
        "like" | "bookmark" => Ok(()),
        _ => Err(AppError::validation("source must be 'like' or 'bookmark'")),
    }
}

fn storage_key(owner_did: &str, source: &str, uri: &str) -> String {
    format!("{owner_did}|{source}|{uri}")
}

fn active_session_did(state: &AppState) -> Result<Option<String>> {
    Ok(state
        .active_session
        .read()
        .map_err(|error| {
            log::error!("active_session poisoned: {error}");
            AppError::StatePoisoned("active_session")
        })?
        .as_ref()
        .map(|session| session.did.clone()))
}

async fn get_session(state: &AppState) -> Result<Arc<LazuriteOAuthSession>> {
    let did = state
        .active_session
        .read()
        .map_err(|error| {
            log::error!("active_session poisoned: {error}");
            AppError::StatePoisoned("active_session")
        })?
        .as_ref()
        .ok_or_else(|| {
            log::error!("no active account");
            AppError::Validation("no active account".into())
        })?
        .did
        .clone();

    state
        .sessions
        .read()
        .map_err(|error| {
            log::error!("sessions poisoned: {error}");
            AppError::StatePoisoned("sessions")
        })?
        .get(&did)
        .cloned()
        .ok_or_else(|| {
            log::error!("session not found for active account");
            AppError::Validation("session not found for active account".into())
        })
}

fn db_load_sync_cursor(conn: &Connection, did: &str, source: &str) -> Result<Option<String>> {
    conn.query_row(
        "SELECT cursor FROM sync_state WHERE did = ?1 AND source = ?2",
        params![did, source],
        |row| row.get::<_, Option<String>>(0),
    )
    .optional()
    .map(|opt| opt.flatten())
    .map_err(AppError::from)
}

fn db_save_sync_state(conn: &Connection, did: &str, source: &str, cursor: Option<&str>) -> Result<()> {
    conn.execute(
        "INSERT INTO sync_state(did, source, cursor, last_synced_at)
         VALUES(?1, ?2, ?3, CURRENT_TIMESTAMP)
         ON CONFLICT(did, source) DO UPDATE SET
           cursor = excluded.cursor,
           last_synced_at = excluded.last_synced_at",
        params![did, source, cursor],
    )?;
    Ok(())
}

fn db_post_exists(conn: &Connection, storage_key: &str) -> Result<bool> {
    conn.query_row(
        "SELECT 1 FROM posts WHERE storage_key = ?1",
        params![storage_key],
        |_| Ok(()),
    )
    .optional()
    .map(|row| row.is_some())
    .map_err(AppError::from)
}

/// Upsert a single `FeedViewPost` JSON item into the `posts` table.
/// On conflict (same uri) updates mutable fields but keeps indexed_at.
fn db_upsert_post_value(conn: &Connection, owner_did: &str, post: &serde_json::Value, source: &str) -> Result<bool> {
    let uri = post
        .get("uri")
        .and_then(|v| v.as_str())
        .ok_or_else(|| AppError::validation("feed item missing post.uri"))?;
    let cid = post
        .get("cid")
        .and_then(|v| v.as_str())
        .ok_or_else(|| AppError::validation("feed item missing post.cid"))?;
    let author = post
        .get("author")
        .ok_or_else(|| AppError::validation("feed item missing post.author"))?;
    let author_did = author
        .get("did")
        .and_then(|v| v.as_str())
        .ok_or_else(|| AppError::validation("feed item missing post.author.did"))?;
    let author_handle = author.get("handle").and_then(|v| v.as_str());

    let record = post.get("record");
    let text = record.and_then(|r| r.get("text")).and_then(|v| v.as_str());
    let created_at = record.and_then(|r| r.get("createdAt")).and_then(|v| v.as_str());
    let json_record = record.map(|r| r.to_string());
    let storage_key = storage_key(owner_did, source, uri);
    let inserted = !db_post_exists(conn, &storage_key)?;

    conn.execute(
        "INSERT INTO posts(storage_key, owner_did, uri, cid, author_did, author_handle, text, created_at, json_record, source)
         VALUES(?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10)
         ON CONFLICT(storage_key) DO UPDATE SET
           cid           = excluded.cid,
           author_handle = excluded.author_handle,
           text          = excluded.text,
           created_at    = excluded.created_at,
           json_record   = excluded.json_record",
        params![
            storage_key,
            owner_did,
            uri,
            cid,
            author_did,
            author_handle,
            text,
            created_at,
            json_record,
            source
        ],
    )?;
    Ok(inserted)
}

fn db_upsert_post(conn: &Connection, owner_did: &str, feed_item: &serde_json::Value, source: &str) -> Result<bool> {
    let post = feed_item.get("post").unwrap_or(feed_item);
    let kind = post.get("$type").and_then(|value| value.as_str());
    match kind {
        Some("app.bsky.feed.defs#blockedPost" | "app.bsky.feed.defs#notFoundPost") => Ok(true),
        _ => db_upsert_post_value(conn, owner_did, post, source),
    }
}

fn db_upsert_bookmark(conn: &Connection, owner_did: &str, bookmark: &serde_json::Value) -> Result<bool> {
    let item = bookmark
        .get("item")
        .ok_or_else(|| AppError::validation("bookmark item missing item payload"))?;
    let kind = item.get("$type").and_then(|value| value.as_str());
    match kind {
        Some("app.bsky.feed.defs#blockedPost" | "app.bsky.feed.defs#notFoundPost") => Ok(true),
        _ => db_upsert_post_value(conn, owner_did, item, "bookmark"),
    }
}

fn db_post_count(conn: &Connection, owner_did: &str, source: &str) -> Result<i64> {
    conn.query_row(
        "SELECT COUNT(*) FROM posts WHERE owner_did = ?1 AND source = ?2",
        params![owner_did, source],
        |row| row.get(0),
    )
    .map_err(AppError::from)
}

fn db_sync_status(conn: &Connection, did: &str, source: &str) -> Result<SyncStatus> {
    let post_count = db_post_count(conn, did, source)?;
    let (cursor, last_synced_at) = conn
        .query_row(
            "SELECT cursor, last_synced_at FROM sync_state WHERE did = ?1 AND source = ?2",
            params![did, source],
            |row| Ok((row.get::<_, Option<String>>(0)?, row.get::<_, Option<String>>(1)?)),
        )
        .optional()?
        .unwrap_or((None, None));

    Ok(SyncStatus { did: did.to_owned(), source: source.to_owned(), post_count, cursor, last_synced_at })
}

pub async fn search_posts_network(
    query: String, sort: Option<String>, limit: Option<u32>, cursor: Option<String>, state: &AppState,
) -> Result<serde_json::Value> {
    validate_query(&query)?;
    let session = get_session(state).await?;

    let output = session
        .send(
            SearchPosts::new()
                .sort(sort.as_deref().map(|s| s.into()))
                .limit(limit.map(|l| l as i64))
                .cursor(cursor.as_deref().map(|c| c.into()))
                .q(query.as_str())
                .build(),
        )
        .await
        .map_err(|error| {
            log::error!("searchPosts error: {error}");
            AppError::validation("searchPosts error")
        })?
        .into_output()
        .map_err(|error| {
            log::error!("searchPosts output error: {error}");
            AppError::validation("searchPosts output error")
        })?;

    serde_json::to_value(&output).map_err(AppError::from)
}

pub async fn search_actors(
    query: String, limit: Option<u32>, cursor: Option<String>, state: &AppState,
) -> Result<serde_json::Value> {
    validate_query(&query)?;
    let session = get_session(state).await?;

    let output = session
        .send(
            SearchActors::new()
                .q(Some(query.as_str().into()))
                .limit(limit.map(|l| l as i64))
                .cursor(cursor.as_deref().map(|c| c.into()))
                .build(),
        )
        .await
        .map_err(|error| {
            log::error!("searchActors error: {error}");
            AppError::validation("searchActors error")
        })?
        .into_output()
        .map_err(|error| {
            log::error!("searchActors output error: {error}");
            AppError::validation("searchActors output error")
        })?;

    serde_json::to_value(&output).map_err(AppError::from)
}

pub async fn search_starter_packs(
    query: String, limit: Option<u32>, cursor: Option<String>, state: &AppState,
) -> Result<serde_json::Value> {
    validate_query(&query)?;
    let session = get_session(state).await?;

    let output = session
        .send(
            SearchStarterPacks::new()
                .limit(limit.map(|l| l as i64))
                .cursor(cursor.as_deref().map(|c| c.into()))
                .q(query.as_str())
                .build(),
        )
        .await
        .map_err(|error| {
            log::error!("searchStarterPacks error: {error}");
            AppError::validation("searchStarterPacks error")
        })?
        .into_output()
        .map_err(|error| {
            log::error!("searchStarterPacks output error: {error}");
            AppError::validation("searchStarterPacks output error")
        })?;

    serde_json::to_value(&output).map_err(AppError::from)
}

/// Sync the authenticated user's likes (or bookmarks) into the local DB.
///
/// Resumes from the last stored cursor if a previous sync was interrupted.
/// During a fresh sync pass, we stop once we hit already-indexed items so we do not re-fetch the full history.
pub async fn sync_posts(did: String, source: String, state: &AppState) -> Result<SyncStatus> {
    validate_source(&source)?;
    let session = get_session(state).await?;

    let mut cursor: Option<String> = {
        let conn = state.auth_store.lock_connection()?;
        db_load_sync_cursor(&conn, &did, &source)?
    };
    let resuming = cursor.is_some();

    log::info!("starting {source} sync for {did}, resume cursor: {cursor:?}");

    loop {
        let (items, next_cursor) = match source.as_str() {
            "like" => {
                let output = session
                    .send(
                        GetActorLikes::new()
                            .limit(Some(100i64))
                            .cursor(cursor.as_deref().map(|value| value.into()))
                            .actor(AtIdentifier::Did(Did::new(&did)?))
                            .build(),
                    )
                    .await
                    .map_err(|error| {
                        log::error!("getActorLikes error: {error}");
                        AppError::validation("getActorLikes error")
                    })?
                    .into_output()
                    .map_err(|error| {
                        log::error!("getActorLikes output error: {error}");
                        AppError::validation("getActorLikes output error")
                    })?;
                let output_json = serde_json::to_value(&output)?;
                let feed = output_json
                    .get("feed")
                    .and_then(|value| value.as_array())
                    .cloned()
                    .unwrap_or_default();
                let next = output_json
                    .get("cursor")
                    .and_then(|value| value.as_str())
                    .map(str::to_owned);
                (feed, next)
            }
            "bookmark" => {
                let output = session
                    .send(
                        GetBookmarks::new()
                            .limit(Some(100i64))
                            .cursor(cursor.as_deref().map(|value| value.into()))
                            .build(),
                    )
                    .await
                    .map_err(|error| {
                        log::error!("getBookmarks error: {error}");
                        AppError::validation("getBookmarks error")
                    })?
                    .into_output()
                    .map_err(|error| {
                        log::error!("getBookmarks output error: {error}");
                        AppError::validation("getBookmarks output error")
                    })?;
                let output_json = serde_json::to_value(&output)?;
                let bookmarks = output_json
                    .get("bookmarks")
                    .and_then(|value| value.as_array())
                    .cloned()
                    .unwrap_or_default();
                let next = output_json
                    .get("cursor")
                    .and_then(|value| value.as_str())
                    .map(str::to_owned);
                (bookmarks, next)
            }
            _ => unreachable!(),
        };

        {
            let conn = state.auth_store.lock_connection()?;
            if items.is_empty() {
                db_save_sync_state(&conn, &did, &source, None)?;
                log::info!("{source} sync for {did}: empty page, stopping");
                break;
            }

            let mut inserted_count = 0usize;
            let mut existing_count = 0usize;

            for item in &items {
                let inserted = match source.as_str() {
                    "like" => db_upsert_post(&conn, &did, item, &source)?,
                    "bookmark" => db_upsert_bookmark(&conn, &did, item)?,
                    _ => unreachable!(),
                };

                if inserted {
                    inserted_count += 1;
                } else {
                    existing_count += 1;
                }
            }

            let stop_after_page = !resuming && existing_count > 0;
            let cursor_to_store = if stop_after_page { None } else { next_cursor.as_deref() };
            db_save_sync_state(&conn, &did, &source, cursor_to_store)?;

            log::debug!(
                "{source} sync for {did}: processed {} item(s), inserted {}, existing {}, next cursor: {next_cursor:?}",
                items.len(),
                inserted_count,
                existing_count
            );

            if stop_after_page {
                log::info!("{source} sync for {did}: reached previously indexed items, stopping");
                break;
            }
        }

        match next_cursor {
            None => {
                log::info!("{source} sync for {did}: reached end of feed");
                break;
            }
            Some(next) => cursor = Some(next),
        }
    }

    let conn = state.auth_store.lock_connection()?;
    db_sync_status(&conn, &did, &source)
}

/// Returns sync status for all sources for the given DID.
pub fn get_sync_status(did: &str, state: &AppState) -> Result<Vec<SyncStatus>> {
    let conn = state.auth_store.lock_connection()?;
    ["like", "bookmark"]
        .into_iter()
        .map(|source| db_sync_status(&conn, did, source))
        .collect()
}

const EMBED_BATCH_SIZE: usize = 32;

fn build_embedding_model(models_dir: PathBuf) -> Result<TextEmbedding> {
    ensure_model_downloaded(&models_dir)?;
    TextEmbedding::try_new(
        TextInitOptions::new(EmbeddingModel::NomicEmbedTextV15)
            .with_cache_dir(models_dir)
            .with_show_download_progress(false),
    )
    .map_err(|error| AppError::validation(format!("failed to init embedding model: {error}")))
}

fn resolve_models_dir(app: &AppHandle) -> Result<PathBuf> {
    let mut dir = app
        .path()
        .app_data_dir()
        .map_err(|error| AppError::PathResolve(error.to_string()))?;
    dir.push("models");
    std::fs::create_dir_all(&dir)?;
    Ok(dir)
}

fn required_embedding_files() -> Vec<&'static str> {
    let mut files = vec![EMBEDDING_MODEL_FILE];
    files.extend(EMBEDDING_TOKENIZER_FILES);
    files
}

fn cached_embedding_files(models_dir: &Path) -> usize {
    let cache = Cache::new(models_dir.to_path_buf());
    let repo = cache.model(EMBEDDING_MODEL_REPO.to_owned());
    required_embedding_files()
        .into_iter()
        .filter(|filename| repo.get(filename).is_some())
        .count()
}

fn embeddings_downloaded(models_dir: &Path) -> bool {
    cached_embedding_files(models_dir) == required_embedding_files().len()
}

fn set_download_idle_state(downloaded_files: usize, total_files: usize) {
    if let Ok(mut state) = EMBEDDINGS_DOWNLOAD_STATE.lock() {
        state.active = false;
        state.current_file = None;
        state.downloaded_files = downloaded_files;
        state.total_files = total_files;
        state.current_bytes = 0;
        state.current_total_bytes = 0;
        state.started_at = None;
        state.last_error = None;
    }
}

fn set_download_error(message: String) {
    if let Ok(mut state) = EMBEDDINGS_DOWNLOAD_STATE.lock() {
        state.active = false;
        state.current_file = None;
        state.current_bytes = 0;
        state.current_total_bytes = 0;
        state.started_at = None;
        state.last_error = Some(message);
    }
}

fn ensure_model_downloaded(models_dir: &Path) -> Result<()> {
    let required_files = required_embedding_files();
    let total_files = required_files.len();
    let already_cached = cached_embedding_files(models_dir);
    if already_cached == total_files {
        set_download_idle_state(total_files, total_files);
        return Ok(());
    }

    set_download_idle_state(already_cached, total_files);

    let api = ApiBuilder::new()
        .with_cache_dir(models_dir.to_path_buf())
        .with_progress(false)
        .build()
        .map_err(|error| AppError::validation(format!("failed to initialize embeddings downloader: {error}")))?;
    let repo = api.model(EMBEDDING_MODEL_REPO.to_owned());
    let cache = Cache::new(models_dir.to_path_buf());
    let cache_repo = cache.model(EMBEDDING_MODEL_REPO.to_owned());

    for (index, filename) in required_files.iter().enumerate() {
        if cache_repo.get(filename).is_some() {
            set_download_idle_state(index + 1, total_files);
            continue;
        }

        let download = repo.download_with_progress(filename, ModelDownloadProgress::new(index, total_files));
        if let Err(error) = download {
            let message = format!("failed to download embeddings file {filename}: {error}");
            set_download_error(message.clone());
            return Err(AppError::validation(message));
        }
    }

    set_download_idle_state(total_files, total_files);
    Ok(())
}

fn db_get_embeddings_enabled(conn: &Connection) -> Result<bool> {
    let val: Option<String> = conn
        .query_row(
            "SELECT value FROM app_settings WHERE key = 'embeddings_enabled'",
            [],
            |row| row.get(0),
        )
        .optional()?;
    Ok(val.map(|v| v != "0").unwrap_or(true))
}

fn db_set_embeddings_enabled(conn: &Connection, enabled: bool) -> Result<()> {
    conn.execute(
        "INSERT INTO app_settings(key, value) VALUES('embeddings_enabled', ?1)
         ON CONFLICT(key) DO UPDATE SET value = excluded.value",
        params![if enabled { "1" } else { "0" }],
    )?;
    Ok(())
}

fn db_keyword_search(conn: &Connection, owner_did: &str, query: &str, limit: usize) -> Result<Vec<SearchRow>> {
    let match_query = build_fts_match_query(query);
    let mut stmt = conn.prepare(
        "SELECT p.storage_key,
                p.uri,
                p.cid,
                p.author_did,
                p.author_handle,
                p.text,
                p.created_at,
                p.source,
                bm25(posts_fts) AS rank
         FROM posts_fts
         JOIN posts p ON p.rowid = posts_fts.rowid
         WHERE p.owner_did = ?1
           AND posts_fts MATCH ?2
         ORDER BY rank ASC, p.created_at DESC, p.uri ASC
         LIMIT ?3",
    )?;

    let rows = stmt.query_map(
        params![owner_did, match_query, limit as i64],
        search_row_from_keyword_row,
    )?;
    rows.collect::<rusqlite::Result<Vec<_>>>().map_err(AppError::from)
}

fn db_semantic_search(
    conn: &Connection, owner_did: &str, query_embedding: &[f32], limit: usize,
) -> Result<Vec<SearchRow>> {
    let bytes: Vec<u8> = query_embedding.iter().flat_map(|f| f.to_le_bytes()).collect();
    let mut stmt = conn.prepare(
        "SELECT p.storage_key,
                p.uri,
                p.cid,
                p.author_did,
                p.author_handle,
                p.text,
                p.created_at,
                p.source,
                v.distance
         FROM posts_vec v
         JOIN posts p ON p.storage_key = v.storage_key
         WHERE p.owner_did = ?1
           AND v.embedding MATCH ?2
           AND v.k = ?3
         ORDER BY v.distance ASC, p.created_at DESC, p.uri ASC
        ",
    )?;

    let rows = stmt.query_map(
        params![owner_did, bytes.as_slice(), limit as i64],
        search_row_from_semantic_row,
    )?;
    rows.collect::<rusqlite::Result<Vec<_>>>().map_err(AppError::from)
}

fn search_row_from_keyword_row(row: &rusqlite::Row<'_>) -> rusqlite::Result<SearchRow> {
    let raw_rank = row.get::<_, f64>(8)?;
    Ok(SearchRow {
        storage_key: row.get(0)?,
        post: PostResult {
            uri: row.get(1)?,
            cid: row.get(2)?,
            author_did: row.get(3)?,
            author_handle: row.get(4)?,
            text: row.get(5)?,
            created_at: row.get(6)?,
            source: row.get(7)?,
            score: -raw_rank,
            keyword_match: true,
            semantic_match: false,
        },
    })
}

fn search_row_from_semantic_row(row: &rusqlite::Row<'_>) -> rusqlite::Result<SearchRow> {
    let distance = row.get::<_, f64>(8)?;
    Ok(SearchRow {
        storage_key: row.get(0)?,
        post: PostResult {
            uri: row.get(1)?,
            cid: row.get(2)?,
            author_did: row.get(3)?,
            author_handle: row.get(4)?,
            text: row.get(5)?,
            created_at: row.get(6)?,
            source: row.get(7)?,
            score: 1.0 / (1.0 + distance),
            keyword_match: false,
            semantic_match: true,
        },
    })
}

fn build_fts_match_query(query: &str) -> String {
    let tokens: Vec<String> = query
        .split_whitespace()
        .filter(|token| !token.is_empty())
        .map(|token| format!("\"{}\"", token.replace('"', "\"\"")))
        .collect();

    if tokens.is_empty() {
        format!("\"{}\"", query.trim().replace('"', "\"\""))
    } else {
        tokens.join(" AND ")
    }
}

fn rrf_merge(keyword_rows: Vec<SearchRow>, semantic_rows: Vec<SearchRow>, limit: usize) -> Vec<PostResult> {
    let mut fused: HashMap<String, SearchRow> = HashMap::new();
    let mut scores: HashMap<String, f64> = HashMap::new();

    for rows in [keyword_rows, semantic_rows] {
        for (rank, row) in rows.into_iter().enumerate() {
            let score = 1.0 / (DEFAULT_RRF_K + rank as f64 + 1.0);
            scores
                .entry(row.storage_key.clone())
                .and_modify(|value| *value += score)
                .or_insert(score);
            fused
                .entry(row.storage_key.clone())
                .and_modify(|existing| {
                    existing.post.keyword_match |= row.post.keyword_match;
                    existing.post.semantic_match |= row.post.semantic_match;
                })
                .or_insert(row);
        }
    }

    let mut rows: Vec<SearchRow> = fused
        .into_iter()
        .filter_map(|(key, mut row)| {
            scores.get(&key).map(|score| {
                row.post.score = *score;
                row
            })
        })
        .collect();

    rows.sort_by(|left, right| {
        right
            .post
            .score
            .total_cmp(&left.post.score)
            .then_with(|| right.post.created_at.cmp(&left.post.created_at))
            .then_with(|| left.post.uri.cmp(&right.post.uri))
    });

    rows.into_iter().take(limit).map(|row| row.post).collect()
}

fn run_local_search(
    conn: &Connection, owner_did: &str, query: &str, mode: SearchMode, limit: usize, embeddings_enabled: bool,
    query_embedding: Option<&[f32]>,
) -> Result<Vec<PostResult>> {
    match mode {
        SearchMode::Keyword => {
            db_keyword_search(conn, owner_did, query, limit).map(|rows| rows.into_iter().map(|row| row.post).collect())
        }
        SearchMode::Semantic => {
            if !embeddings_enabled {
                return Err(AppError::validation(
                    "semantic search is unavailable while embeddings are disabled",
                ));
            }

            let query_embedding =
                query_embedding.ok_or_else(|| AppError::validation("semantic search query embedding missing"))?;
            db_semantic_search(conn, owner_did, query_embedding, limit)
                .map(|rows| rows.into_iter().map(|row| row.post).collect())
        }
        SearchMode::Hybrid => {
            let candidate_limit = limit.saturating_mul(4).min(100);
            let keyword_rows = db_keyword_search(conn, owner_did, query, candidate_limit)?;

            if !embeddings_enabled {
                return Ok(keyword_rows.into_iter().take(limit).map(|row| row.post).collect());
            }

            let Some(query_embedding) = query_embedding else {
                return Err(AppError::validation("hybrid search query embedding missing"));
            };

            let semantic_rows = db_semantic_search(conn, owner_did, query_embedding, candidate_limit)?;
            Ok(rrf_merge(keyword_rows, semantic_rows, limit))
        }
    }
}

fn embed_query_text(query: &str, models_dir: PathBuf) -> Result<Vec<f32>> {
    let mut model = build_embedding_model(models_dir)?;
    let embeddings = model
        .embed(vec![query.to_owned()], Some(1))
        .map_err(|error| AppError::validation(format!("embedding error: {error}")))?;

    embeddings
        .into_iter()
        .next()
        .ok_or_else(|| AppError::validation("embedding model returned no query embedding"))
}

/// Returns (storage_key, text) for posts that have no embedding yet.
fn db_posts_without_embeddings(conn: &Connection) -> Result<Vec<(String, String)>> {
    let mut stmt = conn.prepare(
        "SELECT p.storage_key, p.text
         FROM posts p
         WHERE p.text IS NOT NULL
           AND p.text != ''
           AND p.storage_key NOT IN (SELECT storage_key FROM posts_vec)",
    )?;

    let rows = stmt.query_map([], |row| Ok((row.get::<_, String>(0)?, row.get::<_, String>(1)?)))?;
    rows.collect::<rusqlite::Result<Vec<_>>>().map_err(AppError::from)
}

/// Returns (storage_key, text) for ALL posts that have non-empty text.
fn db_all_posts_with_text(conn: &Connection) -> Result<Vec<(String, String)>> {
    let mut stmt = conn.prepare("SELECT storage_key, text FROM posts WHERE text IS NOT NULL AND text != ''")?;

    let rows = stmt.query_map([], |row| Ok((row.get::<_, String>(0)?, row.get::<_, String>(1)?)))?;
    rows.collect::<rusqlite::Result<Vec<_>>>().map_err(AppError::from)
}

fn db_upsert_embedding(conn: &Connection, storage_key: &str, embedding: &[f32]) -> Result<()> {
    let bytes: Vec<u8> = embedding.iter().flat_map(|f| f.to_le_bytes()).collect();
    conn.execute(
        "INSERT OR REPLACE INTO posts_vec(storage_key, embedding) VALUES(?1, ?2)",
        params![storage_key, bytes.as_slice()],
    )?;
    Ok(())
}

fn embed_posts(posts: &[(String, String)], models_dir: PathBuf, state: &AppState) -> Result<usize> {
    if posts.is_empty() {
        return Ok(0);
    }

    let mut model = build_embedding_model(models_dir)?;

    let mut total = 0usize;

    for chunk in posts.chunks(EMBED_BATCH_SIZE) {
        let texts: Vec<String> = chunk.iter().map(|(_, text)| text.clone()).collect();
        let embeddings = model
            .embed(texts, Some(EMBED_BATCH_SIZE))
            .map_err(|error| AppError::validation(format!("embedding error: {error}")))?;

        let conn = state.auth_store.lock_connection()?;
        for ((storage_key, _), embedding) in chunk.iter().zip(embeddings.iter()) {
            db_upsert_embedding(&conn, storage_key, embedding)?;
        }
        total += chunk.len();
    }

    Ok(total)
}

pub fn search_posts(query: &str, mode: &str, limit: u32, app: &AppHandle, state: &AppState) -> Result<Vec<PostResult>> {
    validate_query(&query)?;
    let limit = validate_limit(limit)?;
    let mode = validate_search_mode(&mode)?;
    let owner_did = active_session_did(state)?.ok_or_else(|| AppError::validation("no active account"))?;

    let embeddings_enabled = {
        let conn = state.auth_store.lock_connection()?;
        db_get_embeddings_enabled(&conn)?
    };

    let query_embedding = match mode {
        SearchMode::Keyword => None,
        SearchMode::Semantic | SearchMode::Hybrid if embeddings_enabled => {
            let models_dir = resolve_models_dir(app)?;
            Some(embed_query_text(&query, models_dir)?)
        }
        SearchMode::Semantic => {
            return Err(AppError::validation(
                "semantic search is unavailable while embeddings are disabled",
            ));
        }
        SearchMode::Hybrid => None,
    };

    let conn = state.auth_store.lock_connection()?;
    run_local_search(
        &conn,
        &owner_did,
        &query,
        mode,
        limit,
        embeddings_enabled,
        query_embedding.as_deref(),
    )
}

/// Embed all posts that do not yet have an embedding. Skipped when embeddings are disabled.
pub fn embed_pending_posts(app: &AppHandle, state: &AppState) -> Result<usize> {
    let enabled = {
        let conn = state.auth_store.lock_connection()?;
        db_get_embeddings_enabled(&conn)?
    };
    if !enabled {
        log::info!("embeddings disabled, skipping embed_pending_posts");
        return Ok(0);
    }

    let posts = {
        let conn = state.auth_store.lock_connection()?;
        db_posts_without_embeddings(&conn)?
    };

    log::info!("embedding {} pending posts", posts.len());
    let models_dir = resolve_models_dir(app)?;
    embed_posts(&posts, models_dir, state)
}

/// Clear all embeddings from `posts_vec` then re-embed every post.
pub fn reindex_embeddings(app: &AppHandle, state: &AppState) -> Result<usize> {
    {
        let conn = state.auth_store.lock_connection()?;
        conn.execute("DELETE FROM posts_vec", [])?;
    }
    log::info!("cleared posts_vec for reindex");

    let posts = {
        let conn = state.auth_store.lock_connection()?;
        db_all_posts_with_text(&conn)?
    };

    log::info!("reindexing {} posts", posts.len());
    let models_dir = resolve_models_dir(app)?;
    embed_posts(&posts, models_dir, state)
}

/// Persist the embeddings-enabled preference.
pub fn set_embeddings_enabled(enabled: bool, state: &AppState) -> Result<()> {
    let conn = state.auth_store.lock_connection()?;
    db_set_embeddings_enabled(&conn, enabled)
}

/// Get the current embeddings-enabled preference.
pub fn get_embeddings_enabled(state: &AppState) -> Result<bool> {
    let conn = state.auth_store.lock_connection()?;
    db_get_embeddings_enabled(&conn)
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct EmbeddingsConfig {
    pub enabled: bool,
    pub model_name: String,
    pub dimensions: i64,
    pub downloaded: bool,
    pub download_active: bool,
    pub download_progress: Option<f64>,
    pub download_eta_seconds: Option<u64>,
    pub download_file: Option<String>,
    pub download_file_index: Option<usize>,
    pub download_file_total: Option<usize>,
    pub last_error: Option<String>,
}

/// Get the embeddings configuration.
pub fn get_embeddings_config(app: &AppHandle, state: &AppState) -> Result<EmbeddingsConfig> {
    let conn = state.auth_store.lock_connection()?;
    let enabled = db_get_embeddings_enabled(&conn)?;
    let models_dir = resolve_models_dir(app)?;
    let downloaded = embeddings_downloaded(&models_dir);
    let state = EMBEDDINGS_DOWNLOAD_STATE
        .lock()
        .map_err(|_| AppError::StatePoisoned("embeddings_download_state"))?;
    let download_progress = if state.active && state.current_total_bytes > 0 {
        Some((state.current_bytes as f64 / state.current_total_bytes as f64) * 100.0)
    } else if downloaded {
        Some(100.0)
    } else {
        None
    };
    let download_eta_seconds = if state.active {
        state.started_at.and_then(|started_at| {
            let elapsed = started_at.elapsed().as_secs_f64();
            let current = state.current_bytes as f64;
            let total = state.current_total_bytes as f64;
            if elapsed <= 0.0 || current <= 0.0 || total <= current {
                None
            } else {
                let bytes_per_second = current / elapsed;
                let remaining = total - current;
                Some((remaining / bytes_per_second).ceil() as u64)
            }
        })
    } else {
        None
    };

    Ok(EmbeddingsConfig {
        enabled,
        model_name: EMBEDDING_MODEL_NAME.to_string(),
        dimensions: EMBEDDING_DIMENSIONS,
        downloaded,
        download_active: state.active,
        download_progress,
        download_eta_seconds,
        download_file: state.current_file.clone(),
        download_file_index: state.active.then_some(state.downloaded_files + 1),
        download_file_total: (state.total_files > 0).then_some(state.total_files),
        last_error: state.last_error.clone(),
    })
}

pub fn prepare_embeddings_model(app: &AppHandle, state: &AppState) -> Result<EmbeddingsConfig> {
    let enabled = {
        let conn = state.auth_store.lock_connection()?;
        db_get_embeddings_enabled(&conn)?
    };

    if enabled {
        let models_dir = resolve_models_dir(app)?;
        ensure_model_downloaded(&models_dir)?;
    }

    get_embeddings_config(app, state)
}

fn sync_due(active_did: Option<&str>, last_synced_did: Option<&str>, last_synced_at: Option<Instant>) -> bool {
    match active_did {
        None => false,
        Some(did) if Some(did) != last_synced_did => true,
        Some(_) => last_synced_at
            .map(|instant| instant.elapsed() >= SEARCH_SYNC_INTERVAL)
            .unwrap_or(true),
    }
}

/// Keeps the active account's local search index warm by syncing likes on login/account switch
/// and then re-syncing every 15 minutes. Embeddings are refreshed for newly synced posts.
pub fn spawn_search_sync_task(app: AppHandle) {
    tauri::async_runtime::spawn(async move {
        let mut last_synced_did: Option<String> = None;
        let mut last_synced_at: Option<Instant> = None;

        loop {
            let state = app.state::<AppState>();
            let active_did = match active_session_did(&state) {
                Ok(value) => value,
                Err(error) => {
                    log::warn!("search sync failed to read active session: {error}");
                    tokio::time::sleep(SEARCH_SYNC_CHECK_INTERVAL).await;
                    continue;
                }
            };

            if active_did.is_none() {
                last_synced_did = None;
                last_synced_at = None;
                tokio::time::sleep(SEARCH_SYNC_CHECK_INTERVAL).await;
                continue;
            }

            if sync_due(active_did.as_deref(), last_synced_did.as_deref(), last_synced_at) {
                let did = active_did.clone().unwrap_or_default();
                let like_sync = sync_posts(did.clone(), "like".to_owned(), &state).await;
                let bookmark_sync = sync_posts(did.clone(), "bookmark".to_owned(), &state).await;
                match (like_sync, bookmark_sync) {
                    (Ok(like_status), Ok(bookmark_status)) => {
                        log::info!(
                            "background search sync complete for {} likes/bookmarks: {}/{} post(s)",
                            did,
                            like_status.post_count,
                            bookmark_status.post_count
                        );
                        if let Err(error) = embed_pending_posts(&app, &state) {
                            log::warn!("background embedding pass failed for {did}: {error}");
                        }
                        last_synced_did = Some(did);
                        last_synced_at = Some(Instant::now());
                    }
                    (Err(error), _) | (_, Err(error)) => {
                        log::warn!("background search sync failed: {error}");
                    }
                }
            }

            tokio::time::sleep(SEARCH_SYNC_CHECK_INTERVAL).await;
        }
    });
}

#[cfg(test)]
mod tests {
    use super::{
        build_fts_match_query, db_get_embeddings_enabled, db_load_sync_cursor, db_post_count, db_save_sync_state,
        db_semantic_search, db_set_embeddings_enabled, db_sync_status, db_upsert_embedding, db_upsert_post,
        run_local_search, storage_key, sync_due, validate_limit, validate_query, validate_search_mode, validate_source,
        SearchMode,
    };
    use rusqlite::{ffi::sqlite3_auto_extension, Connection};
    use sqlite_vec::sqlite3_vec_init;

    fn test_db() -> Connection {
        unsafe {
            sqlite3_auto_extension(Some(std::mem::transmute(sqlite3_vec_init as *const ())));
        }

        let conn = Connection::open_in_memory().expect("in-memory db should open");
        conn.execute_batch(
            "CREATE TABLE posts (
               storage_key TEXT PRIMARY KEY,
               owner_did TEXT NOT NULL,
               uri TEXT NOT NULL,
               cid TEXT NOT NULL,
               author_did TEXT NOT NULL,
               author_handle TEXT,
               text TEXT,
               created_at TEXT,
               indexed_at TEXT DEFAULT CURRENT_TIMESTAMP,
               json_record TEXT,
               source TEXT NOT NULL,
               UNIQUE(owner_did, source, uri)
             );
             CREATE VIRTUAL TABLE posts_fts USING fts5(
               text,
               content=posts,
               content_rowid=rowid
             );
             CREATE VIRTUAL TABLE posts_vec USING vec0(
               storage_key TEXT PRIMARY KEY,
               embedding float[3]
             );
             CREATE TRIGGER posts_ai AFTER INSERT ON posts BEGIN
               INSERT INTO posts_fts(rowid, text) VALUES (new.rowid, new.text);
             END;
             CREATE TRIGGER posts_ad AFTER DELETE ON posts BEGIN
               INSERT INTO posts_fts(posts_fts, rowid, text)
               VALUES('delete', old.rowid, old.text);
             END;
             CREATE TRIGGER posts_au AFTER UPDATE ON posts BEGIN
               INSERT INTO posts_fts(posts_fts, rowid, text)
               VALUES('delete', old.rowid, old.text);
               INSERT INTO posts_fts(rowid, text) VALUES (new.rowid, new.text);
             END;
             CREATE TABLE sync_state (
               did TEXT NOT NULL,
               source TEXT NOT NULL,
               cursor TEXT,
               last_synced_at TEXT,
               PRIMARY KEY (did, source)
             );
             CREATE TABLE app_settings (
               key   TEXT PRIMARY KEY,
               value TEXT NOT NULL
             );",
        )
        .expect("test schema should apply");
        conn
    }

    fn feed_item(uri: &str, cid: &str, did: &str, handle: &str, text: &str, created_at: &str) -> serde_json::Value {
        serde_json::json!({
            "post": {
                "uri": uri,
                "cid": cid,
                "author": { "did": did, "handle": handle },
                "record": { "$type": "app.bsky.feed.post", "text": text, "createdAt": created_at }
            }
        })
    }

    fn insert_post(conn: &Connection, owner_did: &str, uri: &str, source: &str, text: &str, created_at: &str) {
        let item = feed_item(uri, "cid", "did:plc:author", "author.test", text, created_at);
        db_upsert_post(conn, owner_did, &item, source).expect("post should insert");
    }

    fn insert_embedding(conn: &Connection, owner_did: &str, source: &str, uri: &str, embedding: &[f32]) {
        let key = storage_key(owner_did, source, uri);
        db_upsert_embedding(conn, &key, embedding).expect("embedding should insert");
    }

    #[test]
    fn empty_query_is_rejected() {
        assert!(validate_query("").is_err());
    }

    #[test]
    fn whitespace_only_query_is_rejected() {
        assert!(validate_query("   ").is_err());
    }

    #[test]
    fn valid_query_is_accepted() {
        assert!(validate_query("rust programming").is_ok());
    }

    #[test]
    fn zero_limit_is_rejected() {
        assert!(validate_limit(0).is_err());
    }

    #[test]
    fn non_zero_limit_is_accepted() {
        assert_eq!(validate_limit(5).unwrap(), 5);
    }

    #[test]
    fn single_char_query_is_accepted() {
        assert!(validate_query("a").is_ok());
    }

    #[test]
    fn from_handle_syntax_is_accepted() {
        assert!(validate_query("from:alice.bsky.social hello").is_ok());
    }

    #[test]
    fn valid_sources_are_accepted() {
        assert!(validate_source("like").is_ok());
        assert!(validate_source("bookmark").is_ok());
    }

    #[test]
    fn valid_search_modes_are_accepted() {
        assert_eq!(validate_search_mode("keyword").unwrap(), SearchMode::Keyword);
        assert_eq!(validate_search_mode("semantic").unwrap(), SearchMode::Semantic);
        assert_eq!(validate_search_mode("hybrid").unwrap(), SearchMode::Hybrid);
    }

    #[test]
    fn unknown_search_mode_is_rejected() {
        assert!(validate_search_mode("network").is_err());
    }

    #[test]
    fn unknown_source_is_rejected() {
        assert!(validate_source("repost").is_err());
        assert!(validate_source("").is_err());
    }

    #[test]
    fn cursor_is_none_when_no_sync_state_row_exists() {
        let conn = test_db();
        let cursor = db_load_sync_cursor(&conn, "did:plc:alice", "like").unwrap();
        assert!(cursor.is_none());
    }

    #[test]
    fn save_and_load_cursor_roundtrips() {
        let conn = test_db();
        db_save_sync_state(&conn, "did:plc:alice", "like", Some("cursor-abc")).unwrap();
        let loaded = db_load_sync_cursor(&conn, "did:plc:alice", "like").unwrap();
        assert_eq!(loaded.as_deref(), Some("cursor-abc"));
    }

    #[test]
    fn saving_none_cursor_clears_stored_cursor() {
        let conn = test_db();
        db_save_sync_state(&conn, "did:plc:alice", "like", Some("cursor-abc")).unwrap();
        db_save_sync_state(&conn, "did:plc:alice", "like", None).unwrap();
        let loaded = db_load_sync_cursor(&conn, "did:plc:alice", "like").unwrap();
        assert!(loaded.is_none());
    }

    #[test]
    fn cursor_is_per_did_and_source() {
        let conn = test_db();
        db_save_sync_state(&conn, "did:plc:alice", "like", Some("cursor-alice-like")).unwrap();
        db_save_sync_state(&conn, "did:plc:alice", "bookmark", Some("cursor-alice-bm")).unwrap();
        db_save_sync_state(&conn, "did:plc:bob", "like", Some("cursor-bob-like")).unwrap();

        assert_eq!(
            db_load_sync_cursor(&conn, "did:plc:alice", "like").unwrap().as_deref(),
            Some("cursor-alice-like")
        );
        assert_eq!(
            db_load_sync_cursor(&conn, "did:plc:alice", "bookmark")
                .unwrap()
                .as_deref(),
            Some("cursor-alice-bm")
        );
        assert_eq!(
            db_load_sync_cursor(&conn, "did:plc:bob", "like").unwrap().as_deref(),
            Some("cursor-bob-like")
        );
    }

    #[test]
    fn build_fts_match_query_quotes_each_token() {
        assert_eq!(build_fts_match_query("rust sqlite"), "\"rust\" AND \"sqlite\"");
    }

    #[test]
    fn upsert_inserts_new_post_for_owner_and_source() {
        let conn = test_db();
        insert_post(
            &conn,
            "did:plc:alice",
            "at://did:plc:a/app.bsky.feed.post/1",
            "like",
            "hello world",
            "2024-01-01T00:00:00Z",
        );
        assert_eq!(db_post_count(&conn, "did:plc:alice", "like").unwrap(), 1);
    }

    #[test]
    fn upsert_is_scoped_by_owner_did() {
        let conn = test_db();
        let item = feed_item(
            "at://did:plc:a/app.bsky.feed.post/1",
            "cid1",
            "did:plc:a",
            "alice",
            "hello",
            "2024-01-01T00:00:00Z",
        );
        db_upsert_post(&conn, "did:plc:alice", &item, "like").unwrap();
        db_upsert_post(&conn, "did:plc:bob", &item, "like").unwrap();
        assert_eq!(db_post_count(&conn, "did:plc:alice", "like").unwrap(), 1);
        assert_eq!(db_post_count(&conn, "did:plc:bob", "like").unwrap(), 1);
    }

    #[test]
    fn upsert_updates_text_on_conflict() {
        let conn = test_db();
        let original = feed_item(
            "at://did:plc:a/app.bsky.feed.post/1",
            "cid1",
            "did:plc:a",
            "alice",
            "original",
            "2024-01-01T00:00:00Z",
        );
        db_upsert_post(&conn, "did:plc:alice", &original, "like").unwrap();

        let updated = feed_item(
            "at://did:plc:a/app.bsky.feed.post/1",
            "cid2",
            "did:plc:a",
            "alice",
            "updated",
            "2024-01-02T00:00:00Z",
        );
        db_upsert_post(&conn, "did:plc:alice", &updated, "like").unwrap();

        let text: String = conn
            .query_row(
                "SELECT text FROM posts WHERE storage_key = ?1",
                [storage_key(
                    "did:plc:alice",
                    "like",
                    "at://did:plc:a/app.bsky.feed.post/1",
                )],
                |r| r.get(0),
            )
            .unwrap();
        assert_eq!(text, "updated");
    }

    #[test]
    fn upsert_stores_source() {
        let conn = test_db();
        let item = feed_item(
            "at://did:plc:a/app.bsky.feed.post/1",
            "cid1",
            "did:plc:a",
            "alice",
            "hi",
            "2024-01-01T00:00:00Z",
        );
        db_upsert_post(&conn, "did:plc:alice", &item, "bookmark").unwrap();
        let source: String = conn
            .query_row(
                "SELECT source FROM posts WHERE storage_key = ?1",
                [storage_key(
                    "did:plc:alice",
                    "bookmark",
                    "at://did:plc:a/app.bsky.feed.post/1",
                )],
                |r| r.get(0),
            )
            .unwrap();
        assert_eq!(source, "bookmark");
    }

    #[test]
    fn upsert_rejects_item_missing_uri() {
        let conn = test_db();
        let bad = serde_json::json!({ "post": { "cid": "cid1", "author": { "did": "x" } } });
        assert!(db_upsert_post(&conn, "did:plc:alice", &bad, "like").is_err());
    }

    #[test]
    fn post_count_is_per_owner_and_source() {
        let conn = test_db();
        insert_post(
            &conn,
            "did:plc:alice",
            "at://a/app.bsky.feed.post/1",
            "like",
            "rust sqlite",
            "2024-01-01T00:00:00Z",
        );
        insert_post(
            &conn,
            "did:plc:alice",
            "at://a/app.bsky.feed.post/2",
            "bookmark",
            "saved post",
            "2024-01-02T00:00:00Z",
        );
        insert_post(
            &conn,
            "did:plc:bob",
            "at://a/app.bsky.feed.post/3",
            "like",
            "other account",
            "2024-01-03T00:00:00Z",
        );
        assert_eq!(db_post_count(&conn, "did:plc:alice", "like").unwrap(), 1);
        assert_eq!(db_post_count(&conn, "did:plc:alice", "bookmark").unwrap(), 1);
        assert_eq!(db_post_count(&conn, "did:plc:bob", "like").unwrap(), 1);
    }

    #[test]
    fn embeddings_enabled_defaults_to_true_when_row_absent() {
        let conn = test_db();
        assert!(db_get_embeddings_enabled(&conn).unwrap());
    }

    #[test]
    fn set_embeddings_enabled_false_persists() {
        let conn = test_db();
        db_set_embeddings_enabled(&conn, false).unwrap();
        assert!(!db_get_embeddings_enabled(&conn).unwrap());
    }

    #[test]
    fn set_embeddings_enabled_true_persists() {
        let conn = test_db();
        db_set_embeddings_enabled(&conn, false).unwrap();
        db_set_embeddings_enabled(&conn, true).unwrap();
        assert!(db_get_embeddings_enabled(&conn).unwrap());
    }

    #[test]
    fn embeddings_enabled_toggle_is_idempotent() {
        let conn = test_db();
        conn.execute(
            "INSERT INTO app_settings(key, value) VALUES('embeddings_enabled', '1')",
            [],
        )
        .unwrap();
        db_set_embeddings_enabled(&conn, false).unwrap();
        db_set_embeddings_enabled(&conn, false).unwrap();
        assert!(!db_get_embeddings_enabled(&conn).unwrap());
    }

    #[test]
    fn keyword_search_returns_owner_scoped_matches() {
        let conn = test_db();
        insert_post(
            &conn,
            "did:plc:alice",
            "at://alice/app.bsky.feed.post/1",
            "like",
            "rust sqlite vectors",
            "2024-01-01T00:00:00Z",
        );
        insert_post(
            &conn,
            "did:plc:bob",
            "at://bob/app.bsky.feed.post/1",
            "like",
            "rust sqlite vectors",
            "2024-01-02T00:00:00Z",
        );

        let results = run_local_search(
            &conn,
            "did:plc:alice",
            "rust sqlite",
            SearchMode::Keyword,
            10,
            true,
            None,
        )
        .expect("keyword search should succeed");

        assert_eq!(results.len(), 1);
        assert_eq!(results[0].uri, "at://alice/app.bsky.feed.post/1");
    }

    #[test]
    fn semantic_search_returns_nearest_embeddings() {
        let conn = test_db();
        insert_post(
            &conn,
            "did:plc:alice",
            "at://alice/app.bsky.feed.post/1",
            "like",
            "rust vectors",
            "2024-01-01T00:00:00Z",
        );
        insert_post(
            &conn,
            "did:plc:alice",
            "at://alice/app.bsky.feed.post/2",
            "like",
            "sql joins",
            "2024-01-02T00:00:00Z",
        );
        insert_embedding(
            &conn,
            "did:plc:alice",
            "like",
            "at://alice/app.bsky.feed.post/1",
            &[1.0, 0.0, 0.0],
        );
        insert_embedding(
            &conn,
            "did:plc:alice",
            "like",
            "at://alice/app.bsky.feed.post/2",
            &[0.0, 1.0, 0.0],
        );

        let results =
            db_semantic_search(&conn, "did:plc:alice", &[1.0, 0.0, 0.0], 10).expect("semantic search should succeed");

        assert_eq!(results.len(), 2);
        assert_eq!(results[0].post.uri, "at://alice/app.bsky.feed.post/1");
        assert!(results[0].post.score > results[1].post.score);
    }

    #[test]
    fn semantic_search_requires_embeddings_when_disabled() {
        let conn = test_db();
        let error = run_local_search(
            &conn,
            "did:plc:alice",
            "rust",
            SearchMode::Semantic,
            10,
            false,
            Some(&[1.0, 0.0, 0.0]),
        )
        .expect_err("semantic search should fail when embeddings are disabled");

        assert!(error.to_string().contains("semantic search is unavailable"));
    }

    #[test]
    fn hybrid_search_falls_back_to_keyword_when_embeddings_are_disabled() {
        let conn = test_db();
        insert_post(
            &conn,
            "did:plc:alice",
            "at://alice/app.bsky.feed.post/1",
            "like",
            "rust sqlite",
            "2024-01-01T00:00:00Z",
        );

        let results = run_local_search(&conn, "did:plc:alice", "rust", SearchMode::Hybrid, 10, false, None)
            .expect("hybrid fallback should succeed");

        assert_eq!(results.len(), 1);
        assert_eq!(results[0].uri, "at://alice/app.bsky.feed.post/1");
    }

    #[test]
    fn hybrid_search_merges_keyword_and_semantic_results() {
        let conn = test_db();
        insert_post(
            &conn,
            "did:plc:alice",
            "at://alice/app.bsky.feed.post/1",
            "like",
            "rust sqlite search",
            "2024-01-01T00:00:00Z",
        );
        insert_post(
            &conn,
            "did:plc:alice",
            "at://alice/app.bsky.feed.post/2",
            "like",
            "semantic-only match",
            "2024-01-02T00:00:00Z",
        );
        insert_embedding(
            &conn,
            "did:plc:alice",
            "like",
            "at://alice/app.bsky.feed.post/1",
            &[0.5, 0.5, 0.0],
        );
        insert_embedding(
            &conn,
            "did:plc:alice",
            "like",
            "at://alice/app.bsky.feed.post/2",
            &[1.0, 0.0, 0.0],
        );

        let results = run_local_search(
            &conn,
            "did:plc:alice",
            "rust",
            SearchMode::Hybrid,
            10,
            true,
            Some(&[1.0, 0.0, 0.0]),
        )
        .expect("hybrid search should succeed");

        let uris: Vec<&str> = results.iter().map(|result| result.uri.as_str()).collect();
        assert!(uris.contains(&"at://alice/app.bsky.feed.post/1"));
        assert!(uris.contains(&"at://alice/app.bsky.feed.post/2"));
    }

    #[test]
    fn sync_status_returns_counts_for_both_sources_per_did() {
        let conn = test_db();
        insert_post(
            &conn,
            "did:plc:alice",
            "at://alice/app.bsky.feed.post/1",
            "like",
            "liked post",
            "2024-01-01T00:00:00Z",
        );
        insert_post(
            &conn,
            "did:plc:alice",
            "at://alice/app.bsky.feed.post/2",
            "bookmark",
            "saved post",
            "2024-01-02T00:00:00Z",
        );
        insert_post(
            &conn,
            "did:plc:bob",
            "at://bob/app.bsky.feed.post/3",
            "like",
            "bob post",
            "2024-01-03T00:00:00Z",
        );
        db_save_sync_state(&conn, "did:plc:alice", "like", Some("cursor-like")).unwrap();

        let like_status = db_sync_status(&conn, "did:plc:alice", "like").unwrap();
        let bookmark_status = db_sync_status(&conn, "did:plc:alice", "bookmark").unwrap();

        assert_eq!(like_status.post_count, 1);
        assert_eq!(like_status.cursor.as_deref(), Some("cursor-like"));
        assert_eq!(bookmark_status.post_count, 1);
        assert!(bookmark_status.cursor.is_none());
    }

    #[test]
    fn sync_due_is_true_for_new_active_account() {
        assert!(sync_due(Some("did:plc:alice"), None, None));
    }

    #[test]
    fn sync_due_is_false_when_recent_sync_exists() {
        assert!(!sync_due(
            Some("did:plc:alice"),
            Some("did:plc:alice"),
            Some(std::time::Instant::now()),
        ));
    }
}

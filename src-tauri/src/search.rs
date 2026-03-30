use super::auth::LazuriteOAuthSession;
use super::error::{AppError, Result};
use super::state::AppState;
use fastembed::{EmbeddingModel, TextEmbedding, TextInitOptions};
use jacquard::api::app_bsky::actor::search_actors::SearchActors;
use jacquard::api::app_bsky::feed::get_actor_likes::GetActorLikes;
use jacquard::api::app_bsky::feed::search_posts::SearchPosts;
use jacquard::api::app_bsky::graph::search_starter_packs::SearchStarterPacks;
use jacquard::types::did::Did;
use jacquard::types::ident::AtIdentifier;
use jacquard::xrpc::XrpcClient;
use rusqlite::{params, Connection, OptionalExtension};
use serde::Serialize;
use std::path::PathBuf;
use std::sync::Arc;
use tauri::{AppHandle, Manager};
use tauri_plugin_log::log;

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SyncStatus {
    pub source: String,
    pub post_count: i64,
    pub cursor: Option<String>,
    pub last_synced_at: Option<String>,
}

fn validate_query(query: &str) -> Result<()> {
    if query.trim().is_empty() {
        return Err(AppError::validation("search query must not be empty"));
    }
    Ok(())
}

fn validate_source(source: &str) -> Result<()> {
    match source {
        "like" | "bookmark" => Ok(()),
        _ => Err(AppError::validation("source must be 'like' or 'bookmark'")),
    }
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

/// Upsert a single `FeedViewPost` JSON item into the `posts` table.
/// On conflict (same uri) updates mutable fields but keeps indexed_at.
fn db_upsert_post(conn: &Connection, feed_item: &serde_json::Value, source: &str) -> Result<()> {
    let post = feed_item.get("post").unwrap_or(feed_item);

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

    conn.execute(
        "INSERT INTO posts(uri, cid, author_did, author_handle, text, created_at, json_record, source)
         VALUES(?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8)
         ON CONFLICT(uri) DO UPDATE SET
           cid           = excluded.cid,
           author_handle = excluded.author_handle,
           text          = excluded.text,
           json_record   = excluded.json_record",
        params![
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
    Ok(())
}

fn db_post_count(conn: &Connection, source: &str) -> Result<i64> {
    conn.query_row("SELECT COUNT(*) FROM posts WHERE source = ?1", params![source], |row| {
        row.get(0)
    })
    .map_err(AppError::from)
}

fn db_sync_status(conn: &Connection, source: &str) -> Result<SyncStatus> {
    let post_count = db_post_count(conn, source)?;
    let (cursor, last_synced_at) = conn
        .query_row(
            "SELECT cursor, last_synced_at FROM sync_state WHERE source = ?1",
            params![source],
            |row| Ok((row.get::<_, Option<String>>(0)?, row.get::<_, Option<String>>(1)?)),
        )
        .optional()?
        .unwrap_or((None, None));

    Ok(SyncStatus { source: source.to_owned(), post_count, cursor, last_synced_at })
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
/// Resumes from the last stored cursor so interrupted syncs never re-fetch the full history.
/// On completion the cursor is cleared, allowing subsequent calls to pick up new items from the top of the feed.
pub async fn sync_posts(did: String, source: String, state: &AppState) -> Result<SyncStatus> {
    validate_source(&source)?;

    if source == "bookmark" {
        return Err(AppError::validation("bookmark sync is not yet supported"));
    }

    let session = get_session(state).await?;

    let mut cursor: Option<String> = {
        let conn = state.auth_store.lock_connection()?;
        db_load_sync_cursor(&conn, &did, &source)?
    };

    log::info!("starting {source} sync for {did}, resume cursor: {cursor:?}");

    loop {
        let output = session
            .send(
                GetActorLikes::new()
                    .limit(Some(100i64))
                    .cursor(cursor.as_deref().map(|c| c.into()))
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
            .and_then(|v| v.as_array())
            .cloned()
            .unwrap_or_default();

        if feed.is_empty() {
            log::info!("{source} sync for {did}: empty page, stopping");
            break;
        }

        let next_cursor = output_json.get("cursor").and_then(|v| v.as_str()).map(str::to_owned);

        {
            let conn = state.auth_store.lock_connection()?;
            for item in &feed {
                db_upsert_post(&conn, item, &source)?;
            }
            db_save_sync_state(&conn, &did, &source, next_cursor.as_deref())?;
        }

        log::debug!(
            "{source} sync for {did}: upserted {} posts, next cursor: {next_cursor:?}",
            feed.len()
        );

        match next_cursor {
            None => {
                log::info!("{source} sync for {did}: reached end of feed");
                break;
            }
            Some(c) => cursor = Some(c),
        }
    }

    let conn = state.auth_store.lock_connection()?;
    db_sync_status(&conn, &source)
}

/// Returns sync status for all sources for the given DID.
pub fn get_sync_status(did: &str, state: &AppState) -> Result<Vec<SyncStatus>> {
    let conn = state.auth_store.lock_connection()?;
    let mut stmt = conn.prepare(
        "SELECT ss.source,
                COUNT(p.uri)      AS post_count,
                ss.cursor,
                ss.last_synced_at
         FROM sync_state ss
         LEFT JOIN posts p ON p.source = ss.source
         WHERE ss.did = ?1
         GROUP BY ss.source",
    )?;

    let rows = stmt.query_map(params![did], |row| {
        Ok(SyncStatus {
            source: row.get(0)?,
            post_count: row.get(1)?,
            cursor: row.get(2)?,
            last_synced_at: row.get(3)?,
        })
    })?;

    rows.collect::<rusqlite::Result<Vec<_>>>().map_err(AppError::from)
}

const EMBED_BATCH_SIZE: usize = 32;

fn resolve_models_dir(app: &AppHandle) -> Result<PathBuf> {
    let mut dir = app
        .path()
        .app_data_dir()
        .map_err(|error| AppError::PathResolve(error.to_string()))?;
    dir.push("models");
    std::fs::create_dir_all(&dir)?;
    Ok(dir)
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

/// Returns (uri, text) for posts that have no embedding yet.
fn db_posts_without_embeddings(conn: &Connection) -> Result<Vec<(String, String)>> {
    let mut stmt = conn.prepare(
        "SELECT p.uri, p.text
         FROM posts p
         WHERE p.text IS NOT NULL
           AND p.text != ''
           AND p.uri NOT IN (SELECT uri FROM posts_vec)",
    )?;

    let rows = stmt.query_map([], |row| Ok((row.get::<_, String>(0)?, row.get::<_, String>(1)?)))?;
    rows.collect::<rusqlite::Result<Vec<_>>>().map_err(AppError::from)
}

/// Returns (uri, text) for ALL posts that have non-empty text.
fn db_all_posts_with_text(conn: &Connection) -> Result<Vec<(String, String)>> {
    let mut stmt = conn.prepare("SELECT uri, text FROM posts WHERE text IS NOT NULL AND text != ''")?;

    let rows = stmt.query_map([], |row| Ok((row.get::<_, String>(0)?, row.get::<_, String>(1)?)))?;
    rows.collect::<rusqlite::Result<Vec<_>>>().map_err(AppError::from)
}

fn db_upsert_embedding(conn: &Connection, uri: &str, embedding: &[f32]) -> Result<()> {
    let bytes: Vec<u8> = embedding.iter().flat_map(|f| f.to_le_bytes()).collect();
    conn.execute(
        "INSERT OR REPLACE INTO posts_vec(uri, embedding) VALUES(?1, ?2)",
        params![uri, bytes.as_slice()],
    )?;
    Ok(())
}

fn embed_posts(posts: &[(String, String)], models_dir: PathBuf, state: &AppState) -> Result<usize> {
    if posts.is_empty() {
        return Ok(0);
    }

    let mut model = TextEmbedding::try_new(
        TextInitOptions::new(EmbeddingModel::NomicEmbedTextV15)
            .with_cache_dir(models_dir)
            .with_show_download_progress(false),
    )
    .map_err(|error| AppError::validation(format!("failed to init embedding model: {error}")))?;

    let mut total = 0usize;

    for chunk in posts.chunks(EMBED_BATCH_SIZE) {
        let texts: Vec<String> = chunk.iter().map(|(_, text)| text.clone()).collect();
        let embeddings = model
            .embed(texts, Some(EMBED_BATCH_SIZE))
            .map_err(|error| AppError::validation(format!("embedding error: {error}")))?;

        let conn = state.auth_store.lock_connection()?;
        for ((uri, _), embedding) in chunk.iter().zip(embeddings.iter()) {
            db_upsert_embedding(&conn, uri, embedding)?;
        }
        total += chunk.len();
    }

    Ok(total)
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

#[cfg(test)]
mod tests {
    use super::{
        db_get_embeddings_enabled, db_load_sync_cursor, db_post_count, db_save_sync_state, db_set_embeddings_enabled,
        db_upsert_post, validate_query, validate_source,
    };
    use rusqlite::Connection;

    /// Minimal schema for unit tests w/o FTS/vec tables.
    fn test_db() -> Connection {
        let conn = Connection::open_in_memory().expect("in-memory db should open");
        conn.execute_batch(
            "CREATE TABLE posts (
               uri TEXT PRIMARY KEY,
               cid TEXT NOT NULL,
               author_did TEXT NOT NULL,
               author_handle TEXT,
               text TEXT,
               created_at TEXT,
               indexed_at TEXT DEFAULT CURRENT_TIMESTAMP,
               json_record TEXT,
               source TEXT NOT NULL
             );
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

    fn feed_item(uri: &str, cid: &str, did: &str, handle: &str, text: &str) -> serde_json::Value {
        serde_json::json!({
            "post": {
                "uri": uri,
                "cid": cid,
                "author": { "did": did, "handle": handle },
                "record": { "$type": "app.bsky.feed.post", "text": text, "createdAt": "2024-01-01T00:00:00Z" }
            }
        })
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
    fn upsert_inserts_new_post() {
        let conn = test_db();
        let item = feed_item(
            "at://did:plc:a/app.bsky.feed.post/1",
            "cid1",
            "did:plc:a",
            "alice",
            "hello",
        );
        db_upsert_post(&conn, &item, "like").unwrap();
        assert_eq!(db_post_count(&conn, "like").unwrap(), 1);
    }

    #[test]
    fn upsert_is_idempotent_for_same_uri() {
        let conn = test_db();
        let item = feed_item(
            "at://did:plc:a/app.bsky.feed.post/1",
            "cid1",
            "did:plc:a",
            "alice",
            "hello",
        );
        db_upsert_post(&conn, &item, "like").unwrap();
        db_upsert_post(&conn, &item, "like").unwrap();
        assert_eq!(db_post_count(&conn, "like").unwrap(), 1);
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
        );
        db_upsert_post(&conn, &original, "like").unwrap();

        let updated = feed_item(
            "at://did:plc:a/app.bsky.feed.post/1",
            "cid2",
            "did:plc:a",
            "alice",
            "updated",
        );
        db_upsert_post(&conn, &updated, "like").unwrap();

        let text: String = conn
            .query_row(
                "SELECT text FROM posts WHERE uri = ?1",
                ["at://did:plc:a/app.bsky.feed.post/1"],
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
        );
        db_upsert_post(&conn, &item, "bookmark").unwrap();
        let source: String = conn
            .query_row(
                "SELECT source FROM posts WHERE uri = ?1",
                ["at://did:plc:a/app.bsky.feed.post/1"],
                |r| r.get(0),
            )
            .unwrap();
        assert_eq!(source, "bookmark");
    }

    #[test]
    fn upsert_rejects_item_missing_uri() {
        let conn = test_db();
        let bad = serde_json::json!({ "post": { "cid": "cid1", "author": { "did": "x" } } });
        assert!(db_upsert_post(&conn, &bad, "like").is_err());
    }

    #[test]
    fn post_count_is_per_source() {
        let conn = test_db();
        db_upsert_post(
            &conn,
            &feed_item("at://a/app.bsky.feed.post/1", "c1", "did:plc:a", "a", "t"),
            "like",
        )
        .unwrap();
        db_upsert_post(
            &conn,
            &feed_item("at://a/app.bsky.feed.post/2", "c2", "did:plc:a", "a", "t"),
            "bookmark",
        )
        .unwrap();
        assert_eq!(db_post_count(&conn, "like").unwrap(), 1);
        assert_eq!(db_post_count(&conn, "bookmark").unwrap(), 1);
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
}

use super::error::{AppError, Result};
use super::feed::{self, CreateRecordResult, EmbedInput, ReplyRefInput, StrongRefInput};
use super::state::AppState;
use rusqlite::{params, Connection, OptionalExtension};
use serde::{Deserialize, Serialize};
use tauri_plugin_log::log;
use uuid::Uuid;

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Draft {
    pub id: String,
    pub account_did: String,
    pub text: String,
    pub reply_parent_uri: Option<String>,
    pub reply_parent_cid: Option<String>,
    pub reply_root_uri: Option<String>,
    pub reply_root_cid: Option<String>,
    pub quote_uri: Option<String>,
    pub quote_cid: Option<String>,
    pub title: Option<String>,
    pub created_at: String,
    pub updated_at: String,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DraftInput {
    pub id: Option<String>,
    pub text: String,
    pub reply_parent_uri: Option<String>,
    pub reply_parent_cid: Option<String>,
    pub reply_root_uri: Option<String>,
    pub reply_root_cid: Option<String>,
    pub quote_uri: Option<String>,
    pub quote_cid: Option<String>,
    pub title: Option<String>,
}

fn row_to_draft(row: &rusqlite::Row<'_>) -> rusqlite::Result<Draft> {
    Ok(Draft {
        id: row.get(0)?,
        account_did: row.get(1)?,
        text: row.get(2)?,
        reply_parent_uri: row.get(3)?,
        reply_parent_cid: row.get(4)?,
        reply_root_uri: row.get(5)?,
        reply_root_cid: row.get(6)?,
        quote_uri: row.get(7)?,
        quote_cid: row.get(8)?,
        title: row.get(9)?,
        created_at: row.get(10)?,
        updated_at: row.get(11)?,
    })
}

fn db_list_drafts(conn: &Connection, account_did: &str) -> Result<Vec<Draft>> {
    let mut stmt = conn.prepare(
        "SELECT id, account_did, text, reply_parent_uri, reply_parent_cid,
                reply_root_uri, reply_root_cid, quote_uri, quote_cid,
                title, created_at, updated_at
         FROM drafts
         WHERE account_did = ?1
         ORDER BY updated_at DESC",
    )?;

    let rows = stmt.query_map(params![account_did], row_to_draft)?;

    let mut drafts = Vec::new();
    for row in rows {
        drafts.push(row?);
    }
    Ok(drafts)
}

fn db_get_draft(conn: &Connection, id: &str) -> Result<Draft> {
    conn.query_row(
        "SELECT id, account_did, text, reply_parent_uri, reply_parent_cid,
                reply_root_uri, reply_root_cid, quote_uri, quote_cid,
                title, created_at, updated_at
         FROM drafts
         WHERE id = ?1",
        params![id],
        row_to_draft,
    )
    .optional()?
    .ok_or_else(|| AppError::validation(format!("draft {id} not found")))
}

fn db_get_draft_for_account(conn: &Connection, id: &str, account_did: &str) -> Result<Draft> {
    let draft = db_get_draft(conn, id)?;
    if draft.account_did != account_did {
        return Err(AppError::validation("draft does not belong to the active account"));
    }

    Ok(draft)
}

fn db_save_draft(conn: &Connection, account_did: &str, input: &DraftInput) -> Result<Draft> {
    let id = match &input.id {
        Some(existing_id) => {
            let exists: bool = conn
                .query_row(
                    "SELECT COUNT(*) FROM drafts WHERE id = ?1 AND account_did = ?2",
                    params![existing_id, account_did],
                    |row| row.get::<_, i64>(0),
                )
                .map(|count| count > 0)
                .unwrap_or(false);

            if exists {
                conn.execute(
                    "UPDATE drafts
                     SET text = ?1, reply_parent_uri = ?2, reply_parent_cid = ?3,
                         reply_root_uri = ?4, reply_root_cid = ?5,
                         quote_uri = ?6, quote_cid = ?7, title = ?8,
                         updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
                     WHERE id = ?9 AND account_did = ?10",
                    params![
                        input.text,
                        input.reply_parent_uri,
                        input.reply_parent_cid,
                        input.reply_root_uri,
                        input.reply_root_cid,
                        input.quote_uri,
                        input.quote_cid,
                        input.title,
                        existing_id,
                        account_did,
                    ],
                )?;
                existing_id.clone()
            } else {
                db_insert_draft(conn, account_did, input)?
            }
        }
        None => db_insert_draft(conn, account_did, input)?,
    };

    db_get_draft(conn, &id)
}

fn db_insert_draft(conn: &Connection, account_did: &str, input: &DraftInput) -> Result<String> {
    let id = Uuid::new_v4().to_string();
    conn.execute(
        "INSERT INTO drafts (id, account_did, text, reply_parent_uri, reply_parent_cid,
                            reply_root_uri, reply_root_cid, quote_uri, quote_cid,
                            title, created_at, updated_at)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10,
                 strftime('%Y-%m-%dT%H:%M:%fZ', 'now'),
                 strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))",
        params![
            id,
            account_did,
            input.text,
            input.reply_parent_uri,
            input.reply_parent_cid,
            input.reply_root_uri,
            input.reply_root_cid,
            input.quote_uri,
            input.quote_cid,
            input.title,
        ],
    )?;
    Ok(id)
}

fn db_delete_draft(conn: &Connection, id: &str) -> Result<()> {
    let affected = conn.execute("DELETE FROM drafts WHERE id = ?1", params![id])?;
    if affected == 0 {
        log::warn!("delete_draft: no draft found with id {id}");
    }
    Ok(())
}

fn db_delete_draft_for_account(conn: &Connection, id: &str, account_did: &str) -> Result<()> {
    let owner = conn
        .query_row("SELECT account_did FROM drafts WHERE id = ?1", params![id], |row| {
            row.get::<_, String>(0)
        })
        .optional()?;

    match owner {
        None => {
            log::warn!("delete_draft: no draft found with id {id}");
            Ok(())
        }
        Some(owner_did) => {
            if owner_did != account_did {
                return Err(AppError::validation("draft does not belong to the active account"));
            }

            db_delete_draft(conn, id)
        }
    }
}

fn active_account_did(state: &AppState) -> Result<String> {
    state
        .active_session
        .read()
        .map_err(|error| AppError::state_poisoned(format!("active_session poisoned: {error}")))?
        .as_ref()
        .ok_or_else(|| AppError::validation("no active account"))
        .map(|session| session.did.clone())
}

pub fn list_drafts(account_did: &str, state: &AppState) -> Result<Vec<Draft>> {
    let active_did = active_account_did(state)?;
    if account_did != active_did {
        return Err(AppError::validation("account does not match the active account"));
    }

    let conn = state.auth_store.lock_connection()?;
    db_list_drafts(&conn, &active_did)
}

pub fn get_draft(id: &str, state: &AppState) -> Result<Draft> {
    let active_did = active_account_did(state)?;
    let conn = state.auth_store.lock_connection()?;
    db_get_draft_for_account(&conn, id, &active_did)
}

pub fn save_draft(input: &DraftInput, state: &AppState) -> Result<Draft> {
    let account_did = active_account_did(state)?;

    let conn = state.auth_store.lock_connection()?;
    db_save_draft(&conn, &account_did, input)
}

pub fn delete_draft(id: &str, state: &AppState) -> Result<()> {
    let active_did = active_account_did(state)?;
    let conn = state.auth_store.lock_connection()?;
    db_delete_draft_for_account(&conn, id, &active_did)
}

pub async fn submit_draft(id: String, state: &AppState) -> Result<CreateRecordResult> {
    let account_did = active_account_did(state)?;

    let draft = {
        let conn = state.auth_store.lock_connection()?;
        db_get_draft_for_account(&conn, &id, &account_did)?
    };

    let reply_to = build_reply_ref(&draft)?;
    let embed = build_embed(&draft)?;

    let result = feed::create_post(draft.text, reply_to, embed, state).await?;

    {
        let conn = state.auth_store.lock_connection()?;
        if let Err(error) = db_delete_draft(&conn, &id) {
            log::error!("submit_draft: failed to delete draft {id} after successful post: {error}");
        }
    }

    Ok(result)
}

fn build_reply_ref(draft: &Draft) -> Result<Option<ReplyRefInput>> {
    match (
        &draft.reply_parent_uri,
        &draft.reply_parent_cid,
        &draft.reply_root_uri,
        &draft.reply_root_cid,
    ) {
        (Some(parent_uri), Some(parent_cid), Some(root_uri), Some(root_cid)) => Ok(Some(ReplyRefInput {
            parent: StrongRefInput { uri: parent_uri.clone(), cid: parent_cid.clone() },
            root: StrongRefInput { uri: root_uri.clone(), cid: root_cid.clone() },
        })),
        (None, None, None, None) => Ok(None),
        _ => Err(AppError::validation(
            "draft has incomplete reply reference — all four reply fields must be set together",
        )),
    }
}

fn build_embed(draft: &Draft) -> Result<Option<EmbedInput>> {
    match (&draft.quote_uri, &draft.quote_cid) {
        (Some(uri), Some(cid)) => Ok(Some(EmbedInput::Record {
            record: StrongRefInput { uri: uri.clone(), cid: cid.clone() },
        })),
        (None, None) => Ok(None),
        _ => Err(AppError::validation(
            "draft has incomplete quote reference — both quote_uri and quote_cid must be set together",
        )),
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use rusqlite::Connection;

    fn draft_db() -> Connection {
        let conn = Connection::open_in_memory().expect("in-memory db should open");
        conn.execute_batch(include_str!("migrations/011_drafts.sql"))
            .expect("drafts migration should apply");
        conn
    }

    fn insert_draft(conn: &Connection, account_did: &str, text: &str) -> Draft {
        let input = DraftInput {
            id: None,
            text: text.to_string(),
            reply_parent_uri: None,
            reply_parent_cid: None,
            reply_root_uri: None,
            reply_root_cid: None,
            quote_uri: None,
            quote_cid: None,
            title: None,
        };
        db_save_draft(conn, account_did, &input).expect("insert should succeed")
    }

    #[test]
    fn migration_creates_drafts_table() {
        let conn = draft_db();
        let count: i64 = conn
            .query_row("SELECT COUNT(*) FROM drafts", [], |row| row.get(0))
            .expect("should query empty drafts table");
        assert_eq!(count, 0);
    }

    #[test]
    fn save_draft_inserts_with_generated_uuid_when_no_id() {
        let conn = draft_db();
        let input = DraftInput {
            id: None,
            text: "hello world".to_string(),
            reply_parent_uri: None,
            reply_parent_cid: None,
            reply_root_uri: None,
            reply_root_cid: None,
            quote_uri: None,
            quote_cid: None,
            title: Some("my draft".to_string()),
        };

        let draft = db_save_draft(&conn, "did:plc:alice", &input).expect("save should succeed");

        assert!(!draft.id.is_empty());
        assert_eq!(draft.account_did, "did:plc:alice");
        assert_eq!(draft.text, "hello world");
        assert_eq!(draft.title, Some("my draft".to_string()));
        assert!(draft.reply_parent_uri.is_none());
        assert!(draft.quote_uri.is_none());
        assert!(!draft.created_at.is_empty());
        assert!(!draft.updated_at.is_empty());
    }

    #[test]
    fn save_draft_updates_existing_when_id_matches() {
        let conn = draft_db();
        let original = insert_draft(&conn, "did:plc:alice", "original text");

        let input = DraftInput {
            id: Some(original.id.clone()),
            text: "updated text".to_string(),
            reply_parent_uri: None,
            reply_parent_cid: None,
            reply_root_uri: None,
            reply_root_cid: None,
            quote_uri: None,
            quote_cid: None,
            title: Some("updated title".to_string()),
        };

        let updated = db_save_draft(&conn, "did:plc:alice", &input).expect("update should succeed");

        assert_eq!(updated.id, original.id, "id should remain the same after update");
        assert_eq!(updated.text, "updated text");
        assert_eq!(updated.title, Some("updated title".to_string()));
        assert_eq!(
            updated.created_at, original.created_at,
            "created_at should not change on update"
        );

        let count: i64 = conn
            .query_row("SELECT COUNT(*) FROM drafts", [], |row| row.get(0))
            .expect("count should succeed");
        assert_eq!(count, 1, "update should not create a new row");
    }

    #[test]
    fn save_draft_inserts_new_when_id_not_found_in_db() {
        let conn = draft_db();

        let input = DraftInput {
            id: Some("non-existent-id".to_string()),
            text: "orphan draft".to_string(),
            reply_parent_uri: None,
            reply_parent_cid: None,
            reply_root_uri: None,
            reply_root_cid: None,
            quote_uri: None,
            quote_cid: None,
            title: None,
        };

        let draft = db_save_draft(&conn, "did:plc:alice", &input).expect("save should succeed");

        assert_ne!(
            draft.id, "non-existent-id",
            "a new UUID should be generated when the provided id does not exist"
        );
        assert_eq!(draft.text, "orphan draft");
    }

    #[test]
    fn save_draft_cannot_update_another_accounts_draft() {
        let conn = draft_db();
        let alice_draft = insert_draft(&conn, "did:plc:alice", "alice's post");

        let input = DraftInput {
            id: Some(alice_draft.id.clone()),
            text: "bob's takeover".to_string(),
            reply_parent_uri: None,
            reply_parent_cid: None,
            reply_root_uri: None,
            reply_root_cid: None,
            quote_uri: None,
            quote_cid: None,
            title: None,
        };

        // Bob submits with alice's draft id — should insert a new draft, not update alice's
        let saved = db_save_draft(&conn, "did:plc:bob", &input).expect("save should succeed");
        assert_ne!(saved.id, alice_draft.id, "cross-account update must not occur");

        let alice_unchanged = db_get_draft(&conn, &alice_draft.id).expect("alice's draft should still exist");
        assert_eq!(
            alice_unchanged.text, "alice's post",
            "alice's draft must remain unchanged"
        );
    }

    #[test]
    fn list_drafts_returns_only_active_account_drafts() {
        let conn = draft_db();
        insert_draft(&conn, "did:plc:alice", "alice draft 1");
        insert_draft(&conn, "did:plc:alice", "alice draft 2");
        insert_draft(&conn, "did:plc:bob", "bob draft");

        let alice_drafts = db_list_drafts(&conn, "did:plc:alice").expect("list should succeed");
        assert_eq!(alice_drafts.len(), 2);
        assert!(alice_drafts.iter().all(|d| d.account_did == "did:plc:alice"));

        let bob_drafts = db_list_drafts(&conn, "did:plc:bob").expect("list should succeed");
        assert_eq!(bob_drafts.len(), 1);
    }

    #[test]
    fn list_drafts_returns_empty_for_unknown_account() {
        let conn = draft_db();
        let drafts = db_list_drafts(&conn, "did:plc:ghost").expect("list should succeed");
        assert!(drafts.is_empty());
    }

    #[test]
    fn list_drafts_ordered_by_updated_at_desc() {
        let conn = draft_db();

        // Insert with explicit timestamps to ensure ordering
        conn.execute(
            "INSERT INTO drafts (id, account_did, text, created_at, updated_at)
             VALUES ('draft-old', 'did:plc:alice', 'old', '2024-01-01T00:00:00.000Z', '2024-01-01T00:00:00.000Z')",
            [],
        )
        .expect("insert old draft");

        conn.execute(
            "INSERT INTO drafts (id, account_did, text, created_at, updated_at)
             VALUES ('draft-new', 'did:plc:alice', 'new', '2024-01-02T00:00:00.000Z', '2024-01-02T00:00:00.000Z')",
            [],
        )
        .expect("insert new draft");

        let drafts = db_list_drafts(&conn, "did:plc:alice").expect("list should succeed");
        assert_eq!(drafts.len(), 2);
        assert_eq!(drafts[0].id, "draft-new", "most recently updated draft should be first");
        assert_eq!(drafts[1].id, "draft-old");
    }

    #[test]
    fn get_draft_returns_correct_draft() {
        let conn = draft_db();
        let created = insert_draft(&conn, "did:plc:alice", "get me");

        let fetched = db_get_draft(&conn, &created.id).expect("get should succeed");
        assert_eq!(fetched.id, created.id);
        assert_eq!(fetched.text, "get me");
    }

    #[test]
    fn get_draft_errors_for_missing_id() {
        let conn = draft_db();
        let result = db_get_draft(&conn, "does-not-exist");
        assert!(result.is_err(), "get_draft should return an error for missing id");
    }

    #[test]
    fn get_draft_for_account_rejects_foreign_draft() {
        let conn = draft_db();
        let draft = insert_draft(&conn, "did:plc:alice", "alice secret");

        let result = db_get_draft_for_account(&conn, &draft.id, "did:plc:bob");
        assert!(result.is_err(), "should reject loading another account's draft");
    }

    #[test]
    fn delete_draft_removes_draft() {
        let conn = draft_db();
        let draft = insert_draft(&conn, "did:plc:alice", "to be deleted");

        db_delete_draft(&conn, &draft.id).expect("delete should succeed");

        let result = db_get_draft(&conn, &draft.id);
        assert!(result.is_err(), "draft should be gone after delete");
    }

    #[test]
    fn delete_draft_is_idempotent_for_missing_id() {
        let conn = draft_db();
        // Deleting a non-existent draft should not error
        db_delete_draft(&conn, "ghost-id").expect("delete of missing draft should not error");
    }

    #[test]
    fn delete_draft_for_account_rejects_foreign_draft() {
        let conn = draft_db();
        let draft = insert_draft(&conn, "did:plc:alice", "alice only");

        let delete_result = db_delete_draft_for_account(&conn, &draft.id, "did:plc:bob");
        assert!(delete_result.is_err(), "should reject deleting another account's draft");

        let still_exists = db_get_draft(&conn, &draft.id).expect("draft should remain after rejected delete");
        assert_eq!(still_exists.account_did, "did:plc:alice");
    }

    #[test]
    fn delete_draft_for_account_is_idempotent_for_missing_id() {
        let conn = draft_db();
        db_delete_draft_for_account(&conn, "ghost-id", "did:plc:alice")
            .expect("delete of missing draft should not error");
    }

    #[test]
    fn save_draft_preserves_reply_fields() {
        let conn = draft_db();
        let input = DraftInput {
            id: None,
            text: "a reply".to_string(),
            reply_parent_uri: Some("at://did:plc:parent/app.bsky.feed.post/abc".to_string()),
            reply_parent_cid: Some("bafyparent".to_string()),
            reply_root_uri: Some("at://did:plc:root/app.bsky.feed.post/xyz".to_string()),
            reply_root_cid: Some("bafyroot".to_string()),
            quote_uri: None,
            quote_cid: None,
            title: None,
        };

        let draft = db_save_draft(&conn, "did:plc:alice", &input).expect("save should succeed");
        assert_eq!(
            draft.reply_parent_uri.as_deref(),
            Some("at://did:plc:parent/app.bsky.feed.post/abc")
        );
        assert_eq!(draft.reply_parent_cid.as_deref(), Some("bafyparent"));
        assert_eq!(
            draft.reply_root_uri.as_deref(),
            Some("at://did:plc:root/app.bsky.feed.post/xyz")
        );
        assert_eq!(draft.reply_root_cid.as_deref(), Some("bafyroot"));
    }

    #[test]
    fn save_draft_preserves_quote_fields() {
        let conn = draft_db();
        let input = DraftInput {
            id: None,
            text: "quoting".to_string(),
            reply_parent_uri: None,
            reply_parent_cid: None,
            reply_root_uri: None,
            reply_root_cid: None,
            quote_uri: Some("at://did:plc:quoted/app.bsky.feed.post/qrs".to_string()),
            quote_cid: Some("bafyquote".to_string()),
            title: None,
        };

        let draft = db_save_draft(&conn, "did:plc:alice", &input).expect("save should succeed");
        assert_eq!(
            draft.quote_uri.as_deref(),
            Some("at://did:plc:quoted/app.bsky.feed.post/qrs")
        );
        assert_eq!(draft.quote_cid.as_deref(), Some("bafyquote"));
    }

    #[test]
    fn build_reply_ref_returns_none_when_no_reply_fields() {
        let draft = Draft {
            id: "id".to_string(),
            account_did: "did:plc:alice".to_string(),
            text: "plain post".to_string(),
            reply_parent_uri: None,
            reply_parent_cid: None,
            reply_root_uri: None,
            reply_root_cid: None,
            quote_uri: None,
            quote_cid: None,
            title: None,
            created_at: "2024-01-01T00:00:00.000Z".to_string(),
            updated_at: "2024-01-01T00:00:00.000Z".to_string(),
        };

        let result = build_reply_ref(&draft).expect("build_reply_ref should succeed");
        assert!(result.is_none());
    }

    #[test]
    fn build_reply_ref_returns_some_when_all_reply_fields_present() {
        let draft = Draft {
            id: "id".to_string(),
            account_did: "did:plc:alice".to_string(),
            text: "a reply".to_string(),
            reply_parent_uri: Some("at://did:plc:p/app.bsky.feed.post/1".to_string()),
            reply_parent_cid: Some("bafy1".to_string()),
            reply_root_uri: Some("at://did:plc:r/app.bsky.feed.post/2".to_string()),
            reply_root_cid: Some("bafy2".to_string()),
            quote_uri: None,
            quote_cid: None,
            title: None,
            created_at: "2024-01-01T00:00:00.000Z".to_string(),
            updated_at: "2024-01-01T00:00:00.000Z".to_string(),
        };

        let result = build_reply_ref(&draft).expect("build_reply_ref should succeed");
        assert!(result.is_some());
        let reply = result.unwrap();
        assert_eq!(reply.parent.uri, "at://did:plc:p/app.bsky.feed.post/1");
        assert_eq!(reply.root.cid, "bafy2");
    }

    #[test]
    fn build_reply_ref_errors_on_partial_reply_fields() {
        let draft = Draft {
            id: "id".to_string(),
            account_did: "did:plc:alice".to_string(),
            text: "broken reply".to_string(),
            reply_parent_uri: Some("at://did:plc:p/app.bsky.feed.post/1".to_string()),
            reply_parent_cid: None, // missing
            reply_root_uri: None,
            reply_root_cid: None,
            quote_uri: None,
            quote_cid: None,
            title: None,
            created_at: "2024-01-01T00:00:00.000Z".to_string(),
            updated_at: "2024-01-01T00:00:00.000Z".to_string(),
        };

        assert!(build_reply_ref(&draft).is_err(), "partial reply fields should error");
    }

    #[test]
    fn build_embed_returns_none_when_no_quote_fields() {
        let draft = Draft {
            id: "id".to_string(),
            account_did: "did:plc:alice".to_string(),
            text: "plain".to_string(),
            reply_parent_uri: None,
            reply_parent_cid: None,
            reply_root_uri: None,
            reply_root_cid: None,
            quote_uri: None,
            quote_cid: None,
            title: None,
            created_at: "2024-01-01T00:00:00.000Z".to_string(),
            updated_at: "2024-01-01T00:00:00.000Z".to_string(),
        };

        let result = build_embed(&draft).expect("build_embed should succeed");
        assert!(result.is_none());
    }

    #[test]
    fn build_embed_returns_record_embed_when_quote_fields_present() {
        let draft = Draft {
            id: "id".to_string(),
            account_did: "did:plc:alice".to_string(),
            text: "quoting".to_string(),
            reply_parent_uri: None,
            reply_parent_cid: None,
            reply_root_uri: None,
            reply_root_cid: None,
            quote_uri: Some("at://did:plc:q/app.bsky.feed.post/abc".to_string()),
            quote_cid: Some("bafyq".to_string()),
            title: None,
            created_at: "2024-01-01T00:00:00.000Z".to_string(),
            updated_at: "2024-01-01T00:00:00.000Z".to_string(),
        };

        let result = build_embed(&draft).expect("build_embed should succeed");
        assert!(result.is_some());
        match result.unwrap() {
            EmbedInput::Record { record } => {
                assert_eq!(record.uri, "at://did:plc:q/app.bsky.feed.post/abc");
                assert_eq!(record.cid, "bafyq");
            }
        }
    }

    #[test]
    fn build_embed_errors_on_partial_quote_fields() {
        let draft = Draft {
            id: "id".to_string(),
            account_did: "did:plc:alice".to_string(),
            text: "broken quote".to_string(),
            reply_parent_uri: None,
            reply_parent_cid: None,
            reply_root_uri: None,
            reply_root_cid: None,
            quote_uri: Some("at://did:plc:q/app.bsky.feed.post/abc".to_string()),
            quote_cid: None, // missing
            title: None,
            created_at: "2024-01-01T00:00:00.000Z".to_string(),
            updated_at: "2024-01-01T00:00:00.000Z".to_string(),
        };

        assert!(build_embed(&draft).is_err(), "partial quote fields should error");
    }
}

use super::error::{AppError, Result};
use super::state::AppState;
use rusqlite::params;
use serde::Serialize;
use uuid::Uuid;

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Column {
    pub id: String,
    pub account_did: String,
    pub kind: String,
    pub config: String,
    pub position: i64,
    pub width: String,
    pub created_at: String,
}

pub fn get_columns(account_did: &str, state: &AppState) -> Result<Vec<Column>> {
    let conn = state.auth_store.lock_connection()?;
    let mut stmt = conn.prepare(
        "SELECT id, account_did, kind, config, position, width, created_at
         FROM columns
         WHERE account_did = ?1
         ORDER BY position ASC",
    )?;

    let rows = stmt.query_map(params![account_did], |row| {
        Ok(Column {
            id: row.get(0)?,
            account_did: row.get(1)?,
            kind: row.get(2)?,
            config: row.get(3)?,
            position: row.get(4)?,
            width: row.get(5)?,
            created_at: row.get(6)?,
        })
    })?;

    let mut columns = Vec::new();
    for row in rows {
        columns.push(row?);
    }
    Ok(columns)
}

pub fn add_column(
    account_did: &str, kind: &str, config: &str, position: Option<u32>, state: &AppState,
) -> Result<Column> {
    validate_kind(kind)?;
    validate_config_json(config)?;

    let conn = state.auth_store.lock_connection()?;

    let insert_position = match position {
        Some(pos) => {
            conn.execute(
                "UPDATE columns SET position = position + 1
                 WHERE account_did = ?1 AND position >= ?2",
                params![account_did, pos],
            )?;
            pos as i64
        }
        None => {
            let max: Option<i64> = conn
                .query_row(
                    "SELECT MAX(position) FROM columns WHERE account_did = ?1",
                    params![account_did],
                    |row| row.get(0),
                )
                .unwrap_or(None);
            max.map(|m| m + 1).unwrap_or(0)
        }
    };

    let id = Uuid::new_v4().to_string();
    conn.execute(
        "INSERT INTO columns(id, account_did, kind, config, position, width)
         VALUES (?1, ?2, ?3, ?4, ?5, 'standard')",
        params![id, account_did, kind, config, insert_position],
    )?;

    let column = conn.query_row(
        "SELECT id, account_did, kind, config, position, width, created_at
         FROM columns WHERE id = ?1",
        params![id],
        |row| {
            Ok(Column {
                id: row.get(0)?,
                account_did: row.get(1)?,
                kind: row.get(2)?,
                config: row.get(3)?,
                position: row.get(4)?,
                width: row.get(5)?,
                created_at: row.get(6)?,
            })
        },
    )?;

    Ok(column)
}

pub fn remove_column(id: &str, state: &AppState) -> Result<()> {
    let conn = state.auth_store.lock_connection()?;

    let affected = conn.execute("DELETE FROM columns WHERE id = ?1", params![id])?;

    if affected == 0 {
        return Err(AppError::validation(format!("column '{id}' not found")));
    }

    Ok(())
}

pub fn reorder_columns(ids: &[String], state: &AppState) -> Result<()> {
    if ids.is_empty() {
        return Ok(());
    }

    let conn = state.auth_store.lock_connection()?;

    for (position, id) in ids.iter().enumerate() {
        conn.execute(
            "UPDATE columns SET position = ?1 WHERE id = ?2",
            params![position as i64, id],
        )?;
    }

    Ok(())
}

pub fn update_column(id: &str, config: Option<&str>, width: Option<&str>, state: &AppState) -> Result<Column> {
    if config.is_none() && width.is_none() {
        return Err(AppError::validation("at least one of config or width must be provided"));
    }

    if let Some(c) = config {
        validate_config_json(c)?;
    }

    if let Some(w) = width {
        validate_width(w)?;
    }

    let conn = state.auth_store.lock_connection()?;

    let exists: bool = conn
        .query_row("SELECT 1 FROM columns WHERE id = ?1", params![id], |_| Ok(true))
        .unwrap_or(false);

    if !exists {
        return Err(AppError::validation(format!("column '{id}' not found")));
    }

    if let Some(c) = config {
        conn.execute("UPDATE columns SET config = ?1 WHERE id = ?2", params![c, id])?;
    }

    if let Some(w) = width {
        conn.execute("UPDATE columns SET width = ?1 WHERE id = ?2", params![w, id])?;
    }

    let column = conn.query_row(
        "SELECT id, account_did, kind, config, position, width, created_at
         FROM columns WHERE id = ?1",
        params![id],
        |row| {
            Ok(Column {
                id: row.get(0)?,
                account_did: row.get(1)?,
                kind: row.get(2)?,
                config: row.get(3)?,
                position: row.get(4)?,
                width: row.get(5)?,
                created_at: row.get(6)?,
            })
        },
    )?;

    Ok(column)
}

fn validate_kind(kind: &str) -> Result<()> {
    match kind {
        "feed" | "explorer" | "diagnostics" | "messages" | "search" | "profile" => Ok(()),
        _ => Err(AppError::validation(format!(
            "invalid column kind '{kind}': must be 'feed', 'explorer', 'diagnostics', 'messages', 'search', or 'profile'"
        ))),
    }
}

fn validate_width(width: &str) -> Result<()> {
    match width {
        "narrow" | "standard" | "wide" => Ok(()),
        _ => Err(AppError::validation(format!(
            "invalid column width '{width}': must be 'narrow', 'standard', or 'wide'"
        ))),
    }
}

fn validate_config_json(config: &str) -> Result<()> {
    serde_json::from_str::<serde_json::Value>(config)
        .map(|_| ())
        .map_err(|e| AppError::validation(format!("config must be valid JSON: {e}")))
}

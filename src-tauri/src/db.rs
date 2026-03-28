use std::collections::HashSet;
use std::fs;
use std::path::PathBuf;
use std::sync::{Arc, Mutex};

use rusqlite::ffi::sqlite3_auto_extension;
use rusqlite::{params, Connection, OpenFlags, OptionalExtension};
use sqlite_vec::sqlite3_vec_init;
use tauri::{AppHandle, Manager};

use crate::error::AppError;

pub type DbPool = Arc<Mutex<Connection>>;

struct Migration {
    version: i64,
    name: &'static str,
    sql: &'static str,
}

impl Migration {
    const fn new(version: i64, name: &'static str, sql: &'static str) -> Self {
        Self { version, name, sql }
    }
}

const MIGRATIONS: &[Migration] = &[
    Migration::new(1, "initial_schema", include_str!("migrations/001_initial.sql")),
    Migration::new(2, "oauth_storage", include_str!("migrations/002_auth_storage.sql")),
];

pub fn initialize_database(app: &AppHandle) -> Result<DbPool, AppError> {
    // Registers sqlite-vec for all future rusqlite connections.
    unsafe {
        sqlite3_auto_extension(Some(std::mem::transmute(sqlite3_vec_init as *const ())));
    }

    let database_path = resolve_database_path(app)?;
    if let Some(parent) = database_path.parent() {
        fs::create_dir_all(parent)?;
    }

    let connection = Connection::open_with_flags(
        database_path,
        OpenFlags::SQLITE_OPEN_READ_WRITE | OpenFlags::SQLITE_OPEN_CREATE,
    )?;

    connection.pragma_update(None, "journal_mode", "WAL")?;
    connection.pragma_update(None, "foreign_keys", "ON")?;

    run_migrations(&connection)?;
    validate_sqlite_vec(&connection)?;

    Ok(Arc::new(Mutex::new(connection)))
}

fn resolve_database_path(app: &AppHandle) -> Result<PathBuf, AppError> {
    let mut app_data_dir = app
        .path()
        .app_data_dir()
        .map_err(|error| AppError::PathResolve(error.to_string()))?;

    app_data_dir.push("lazurite.db");
    Ok(app_data_dir)
}

fn run_migrations(connection: &Connection) -> Result<(), AppError> {
    connection.execute_batch(
        "
        CREATE TABLE IF NOT EXISTS schema_migrations (
            version INTEGER PRIMARY KEY,
            name TEXT NOT NULL,
            applied_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
        );
    ",
    )?;

    let mut applied_statement = connection.prepare("SELECT version FROM schema_migrations")?;
    let applied_rows = applied_statement.query_map([], |row| row.get::<_, i64>(0))?;

    let mut applied_versions = HashSet::new();
    for version in applied_rows {
        applied_versions.insert(version?);
    }

    for migration in MIGRATIONS {
        if applied_versions.contains(&migration.version) {
            continue;
        }

        let transaction = connection.unchecked_transaction()?;
        transaction.execute_batch(migration.sql)?;
        transaction.execute(
            "INSERT INTO schema_migrations(version, name) VALUES (?1, ?2)",
            params![migration.version, migration.name],
        )?;
        transaction.commit()?;
    }

    Ok(())
}

fn validate_sqlite_vec(connection: &Connection) -> Result<(), AppError> {
    let version: Option<String> = connection
        .query_row("SELECT vec_version()", [], |row| row.get(0))
        .optional()?;

    if version.is_none() {
        return Err(AppError::Validation(
            "sqlite-vec extension did not report a version".to_string(),
        ));
    }

    Ok(())
}

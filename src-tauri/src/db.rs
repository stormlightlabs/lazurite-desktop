use super::error::AppError;
use rusqlite::ffi::sqlite3_auto_extension;
use rusqlite::{params, Connection, OpenFlags, OptionalExtension};
use sqlite_vec::sqlite3_vec_init;
use std::collections::HashSet;
use std::ffi::{c_char, c_int};
use std::fs;
use std::path::PathBuf;
use std::sync::{Arc, Mutex};
use tauri::{AppHandle, Manager};

pub type DbPool = Arc<Mutex<Connection>>;

type SqliteVecInit = unsafe extern "C" fn();

type SqliteAutoExtension = unsafe extern "C" fn(
    db: *mut rusqlite::ffi::sqlite3,
    pz_err_msg: *mut *mut c_char,
    api: *const rusqlite::ffi::sqlite3_api_routines,
) -> c_int;

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
    Migration::new(
        3,
        "oauth_sessions_without_fk",
        include_str!("migrations/003_oauth_sessions_without_fk.sql"),
    ),
    Migration::new(4, "account_avatars", include_str!("migrations/004_account_avatars.sql")),
    Migration::new(5, "sync_state", include_str!("migrations/005_sync_state.sql")),
    Migration::new(6, "app_settings", include_str!("migrations/006_app_settings.sql")),
    Migration::new(
        7,
        "search_owner_scope",
        include_str!("migrations/007_search_owner_scope.sql"),
    ),
];

pub fn initialize_database(app: &AppHandle) -> Result<DbPool, AppError> {
    unsafe {
        let init: SqliteVecInit = sqlite3_vec_init;
        let auto_extension: SqliteAutoExtension = std::mem::transmute(init);
        sqlite3_auto_extension(Some(auto_extension));
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

    match version.is_none() {
        true => Err(AppError::Validation(
            "sqlite-vec extension did not report a version".to_string(),
        )),
        false => Ok(()),
    }
}

#[cfg(test)]
mod tests {
    use rusqlite::{params, Connection};

    fn auth_schema_connection() -> Connection {
        let connection = Connection::open_in_memory().expect("in-memory db should open");
        connection
            .pragma_update(None, "foreign_keys", "ON")
            .expect("foreign keys should enable");
        connection
            .execute_batch(
                "
                CREATE TABLE accounts (
                  did TEXT PRIMARY KEY,
                  handle TEXT,
                  pds_url TEXT,
                  active INTEGER NOT NULL DEFAULT 0 CHECK(active IN (0, 1))
                );
            ",
            )
            .expect("accounts table should apply");
        connection
            .execute_batch(include_str!("migrations/002_auth_storage.sql"))
            .expect("auth storage schema should apply");
        connection
    }

    #[test]
    fn oauth_sessions_require_accounts_before_migration_three() {
        let connection = auth_schema_connection();

        let error = connection
            .execute(
                "
                INSERT INTO oauth_sessions(did, session_id, session_json, updated_at)
                VALUES (?1, ?2, ?3, CURRENT_TIMESTAMP)
            ",
                params!["did:plc:ghost", "session-1", "{}"],
            )
            .expect_err("foreign key should reject oauth sessions without an account row");

        assert!(error.to_string().contains("FOREIGN KEY constraint failed"));
    }

    #[test]
    fn migration_three_allows_oauth_sessions_before_account_insert() {
        let connection = auth_schema_connection();
        connection
            .execute_batch(include_str!("migrations/003_oauth_sessions_without_fk.sql"))
            .expect("migration three should apply");

        connection
            .execute(
                "
                INSERT INTO oauth_sessions(did, session_id, session_json, updated_at)
                VALUES (?1, ?2, ?3, CURRENT_TIMESTAMP)
            ",
                params!["did:plc:ghost", "session-1", "{}"],
            )
            .expect("oauth session insert should succeed after migration three");

        let stored_count: i64 = connection
            .query_row(
                "SELECT COUNT(*) FROM oauth_sessions WHERE did = ?1",
                params!["did:plc:ghost"],
                |row| row.get(0),
            )
            .expect("oauth session count should query");

        assert_eq!(stored_count, 1);
    }
}

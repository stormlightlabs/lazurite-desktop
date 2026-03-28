use super::db::DbPool;
use super::error::AppError;
use super::state::{AccountSummary, ActiveSession};
use jacquard::api::com_atproto::server::get_session::GetSession;
use jacquard::common::session::SessionStoreError;
use jacquard::oauth::atproto::AtprotoClientMetadata;
use jacquard::oauth::authstore::ClientAuthStore;
use jacquard::oauth::client::{OAuthClient, OAuthSession};
use jacquard::oauth::loopback::{handle_localhost_callback, one_shot_server, try_open_in_browser};
use jacquard::oauth::loopback::{CallbackHandle, LoopbackConfig, LoopbackPort};
use jacquard::oauth::session::{AuthRequestData, ClientData, ClientSessionData};
use jacquard::oauth::types::AuthorizeOptions;
use jacquard::types::{aturi::AtUri, did::Did};
use jacquard::xrpc::XrpcClient;
use jacquard::IntoStatic;
use rusqlite::{params, OptionalExtension};
use serde::Serialize;
use std::collections::HashMap;
use std::net::SocketAddr;
use std::sync::{MutexGuard, RwLock};
use tauri::{AppHandle, Emitter};

pub const ACCOUNT_SWITCHED_EVENT: &str = "auth:account-switched";
pub const AT_URI_OPEN_EVENT: &str = "navigation:open-at-uri";
const CLIENT_NAME: &str = "Lazurite";

pub type LazuriteOAuthClient = OAuthClient<jacquard::identity::JacquardResolver, PersistentAuthStore>;
pub type LazuriteOAuthSession = OAuthSession<jacquard::identity::JacquardResolver, PersistentAuthStore>;

#[derive(Clone)]
pub struct PersistentAuthStore {
    db_pool: DbPool,
}

#[derive(Clone, Debug)]
pub struct StoredAccount {
    pub did: String,
    pub session_id: Option<String>,
    pub handle: String,
    pub pds_url: String,
    pub active: bool,
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AtUriNavigation {
    pub uri: String,
}

impl PersistentAuthStore {
    pub fn new(db_pool: DbPool) -> Self {
        Self { db_pool }
    }

    pub fn lock_connection(&self) -> Result<MutexGuard<'_, rusqlite::Connection>, AppError> {
        self.db_pool.lock().map_err(|_| AppError::StatePoisoned("db_pool"))
    }

    pub fn load_accounts(&self) -> Result<Vec<StoredAccount>, AppError> {
        let connection = self.lock_connection()?;
        let mut statement = connection.prepare(
            "
            SELECT
                did,
                session_id,
                COALESCE(handle, ''),
                COALESCE(pds_url, ''),
                active
            FROM accounts
            ORDER BY active DESC, handle COLLATE NOCASE ASC
        ",
        )?;

        let rows = statement.query_map([], |row| {
            Ok(StoredAccount {
                did: row.get(0)?,
                session_id: row.get(1)?,
                handle: row.get(2)?,
                pds_url: row.get(3)?,
                active: row.get::<_, i64>(4)? == 1,
            })
        })?;

        let mut accounts = Vec::new();
        for row in rows {
            accounts.push(row?);
        }

        Ok(accounts)
    }

    pub fn get_account(&self, did: &str) -> Result<Option<StoredAccount>, AppError> {
        let connection = self.lock_connection()?;
        connection
            .query_row(
                "
                SELECT
                    did,
                    session_id,
                    COALESCE(handle, ''),
                    COALESCE(pds_url, ''),
                    active
                FROM accounts
                WHERE did = ?1
            ",
                params![did],
                |row| {
                    Ok(StoredAccount {
                        did: row.get(0)?,
                        session_id: row.get(1)?,
                        handle: row.get(2)?,
                        pds_url: row.get(3)?,
                        active: row.get::<_, i64>(4)? == 1,
                    })
                },
            )
            .optional()
            .map_err(AppError::from)
    }

    pub fn upsert_account(
        &self, account: &AccountSummary, session_id: &str, make_active: bool,
    ) -> Result<(), AppError> {
        let mut connection = self.lock_connection()?;
        let transaction = connection.transaction()?;

        if make_active {
            transaction.execute("UPDATE accounts SET active = 0 WHERE active = 1", [])?;
        }

        transaction.execute(
            "
            INSERT INTO accounts(did, handle, pds_url, session_id, active)
            VALUES (?1, ?2, ?3, ?4, ?5)
            ON CONFLICT(did) DO UPDATE SET
                handle = excluded.handle,
                pds_url = excluded.pds_url,
                session_id = excluded.session_id,
                active = excluded.active
        ",
            params![
                account.did,
                account.handle,
                account.pds_url,
                session_id,
                if make_active { 1_i64 } else { 0_i64 }
            ],
        )?;

        transaction.execute(
            "DELETE FROM oauth_sessions WHERE did = ?1 AND session_id <> ?2",
            params![account.did, session_id],
        )?;
        transaction.commit()?;

        Ok(())
    }

    pub fn set_active_account(&self, did: &str) -> Result<(), AppError> {
        let mut connection = self.lock_connection()?;
        let transaction = connection.transaction()?;
        transaction.execute("UPDATE accounts SET active = 0 WHERE active = 1", [])?;
        let rows_updated = transaction.execute("UPDATE accounts SET active = 1 WHERE did = ?1", params![did])?;

        if rows_updated == 0 {
            return Err(AppError::Validation(format!(
                "cannot activate unknown account did: {did}"
            )));
        }

        transaction.commit()?;
        Ok(())
    }

    pub fn clear_active_account(&self) -> Result<(), AppError> {
        let connection = self.lock_connection()?;
        connection.execute("UPDATE accounts SET active = 0 WHERE active = 1", [])?;
        Ok(())
    }

    pub fn delete_account(&self, did: &str) -> Result<Option<String>, AppError> {
        let mut connection = self.lock_connection()?;
        let transaction = connection.transaction()?;

        let was_active = transaction
            .query_row("SELECT active FROM accounts WHERE did = ?1", params![did], |row| {
                row.get::<_, i64>(0)
            })
            .optional()?
            .unwrap_or_default()
            == 1;

        transaction.execute("DELETE FROM accounts WHERE did = ?1", params![did])?;

        let next_active = if was_active {
            let next = transaction
                .query_row(
                    "SELECT did FROM accounts ORDER BY handle COLLATE NOCASE ASC LIMIT 1",
                    [],
                    |row| row.get::<_, String>(0),
                )
                .optional()?;

            if let Some(next_did) = &next {
                transaction.execute("UPDATE accounts SET active = 1 WHERE did = ?1", params![next_did])?;
            }

            next
        } else {
            None
        };

        transaction.commit()?;
        Ok(next_active)
    }
}

impl ClientAuthStore for PersistentAuthStore {
    async fn get_session(
        &self, did: &Did<'_>, session_id: &str,
    ) -> Result<Option<ClientSessionData<'_>>, SessionStoreError> {
        let connection = self.lock_connection().map_err(app_to_store_error)?;
        let payload: Option<String> = connection
            .query_row(
                "
                SELECT session_json
                FROM oauth_sessions
                WHERE did = ?1 AND session_id = ?2
            ",
                params![did.as_str(), session_id],
                |row| row.get(0),
            )
            .optional()
            .map_err(sqlite_to_store_error)?;

        payload
            .map(|json| serde_json::from_str::<ClientSessionData<'_>>(&json).map(IntoStatic::into_static))
            .transpose()
            .map_err(SessionStoreError::from)
    }

    async fn upsert_session(&self, session: ClientSessionData<'_>) -> Result<(), SessionStoreError> {
        let connection = self.lock_connection().map_err(app_to_store_error)?;
        let payload = serde_json::to_string(&session).map_err(SessionStoreError::from)?;

        connection
            .execute(
                "
                INSERT INTO oauth_sessions(did, session_id, session_json, updated_at)
                VALUES (?1, ?2, ?3, CURRENT_TIMESTAMP)
                ON CONFLICT(did, session_id) DO UPDATE SET
                    session_json = excluded.session_json,
                    updated_at = CURRENT_TIMESTAMP
            ",
                params![session.account_did.as_str(), session.session_id.as_ref(), payload],
            )
            .map_err(sqlite_to_store_error)?;

        Ok(())
    }

    async fn delete_session(&self, did: &Did<'_>, session_id: &str) -> Result<(), SessionStoreError> {
        let connection = self.lock_connection().map_err(app_to_store_error)?;
        connection
            .execute(
                "DELETE FROM oauth_sessions WHERE did = ?1 AND session_id = ?2",
                params![did.as_str(), session_id],
            )
            .map_err(sqlite_to_store_error)?;
        Ok(())
    }

    async fn get_auth_req_info(&self, state: &str) -> Result<Option<AuthRequestData<'_>>, SessionStoreError> {
        let connection = self.lock_connection().map_err(app_to_store_error)?;
        let payload: Option<String> = connection
            .query_row(
                "SELECT auth_request_json FROM oauth_auth_requests WHERE state = ?1",
                params![state],
                |row| row.get(0),
            )
            .optional()
            .map_err(sqlite_to_store_error)?;

        payload
            .map(|json| serde_json::from_str::<AuthRequestData<'_>>(&json).map(IntoStatic::into_static))
            .transpose()
            .map_err(SessionStoreError::from)
    }

    async fn save_auth_req_info(&self, auth_req_info: &AuthRequestData<'_>) -> Result<(), SessionStoreError> {
        let connection = self.lock_connection().map_err(app_to_store_error)?;
        let payload = serde_json::to_string(auth_req_info).map_err(SessionStoreError::from)?;

        connection
            .execute(
                "
                INSERT INTO oauth_auth_requests(state, auth_request_json)
                VALUES (?1, ?2)
                ON CONFLICT(state) DO UPDATE SET
                    auth_request_json = excluded.auth_request_json,
                    created_at = CURRENT_TIMESTAMP
            ",
                params![auth_req_info.state.as_ref(), payload],
            )
            .map_err(sqlite_to_store_error)?;

        Ok(())
    }

    async fn delete_auth_req_info(&self, state: &str) -> Result<(), SessionStoreError> {
        let connection = self.lock_connection().map_err(app_to_store_error)?;
        connection
            .execute("DELETE FROM oauth_auth_requests WHERE state = ?1", params![state])
            .map_err(sqlite_to_store_error)?;
        Ok(())
    }
}

pub fn build_oauth_client(store: PersistentAuthStore) -> LazuriteOAuthClient {
    let client_data = ClientData::new_public(default_client_metadata());
    OAuthClient::new(store, client_data)
}

pub fn default_client_metadata() -> AtprotoClientMetadata<'static> {
    AtprotoClientMetadata::default_localhost().with_prod_info(CLIENT_NAME, None, None, None)
}

pub async fn login_with_loopback(
    oauth_client: &LazuriteOAuthClient, identifier: &str,
) -> Result<LazuriteOAuthSession, AppError> {
    let config = LoopbackConfig::default();
    let options = AuthorizeOptions::default();
    let bind_addr = loopback_bind_addr(&config)?;
    let (local_addr, callback_handle) = one_shot_server(bind_addr);
    let flow_client = build_loopback_client(oauth_client, &config, &options, local_addr);

    let auth_url = flow_client.start_auth(identifier, options).await?;
    let _ = try_open_in_browser(&auth_url);

    complete_loopback_login(flow_client, callback_handle, config).await
}

pub async fn fetch_account_summary(session: &LazuriteOAuthSession, active: bool) -> Result<AccountSummary, AppError> {
    let response = session
        .send(GetSession)
        .await
        .map_err(|error| AppError::Validation(format!("failed to query account session: {error}")))?;
    let output = response
        .into_output()
        .map_err(|error| AppError::Validation(format!("failed to parse account session: {error}")))?;

    Ok(AccountSummary {
        did: output.did.to_string(),
        handle: output.handle.to_string(),
        pds_url: session.endpoint().await.to_string(),
        active,
    })
}

pub fn restore_session_from_data(
    oauth_client: &LazuriteOAuthClient, session_data: ClientSessionData<'static>,
) -> LazuriteOAuthSession {
    OAuthSession::new(oauth_client.registry.clone(), oauth_client.client.clone(), session_data)
}

pub fn normalize_at_uri(raw: &str) -> Result<String, AppError> {
    Ok(AtUri::new(raw)?.to_string())
}

pub fn emit_account_switch(app: &AppHandle, active_session: Option<ActiveSession>) -> Result<(), AppError> {
    app.emit(ACCOUNT_SWITCHED_EVENT, active_session)?;
    Ok(())
}

pub fn emit_at_uri_navigation(app: &AppHandle, raw: &str) -> Result<(), AppError> {
    let uri = normalize_at_uri(raw)?;
    app.emit(AT_URI_OPEN_EVENT, AtUriNavigation { uri })?;
    Ok(())
}

pub fn active_session_from_accounts(accounts: &[StoredAccount]) -> Option<ActiveSession> {
    accounts
        .iter()
        .find(|account| account.active)
        .map(|account| ActiveSession { did: account.did.clone(), handle: account.handle.clone() })
}

pub fn account_summaries(accounts: &[StoredAccount]) -> Vec<AccountSummary> {
    accounts
        .iter()
        .map(|account| AccountSummary {
            did: account.did.clone(),
            handle: account.handle.clone(),
            pds_url: account.pds_url.clone(),
            active: account.active,
        })
        .collect()
}

pub fn remove_cached_session(
    sessions: &RwLock<HashMap<String, std::sync::Arc<LazuriteOAuthSession>>>, did: &str,
) -> Result<(), AppError> {
    sessions
        .write()
        .map_err(|_| AppError::StatePoisoned("sessions"))?
        .remove(did);
    Ok(())
}

fn build_loopback_client(
    oauth_client: &LazuriteOAuthClient, config: &LoopbackConfig, options: &AuthorizeOptions<'_>, local_addr: SocketAddr,
) -> LazuriteOAuthClient {
    let mut client_data = oauth_client.build_localhost_client_data(config, options, local_addr);
    client_data.config = client_data.config.with_prod_info(CLIENT_NAME, None, None, None);

    OAuthClient::new_with_shared(
        oauth_client.registry.store.clone(),
        oauth_client.client.clone(),
        client_data,
    )
}

async fn complete_loopback_login(
    flow_client: LazuriteOAuthClient, callback_handle: CallbackHandle, config: LoopbackConfig,
) -> Result<LazuriteOAuthSession, AppError> {
    Ok(handle_localhost_callback(callback_handle, &flow_client, &config).await?)
}

fn loopback_bind_addr(config: &LoopbackConfig) -> Result<SocketAddr, AppError> {
    let port = match config.port {
        LoopbackPort::Fixed(port) => port,
        LoopbackPort::Ephemeral => 0,
    };

    format!("0.0.0.0:{port}")
        .parse()
        .map_err(|error| AppError::Validation(format!("invalid loopback bind address: {error}")))
}

fn sqlite_to_store_error(error: rusqlite::Error) -> SessionStoreError {
    SessionStoreError::Other(Box::new(error))
}

fn app_to_store_error(error: AppError) -> SessionStoreError {
    SessionStoreError::Other(Box::new(error))
}

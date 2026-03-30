use super::db::DbPool;
use super::error::{AppError, TypeaheadFetchError, TypeaheadFetchErrorKind};
use super::state::{AccountSummary, ActiveSession};
use jacquard::api::app_bsky::actor::get_profile::GetProfile;
use jacquard::api::com_atproto::server::get_session::GetSession;
use jacquard::common::deps::fluent_uri::Uri;
use jacquard::common::session::SessionStoreError;
use jacquard::oauth::atproto::AtprotoClientMetadata;
use jacquard::oauth::authstore::ClientAuthStore;
use jacquard::oauth::client::{OAuthClient, OAuthSession};
use jacquard::oauth::loopback::{try_open_in_browser, LoopbackConfig, LoopbackPort};
use jacquard::oauth::scopes::Scope;
use jacquard::oauth::session::{AuthRequestData, ClientData, ClientSessionData};
use jacquard::oauth::types::{AuthorizeOptions, CallbackParams};
use jacquard::types::did::Did;
use jacquard::xrpc::XrpcClient;
use jacquard::IntoStatic;
use rusqlite::{params, OptionalExtension};
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::io::{Read, Write};
use std::net::{SocketAddr, TcpListener, TcpStream};
use std::sync::mpsc as std_mpsc;
use std::sync::{MutexGuard, RwLock};
use std::thread;
use std::time::Duration;
use tauri::{AppHandle, Emitter};
use tokio::sync::oneshot;

pub const ACCOUNT_SWITCHED_EVENT: &str = "auth:account-switched";
const CLIENT_NAME: &str = "Lazurite";
const CLIENT_METADATA_URL: &str = "https://lazurite.stormlightlabs.org/client-metadata.json";
const CLIENT_SITE_URL: &str = "https://lazurite.stormlightlabs.org";
const LOOPBACK_CALLBACK_PATH: &str = "/callback";
const LOOPBACK_SCOPE: &str = "atproto transition:generic";
const LOGIN_TYPEAHEAD_LIMIT: usize = 6;
const LOGIN_TYPEAHEAD_CLIENT: &str = "lazurite-desktop";
const LOGIN_TYPEAHEAD_PRIMARY_URL: &str = "https://typeahead.waow.tech";
const LOGIN_TYPEAHEAD_FALLBACK_URL: &str = "https://public.api.bsky.app";

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
    pub avatar: Option<String>,
}

#[derive(Clone, Debug, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct LoginSuggestion {
    pub did: String,
    pub handle: String,
    pub display_name: Option<String>,
    pub avatar: Option<String>,
}

#[derive(Debug, Deserialize)]
struct TypeaheadResponse {
    #[serde(default)]
    actors: Vec<TypeaheadActor>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct TypeaheadActor {
    did: String,
    handle: String,
    display_name: Option<String>,
    avatar: Option<String>,
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
                    active,
                    avatar
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
                avatar: row.get(5)?,
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
                    active,
                    avatar
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
                        avatar: row.get(5)?,
                    })
                },
            )
            .optional()
            .map_err(AppError::from)
    }

    pub fn get_latest_session_id(&self, did: &str) -> Result<Option<String>, AppError> {
        let connection = self.lock_connection()?;
        connection
            .query_row(
                "
                SELECT session_id
                FROM oauth_sessions
                WHERE did = ?1
                ORDER BY updated_at DESC, created_at DESC
                LIMIT 1
            ",
                params![did],
                |row| row.get::<_, String>(0),
            )
            .optional()
            .map_err(AppError::from)
    }

    pub fn update_account_session_id(&self, did: &str, session_id: &str) -> Result<(), AppError> {
        let connection = self.lock_connection()?;
        let rows_updated = connection.execute(
            "UPDATE accounts SET session_id = ?2 WHERE did = ?1",
            params![did, session_id],
        )?;

        if rows_updated == 0 {
            return Err(AppError::Validation(format!(
                "cannot update session_id for unknown account did: {did}"
            )));
        }

        Ok(())
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
            INSERT INTO accounts(did, handle, pds_url, session_id, active, avatar)
            VALUES (?1, ?2, ?3, ?4, ?5, ?6)
            ON CONFLICT(did) DO UPDATE SET
                handle = excluded.handle,
                pds_url = excluded.pds_url,
                session_id = excluded.session_id,
                active = excluded.active,
                avatar = excluded.avatar
        ",
            params![
                account.did,
                account.handle,
                account.pds_url,
                session_id,
                if make_active { 1_i64 } else { 0_i64 },
                account.avatar,
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

    pub fn prune_orphaned_sessions(&self) -> Result<(), AppError> {
        let connection = self.lock_connection()?;
        connection.execute(
            "
            DELETE FROM oauth_sessions
            WHERE did NOT IN (SELECT did FROM accounts)
        ",
            [],
        )?;
        Ok(())
    }

    pub fn delete_persisted_session(&self, did: &str, session_id: &str) -> Result<(), AppError> {
        let connection = self.lock_connection()?;
        connection.execute(
            "DELETE FROM oauth_sessions WHERE did = ?1 AND session_id = ?2",
            params![did, session_id],
        )?;
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

        transaction.execute("DELETE FROM oauth_sessions WHERE did = ?1", params![did])?;
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
    build_client_metadata("http://127.0.0.1/callback")
}

pub async fn login_with_loopback(
    oauth_client: &LazuriteOAuthClient, identifier: &str,
) -> Result<LazuriteOAuthSession, AppError> {
    let config = LoopbackConfig::default();
    let options = AuthorizeOptions::default();
    let bind_addr = loopback_bind_addr(&config)?;
    let (local_addr, callback_handle) = start_loopback_callback_server(bind_addr)?;
    let flow_client = build_loopback_client(oauth_client, &config, &options, local_addr);

    let auth_url = match flow_client.start_auth(identifier, options).await {
        Ok(auth_url) => auth_url,
        Err(error) => {
            let _ = callback_handle.stop_tx.send(());
            let _ = callback_handle.server_handle.join();
            return Err(error.into());
        }
    };
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
    let avatar = session
        .send(
            GetProfile::new()
                .actor(jacquard::common::types::ident::AtIdentifier::Did(output.did.clone()))
                .build(),
        )
        .await
        .ok()
        .and_then(|response| response.into_output().ok())
        .and_then(|profile| profile.value.avatar.map(|uri| uri.as_str().to_owned()));

    Ok(AccountSummary {
        did: output.did.to_string(),
        handle: output.handle.to_string(),
        pds_url: session.endpoint().await.to_string(),
        active,
        avatar,
    })
}

pub fn restore_session_from_data(
    oauth_client: &LazuriteOAuthClient, session_data: ClientSessionData<'static>,
) -> LazuriteOAuthSession {
    OAuthSession::new(oauth_client.registry.clone(), oauth_client.client.clone(), session_data)
}

pub fn emit_account_switch(app: &AppHandle, active_session: Option<ActiveSession>) -> Result<(), AppError> {
    app.emit(ACCOUNT_SWITCHED_EVENT, active_session)?;
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
            avatar: account.avatar.clone(),
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
    let scopes = if options.scopes.is_empty() { None } else { Some(options.scopes.clone().into_static()) };
    let redirect_uri = format!("http://{}:{}{}", config.host, local_addr.port(), LOOPBACK_CALLBACK_PATH);
    let client_data = ClientData::new_public(build_client_metadata_with_scopes(&redirect_uri, scopes));

    OAuthClient::new_with_shared(
        oauth_client.registry.store.clone(),
        oauth_client.client.clone(),
        client_data,
    )
}

struct LocalCallbackServerHandle {
    callback_rx: oneshot::Receiver<CallbackParams<'static>>,
    server_handle: thread::JoinHandle<()>,
    stop_tx: std_mpsc::Sender<()>,
}

async fn complete_loopback_login(
    flow_client: LazuriteOAuthClient, callback_handle: LocalCallbackServerHandle, config: LoopbackConfig,
) -> Result<LazuriteOAuthSession, AppError> {
    let callback = tokio::time::timeout(Duration::from_millis(config.timeout_ms), callback_handle.callback_rx)
        .await
        .map_err(|_| AppError::validation("oauth loopback callback timed out"))?
        .map_err(|_| AppError::validation("oauth loopback callback channel closed"))?;

    let _ = callback_handle.stop_tx.send(());
    let _ = callback_handle.server_handle.join();

    Ok(flow_client.callback(callback).await?)
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

fn start_loopback_callback_server(bind_addr: SocketAddr) -> Result<(SocketAddr, LocalCallbackServerHandle), AppError> {
    let listener = TcpListener::bind(bind_addr)?;
    listener.set_nonblocking(true)?;
    let local_addr = listener.local_addr()?;

    let (callback_tx, callback_rx) = oneshot::channel();
    let (stop_tx, stop_rx) = std_mpsc::channel();

    let server_handle = thread::spawn(move || {
        run_loopback_callback_server(&listener, callback_tx, &stop_rx);
    });

    Ok((
        local_addr,
        LocalCallbackServerHandle { callback_rx, server_handle, stop_tx },
    ))
}

fn run_loopback_callback_server(
    listener: &TcpListener, callback_tx: oneshot::Sender<CallbackParams<'static>>, stop_rx: &std_mpsc::Receiver<()>,
) {
    let mut callback_tx = Some(callback_tx);

    loop {
        if stop_rx.try_recv().is_ok() {
            break;
        }

        match listener.accept() {
            Ok((mut stream, _)) => {
                let handled = handle_loopback_stream(&mut stream, &mut callback_tx);
                if handled {
                    break;
                }
            }
            Err(error) => match error.kind() {
                std::io::ErrorKind::WouldBlock => thread::sleep(Duration::from_millis(25)),
                _ => break,
            },
        }
    }
}

fn handle_loopback_stream(
    stream: &mut TcpStream, callback_tx: &mut Option<oneshot::Sender<CallbackParams<'static>>>,
) -> bool {
    let mut buffer = [0_u8; 8192];
    let bytes_read = match stream.read(&mut buffer) {
        Ok(bytes_read) => bytes_read,
        Err(_) => return false,
    };

    let request = String::from_utf8_lossy(&buffer[..bytes_read]);
    let request_line = request.lines().next().unwrap_or_default();
    let request_target = request_line.split_whitespace().nth(1).unwrap_or_default();

    match parse_loopback_callback(request_target) {
        Ok(params) => {
            let _ = write_http_response(stream, 200, "Logged in!");
            if let Some(callback_tx) = callback_tx.take() {
                let _ = callback_tx.send(params);
            }
            true
        }
        Err(_) => {
            let _ = write_http_response(stream, 404, "Not found");
            false
        }
    }
}

fn parse_loopback_callback(request_target: &str) -> Result<CallbackParams<'static>, AppError> {
    let url = reqwest::Url::parse(&format!("http://127.0.0.1{request_target}"))
        .map_err(|error| AppError::validation(format!("invalid loopback callback URL: {error}")))?;

    if url.path() != LOOPBACK_CALLBACK_PATH {
        return Err(AppError::validation("unexpected loopback callback path"));
    }

    let mut code = None;
    let mut iss = None;
    let mut state = None;

    for (key, value) in url.query_pairs() {
        match key.as_ref() {
            "code" => code = Some(value.into_owned()),
            "iss" => iss = Some(value.into_owned()),
            "state" => state = Some(value.into_owned()),
            _ => {}
        }
    }

    let code = code.ok_or_else(|| AppError::validation("loopback callback missing code"))?;

    Ok(CallbackParams { code: code.into(), iss: iss.map(Into::into), state: state.map(Into::into) })
}

fn write_http_response(stream: &mut TcpStream, status_code: u16, body: &str) -> std::io::Result<()> {
    let status_text = match status_code {
        200 => "OK",
        404 => "Not Found",
        _ => "OK",
    };
    let response = format!(
        "HTTP/1.1 {status_code} {status_text}\r\nContent-Type: text/plain; charset=utf-8\r\nContent-Length: {}\r\nConnection: close\r\n\r\n{body}",
        body.len()
    );
    stream.write_all(response.as_bytes())?;
    stream.flush()
}

fn build_client_metadata(redirect_uri: &str) -> AtprotoClientMetadata<'static> {
    build_client_metadata_with_scopes(redirect_uri, None)
}

fn build_client_metadata_with_scopes(
    redirect_uri: &str, scopes: Option<Vec<Scope<'static>>>,
) -> AtprotoClientMetadata<'static> {
    AtprotoClientMetadata {
        client_id: Uri::parse(CLIENT_METADATA_URL.to_string()).expect("client metadata URL should be valid"),
        client_uri: Some(Uri::parse(CLIENT_SITE_URL.to_string()).expect("client site URL should be valid")),
        redirect_uris: vec![Uri::parse(redirect_uri.to_string()).expect("loopback redirect URI should be valid")],
        grant_types: vec![
            jacquard::oauth::atproto::GrantType::AuthorizationCode,
            jacquard::oauth::atproto::GrantType::RefreshToken,
        ],
        scopes: scopes.unwrap_or_else(|| Scope::parse_multiple(LOOPBACK_SCOPE).expect("loopback scopes should parse")),
        jwks_uri: None,
        client_name: Some(CLIENT_NAME.into()),
        logo_uri: None,
        tos_uri: None,
        privacy_policy_uri: None,
    }
}

fn sqlite_to_store_error(error: rusqlite::Error) -> SessionStoreError {
    SessionStoreError::Other(Box::new(error))
}

fn app_to_store_error(error: AppError) -> SessionStoreError {
    SessionStoreError::Other(Box::new(error))
}

pub async fn search_login_suggestions(query: &str) -> Result<Vec<LoginSuggestion>, AppError> {
    let Some(normalized_query) = normalize_login_suggestion_query(query) else {
        return Ok(Vec::new());
    };

    let client = reqwest::Client::builder().timeout(Duration::from_secs(4)).build()?;

    match fetch_login_suggestions_from_endpoint(&client, LOGIN_TYPEAHEAD_PRIMARY_URL, normalized_query).await {
        Ok(suggestions) => Ok(suggestions),
        Err(error) if should_fallback_to_public_typeahead(&error) => {
            fetch_login_suggestions_from_endpoint(&client, LOGIN_TYPEAHEAD_FALLBACK_URL, normalized_query)
                .await
                .map_err(|fallback_error| {
                    AppError::validation(format!("{error}; fallback request also failed: {fallback_error}"))
                })
        }
        Err(error) => Err(AppError::validation(error.to_string())),
    }
}

async fn fetch_login_suggestions_from_endpoint(
    client: &reqwest::Client, base_url: &str, query: &str,
) -> Result<Vec<LoginSuggestion>, TypeaheadFetchError> {
    let response = client
        .get(format!("{base_url}/xrpc/app.bsky.actor.searchActorsTypeahead"))
        .header("X-Client", LOGIN_TYPEAHEAD_CLIENT)
        .query(&[("q", query), ("limit", "6")])
        .send()
        .await
        .map_err(|error| TypeaheadFetchError::transport(&error))?;

    let status = response.status();
    if !status.is_success() {
        return Err(TypeaheadFetchError::status(status));
    }

    let payload = response
        .json::<TypeaheadResponse>()
        .await
        .map_err(|error| TypeaheadFetchError::decode(&error))?;

    Ok(payload
        .actors
        .into_iter()
        .filter(|actor| !actor.handle.trim().is_empty())
        .map(|actor| LoginSuggestion {
            did: actor.did,
            handle: actor.handle,
            display_name: actor.display_name,
            avatar: actor.avatar,
        })
        .take(LOGIN_TYPEAHEAD_LIMIT)
        .collect())
}

fn normalize_login_suggestion_query(query: &str) -> Option<&str> {
    let trimmed = query.trim();
    if trimmed.len() < 2
        || trimmed.starts_with("did:")
        || trimmed.starts_with("http://")
        || trimmed.starts_with("https://")
    {
        return None;
    }

    Some(trimmed.trim_start_matches('@'))
}

fn should_fallback_to_public_typeahead(error: &TypeaheadFetchError) -> bool {
    match error.kind {
        TypeaheadFetchErrorKind::Decode | TypeaheadFetchErrorKind::Transport => true,
        TypeaheadFetchErrorKind::Status(status) => {
            status == reqwest::StatusCode::TOO_MANY_REQUESTS || status.is_server_error()
        }
    }
}

#[cfg(test)]
mod tests {
    use super::{
        default_client_metadata, parse_loopback_callback, should_fallback_to_public_typeahead, LoginSuggestion,
        PersistentAuthStore, TypeaheadFetchError, TypeaheadFetchErrorKind,
    };
    use crate::db::DbPool;
    use jacquard::common::deps::fluent_uri::Uri;
    use reqwest::StatusCode;
    use rusqlite::{params, Connection};
    use std::sync::{Arc, Mutex};

    fn auth_store_with_schema(schema: &str) -> PersistentAuthStore {
        let connection = Connection::open_in_memory().expect("in-memory db should open");
        connection.execute_batch(schema).expect("schema should apply");

        let pool: DbPool = Arc::new(Mutex::new(connection));
        PersistentAuthStore::new(pool)
    }

    #[test]
    fn prunes_orphaned_oauth_sessions() {
        let store = auth_store_with_schema(
            "
            CREATE TABLE accounts (
                did TEXT PRIMARY KEY,
                handle TEXT,
                pds_url TEXT,
                session_id TEXT,
                active INTEGER NOT NULL DEFAULT 0,
                avatar TEXT
            );

            CREATE TABLE oauth_sessions (
                did TEXT NOT NULL,
                session_id TEXT NOT NULL,
                session_json TEXT NOT NULL,
                created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
                updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
                PRIMARY KEY (did, session_id)
            );
        ",
        );

        let connection = store.lock_connection().expect("connection should lock");
        connection
            .execute(
                "INSERT INTO accounts(did, handle) VALUES (?1, ?2)",
                params!["did:plc:kept", "kept.test"],
            )
            .expect("account should insert");
        connection
            .execute(
                "INSERT INTO oauth_sessions(did, session_id, session_json) VALUES (?1, ?2, ?3)",
                params!["did:plc:kept", "session-kept", "{}"],
            )
            .expect("owned oauth session should insert");
        connection
            .execute(
                "INSERT INTO oauth_sessions(did, session_id, session_json) VALUES (?1, ?2, ?3)",
                params!["did:plc:orphan", "session-orphan", "{}"],
            )
            .expect("orphan oauth session should insert");
        drop(connection);

        store.prune_orphaned_sessions().expect("orphan pruning should succeed");

        let connection = store.lock_connection().expect("connection should relock");
        let dids: Vec<String> = connection
            .prepare("SELECT did FROM oauth_sessions ORDER BY did ASC")
            .expect("statement should prepare")
            .query_map([], |row| row.get(0))
            .expect("query should run")
            .collect::<Result<_, _>>()
            .expect("rows should collect");

        assert_eq!(dids, vec!["did:plc:kept".to_string()]);
    }

    #[test]
    fn falls_back_to_public_typeahead_on_rate_limit() {
        let error = TypeaheadFetchError {
            kind: TypeaheadFetchErrorKind::Status(StatusCode::TOO_MANY_REQUESTS),
            message: "rate limited".to_string(),
        };

        assert!(should_fallback_to_public_typeahead(&error));
    }

    #[test]
    fn does_not_fallback_to_public_typeahead_on_client_input_errors() {
        let error = TypeaheadFetchError {
            kind: TypeaheadFetchErrorKind::Status(StatusCode::BAD_REQUEST),
            message: "bad request".to_string(),
        };

        assert!(!should_fallback_to_public_typeahead(&error));
    }

    #[test]
    fn login_suggestion_serialization_shape_matches_frontend_contract() {
        let suggestion = LoginSuggestion {
            did: "did:plc:alice".to_string(),
            handle: "alice.bsky.social".to_string(),
            display_name: Some("Alice".to_string()),
            avatar: Some("https://cdn.example/alice.jpg".to_string()),
        };

        let payload = serde_json::to_value(suggestion).expect("login suggestion should serialize");

        assert_eq!(payload["did"], "did:plc:alice");
        assert_eq!(payload["handle"], "alice.bsky.social");
        assert_eq!(payload["displayName"], "Alice");
        assert_eq!(payload["avatar"], "https://cdn.example/alice.jpg");
    }

    #[test]
    fn default_client_metadata_uses_hosted_document_and_callback_path() {
        let metadata = default_client_metadata();

        assert_eq!(
            metadata.client_id.as_str(),
            "https://lazurite.stormlightlabs.org/client-metadata.json"
        );
        assert_eq!(
            metadata.client_uri.as_ref().map(Uri::as_str),
            Some("https://lazurite.stormlightlabs.org")
        );
        assert_eq!(metadata.redirect_uris[0].as_str(), "http://127.0.0.1/callback");
    }

    #[test]
    fn parse_loopback_callback_extracts_query_params_from_callback_path() {
        let params = parse_loopback_callback("/callback?code=abc123&state=state-1&iss=https%3A%2F%2Fauth.example")
            .expect("loopback callback should parse");

        assert_eq!(params.code.as_ref(), "abc123");
        assert_eq!(params.state.as_deref(), Some("state-1"));
        assert_eq!(params.iss.as_deref(), Some("https://auth.example"));
    }

    #[test]
    fn latest_session_id_prefers_most_recent_persisted_session() {
        let store = auth_store_with_schema(
            "
            CREATE TABLE accounts (
                did TEXT PRIMARY KEY,
                handle TEXT,
                pds_url TEXT,
                session_id TEXT,
                active INTEGER NOT NULL DEFAULT 0,
                avatar TEXT
            );

            CREATE TABLE oauth_sessions (
                did TEXT NOT NULL,
                session_id TEXT NOT NULL,
                session_json TEXT NOT NULL,
                created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
                updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
                PRIMARY KEY (did, session_id)
            );
        ",
        );

        let connection = store.lock_connection().expect("connection should lock");
        connection
            .execute(
                "INSERT INTO accounts(did, handle, session_id) VALUES (?1, ?2, ?3)",
                params!["did:plc:alice", "alice.test", "session-old"],
            )
            .expect("account should insert");
        connection
            .execute(
                "INSERT INTO oauth_sessions(did, session_id, session_json, updated_at) VALUES (?1, ?2, ?3, '2026-03-29 10:00:00')",
                params!["did:plc:alice", "session-old", "{}"],
            )
            .expect("old oauth session should insert");
        connection
            .execute(
                "INSERT INTO oauth_sessions(did, session_id, session_json, updated_at) VALUES (?1, ?2, ?3, '2026-03-29 11:00:00')",
                params!["did:plc:alice", "session-new", "{}"],
            )
            .expect("new oauth session should insert");
        drop(connection);

        let latest = store
            .get_latest_session_id("did:plc:alice")
            .expect("latest session lookup should succeed");

        assert_eq!(latest.as_deref(), Some("session-new"));
    }

    #[test]
    fn update_account_session_id_repoints_stale_account_record() {
        let store = auth_store_with_schema(
            "
            CREATE TABLE accounts (
                did TEXT PRIMARY KEY,
                handle TEXT,
                pds_url TEXT,
                session_id TEXT,
                active INTEGER NOT NULL DEFAULT 0,
                avatar TEXT
            );

            CREATE TABLE oauth_sessions (
                did TEXT NOT NULL,
                session_id TEXT NOT NULL,
                session_json TEXT NOT NULL,
                created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
                updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
                PRIMARY KEY (did, session_id)
            );
        ",
        );

        let connection = store.lock_connection().expect("connection should lock");
        connection
            .execute(
                "INSERT INTO accounts(did, handle, session_id) VALUES (?1, ?2, ?3)",
                params!["did:plc:alice", "alice.test", "session-old"],
            )
            .expect("account should insert");
        drop(connection);

        store
            .update_account_session_id("did:plc:alice", "session-new")
            .expect("session id update should succeed");

        let updated = store
            .get_account("did:plc:alice")
            .expect("account lookup should succeed")
            .expect("account should remain present");

        assert_eq!(updated.session_id.as_deref(), Some("session-new"));
    }
}

use super::auth::{
    account_summaries, active_session_from_accounts, build_oauth_client, emit_account_switch, fetch_account_summary,
    login_with_loopback, remove_cached_session, restore_session_from_data,
};
use super::auth::{LazuriteOAuthClient, LazuriteOAuthSession, PersistentAuthStore, StoredAccount};
use super::db::DbPool;
use super::error::AppError;
use jacquard::oauth::authstore::ClientAuthStore;
use jacquard::oauth::error::OAuthError;
use jacquard::types::did::Did;
use jacquard::IntoStatic;
use serde::Serialize;
use std::collections::HashMap;
use std::sync::{Arc, RwLock};
use std::time::Duration;
use tauri::{AppHandle, Emitter, Manager};
use tauri_plugin_log::log;

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ActiveSession {
    pub did: String,
    pub handle: String,
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AppBootstrap {
    pub active_session: Option<ActiveSession>,
    pub account_list: Vec<AccountSummary>,
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AccountSummary {
    pub did: String,
    pub handle: String,
    pub pds_url: String,
    pub active: bool,
    pub avatar: Option<String>,
}

pub struct AppState {
    pub auth_store: PersistentAuthStore,
    pub oauth_client: LazuriteOAuthClient,
    pub active_session: RwLock<Option<ActiveSession>>,
    pub account_list: RwLock<Vec<AccountSummary>>,
    pub sessions: RwLock<HashMap<String, Arc<LazuriteOAuthSession>>>,
}

impl AppState {
    pub async fn bootstrap(db_pool: DbPool) -> Result<Self, AppError> {
        log::info!("bootstrapping application state");
        let auth_store = PersistentAuthStore::new(db_pool.clone());
        auth_store.prune_orphaned_sessions()?;
        let oauth_client = build_oauth_client(auth_store.clone());
        let accounts = auth_store.load_accounts()?;
        log::info!("loaded {} stored account(s)", accounts.len());

        let active = active_session_from_accounts(&accounts);
        if let Some(ref session) = active {
            log::info!("active account from database: {}", session.handle);
        } else {
            log::debug!("no active account found in database");
        }

        let app_state = Self {
            auth_store,
            oauth_client,
            active_session: RwLock::new(active),
            account_list: RwLock::new(account_summaries(&accounts)),
            sessions: RwLock::new(HashMap::new()),
        };

        app_state.restore_sessions().await?;
        app_state.refresh_account_cache()?;

        let final_active = app_state.current_active_session()?;
        if let Some(ref session) = final_active {
            log::info!("bootstrap complete, active session: {}", session.handle);
        } else {
            log::warn!("bootstrap complete, no active session (reauth may be required)");
        }

        Ok(app_state)
    }

    pub fn snapshot(&self) -> Result<AppBootstrap, AppError> {
        let active_session = self
            .active_session
            .read()
            .map_err(|_| AppError::StatePoisoned("active_session"))?
            .clone();
        let account_list = self
            .account_list
            .read()
            .map_err(|_| AppError::StatePoisoned("account_list"))?
            .clone();

        Ok(AppBootstrap { active_session, account_list })
    }

    pub fn accounts(&self) -> Result<Vec<AccountSummary>, AppError> {
        Ok(self
            .account_list
            .read()
            .map_err(|_| AppError::StatePoisoned("account_list"))?
            .clone())
    }

    pub async fn login(&self, app: &AppHandle, identifier: String) -> Result<AccountSummary, AppError> {
        log::info!("starting login flow for {}", identifier.trim());
        let session = Arc::new(login_with_loopback(&self.oauth_client, identifier.trim()).await?);
        let (did, session_id) = session.session_info().await;
        let did = did.to_string();
        let session_id = session_id.to_string();
        let account_summary_result = async {
            let account_summary = fetch_account_summary(&session, true).await?;
            self.auth_store.upsert_account(&account_summary, &session_id, true)?;
            Ok::<_, AppError>(account_summary)
        }
        .await;
        let account_summary = match account_summary_result {
            Ok(account_summary) => account_summary,
            Err(error) => {
                self.auth_store.delete_persisted_session(&did, &session_id)?;
                return Err(error);
            }
        };

        self.sessions
            .write()
            .map_err(|_| AppError::StatePoisoned("sessions"))?
            .insert(did, session);

        self.refresh_account_cache()?;
        emit_account_switch(app, self.current_active_session()?)?;

        log::info!("login complete for {}", account_summary.handle);
        Ok(account_summary)
    }

    pub async fn logout(&self, app: &AppHandle, did: &str) -> Result<(), AppError> {
        log::info!("logging out account {did}");
        let account = self
            .auth_store
            .get_account(did)?
            .ok_or_else(|| AppError::Validation(format!("cannot logout unknown account did: {did}")))?;

        let session = self.ensure_session(&account, false).await?;
        session.logout().await?;

        self.auth_store.delete_account(did)?;
        remove_cached_session(&self.sessions, did)?;
        self.refresh_account_cache()?;
        emit_account_switch(app, self.current_active_session()?)?;

        Ok(())
    }

    pub async fn switch_account(&self, app: &AppHandle, did: &str) -> Result<(), AppError> {
        log::info!("switching to account {did}");
        let account = self
            .auth_store
            .get_account(did)?
            .ok_or_else(|| AppError::Validation(format!("cannot activate unknown account did: {did}")))?;
        self.ensure_session(&account, true).await?;
        self.auth_store.set_active_account(did)?;
        self.refresh_account_cache()?;
        emit_account_switch(app, self.current_active_session()?)?;
        Ok(())
    }

    fn refresh_account_cache(&self) -> Result<(), AppError> {
        let accounts = self.auth_store.load_accounts()?;
        *self
            .account_list
            .write()
            .map_err(|_| AppError::StatePoisoned("account_list"))? = account_summaries(&accounts);
        *self
            .active_session
            .write()
            .map_err(|_| AppError::StatePoisoned("active_session"))? = active_session_from_accounts(&accounts);

        Ok(())
    }

    fn current_active_session(&self) -> Result<Option<ActiveSession>, AppError> {
        Ok(self
            .active_session
            .read()
            .map_err(|_| AppError::StatePoisoned("active_session"))?
            .clone())
    }

    async fn ensure_session(
        &self, account: &StoredAccount, refresh: bool,
    ) -> Result<Arc<LazuriteOAuthSession>, AppError> {
        if let Some(existing) = self
            .sessions
            .read()
            .map_err(|_| AppError::StatePoisoned("sessions"))?
            .get(&account.did)
            .cloned()
        {
            log::debug!("using cached session for {}", account.handle);
            return Ok(existing);
        }

        let did = Did::new(&account.did)?;
        let session_id = self.resolve_restorable_session_id(account, &did).await?;
        let session = if refresh {
            log::info!("restoring session with token refresh for {}", account.handle);
            match self.oauth_client.restore(&did, &session_id).await {
                Ok(session) => Arc::new(session),
                Err(error) if should_fallback_to_persisted_session(&error) => {
                    log::warn!(
                        "token refresh unavailable for {} during restore: {}; using persisted session data",
                        account.handle,
                        error
                    );
                    self.restore_persisted_session(account, &did, &session_id).await?
                }
                Err(error) => return Err(AppError::from(error)),
            }
        } else {
            log::debug!("restoring session from persisted data for {}", account.handle);
            self.restore_persisted_session(account, &did, &session_id).await?
        };

        self.sessions
            .write()
            .map_err(|_| AppError::StatePoisoned("sessions"))?
            .insert(account.did.clone(), session.clone());

        log::info!("session restored successfully for {}", account.handle);
        Ok(session)
    }

    async fn resolve_restorable_session_id(
        &self, account: &StoredAccount, did: &Did<'_>,
    ) -> Result<String, AppError> {
        let configured_session_id = account.session_id.as_deref().ok_or_else(|| {
            AppError::Validation(format!("account {} does not have a stored oauth session", account.did))
        })?;

        if self
            .auth_store
            .get_session(did, configured_session_id)
            .await?
            .is_some()
        {
            return Ok(configured_session_id.to_string());
        }

        let fallback_session_id = self.auth_store.get_latest_session_id(&account.did)?.ok_or_else(|| {
            AppError::Validation(format!("missing persisted oauth session for account {}", account.did))
        })?;

        log::warn!(
            "account {} referenced missing session {}; falling back to persisted session {}",
            account.handle,
            configured_session_id,
            fallback_session_id
        );

        self.auth_store
            .update_account_session_id(&account.did, &fallback_session_id)?;

        Ok(fallback_session_id)
    }

    async fn restore_persisted_session(
        &self, account: &StoredAccount, did: &Did<'_>, session_id: &str,
    ) -> Result<Arc<LazuriteOAuthSession>, AppError> {
        let session_data = self.auth_store.get_session(did, session_id).await?.ok_or_else(|| {
            AppError::Validation(format!("missing persisted oauth session for account {}", account.did))
        })?;

        Ok(Arc::new(restore_session_from_data(
            &self.oauth_client,
            session_data.into_static(),
        )))
    }

    async fn restore_sessions(&self) -> Result<(), AppError> {
        let accounts = self.auth_store.load_accounts()?;
        log::info!("restoring sessions for {} account(s)", accounts.len());

        for account in &accounts {
            if account.session_id.is_none() {
                log::debug!("skipping {} (no session_id)", account.handle);
                continue;
            }

            log::debug!(
                "restoring session for {} (active={}, refresh={})",
                account.handle,
                account.active,
                account.active
            );

            let restored = self.ensure_session(account, account.active).await;
            if restored.is_ok() {
                continue;
            }

            if let Err(error) = restored {
                log::warn!("failed to restore session for {}: {error}", account.handle);
            }

            remove_cached_session(&self.sessions, &account.did)?;
            if account.active {
                log::warn!("clearing active flag for {} after restore failure", account.handle);
                self.auth_store.clear_active_account()?;
            }
        }

        Ok(())
    }

    pub async fn refresh_active_token(&self, app: &AppHandle) -> Result<(), AppError> {
        let active = self
            .active_session
            .read()
            .map_err(|_| AppError::StatePoisoned("active_session"))?
            .clone();

        let Some(active) = active else {
            return self.try_recover_session(app).await;
        };

        let account = match self.auth_store.get_account(&active.did)? {
            Some(account) => account,
            None => return Ok(()),
        };

        let session = match self.ensure_session(&account, false).await {
            Ok(session) => session,
            Err(error) => {
                log::warn!("active session could not be loaded for {}: {error}", active.handle);
                self.invalidate_active_session(app)?;
                return Err(AppError::validation(format!("session unavailable: {error}")));
            }
        };

        match session.refresh().await {
            Ok(_) => {
                log::info!("token refresh succeeded for {}", active.handle);
                Ok(())
            }
            Err(error) if oauth_error_requires_reauth(&error) => {
                log::warn!("token refresh failed permanently for {}: {error}", active.handle);
                remove_cached_session(&self.sessions, &active.did)?;
                self.invalidate_active_session(app)?;
                Err(AppError::validation(format!("refresh failed permanently: {error}")))
            }
            Err(error) => {
                log::warn!("token refresh unavailable for {}: {error}", active.handle);
                Err(AppError::validation(format!("refresh unavailable: {error}")))
            }
        }
    }

    /// Attempt to recover a session when no account is currently active.
    /// This handles the case where bootstrap failed to restore a session
    /// (e.g. due to a transient network error) and the active flag was cleared.
    async fn try_recover_session(&self, app: &AppHandle) -> Result<(), AppError> {
        let accounts = self.auth_store.load_accounts()?;
        let candidate = accounts.iter().find(|a| a.session_id.is_some());

        let Some(account) = candidate else {
            return Ok(());
        };

        let did = Did::new(&account.did)?;
        let session_id = self.resolve_restorable_session_id(account, &did).await?;

        match self.oauth_client.restore(&did, &session_id).await {
            Ok(session) => {
                self.sessions
                    .write()
                    .map_err(|_| AppError::StatePoisoned("sessions"))?
                    .insert(account.did.clone(), Arc::new(session));

                self.auth_store.set_active_account(&account.did)?;
                self.refresh_account_cache()?;

                log::info!("session recovery succeeded for {}", account.handle);
                emit_account_switch(app, self.current_active_session()?)?;
                Ok(())
            }
            Err(error) => {
                log::warn!("session recovery failed for {}: {error}", account.handle);
                Err(AppError::validation(format!("recovery failed: {error}")))
            }
        }
    }

    /// Starts a background task to refresh the active session's token at regular intervals.
    ///
    /// Adds a short initial delay to quickly retry if bootstrap restore failed
    pub fn spawn_token_refresh_task(app: AppHandle) {
        const INITIAL_DELAY: Duration = Duration::from_secs(30);
        const REFRESH_INTERVAL: Duration = Duration::from_secs(15 * 60);

        tauri::async_runtime::spawn(async move {
            tokio::time::sleep(INITIAL_DELAY).await;

            loop {
                let state = app.state::<AppState>();
                match state.refresh_active_token(&app).await {
                    Ok(_) => log::debug!("background token refresh successful"),
                    Err(error) => log::warn!("background token refresh error: {error}"),
                }

                tokio::time::sleep(REFRESH_INTERVAL).await;
            }
        });
    }

    fn invalidate_active_session(&self, app: &AppHandle) -> Result<(), AppError> {
        self.auth_store.clear_active_account()?;
        self.refresh_account_cache()?;
        app.emit(super::auth::ACCOUNT_SWITCHED_EVENT, None::<ActiveSession>)?;
        Ok(())
    }
}

fn oauth_error_requires_reauth(error: &OAuthError) -> bool {
    match error {
        OAuthError::Session(error) => error.is_permanent(),
        OAuthError::Request(error) => error.is_permanent(),
        _ => false,
    }
}

fn should_fallback_to_persisted_session(error: &OAuthError) -> bool {
    matches!(error, OAuthError::Session(error) if !error.is_permanent())
        || matches!(error, OAuthError::Request(error) if !error.is_permanent())
        || matches!(error, OAuthError::Resolver(_))
}

#[cfg(test)]
mod tests {
    use super::{oauth_error_requires_reauth, should_fallback_to_persisted_session};
    use jacquard::oauth::error::OAuthError;
    use jacquard::oauth::request::RequestError;
    use jacquard::oauth::session::Error as OAuthSessionError;

    #[test]
    fn transient_session_errors_fall_back_to_persisted_data() {
        let error = OAuthError::Session(OAuthSessionError::ServerAgent(RequestError::http_status(
            reqwest::StatusCode::BAD_GATEWAY,
        )));
        assert!(should_fallback_to_persisted_session(&error));
        assert!(!oauth_error_requires_reauth(&error));
    }

    #[test]
    fn permanent_session_errors_require_reauth() {
        let not_found = OAuthError::Session(OAuthSessionError::SessionNotFound);
        let refresh_failed = OAuthError::Session(OAuthSessionError::RefreshFailed(RequestError::no_refresh_token()));

        assert!(!should_fallback_to_persisted_session(&not_found));
        assert!(oauth_error_requires_reauth(&not_found));

        assert!(!should_fallback_to_persisted_session(&refresh_failed));
        assert!(oauth_error_requires_reauth(&refresh_failed));
    }
}

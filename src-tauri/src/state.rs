use super::auth::{
    account_summaries, active_session_from_accounts, build_oauth_client, emit_account_switch, fetch_account_summary,
    remove_cached_session, restore_session_from_data,
};
use super::auth::{login_with_loopback, LazuriteOAuthClient, LazuriteOAuthSession};
use super::auth::{PersistentAuthStore, StoredAccount};
use super::db::DbPool;
use super::error::AppError;
use jacquard::oauth::authstore::ClientAuthStore;
use jacquard::types::did::Did;
use jacquard::IntoStatic;
use serde::Serialize;
use std::collections::HashMap;
use std::sync::{Arc, RwLock};
use tauri::AppHandle;

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
        let auth_store = PersistentAuthStore::new(db_pool.clone());
        auth_store.prune_orphaned_sessions()?;
        let oauth_client = build_oauth_client(auth_store.clone());
        let accounts = auth_store.load_accounts()?;
        let app_state = Self {
            auth_store,
            oauth_client,
            active_session: RwLock::new(active_session_from_accounts(&accounts)),
            account_list: RwLock::new(account_summaries(&accounts)),
            sessions: RwLock::new(HashMap::new()),
        };

        app_state.restore_sessions().await?;
        app_state.refresh_account_cache()?;

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

        Ok(account_summary)
    }

    pub async fn logout(&self, app: &AppHandle, did: &str) -> Result<(), AppError> {
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
            return Ok(existing);
        }

        let session_id = account.session_id.as_deref().ok_or_else(|| {
            AppError::Validation(format!("account {} does not have a stored oauth session", account.did))
        })?;

        let did = Did::new(&account.did)?;
        let session = if refresh {
            Arc::new(self.oauth_client.restore(&did, session_id).await?)
        } else {
            let session_data = self.auth_store.get_session(&did, session_id).await?.ok_or_else(|| {
                AppError::Validation(format!("missing persisted oauth session for account {}", account.did))
            })?;
            Arc::new(restore_session_from_data(
                &self.oauth_client,
                session_data.into_static(),
            ))
        };

        self.sessions
            .write()
            .map_err(|_| AppError::StatePoisoned("sessions"))?
            .insert(account.did.clone(), session.clone());

        Ok(session)
    }

    async fn restore_sessions(&self) -> Result<(), AppError> {
        let accounts = self.auth_store.load_accounts()?;

        for account in accounts {
            if account.session_id.is_none() {
                continue;
            }

            let restored = self.ensure_session(&account, account.active).await;
            if restored.is_ok() {
                continue;
            }

            remove_cached_session(&self.sessions, &account.did)?;
            if account.active {
                self.auth_store.clear_active_account()?;
            }
        }

        Ok(())
    }
}

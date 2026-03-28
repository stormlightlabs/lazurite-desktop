use std::sync::RwLock;

use rusqlite::params;
use serde::Serialize;

use crate::db::DbPool;
use crate::error::AppError;

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AccountSummary {
    pub did: String,
    pub handle: String,
    pub pds_url: String,
    pub active: bool,
}

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

pub struct AppState {
    pub db_pool: DbPool,
    pub active_session: RwLock<Option<ActiveSession>>,
    pub account_list: RwLock<Vec<AccountSummary>>,
}

impl AppState {
    pub fn bootstrap(db_pool: DbPool) -> Result<Self, AppError> {
        let account_list = load_accounts(&db_pool)?;
        let active_session = account_list
            .iter()
            .find(|account| account.active)
            .map(|account| ActiveSession { did: account.did.clone(), handle: account.handle.clone() });

        Ok(Self { db_pool, active_session: RwLock::new(active_session), account_list: RwLock::new(account_list) })
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

    pub fn set_active_account(&self, did: &str) -> Result<(), AppError> {
        {
            let mut connection = self.db_pool.lock().map_err(|_| AppError::StatePoisoned("db_pool"))?;

            let transaction = connection.transaction()?;
            transaction.execute("UPDATE accounts SET active = 0 WHERE active = 1", [])?;
            let rows_updated = transaction.execute("UPDATE accounts SET active = 1 WHERE did = ?1", params![did])?;

            if rows_updated == 0 {
                return Err(AppError::Validation(format!(
                    "cannot activate unknown account did: {did}"
                )));
            }

            transaction.commit()?;
        }

        let refreshed_accounts = load_accounts(&self.db_pool)?;
        let refreshed_session = refreshed_accounts
            .iter()
            .find(|account| account.active)
            .map(|account| ActiveSession { did: account.did.clone(), handle: account.handle.clone() });

        *self
            .account_list
            .write()
            .map_err(|_| AppError::StatePoisoned("account_list"))? = refreshed_accounts;
        *self
            .active_session
            .write()
            .map_err(|_| AppError::StatePoisoned("active_session"))? = refreshed_session;

        Ok(())
    }
}

fn load_accounts(db_pool: &DbPool) -> Result<Vec<AccountSummary>, AppError> {
    let connection = db_pool.lock().map_err(|_| AppError::StatePoisoned("db_pool"))?;

    let mut statement = connection.prepare(
        "
        SELECT
            did,
            COALESCE(handle, ''),
            COALESCE(pds_url, ''),
            active
        FROM accounts
        ORDER BY active DESC, handle COLLATE NOCASE ASC
    ",
    )?;

    let rows = statement.query_map([], |row| {
        Ok(AccountSummary {
            did: row.get(0)?,
            handle: row.get(1)?,
            pds_url: row.get(2)?,
            active: row.get::<_, i64>(3)? == 1,
        })
    })?;

    let mut accounts = Vec::new();
    for row in rows {
        accounts.push(row?);
    }

    Ok(accounts)
}

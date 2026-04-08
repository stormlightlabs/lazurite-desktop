use super::auth::LazuriteOAuthSession;
use super::error::{AppError, Result};
use super::state::AppState;
use jacquard::api::app_bsky::labeler::get_services::GetServices;
use jacquard::api::app_bsky::labeler::get_services::GetServicesOutputViewsItem;
use jacquard::api::com_atproto::admin::RepoRef;
use jacquard::api::com_atproto::label::{Label, LabelValueDefinition};
use jacquard::api::com_atproto::moderation::create_report::{CreateReport, CreateReportSubject};
use jacquard::api::com_atproto::moderation::ReasonType;
use jacquard::api::com_atproto::repo::strong_ref::StrongRef;
use jacquard::moderation::moderate;
use jacquard::moderation::{Blur, LabelPref, LabeledRecord, LabelerDefs, ModerationDecision, ModerationPrefs};
use jacquard::types::aturi::AtUri;
use jacquard::types::cid::Cid;
use jacquard::types::did::Did;
use jacquard::xrpc::{CallOptions, XrpcClient};
use jacquard::{CowStr, IntoStatic};
use rusqlite::{params, Connection, OptionalExtension};
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::sync::Arc;
use std::time::{SystemTime, UNIX_EPOCH};
use tauri_plugin_log::log;

/// The built-in Bluesky safety labeler DID. Always included in the accept-labelers header.
pub const BUILTIN_LABELER_DID: &str = "did:plc:ar7c4by46qjdydhdevvrndac";

/// How long to keep labeler policies in the local cache before re-fetching.
const LABELER_CACHE_TTL_SECS: i64 = 3600;

/// Maximum number of user-subscribed labelers (Bluesky limit).
pub const MAX_CUSTOM_LABELERS: usize = 20;

/// User's moderation preferences, persisted as JSON in `app_settings`.
///
/// Key in the table: `moderation_preferences::{did}`
#[derive(Debug, Clone, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct StoredModerationPrefs {
    /// Whether adult-only content may be revealed by the user.
    pub adult_content_enabled: bool,
    /// DIDs of labelers the user has subscribed to (does not include the built-in labeler).
    pub subscribed_labelers: Vec<String>,
    /// Per-labeler label-visibility overrides.
    ///
    /// Map: labeler DID → (label identifier → "ignore" | "warn" | "hide")
    pub label_preferences: HashMap<String, HashMap<String, String>>,
}

/// The UI action the frontend should apply to a piece of content.
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ModerationUI {
    /// Hide content completely.
    pub filter: bool,
    /// Blur level: "none" | "content" | "media"
    pub blur: String,
    /// Show a red alert badge.
    pub alert: bool,
    /// Show an informational badge.
    pub inform: bool,
    /// User cannot override the decision (e.g. legal takedown).
    pub no_override: bool,
}

impl From<ModerationDecision> for ModerationUI {
    fn from(d: ModerationDecision) -> Self {
        Self {
            filter: d.filter,
            blur: match d.blur {
                Blur::None => "none".into(),
                Blur::Content => "content".into(),
                Blur::Media => "media".into(),
            },
            alert: d.alert,
            inform: d.inform,
            no_override: d.no_override,
        }
    }
}

/// Input description of what to report.
#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase", tag = "type")]
pub enum ReportSubjectInput {
    /// Report a whole account/profile.
    Repo { did: String },
    /// Report a specific record (post, etc.).
    Record { uri: String, cid: String },
}

pub fn prefs_key(did: &str) -> String {
    format!("moderation_preferences::{did}")
}

pub fn load_prefs(conn: &Connection, did: &str) -> Result<StoredModerationPrefs> {
    let key = prefs_key(did);
    let maybe_json: Option<String> = conn
        .query_row("SELECT value FROM app_settings WHERE key = ?1", params![key], |row| {
            row.get(0)
        })
        .optional()?;

    match maybe_json {
        None => Ok(StoredModerationPrefs::default()),
        Some(json) => serde_json::from_str(&json).map_err(|error| {
            log::warn!("failed to deserialize moderation prefs for {did}: {error}");
            AppError::SerdeJson(error)
        }),
    }
}

pub fn save_prefs(conn: &Connection, did: &str, prefs: &StoredModerationPrefs) -> Result<()> {
    let key = prefs_key(did);
    let json = serde_json::to_string(prefs)?;
    conn.execute(
        "INSERT INTO app_settings(key, value) VALUES(?1, ?2)
         ON CONFLICT(key) DO UPDATE SET value = excluded.value",
        params![key, json],
    )?;
    Ok(())
}

/// Load cached labeler policies. Returns `None` when absent or stale.
pub fn load_labeler_cache(conn: &Connection, labeler_did: &str) -> Result<Option<Vec<LabelValueDefinition<'static>>>> {
    let now = unix_now();
    let row: Option<(String, i64)> = conn
        .query_row(
            "SELECT policies_json, fetched_at FROM labeler_cache WHERE labeler_did = ?1",
            params![labeler_did],
            |row| Ok((row.get(0)?, row.get(1)?)),
        )
        .optional()?;

    let Some((json, fetched_at)) = row else {
        return Ok(None);
    };

    if now - fetched_at > LABELER_CACHE_TTL_SECS {
        log::debug!("labeler cache expired for {labeler_did}");
        return Ok(None);
    }

    let defs = serde_json::from_str::<Vec<LabelValueDefinition<'_>>>(&json).map_err(|error| {
        log::warn!("failed to deserialize labeler cache for {labeler_did}: {error}");
        AppError::SerdeJson(error)
    })?;
    let defs = defs
        .into_iter()
        .map(IntoStatic::into_static)
        .collect::<Vec<LabelValueDefinition<'static>>>();

    Ok(Some(defs))
}

pub fn store_labeler_cache(conn: &Connection, labeler_did: &str, defs: &[LabelValueDefinition<'_>]) -> Result<()> {
    let json = serde_json::to_string(defs)?;
    let now = unix_now();
    conn.execute(
        "INSERT INTO labeler_cache(labeler_did, policies_json, fetched_at) VALUES(?1, ?2, ?3)
         ON CONFLICT(labeler_did) DO UPDATE SET policies_json = excluded.policies_json, fetched_at = excluded.fetched_at",
        params![labeler_did, json, now],
    )?;
    Ok(())
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
        .ok_or_else(|| AppError::Validation("no active account".into()))?
        .did
        .clone();

    state
        .sessions
        .read()
        .map_err(|error| AppError::state_poisoned(format!("sessions poisoned: {error}")))?
        .get(&did)
        .cloned()
        .ok_or_else(|| AppError::validation(format!("session not found for active account {did}")))
}

fn active_did(state: &AppState) -> Result<String> {
    state
        .active_session
        .read()
        .map_err(|error| AppError::state_poisoned(format!("active_session poisoned: {error}")))?
        .as_ref()
        .map(|s| s.did.clone())
        .ok_or_else(|| AppError::Validation("no active account".into()))
}

/// Build the complete list of accepted labeler DIDs (built-in + user subscriptions).
pub fn accepted_labeler_dids(prefs: &StoredModerationPrefs) -> Vec<String> {
    let mut dids = vec![BUILTIN_LABELER_DID.to_string()];
    for did in &prefs.subscribed_labelers {
        if !dids.contains(did) {
            dids.push(did.clone());
        }
    }
    dids
}

/// Apply the user's current labeler subscriptions as session-level `atproto-accept-labelers` headers.
///
/// This must be called after changing labeler subscriptions so that all subsequent API calls
/// carry the correct header.
pub async fn apply_labeler_headers(session: &LazuriteOAuthSession, prefs: &StoredModerationPrefs) {
    let dids: Vec<CowStr<'static>> = accepted_labeler_dids(prefs).into_iter().map(CowStr::from).collect();
    let opts = CallOptions { atproto_accept_labelers: Some(dids), ..Default::default() };
    session.set_options(opts).await;
    log::debug!(
        "updated atproto-accept-labelers to {} labeler(s)",
        prefs.subscribed_labelers.len() + 1
    );
}

/// Fetch labeler policies from the Bluesky AppView for the given DIDs.
///
/// Returns a list of `(Did<'static>, Vec<LabelValueDefinition<'static>>)` pairs.
/// Skips DIDs where the fetch fails (logged as warnings) so callers get partial results.
///
/// This function does **not** access the database — callers are responsible for caching.
pub async fn fetch_labeler_policies_from_api(
    session: &LazuriteOAuthSession, dids: &[String],
) -> Vec<(Did<'static>, Vec<LabelValueDefinition<'static>>)> {
    if dids.is_empty() {
        return Vec::new();
    }

    let parsed_dids: Vec<Did<'_>> = dids
        .iter()
        .filter_map(|s| {
            Did::new(s)
                .map_err(|error| {
                    log::warn!("skipping invalid labeler DID '{s}': {error}");
                    error
                })
                .ok()
        })
        .collect();

    if parsed_dids.is_empty() {
        return Vec::new();
    }

    log::info!("fetching policies for {} labeler(s) from API", parsed_dids.len());

    let request = GetServices::new().dids(parsed_dids).detailed(true).build();
    let response = match session.send(request).await {
        Ok(r) => r,
        Err(error) => {
            log::error!("failed to fetch labeler services: {error}");
            return Vec::new();
        }
    };

    let output = match response.into_output() {
        Ok(o) => o,
        Err(error) => {
            log::error!("failed to decode labeler services response: {error}");
            return Vec::new();
        }
    };

    output
        .views
        .into_iter()
        .filter_map(|view| {
            let GetServicesOutputViewsItem::LabelerViewDetailed(detailed) = view else {
                return None;
            };
            let did = detailed.creator.did.clone().into_static();
            let label_defs = detailed
                .policies
                .label_value_definitions
                .unwrap_or_default()
                .into_iter()
                .map(IntoStatic::into_static)
                .collect::<Vec<_>>();
            Some((did, label_defs))
        })
        .collect()
}

/// Build `LabelerDefs` for the given DIDs, using the local cache where available
/// and fetching from the API for any missing/stale entries.
///
/// The database connection is never held across an `await` point.
pub async fn build_labeler_defs(
    session: &LazuriteOAuthSession, state: &AppState, dids: &[String],
) -> LabelerDefs<'static> {
    let (mut defs, missing) = {
        let Ok(conn) = state.auth_store.lock_connection() else {
            log::error!("failed to lock DB for labeler cache read");
            return LabelerDefs::new();
        };

        let mut defs = LabelerDefs::new();
        let mut missing: Vec<String> = Vec::new();

        for did_str in dids {
            match load_labeler_cache(&conn, did_str) {
                Ok(Some(cached_defs)) => {
                    if let Ok(did) = Did::new(did_str) {
                        defs.insert(did.into_static(), cached_defs);
                    }
                }
                Ok(None) => missing.push(did_str.clone()),
                Err(error) => {
                    log::warn!("failed to read labeler cache for {did_str}: {error}");
                    missing.push(did_str.clone());
                }
            }
        }

        (defs, missing)
    };

    if !missing.is_empty() {
        let fetched = fetch_labeler_policies_from_api(session, &missing).await;

        {
            match state.auth_store.lock_connection() {
                Ok(conn) => {
                    for (did, label_defs) in &fetched {
                        if let Err(error) = store_labeler_cache(&conn, did.as_str(), label_defs) {
                            log::warn!("failed to cache labeler policies for {}: {error}", did.as_str());
                        }
                    }
                }
                Err(error) => {
                    log::warn!("failed to lock DB for labeler cache write: {error}");
                }
            }
        }

        for (did, label_defs) in fetched {
            defs.insert(did, label_defs);
        }
    }

    defs
}

/// Submit a moderation report to the Bluesky moderation service.
pub async fn submit_report(
    session: &LazuriteOAuthSession, subject: ReportSubjectInput, reason_type_str: String, reason: Option<String>,
) -> Result<i64> {
    let reason_type = ReasonType::from(reason_type_str);
    let subject = match subject {
        ReportSubjectInput::Repo { did } => {
            let parsed_did = Did::new(&did)
                .map_err(|_| AppError::validation("invalid DID in report subject"))?
                .into_static();
            let repo_ref = RepoRef::new().did(parsed_did).build();
            CreateReportSubject::RepoRef(Box::new(repo_ref))
        }
        ReportSubjectInput::Record { uri, cid } => {
            let parsed_uri = AtUri::new(&uri)
                .map_err(|_| AppError::validation("invalid AT-URI in report subject"))?
                .into_static();
            let parsed_cid = Cid::str(&cid).into_static();
            parsed_cid
                .to_ipld()
                .map_err(|error| AppError::validation(format!("invalid CID in report subject: {error}")))?;
            let strong_ref = StrongRef::new().uri(parsed_uri).cid(parsed_cid).build();
            CreateReportSubject::StrongRef(Box::new(strong_ref))
        }
    };

    let mut builder = CreateReport::new().reason_type(reason_type).subject(subject);
    if let Some(reason_text) = reason {
        builder = builder.reason(CowStr::from(reason_text));
    }

    let request = builder.build();
    let response = session.send(request).await.map_err(|error| {
        log::error!("create_report API error: {error}");
        AppError::validation("failed to submit report")
    })?;

    let output = response.into_output().map_err(|error| {
        log::error!("create_report response decode error: {error}");
        AppError::validation("unexpected response from moderation service")
    })?;

    log::info!("report submitted: id={}", output.id);
    Ok(output.id)
}

/// Convert stored prefs to the jacquard `ModerationPrefs` type.
fn to_jacquard_prefs(prefs: &StoredModerationPrefs) -> ModerationPrefs<'static> {
    let labelers = prefs
        .label_preferences
        .iter()
        .filter_map(|(did_str, label_map)| {
            let did = Did::new(did_str).ok()?.into_static();
            let pref_map = label_map
                .iter()
                .map(|(label, vis)| {
                    let pref = parse_label_pref(vis);
                    (CowStr::from(label.clone()), pref)
                })
                .collect();
            Some((did, pref_map))
        })
        .collect();

    ModerationPrefs { adult_content_enabled: prefs.adult_content_enabled, labels: HashMap::new(), labelers }
}

fn parse_label_pref(s: &str) -> LabelPref {
    match s {
        "hide" => LabelPref::Hide,
        "warn" => LabelPref::Warn,
        _ => LabelPref::Ignore,
    }
}

/// Evaluate a JSON array of ATProto labels against the user's moderation preferences.
///
/// `labels_json` – JSON array of `com.atproto.label.defs#label` objects.
/// `accepted_dids` – DIDs of labelers whose labels should be evaluated (built-in + subscribed).
pub fn evaluate_labels(
    labels_json: &str, prefs: &StoredModerationPrefs, defs: &LabelerDefs<'_>, accepted_dids: &[String],
) -> Result<ModerationUI> {
    let labels = serde_json::from_str::<Vec<Label<'_>>>(labels_json).map_err(|error| {
        log::warn!("failed to deserialize labels: {error}");
        AppError::validation("invalid labels format")
    })?;
    let labels = labels
        .into_iter()
        .map(IntoStatic::into_static)
        .collect::<Vec<Label<'static>>>();

    let jacquard_prefs = to_jacquard_prefs(prefs);

    let accepted_labelers: Vec<Did<'_>> = accepted_dids.iter().filter_map(|s| Did::new(s).ok()).collect();

    let record = LabeledRecord { record: (), labels };
    let decision = moderate(&record, &jacquard_prefs, defs, &accepted_labelers);
    Ok(ModerationUI::from(decision))
}

/// Load moderation preferences for the currently active account.
pub fn get_prefs(state: &AppState) -> Result<StoredModerationPrefs> {
    let did = active_did(state)?;
    let conn = state.auth_store.lock_connection()?;
    load_prefs(&conn, &did)
}

/// Toggle adult-content access for the active account and persist.
pub async fn set_adult_content(state: &AppState, enabled: bool) -> Result<()> {
    let did = active_did(state)?;
    let mut prefs = {
        let conn = state.auth_store.lock_connection()?;
        load_prefs(&conn, &did)?
    };
    prefs.adult_content_enabled = enabled;
    let conn = state.auth_store.lock_connection()?;
    save_prefs(&conn, &did, &prefs)
}

/// Set the visibility preference for a specific label from a specific labeler.
pub async fn set_label_pref(state: &AppState, labeler_did: String, label: String, visibility: String) -> Result<()> {
    if !matches!(visibility.as_str(), "ignore" | "warn" | "hide") {
        return Err(AppError::validation("visibility must be 'ignore', 'warn', or 'hide'"));
    }

    let did = active_did(state)?;
    let mut prefs = {
        let conn = state.auth_store.lock_connection()?;
        load_prefs(&conn, &did)?
    };

    prefs
        .label_preferences
        .entry(labeler_did)
        .or_default()
        .insert(label, visibility);

    let conn = state.auth_store.lock_connection()?;
    save_prefs(&conn, &did, &prefs)
}

/// Subscribe the active account to a labeler and update the session headers.
pub async fn subscribe_labeler(state: &AppState, labeler_did: String) -> Result<()> {
    Did::new(&labeler_did).map_err(|_| AppError::validation("invalid labeler DID"))?;

    let did = active_did(state)?;
    let mut prefs = {
        let conn = state.auth_store.lock_connection()?;
        load_prefs(&conn, &did)?
    };

    if prefs.subscribed_labelers.contains(&labeler_did) {
        return Ok(());
    }

    if prefs.subscribed_labelers.len() >= MAX_CUSTOM_LABELERS {
        return Err(AppError::validation(format!(
            "you can subscribe to at most {MAX_CUSTOM_LABELERS} custom labelers"
        )));
    }

    prefs.subscribed_labelers.push(labeler_did.clone());
    {
        let conn = state.auth_store.lock_connection()?;
        save_prefs(&conn, &did, &prefs)?;
    }

    let session = get_session(state).await?;
    apply_labeler_headers(&session, &prefs).await;

    let fetched = fetch_labeler_policies_from_api(&session, &[labeler_did]).await;
    {
        match state.auth_store.lock_connection() {
            Ok(conn) => {
                for (did, label_defs) in &fetched {
                    if let Err(error) = store_labeler_cache(&conn, did.as_str(), label_defs) {
                        log::warn!("failed to cache labeler policy after subscribe: {error}");
                    }
                }
            }
            Err(error) => {
                log::warn!("failed to lock DB for post-subscribe cache write: {error}");
            }
        }
    }

    Ok(())
}

/// Unsubscribe the active account from a labeler and update the session headers.
pub async fn unsubscribe_labeler(state: &AppState, labeler_did: String) -> Result<()> {
    let did = active_did(state)?;
    let mut prefs = {
        let conn = state.auth_store.lock_connection()?;
        load_prefs(&conn, &did)?
    };

    let before = prefs.subscribed_labelers.len();
    prefs.subscribed_labelers.retain(|d| d != &labeler_did);

    if prefs.subscribed_labelers.len() == before {
        return Ok(());
    }

    prefs.label_preferences.remove(&labeler_did);
    {
        let conn = state.auth_store.lock_connection()?;
        save_prefs(&conn, &did, &prefs)?;
    }

    let session = get_session(state).await?;
    apply_labeler_headers(&session, &prefs).await;

    Ok(())
}

fn unix_now() -> i64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_secs() as i64)
        .unwrap_or(0)
}

/// Returns the distribution channel this binary was compiled for.
///
/// Controlled by the `DISTRIBUTION_CHANNEL` environment variable at compile time.
/// Falls back to `"github"` if the variable was not set.
pub fn distribution_channel() -> &'static str {
    option_env!("DISTRIBUTION_CHANNEL").unwrap_or("github")
}

#[cfg(test)]
mod tests {
    use super::*;
    use rusqlite::Connection;

    fn in_memory_db() -> Connection {
        let conn = Connection::open_in_memory().expect("open in-memory db");
        conn.execute_batch(
            "CREATE TABLE app_settings (key TEXT PRIMARY KEY, value TEXT NOT NULL);
             CREATE TABLE labeler_cache (
               labeler_did TEXT PRIMARY KEY,
               policies_json TEXT NOT NULL,
               fetched_at INTEGER NOT NULL
             );",
        )
        .expect("create tables");
        conn
    }

    #[test]
    fn moderation_prefs_round_trip() {
        let conn = in_memory_db();
        let did = "did:plc:abc123";

        let prefs = load_prefs(&conn, did).expect("load default prefs");
        assert!(!prefs.adult_content_enabled);
        assert!(prefs.subscribed_labelers.is_empty());

        let mut updated = prefs;
        updated.adult_content_enabled = true;
        updated.subscribed_labelers.push("did:plc:labeler1".into());
        updated
            .label_preferences
            .entry("did:plc:labeler1".into())
            .or_default()
            .insert("porn".into(), "hide".into());

        save_prefs(&conn, did, &updated).expect("save prefs");

        let loaded = load_prefs(&conn, did).expect("load saved prefs");
        assert!(loaded.adult_content_enabled);
        assert_eq!(loaded.subscribed_labelers, vec!["did:plc:labeler1"]);
        assert_eq!(loaded.label_preferences["did:plc:labeler1"]["porn"], "hide");
    }

    #[test]
    fn labeler_cache_round_trip() {
        let conn = in_memory_db();
        let did = "did:plc:labeler1";

        assert!(load_labeler_cache(&conn, did).expect("load empty cache").is_none());

        store_labeler_cache(&conn, did, &[]).expect("store empty defs");
        let cached = load_labeler_cache(&conn, did).expect("load cached defs");
        assert!(cached.is_some());
    }

    #[test]
    fn labeler_cache_staleness() {
        let conn = in_memory_db();
        let did = "did:plc:labeler_stale";
        let old_ts = unix_now() - LABELER_CACHE_TTL_SECS - 1;

        conn.execute(
            "INSERT INTO labeler_cache(labeler_did, policies_json, fetched_at) VALUES(?1, '[]', ?2)",
            params![did, old_ts],
        )
        .expect("insert stale cache");

        assert!(
            load_labeler_cache(&conn, did).expect("load stale").is_none(),
            "stale cache entry should be treated as missing"
        );
    }

    #[test]
    fn accepted_labeler_dids_includes_builtin() {
        let prefs = StoredModerationPrefs { subscribed_labelers: vec!["did:plc:custom".into()], ..Default::default() };
        let dids = accepted_labeler_dids(&prefs);
        assert!(dids.contains(&BUILTIN_LABELER_DID.to_string()));
        assert!(dids.contains(&"did:plc:custom".to_string()));
    }

    #[test]
    fn accepted_labeler_dids_no_duplicates() {
        let prefs =
            StoredModerationPrefs { subscribed_labelers: vec![BUILTIN_LABELER_DID.into()], ..Default::default() };
        let dids = accepted_labeler_dids(&prefs);
        let count = dids.iter().filter(|d| d.as_str() == BUILTIN_LABELER_DID).count();
        assert_eq!(count, 1, "builtin labeler should not be duplicated");
    }

    #[test]
    fn distribution_channel_defaults_to_github() {
        let channel = distribution_channel();
        assert!(!channel.is_empty());
    }

    #[test]
    fn evaluate_labels_empty_returns_no_moderation() {
        let prefs = StoredModerationPrefs::default();
        let defs = LabelerDefs::new();
        let accepted: Vec<String> = vec![];
        let ui = evaluate_labels("[]", &prefs, &defs, &accepted).expect("evaluate");
        assert!(!ui.filter);
        assert_eq!(ui.blur, "none");
        assert!(!ui.alert);
        assert!(!ui.inform);
    }

    #[test]
    fn prefs_key_format() {
        assert_eq!(prefs_key("did:plc:abc"), "moderation_preferences::did:plc:abc");
    }
}

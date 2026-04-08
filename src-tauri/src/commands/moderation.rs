use super::super::error::Result;
use super::super::moderation::{
    self,
    ModerationLabelerPolicyDefinition,
    ModerationUI,
    ReportSubjectInput,
    StoredModerationPrefs,
};
use super::super::state::AppState;
use tauri_plugin_log::log;

type State<'a> = tauri::State<'a, AppState>;

/// Return the moderation preferences for the currently active account.
#[tauri::command]
pub fn get_moderation_prefs(state: State<'_>) -> Result<StoredModerationPrefs> {
    moderation::get_prefs(&state)
}

/// Enable or disable adult content for the currently active account.
#[tauri::command]
pub async fn set_adult_content_enabled(enabled: bool, state: State<'_>) -> Result<()> {
    moderation::set_adult_content(&state, enabled).await
}

/// Set the visibility preference for a specific label value from a specific labeler.
///
/// `visibility` must be one of `"ignore"`, `"warn"`, or `"hide"`.
#[tauri::command]
pub async fn set_label_preference(
    labeler_did: String, label: String, visibility: String, state: State<'_>,
) -> Result<()> {
    moderation::set_label_pref(&state, labeler_did, label, visibility).await
}

/// Subscribe the active account to a labeler, fetch its policies, and update
/// the `atproto-accept-labelers` header on the current session.
#[tauri::command]
pub async fn subscribe_labeler(did: String, state: State<'_>) -> Result<()> {
    moderation::subscribe_labeler(&state, did).await
}

/// Remove a labeler subscription and update the session headers.
#[tauri::command]
pub async fn unsubscribe_labeler(did: String, state: State<'_>) -> Result<()> {
    moderation::unsubscribe_labeler(&state, did).await
}

/// Evaluate a set of labels against the user's moderation preferences.
///
/// `labels_json` – JSON array of `com.atproto.label.defs#label` objects.
///
/// Returns a `ModerationUI` describing what the frontend should do with the content.
#[tauri::command]
pub async fn moderate_content(labels_json: String, context: String, state: State<'_>) -> Result<ModerationUI> {
    let parsed_context = moderation::parse_moderation_context(&context)?;
    log::debug!("moderate_content requested for context={}", parsed_context.as_str());

    let prefs = moderation::get_prefs(&state)?;
    let accepted_dids = moderation::accepted_labeler_dids(&prefs);

    let session = {
        let did = state
            .active_session
            .read()
            .map_err(|_| super::super::error::AppError::StatePoisoned("active_session"))?
            .as_ref()
            .ok_or_else(|| super::super::error::AppError::Validation("no active account".into()))?
            .did
            .clone();
        state
            .sessions
            .read()
            .map_err(|_| super::super::error::AppError::StatePoisoned("sessions"))?
            .get(&did)
            .cloned()
            .ok_or_else(|| super::super::error::AppError::validation(format!("session not found for {did}")))?
    };

    let defs = moderation::build_labeler_defs(&session, state.inner(), &accepted_dids).await;

    moderation::evaluate_labels(&labels_json, &prefs, &defs, &accepted_dids)
}

/// Return structured policy definitions for all accepted labelers.
#[tauri::command]
pub async fn get_labeler_policy_definitions(state: State<'_>) -> Result<Vec<ModerationLabelerPolicyDefinition>> {
    moderation::get_labeler_policy_definitions(&state).await
}

/// Submit a content or account report to the Bluesky moderation service.
///
/// `subject` must be `{"type":"repo","did":"..."}` or `{"type":"record","uri":"...","cid":"..."}`.
/// `reason_type` is a string like `"com.atproto.moderation.defs#reasonSpam"`.
#[tauri::command]
pub async fn create_report(
    subject: ReportSubjectInput, reason_type: String, reason: Option<String>, state: State<'_>,
) -> Result<i64> {
    let session = {
        let did = state
            .active_session
            .read()
            .map_err(|_| super::super::error::AppError::StatePoisoned("active_session"))?
            .as_ref()
            .ok_or_else(|| super::super::error::AppError::Validation("no active account".into()))?
            .did
            .clone();
        state
            .sessions
            .read()
            .map_err(|_| super::super::error::AppError::StatePoisoned("sessions"))?
            .get(&did)
            .cloned()
            .ok_or_else(|| super::super::error::AppError::validation(format!("session not found for {did}")))?
    };

    log::info!("submitting report (reason_type={reason_type})");
    moderation::submit_report(&session, subject, reason_type, reason).await
}

/// Return the distribution channel this binary was compiled for.
///
/// Returns `"github"` (default), `"mac_app_store"`, or `"microsoft_store"`.
/// Set the `DISTRIBUTION_CHANNEL` environment variable at compile time to override.
#[tauri::command]
pub fn get_distribution_channel() -> &'static str {
    moderation::distribution_channel()
}

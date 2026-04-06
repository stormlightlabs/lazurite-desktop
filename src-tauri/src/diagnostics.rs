use crate::actors::{
    actor_unavailable_message, classify_actor_unavailability, ActorAvailability, ActorAvailabilityReason,
};
use crate::constellation::{BacklinksResponse, ConstellationClient, ConstellationLinkRecord};
use crate::error::{AppError, Result};
use crate::explorer;
use crate::settings;
use crate::state::AppState;
use jacquard::api::app_bsky::actor::get_profile::GetProfile;
use jacquard::api::app_bsky::actor::get_profiles::GetProfiles;
use jacquard::api::app_bsky::graph::get_list::GetList;
use jacquard::api::app_bsky::graph::get_relationships::{GetRelationships, GetRelationshipsOutputRelationshipsItem};
use jacquard::api::app_bsky::graph::get_starter_packs::GetStarterPacks;
use jacquard::api::com_atproto::label::query_labels::QueryLabels;
use jacquard::client::{Agent, UnauthenticatedSession};
use jacquard::identity::JacquardResolver;
use jacquard::types::aturi::AtUri;
use jacquard::types::did::Did;
use jacquard::types::ident::AtIdentifier;
use jacquard::xrpc::XrpcClient;
use jacquard::IntoStatic;
use serde::{Deserialize, Serialize};
use serde_json::Value;
use std::collections::{BTreeMap, BTreeSet, HashMap};
use tauri_plugin_log::log;

const LIST_MEMBERSHIP_SOURCE: &str = "app.bsky.graph.listitem:subject";
const LIST_MEMBERSHIP_PATH_TO_OTHER: &str = "list";
const BLOCK_SOURCE: &str = "app.bsky.graph.block:subject";
const STARTER_PACK_SOURCE: &str = "app.bsky.graph.starterpack:listItemsSample[].subject";
const BLOCK_COLLECTION: &str = "app.bsky.graph.block";
const LIKES_SOURCE: &str = "app.bsky.feed.like:subject.uri";
const REPOSTS_SOURCE: &str = "app.bsky.feed.repost:subject.uri";
const REPLIES_SOURCE: &str = "app.bsky.feed.post:reply.parent.uri";
const QUOTES_SOURCE: &str = "app.bsky.feed.post:embed.record.uri";
const PUBLIC_BATCH_LIMIT: usize = 25;
const ACCOUNT_LIST_PAGE_LIMIT: u32 = 100;
const ACCOUNT_LIST_MAX_ITEMS: usize = 200;
const STARTER_PACK_LIMIT: u32 = 100;
const STARTER_PACK_MAX_ITEMS: usize = 200;
const BACKLINK_PREVIEW_LIMIT: u32 = 25;
const BLOCK_PREVIEW_LIMIT: u32 = 50;
const LABEL_LIMIT: i64 = 100;

type PublicClient = Agent<UnauthenticatedSession<JacquardResolver>>;

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AccountListsResult {
    pub total: usize,
    pub lists: Vec<Value>,
    pub truncated: bool,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AccountLabelsResult {
    pub labels: Vec<Value>,
    pub source_profiles: BTreeMap<String, Value>,
    pub cursor: Option<String>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DidProfileItem {
    pub did: String,
    pub availability: ActorAvailability,
    pub profile: Option<Value>,
    pub unavailable_reason: Option<ActorAvailabilityReason>,
    pub unavailable_message: Option<String>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AccountBlockedByResult {
    pub total: u64,
    pub items: Vec<DidProfileItem>,
    pub cursor: Option<String>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AccountBlockingResult {
    pub items: Vec<AccountBlockingItem>,
    pub cursor: Option<String>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AccountBlockingItem {
    pub uri: String,
    pub cid: String,
    pub subject_did: String,
    pub created_at: Option<String>,
    pub availability: ActorAvailability,
    pub value: Value,
    pub profile: Option<Value>,
    pub unavailable_reason: Option<ActorAvailabilityReason>,
    pub unavailable_message: Option<String>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AccountStarterPacksResult {
    pub total: u64,
    pub starter_packs: Vec<Value>,
    pub truncated: bool,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct RecordBacklinksResult {
    pub likes: BacklinkGroup,
    pub reposts: BacklinkGroup,
    pub replies: BacklinkGroup,
    pub quotes: BacklinkGroup,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct BacklinkGroup {
    pub total: u64,
    pub records: Vec<BacklinkRecordItem>,
    pub cursor: Option<String>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct BacklinkRecordItem {
    pub uri: String,
    pub did: String,
    pub collection: String,
    pub rkey: String,
    pub profile: Option<Value>,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
struct RepoListRecordsOutput {
    cursor: Option<String>,
    #[serde(default)]
    records: Vec<RepoRecord>,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
struct RepoRecord {
    uri: String,
    cid: String,
    value: Value,
}

pub async fn get_account_lists(did: String, state: &AppState) -> Result<AccountListsResult> {
    let normalized_did = normalize_did(&did)?;
    let client = constellation_client(state)?;
    let counts = match client
        .get_many_to_many_counts(
            normalized_did.clone(),
            LIST_MEMBERSHIP_SOURCE.to_string(),
            LIST_MEMBERSHIP_PATH_TO_OTHER.to_string(),
        )
        .await
    {
        Ok(counts) => counts,
        Err(error) if should_skip_missing_resource(&error) => {
            log_missing_resource("account lists", &normalized_did, &error);
            return Ok(AccountListsResult { total: 0, lists: Vec::new(), truncated: false });
        }
        Err(error) => return Err(AppError::diagnostics("Couldn't load lists for this account.", error)),
    };

    let mut list_uris = Vec::new();
    let mut cursor = None;
    let mut truncated = false;

    while list_uris.len() < ACCOUNT_LIST_MAX_ITEMS {
        let response = match client
            .get_many_to_many(
                normalized_did.clone(),
                LIST_MEMBERSHIP_SOURCE.to_string(),
                LIST_MEMBERSHIP_PATH_TO_OTHER.to_string(),
                Some(ACCOUNT_LIST_PAGE_LIMIT),
                cursor.clone(),
            )
            .await
        {
            Ok(response) => response,
            Err(error) if should_skip_missing_resource(&error) => {
                log_missing_resource("account lists", &normalized_did, &error);
                break;
            }
            Err(error) => return Err(AppError::diagnostics("Couldn't load lists for this account.", error)),
        };

        if response.items.is_empty() {
            break;
        }

        for item in response.items {
            if list_uris.len() >= ACCOUNT_LIST_MAX_ITEMS {
                truncated = true;
                break;
            }
            list_uris.push(item.other_subject);
        }

        match response.cursor {
            Some(next_cursor) if list_uris.len() < ACCOUNT_LIST_MAX_ITEMS => cursor = Some(next_cursor),
            Some(_) => {
                truncated = true;
                break;
            }
            None => break,
        }
    }

    let unique_list_uris = dedupe_preserve_order(list_uris);
    let lists = fetch_lists(&unique_list_uris).await?;

    Ok(AccountListsResult { total: counts.counts_by_other_subject.len(), lists, truncated })
}

pub async fn get_account_labels(did: String) -> Result<AccountLabelsResult> {
    let normalized_did = normalize_did(&did)?;
    let client = public_client();
    let output = client
        .send(
            QueryLabels::new()
                .uri_patterns(vec![normalized_did.clone().into()])
                .limit(LABEL_LIMIT)
                .build(),
        )
        .await
        .map_err(|error| AppError::diagnostics("Couldn't load labels for this account.", error))?
        .into_output()
        .map_err(|error| AppError::diagnostics("Couldn't read labels for this account.", error))?
        .into_static();

    let labels = output
        .labels
        .iter()
        .map(serde_json::to_value)
        .collect::<std::result::Result<Vec<_>, _>>()?;

    let source_dids = output
        .labels
        .iter()
        .map(|label| label.src.to_string())
        .collect::<Vec<_>>();
    let source_profiles = fetch_profiles_map(&source_dids).await?;

    Ok(AccountLabelsResult { labels, source_profiles, cursor: output.cursor.map(|cursor| cursor.to_string()) })
}

pub async fn get_account_blocked_by(
    did: String, limit: Option<u32>, cursor: Option<String>, state: &AppState,
) -> Result<AccountBlockedByResult> {
    let normalized_did = normalize_did(&did)?;
    let client = constellation_client(state)?;
    let response = match client
        .get_backlinks(
            normalized_did.clone(),
            BLOCK_SOURCE.to_string(),
            limit.or(Some(BLOCK_PREVIEW_LIMIT)),
            cursor,
        )
        .await
    {
        Ok(response) => response,
        Err(error) if should_skip_missing_resource(&error) => {
            return Ok(AccountBlockedByResult { total: 0, items: Vec::new(), cursor: None });
        }
        Err(error) => {
            return Err(AppError::diagnostics(
                "Couldn't load the accounts blocking this profile.",
                error,
            ))
        }
    };

    let candidate_dids = extract_blocker_dids(&response.records);
    let confirmed_dids = confirm_blocked_by(&normalized_did, &candidate_dids).await?;
    let actor_states = fetch_actor_states(&confirmed_dids).await?;
    let items = confirmed_dids
        .into_iter()
        .map(|entry_did| build_did_profile_item(entry_did.clone(), actor_states.get(&entry_did)))
        .collect::<Vec<_>>();

    Ok(AccountBlockedByResult { total: response.total, items, cursor: response.cursor })
}

pub async fn get_account_blocking(did: String, cursor: Option<String>) -> Result<AccountBlockingResult> {
    let normalized_did = normalize_did(&did)?;
    let output = match explorer::list_records(normalized_did.clone(), BLOCK_COLLECTION.to_string(), cursor).await {
        Ok(output) => output,
        Err(error) if should_skip_missing_resource(&error) => {
            log_missing_resource("block records", &normalized_did, &error);
            return Ok(AccountBlockingResult { items: Vec::new(), cursor: None });
        }
        Err(error) => {
            return Err(AppError::diagnostics(
                "Couldn't load this account's block records.",
                error,
            ))
        }
    };
    let parsed: RepoListRecordsOutput = serde_json::from_value(output).map_err(|error| {
        log::error!("failed to decode block listRecords output: {error}");
        AppError::validation("Lazurite couldn't read this account's block records.")
    })?;

    let subject_dids = parsed
        .records
        .iter()
        .filter_map(|record| extract_subject_did(&record.value))
        .collect::<Vec<_>>();
    let actor_states = fetch_actor_states(&subject_dids).await?;

    let items = parsed
        .records
        .into_iter()
        .filter_map(|record| {
            let subject_did = extract_subject_did(&record.value)?;
            let actor_state = actor_states.get(&subject_did);
            Some(AccountBlockingItem {
                created_at: extract_created_at(&record.value),
                availability: actor_state
                    .map(|state| state.availability)
                    .unwrap_or(ActorAvailability::Unavailable),
                profile: actor_state.and_then(|state| state.profile.clone()),
                uri: record.uri,
                cid: record.cid,
                unavailable_reason: actor_state.and_then(|state| state.unavailable_reason),
                unavailable_message: actor_state.and_then(|state| state.unavailable_message.clone()),
                subject_did,
                value: record.value,
            })
        })
        .collect();

    Ok(AccountBlockingResult { items, cursor: parsed.cursor })
}

pub async fn get_account_starter_packs(did: String, state: &AppState) -> Result<AccountStarterPacksResult> {
    let normalized_did = normalize_did(&did)?;
    let client = constellation_client(state)?;
    let count = match client
        .get_backlinks_count(normalized_did.clone(), STARTER_PACK_SOURCE.to_string())
        .await
    {
        Ok(count) => count,
        Err(error) if should_skip_missing_resource(&error) => {
            log_missing_resource("starter packs", &normalized_did, &error);
            return Ok(AccountStarterPacksResult { total: 0, starter_packs: Vec::new(), truncated: false });
        }
        Err(error) => {
            return Err(AppError::diagnostics(
                "Couldn't load starter packs for this account.",
                error,
            ))
        }
    };

    let mut pack_uris = Vec::new();
    let mut cursor = None;
    let mut truncated = false;

    while pack_uris.len() < STARTER_PACK_MAX_ITEMS {
        let response = match client
            .get_backlinks(
                normalized_did.clone(),
                STARTER_PACK_SOURCE.to_string(),
                Some(STARTER_PACK_LIMIT),
                cursor.clone(),
            )
            .await
        {
            Ok(response) => response,
            Err(error) if should_skip_missing_resource(&error) => {
                log_missing_resource("starter packs", &normalized_did, &error);
                break;
            }
            Err(error) => {
                return Err(AppError::diagnostics(
                    "Couldn't load starter packs for this account.",
                    error,
                ))
            }
        };

        if response.records.is_empty() {
            break;
        }

        for record in response.records {
            if pack_uris.len() >= STARTER_PACK_MAX_ITEMS {
                truncated = true;
                break;
            }
            pack_uris.push(link_record_uri(&record));
        }

        match response.cursor {
            Some(next_cursor) if pack_uris.len() < STARTER_PACK_MAX_ITEMS => cursor = Some(next_cursor),
            Some(_) => {
                truncated = true;
                break;
            }
            None => break,
        }
    }

    let starter_packs = fetch_starter_packs(&dedupe_preserve_order(pack_uris)).await?;
    Ok(AccountStarterPacksResult { total: count.total, starter_packs, truncated })
}

pub async fn get_record_backlinks(uri: String, state: &AppState) -> Result<RecordBacklinksResult> {
    let normalized_uri = normalize_at_uri(&uri)?;
    let client = constellation_client(state)?;

    let likes = fetch_backlink_group(&client, &normalized_uri, LIKES_SOURCE).await?;
    let reposts = fetch_backlink_group(&client, &normalized_uri, REPOSTS_SOURCE).await?;
    let replies = fetch_backlink_group(&client, &normalized_uri, REPLIES_SOURCE).await?;
    let quotes = fetch_backlink_group(&client, &normalized_uri, QUOTES_SOURCE).await?;

    Ok(RecordBacklinksResult { likes, reposts, replies, quotes })
}

fn constellation_client(state: &AppState) -> Result<ConstellationClient> {
    ConstellationClient::new(&settings::get_constellation_url(state)?)
}

fn public_client() -> PublicClient {
    Agent::new(UnauthenticatedSession::new_public())
}

fn normalize_did(input: &str) -> Result<String> {
    let trimmed = input.trim();
    if trimmed.is_empty() {
        return Err(AppError::validation("A DID is required."));
    }

    Did::new(trimmed)
        .map(|did| did.to_string())
        .map_err(|_| AppError::validation("Enter a valid DID."))
}

fn normalize_at_uri(input: &str) -> Result<String> {
    let trimmed = input.trim();
    if trimmed.is_empty() {
        return Err(AppError::validation("A record URI is required."));
    }

    AtUri::new(trimmed)
        .map(|uri| uri.to_string())
        .map_err(|_| AppError::validation("Enter a valid AT-URI."))
}

fn log_missing_resource(kind: &str, identifier: &str, error: impl std::fmt::Display) {
    log::warn!("Skipping missing {kind} for {identifier}: {error}");
}

fn should_skip_missing_resource(error: &impl std::fmt::Display) -> bool {
    let message = error.to_string().to_ascii_lowercase();
    let mentions_missing = message.contains("not found") || message.contains("notfound");
    let mentions_resource = message.contains("list")
        || message.contains("record")
        || message.contains("repo")
        || message.contains("profile")
        || message.contains("starter pack")
        || message.contains("starterpack");

    mentions_missing && mentions_resource
}

fn link_record_uri(record: &ConstellationLinkRecord) -> String {
    format!("at://{}/{}/{}", record.did, record.collection, record.rkey)
}

fn dedupe_preserve_order(values: Vec<String>) -> Vec<String> {
    let mut seen = BTreeSet::new();
    let mut deduped = Vec::new();

    for value in values {
        if seen.insert(value.clone()) {
            deduped.push(value);
        }
    }

    deduped
}

fn did_identifier(did: &str) -> Result<AtIdentifier<'static>> {
    Ok(AtIdentifier::Did(Did::new(did)?.into_static()))
}

#[derive(Debug, Clone)]
struct ActorState {
    availability: ActorAvailability,
    profile: Option<Value>,
    unavailable_reason: Option<ActorAvailabilityReason>,
    unavailable_message: Option<String>,
}

async fn fetch_actor_states(dids: &[String]) -> Result<BTreeMap<String, ActorState>> {
    let unique_dids = dedupe_preserve_order(dids.to_vec());
    if unique_dids.is_empty() {
        return Ok(BTreeMap::new());
    }

    let profiles = fetch_profiles_map(&unique_dids).await?;
    let mut states = profiles
        .into_iter()
        .map(|(did, profile)| {
            (
                did,
                ActorState {
                    availability: ActorAvailability::Available,
                    profile: Some(profile),
                    unavailable_reason: None,
                    unavailable_message: None,
                },
            )
        })
        .collect::<BTreeMap<_, _>>();

    for did in unique_dids {
        if states.contains_key(&did) {
            continue;
        }

        states.insert(did.clone(), fetch_missing_actor_state(&did).await);
    }

    Ok(states)
}

async fn fetch_profiles_map(dids: &[String]) -> Result<BTreeMap<String, Value>> {
    let unique_dids = dedupe_preserve_order(dids.to_vec());
    if unique_dids.is_empty() {
        return Ok(BTreeMap::new());
    }

    let client = public_client();
    let mut profiles = BTreeMap::new();

    for chunk in unique_dids.chunks(PUBLIC_BATCH_LIMIT) {
        let actors = chunk
            .iter()
            .filter_map(|did| match did_identifier(did) {
                Ok(actor) => Some(actor),
                Err(error) => {
                    log_missing_resource("profile", did, error);
                    None
                }
            })
            .collect::<Vec<_>>();
        if actors.is_empty() {
            continue;
        }

        let output = match client.send(GetProfiles::new().actors(actors).build()).await {
            Ok(output) => output,
            Err(error) if should_skip_missing_resource(&error) => {
                log_missing_resource("profiles", &chunk.join(","), error);
                continue;
            }
            Err(error) => return Err(AppError::diagnostics("Couldn't load account profiles.", error)),
        };
        let output = match output.into_output() {
            Ok(output) => output.into_static(),
            Err(error) if should_skip_missing_resource(&error) => {
                log_missing_resource("profiles", &chunk.join(","), error);
                continue;
            }
            Err(error) => return Err(AppError::diagnostics("Couldn't read account profiles.", error)),
        };

        for profile in output.profiles {
            profiles.insert(profile.did.to_string(), serde_json::to_value(profile)?);
        }
    }

    Ok(profiles)
}

async fn fetch_missing_actor_state(did: &str) -> ActorState {
    let actor = match did_identifier(did) {
        Ok(actor) => actor,
        Err(error) => {
            log_missing_resource("profile", did, error);
            return unavailable_actor_state(ActorAvailabilityReason::Unavailable);
        }
    };
    let client = public_client();

    let output = match client.send(GetProfile::new().actor(actor).build()).await {
        Ok(output) => output,
        Err(error) => {
            log::warn!("failed to load missing actor profile for {did}: {error}");
            return actor_state_from_error(&error);
        }
    };

    match output.into_output() {
        Ok(output) => match serde_json::to_value(output.value) {
            Ok(profile) => ActorState {
                availability: ActorAvailability::Available,
                profile: Some(profile),
                unavailable_reason: None,
                unavailable_message: None,
            },
            Err(error) => {
                log::warn!("failed to serialize actor profile for {did}: {error}");
                unavailable_actor_state(ActorAvailabilityReason::Unavailable)
            }
        },
        Err(error) => {
            log::warn!("failed to decode actor profile for {did}: {error}");
            actor_state_from_error(&error)
        }
    }
}

fn actor_state_from_error(error: &impl std::fmt::Display) -> ActorState {
    unavailable_actor_state(classify_actor_unavailability(error).unwrap_or(ActorAvailabilityReason::Unavailable))
}

fn unavailable_actor_state(reason: ActorAvailabilityReason) -> ActorState {
    ActorState {
        availability: ActorAvailability::Unavailable,
        profile: None,
        unavailable_reason: Some(reason),
        unavailable_message: Some(actor_unavailable_message(reason).to_string()),
    }
}

fn build_did_profile_item(did: String, actor_state: Option<&ActorState>) -> DidProfileItem {
    DidProfileItem {
        availability: actor_state
            .map(|state| state.availability)
            .unwrap_or(ActorAvailability::Unavailable),
        did,
        profile: actor_state.and_then(|state| state.profile.clone()),
        unavailable_reason: actor_state.and_then(|state| state.unavailable_reason),
        unavailable_message: actor_state.and_then(|state| state.unavailable_message.clone()),
    }
}

async fn fetch_lists(list_uris: &[String]) -> Result<Vec<Value>> {
    let client = public_client();
    let mut lists = Vec::new();

    for list_uri in list_uris {
        let parsed_uri = match AtUri::new(list_uri) {
            Ok(uri) => uri,
            Err(error) => {
                log_missing_resource("list", list_uri, error);
                continue;
            }
        };
        let output = match client
            .send(GetList::new().list(parsed_uri.into_static()).limit(1).build())
            .await
        {
            Ok(output) => output,
            Err(error) if should_skip_missing_resource(&error) => {
                log_missing_resource("list", list_uri, error);
                continue;
            }
            Err(error) => return Err(AppError::diagnostics("Couldn't load one of the matching lists.", error)),
        };
        let output = match output.into_output() {
            Ok(output) => output.into_static(),
            Err(error) if should_skip_missing_resource(&error) => {
                log_missing_resource("list", list_uri, error);
                continue;
            }
            Err(error) => return Err(AppError::diagnostics("Couldn't read one of the matching lists.", error)),
        };
        lists.push(serde_json::to_value(output.list)?);
    }

    Ok(lists)
}

async fn fetch_starter_packs(uris: &[String]) -> Result<Vec<Value>> {
    if uris.is_empty() {
        return Ok(Vec::new());
    }

    let client = public_client();
    let mut starter_packs = Vec::new();

    for uri in uris {
        let parsed_uri = match AtUri::new(uri).map(IntoStatic::into_static) {
            Ok(parsed_uri) => parsed_uri,
            Err(error) => {
                log_missing_resource("starter pack", uri, error);
                continue;
            }
        };
        let output = match client.send(GetStarterPacks::new().uris(vec![parsed_uri]).build()).await {
            Ok(output) => output,
            Err(error) if should_skip_missing_resource(&error) => {
                log_missing_resource("starter pack", uri, error);
                continue;
            }
            Err(error) => {
                return Err(AppError::diagnostics(
                    "Couldn't load starter packs for this account.",
                    error,
                ))
            }
        };
        let output = match output.into_output() {
            Ok(output) => output.into_static(),
            Err(error) if should_skip_missing_resource(&error) => {
                log_missing_resource("starter pack", uri, error);
                continue;
            }
            Err(error) => return Err(AppError::diagnostics("Couldn't read starter pack details.", error)),
        };

        for starter_pack in output.starter_packs {
            starter_packs.push(serde_json::to_value(starter_pack)?);
        }
    }

    Ok(starter_packs)
}

async fn fetch_backlink_group(client: &ConstellationClient, subject: &str, source: &str) -> Result<BacklinkGroup> {
    let response = client
        .get_backlinks(
            subject.to_string(),
            source.to_string(),
            Some(BACKLINK_PREVIEW_LIMIT),
            None,
        )
        .await
        .map_err(|error| AppError::diagnostics("Couldn't load record backlinks right now.", error))?;

    build_backlink_group(response).await
}

async fn build_backlink_group(response: BacklinksResponse) -> Result<BacklinkGroup> {
    let dids = response
        .records
        .iter()
        .map(|record| record.did.clone())
        .collect::<Vec<_>>();
    let profiles = fetch_profiles_lookup(&dids).await?;

    let records = response
        .records
        .into_iter()
        .map(|record| BacklinkRecordItem {
            uri: link_record_uri(&record),
            profile: profiles.get(&record.did).cloned(),
            did: record.did,
            collection: record.collection,
            rkey: record.rkey,
        })
        .collect();

    Ok(BacklinkGroup { total: response.total, records, cursor: response.cursor })
}

async fn fetch_profiles_lookup(dids: &[String]) -> Result<HashMap<String, Value>> {
    Ok(fetch_profiles_map(dids).await?.into_iter().collect())
}

fn extract_blocker_dids(records: &[ConstellationLinkRecord]) -> Vec<String> {
    dedupe_preserve_order(records.iter().map(|record| record.did.clone()).collect())
}

async fn confirm_blocked_by(actor_did: &str, candidate_dids: &[String]) -> Result<Vec<String>> {
    if candidate_dids.is_empty() {
        return Ok(Vec::new());
    }

    let actor = did_identifier(actor_did)?;
    let client = public_client();
    let mut confirmed = BTreeSet::new();

    for chunk in candidate_dids.chunks(PUBLIC_BATCH_LIMIT) {
        let others = chunk
            .iter()
            .filter_map(|did| match did_identifier(did) {
                Ok(actor) => Some(actor),
                Err(error) => {
                    log_missing_resource("relationship", did, error);
                    None
                }
            })
            .collect::<Vec<_>>();
        if others.is_empty() {
            continue;
        }

        let output = client
            .send(GetRelationships::new().actor(actor.clone()).others(others).build())
            .await
            .map_err(|error| AppError::diagnostics("Couldn't confirm who blocks this profile.", error))?
            .into_output()
            .map_err(|error| AppError::diagnostics("Couldn't read who blocks this profile.", error))?
            .into_static();

        for did in extract_confirmed_blocked_by_dids(&output.relationships) {
            confirmed.insert(did);
        }
    }

    Ok(candidate_dids
        .iter()
        .filter(|did| confirmed.contains(did.as_str()))
        .cloned()
        .collect())
}

fn extract_confirmed_blocked_by_dids(relationships: &[GetRelationshipsOutputRelationshipsItem<'_>]) -> Vec<String> {
    relationships
        .iter()
        .filter_map(|relationship| match relationship {
            GetRelationshipsOutputRelationshipsItem::Relationship(relationship)
                if relationship.blocked_by.is_some() =>
            {
                Some(relationship.did.to_string())
            }
            _ => None,
        })
        .collect()
}

fn extract_subject_did(value: &Value) -> Option<String> {
    value.get("subject").and_then(Value::as_str).map(str::to_string)
}

fn extract_created_at(value: &Value) -> Option<String> {
    value.get("createdAt").and_then(Value::as_str).map(str::to_string)
}

#[cfg(test)]
mod tests {
    use super::{
        dedupe_preserve_order, extract_blocker_dids, extract_confirmed_blocked_by_dids, extract_created_at,
        extract_subject_did, should_skip_missing_resource,
    };
    use crate::constellation::ConstellationLinkRecord;
    use jacquard::api::app_bsky::graph::{get_relationships::GetRelationshipsOutputRelationshipsItem, Relationship};
    use jacquard::types::{aturi::AtUri, did::Did};
    use serde_json::json;

    #[test]
    fn dedupe_preserve_order_keeps_first_occurrence() {
        let values = vec!["at://one".to_string(), "at://two".to_string(), "at://one".to_string()];

        assert_eq!(
            dedupe_preserve_order(values),
            vec!["at://one".to_string(), "at://two".to_string()]
        );
    }

    #[test]
    fn extract_subject_and_created_at_from_block_value() {
        let value = json!({
            "subject": "did:plc:blocked",
            "createdAt": "2025-01-01T00:00:00Z"
        });

        assert_eq!(extract_subject_did(&value).as_deref(), Some("did:plc:blocked"));
        assert_eq!(extract_created_at(&value).as_deref(), Some("2025-01-01T00:00:00Z"));
    }

    #[test]
    fn treats_missing_list_errors_as_skippable() {
        assert!(should_skip_missing_resource(
            &"XRPC error: Object(Object({\"error\":\"InvalidRequest\",\"message\":\"List not found\"}))"
        ));
        assert!(should_skip_missing_resource(&"repo not found"));
        assert!(!should_skip_missing_resource(&"rate limit exceeded"));
    }

    #[test]
    fn extract_blocker_dids_preserves_order_and_dedupes() {
        let records = vec![
            ConstellationLinkRecord {
                did: "did:plc:one".to_string(),
                collection: "app.bsky.graph.block".to_string(),
                rkey: "1".to_string(),
            },
            ConstellationLinkRecord {
                did: "did:plc:two".to_string(),
                collection: "app.bsky.graph.block".to_string(),
                rkey: "2".to_string(),
            },
            ConstellationLinkRecord {
                did: "did:plc:one".to_string(),
                collection: "app.bsky.graph.block".to_string(),
                rkey: "3".to_string(),
            },
        ];

        assert_eq!(
            extract_blocker_dids(&records),
            vec!["did:plc:one".to_string(), "did:plc:two".to_string()]
        );
    }

    #[test]
    fn extracts_only_confirmed_blocked_by_relationships() {
        let relationships = vec![
            GetRelationshipsOutputRelationshipsItem::Relationship(Box::new(
                Relationship::new()
                    .did(Did::new("did:plc:one").expect("did should parse"))
                    .blocked_by(AtUri::new("at://did:plc:one/app.bsky.graph.block/1").expect("uri should parse"))
                    .build(),
            )),
            GetRelationshipsOutputRelationshipsItem::Relationship(Box::new(
                Relationship::new()
                    .did(Did::new("did:plc:two").expect("did should parse"))
                    .build(),
            )),
        ];

        assert_eq!(
            extract_confirmed_blocked_by_dids(&relationships),
            vec!["did:plc:one".to_string()]
        );
    }
}

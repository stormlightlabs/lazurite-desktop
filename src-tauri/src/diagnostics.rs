use crate::constellation::{BacklinksResponse, ConstellationClient, ConstellationLinkRecord};
use crate::error::{AppError, Result};
use crate::explorer;
use crate::settings;
use crate::state::AppState;
use jacquard::api::app_bsky::actor::get_profiles::GetProfiles;
use jacquard::api::app_bsky::graph::get_list::GetList;
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
    pub profile: Option<Value>,
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
    pub value: Value,
    pub profile: Option<Value>,
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
    let counts = client
        .get_many_to_many_counts(
            normalized_did.clone(),
            LIST_MEMBERSHIP_SOURCE.to_string(),
            LIST_MEMBERSHIP_PATH_TO_OTHER.to_string(),
        )
        .await
        .map_err(|error| diagnostics_error("Couldn't load lists for this account.", error))?;

    let mut list_uris = Vec::new();
    let mut cursor = None;
    let mut truncated = false;

    while list_uris.len() < ACCOUNT_LIST_MAX_ITEMS {
        let response = client
            .get_many_to_many(
                normalized_did.clone(),
                LIST_MEMBERSHIP_SOURCE.to_string(),
                LIST_MEMBERSHIP_PATH_TO_OTHER.to_string(),
                Some(ACCOUNT_LIST_PAGE_LIMIT),
                cursor.clone(),
            )
            .await
            .map_err(|error| diagnostics_error("Couldn't load lists for this account.", error))?;

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
        .map_err(|error| diagnostics_error("Couldn't load labels for this account.", error))?
        .into_output()
        .map_err(|error| diagnostics_error("Couldn't read labels for this account.", error))?
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
    let response = client
        .get_distinct_dids(
            normalized_did,
            BLOCK_SOURCE.to_string(),
            limit.or(Some(BLOCK_PREVIEW_LIMIT)),
            cursor,
        )
        .await
        .map_err(|error| diagnostics_error("Couldn't load the accounts blocking this profile.", error))?;

    let profiles = fetch_profiles_map(&response.dids).await?;
    let items = response
        .dids
        .into_iter()
        .map(|entry_did| DidProfileItem { profile: profiles.get(&entry_did).cloned(), did: entry_did })
        .collect();

    Ok(AccountBlockedByResult { total: response.total, items, cursor: response.cursor })
}

pub async fn get_account_blocking(did: String, cursor: Option<String>) -> Result<AccountBlockingResult> {
    let normalized_did = normalize_did(&did)?;
    let output = explorer::list_records(normalized_did.clone(), BLOCK_COLLECTION.to_string(), cursor)
        .await
        .map_err(|error| diagnostics_error("Couldn't load this account's block records.", error))?;
    let parsed: RepoListRecordsOutput = serde_json::from_value(output).map_err(|error| {
        log::error!("failed to decode block listRecords output: {error}");
        AppError::validation("Lazurite couldn't read this account's block records.")
    })?;

    let subject_dids = parsed
        .records
        .iter()
        .filter_map(|record| extract_subject_did(&record.value))
        .collect::<Vec<_>>();
    let profiles = fetch_profiles_map(&subject_dids).await?;

    let items = parsed
        .records
        .into_iter()
        .filter_map(|record| {
            let subject_did = extract_subject_did(&record.value)?;
            Some(AccountBlockingItem {
                created_at: extract_created_at(&record.value),
                profile: profiles.get(&subject_did).cloned(),
                uri: record.uri,
                cid: record.cid,
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
    let count = client
        .get_backlinks_count(normalized_did.clone(), STARTER_PACK_SOURCE.to_string())
        .await
        .map_err(|error| diagnostics_error("Couldn't load starter packs for this account.", error))?;

    let mut pack_uris = Vec::new();
    let mut cursor = None;
    let mut truncated = false;

    while pack_uris.len() < STARTER_PACK_MAX_ITEMS {
        let response = client
            .get_backlinks(
                normalized_did.clone(),
                STARTER_PACK_SOURCE.to_string(),
                Some(STARTER_PACK_LIMIT),
                cursor.clone(),
            )
            .await
            .map_err(|error| diagnostics_error("Couldn't load starter packs for this account.", error))?;

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

fn diagnostics_error(message: &'static str, error: impl std::fmt::Display) -> AppError {
    log::error!("{message} {error}");
    AppError::validation(message)
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
            .map(|did| did_identifier(did))
            .collect::<Result<Vec<_>>>()?;
        let output = client
            .send(GetProfiles::new().actors(actors).build())
            .await
            .map_err(|error| diagnostics_error("Couldn't load account profiles.", error))?
            .into_output()
            .map_err(|error| diagnostics_error("Couldn't read account profiles.", error))?
            .into_static();

        for profile in output.profiles {
            profiles.insert(profile.did.to_string(), serde_json::to_value(profile)?);
        }
    }

    Ok(profiles)
}

async fn fetch_lists(list_uris: &[String]) -> Result<Vec<Value>> {
    let client = public_client();
    let mut lists = Vec::new();

    for list_uri in list_uris {
        let parsed_uri = AtUri::new(list_uri).map_err(|_| AppError::validation("A list URI was invalid."))?;
        let output = client
            .send(GetList::new().list(parsed_uri.into_static()).limit(1).build())
            .await
            .map_err(|error| diagnostics_error("Couldn't load one of the matching lists.", error))?
            .into_output()
            .map_err(|error| diagnostics_error("Couldn't read one of the matching lists.", error))?
            .into_static();
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

    for chunk in uris.chunks(PUBLIC_BATCH_LIMIT) {
        let parsed_uris = chunk
            .iter()
            .map(|uri| {
                AtUri::new(uri)
                    .map(IntoStatic::into_static)
                    .map_err(|_| AppError::validation("A starter pack URI was invalid."))
            })
            .collect::<Result<Vec<_>>>()?;
        let output = client
            .send(GetStarterPacks::new().uris(parsed_uris).build())
            .await
            .map_err(|error| diagnostics_error("Couldn't load starter packs for this account.", error))?
            .into_output()
            .map_err(|error| diagnostics_error("Couldn't read starter pack details.", error))?
            .into_static();

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
        .map_err(|error| diagnostics_error("Couldn't load record backlinks right now.", error))?;

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

fn extract_subject_did(value: &Value) -> Option<String> {
    value.get("subject").and_then(Value::as_str).map(str::to_string)
}

fn extract_created_at(value: &Value) -> Option<String> {
    value.get("createdAt").and_then(Value::as_str).map(str::to_string)
}

#[cfg(test)]
mod tests {
    use super::{dedupe_preserve_order, extract_created_at, extract_subject_did};
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
}

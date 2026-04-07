use crate::error::{AppError, Result};
use base64::{engine::general_purpose::STANDARD as BASE64_STANDARD, Engine as _};
use jacquard::api::com_atproto::identity::resolve_handle::ResolveHandle;
use jacquard::api::com_atproto::label::query_labels::QueryLabels;
use jacquard::api::com_atproto::repo::describe_repo::DescribeRepo;
use jacquard::api::com_atproto::repo::get_record::GetRecord;
use jacquard::api::com_atproto::repo::list_records::ListRecords;
use jacquard::api::com_atproto::server::describe_server::DescribeServer;
use jacquard::api::com_atproto::sync::get_blob::GetBlob;
use jacquard::api::com_atproto::sync::get_repo::GetRepo;
use jacquard::api::com_atproto::sync::list_repos::ListRepos;
use jacquard::client::{Agent, UnauthenticatedSession};
use jacquard::deps::fluent_uri::Uri;
use jacquard::identity::{resolver::IdentityResolver, JacquardResolver};
use jacquard::types::aturi::AtUri;
use jacquard::types::cid::Cid;
use jacquard::types::did::Did;
use jacquard::types::did_doc::DidDocument;
use jacquard::types::handle::Handle;
use jacquard::types::ident::AtIdentifier;
use jacquard::types::nsid::Nsid;
use jacquard::types::recordkey::{RecordKey, Rkey};
use jacquard::xrpc::XrpcClient;
use jacquard::IntoStatic;
use serde::{Deserialize, Serialize};
use serde_json::Value;
use std::collections::HashMap;
use std::path::PathBuf;
use std::time::Duration;
use tauri::{AppHandle, Emitter, Manager};
use tauri_plugin_log::log;
use uuid::Uuid;

pub const EXPLORER_NAVIGATION_EVENT: &str = "navigation:explorer-resolved";
const PDS_REPO_LIST_LIMIT: i64 = 100;
const QUERY_LABELS_LIMIT: i64 = 100;
const FAVICON_FETCH_TIMEOUT: Duration = Duration::from_secs(2);
const LEXICON_FAVICON_HOST_OVERRIDES: &[(&str, &str)] = &[("sh.tangled.", "tangled.org"), ("chat.bsky.", "bsky.app")];

type ExplorerClient = Agent<UnauthenticatedSession<JacquardResolver>>;

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum ExplorerInputKind {
    AtUri,
    Handle,
    Did,
    PdsUrl,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum ExplorerTargetKind {
    Pds,
    Repo,
    Collection,
    Record,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ResolvedExplorerInput {
    pub input: String,
    pub input_kind: ExplorerInputKind,
    pub target_kind: ExplorerTargetKind,
    pub normalized_input: String,
    pub uri: Option<String>,
    pub did: Option<String>,
    pub handle: Option<String>,
    pub pds_url: Option<String>,
    pub collection: Option<String>,
    pub rkey: Option<String>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ExplorerNavigation {
    pub target: ResolvedExplorerInput,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ExplorerHostedRepo {
    pub did: String,
    pub head: String,
    pub rev: String,
    pub active: bool,
    pub status: Option<String>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ExplorerServerView {
    pub pds_url: String,
    pub server: Value,
    pub repos: Vec<ExplorerHostedRepo>,
    pub cursor: Option<String>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RepoCarExport {
    pub did: String,
    pub path: String,
    pub bytes_written: usize,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TempBlobFile {
    pub path: String,
    pub bytes_written: usize,
}

pub async fn resolve_input(input: String) -> Result<ResolvedExplorerInput> {
    let trimmed = input.trim();
    if trimmed.is_empty() {
        return Err(AppError::validation("explorer input cannot be empty"));
    }

    match detect_input_kind(trimmed)? {
        ExplorerInputKind::AtUri => resolve_at_uri_input(trimmed).await,
        ExplorerInputKind::Handle => resolve_handle_input(trimmed).await,
        ExplorerInputKind::Did => resolve_did_input(trimmed).await,
        ExplorerInputKind::PdsUrl => Ok(ResolvedExplorerInput {
            input: trimmed.to_string(),
            input_kind: ExplorerInputKind::PdsUrl,
            target_kind: ExplorerTargetKind::Pds,
            normalized_input: normalize_pds_url(trimmed)?,
            uri: None,
            did: None,
            handle: None,
            pds_url: Some(normalize_pds_url(trimmed)?),
            collection: None,
            rkey: None,
        }),
    }
}

pub async fn describe_server(pds_url: String) -> Result<ExplorerServerView> {
    let normalized_pds_url = normalize_pds_url(&pds_url)?;
    let client = client_for_base_uri(&normalized_pds_url).await?;

    let server_output = client
        .send(DescribeServer)
        .await
        .map_err(|error| AppError::validation(format!("describeServer request failed: {error}")))?
        .into_output()
        .map_err(|error| AppError::validation(format!("describeServer output failed: {error}")))?
        .into_static();

    let repo_output = client
        .send(ListRepos::new().limit(PDS_REPO_LIST_LIMIT).build())
        .await
        .map_err(|error| AppError::validation(format!("listRepos request failed: {error}")))?
        .into_output()
        .map_err(|error| AppError::validation(format!("listRepos output failed: {error}")))?
        .into_static();

    let repos = repo_output
        .repos
        .into_iter()
        .map(|repo| ExplorerHostedRepo {
            did: repo.did.to_string(),
            head: repo.head.to_string(),
            rev: repo.rev.to_string(),
            active: repo.active.unwrap_or(true),
            status: repo.status.map(|status| status.to_string()),
        })
        .collect();

    Ok(ExplorerServerView {
        pds_url: normalized_pds_url,
        server: serde_json::to_value(&server_output)?,
        repos,
        cursor: repo_output.cursor.map(|cursor| cursor.to_string()),
    })
}

pub async fn describe_repo(did: String) -> Result<Value> {
    let output = describe_repo_output(&did).await?;
    serde_json::to_value(output).map_err(AppError::from)
}

pub async fn list_records(did: String, collection: String, cursor: Option<String>) -> Result<Value> {
    let client = client_for_repo_did(&did).await?;
    let request = ListRecords::new()
        .repo(parse_at_identifier(&did)?)
        .collection(parse_collection(&collection)?)
        .maybe_cursor(cursor.map(Into::into))
        .build();

    let output = client
        .send(request)
        .await
        .map_err(|error| AppError::validation(format!("listRecords request failed: {error}")))?
        .into_output()
        .map_err(|error| AppError::validation(format!("listRecords output failed: {error}")))?
        .into_static();

    serde_json::to_value(output).map_err(AppError::from)
}

pub async fn get_record(did: String, collection: String, rkey: String) -> Result<Value> {
    let client = client_for_repo_did(&did).await?;
    let request = GetRecord::new()
        .repo(parse_at_identifier(&did)?)
        .collection(parse_collection(&collection)?)
        .rkey(parse_record_key(&rkey)?)
        .build();

    let output = client
        .send(request)
        .await
        .map_err(|error| AppError::validation(format!("getRecord request failed: {error}")))?
        .into_output()
        .map_err(|error| AppError::validation(format!("getRecord output failed: {error}")))?
        .into_static();

    serde_json::to_value(output).map_err(AppError::from)
}

pub async fn export_repo_car(did: String, app: &AppHandle) -> Result<RepoCarExport> {
    let parsed_did = Did::new(&did)?.into_static();
    let client = client_for_repo_did(parsed_did.as_str()).await?;
    let output = client
        .send(GetRepo::new().did(parsed_did.clone()).build())
        .await
        .map_err(|error| AppError::validation(format!("getRepo request failed: {error}")))?
        .into_output()
        .map_err(|error| AppError::validation(format!("getRepo output failed: {error}")))?;

    let export_path = resolve_car_export_path(app, parsed_did.as_str())?;
    if let Some(parent) = export_path.parent() {
        std::fs::create_dir_all(parent)?;
    }
    std::fs::write(&export_path, &output.body)?;

    Ok(RepoCarExport {
        did: parsed_did.to_string(),
        path: export_path.to_string_lossy().into_owned(),
        bytes_written: output.body.len(),
    })
}

pub async fn fetch_blob_to_temp_file(
    did: String, cid: String, extension: Option<String>, app: &AppHandle,
) -> Result<TempBlobFile> {
    let parsed_did = Did::new(did.trim())?.into_static();
    let parsed_cid = parse_cid(&cid)?;
    let client = client_for_repo_did(parsed_did.as_str()).await?;
    let output = client
        .send(GetBlob::new().did(parsed_did.clone()).cid(parsed_cid.clone()).build())
        .await
        .map_err(|error| AppError::validation(format!("getBlob request failed: {error}")))?
        .into_output()
        .map_err(|error| AppError::validation(format!("getBlob output failed: {error}")))?;

    let blob_path = resolve_blob_temp_path(app, parsed_did.as_str(), parsed_cid.as_str(), extension.as_deref())?;
    if let Some(parent) = blob_path.parent() {
        std::fs::create_dir_all(parent)?;
    }

    std::fs::write(&blob_path, &output.body).map_err(|error| {
        log::error!(
            "failed to write temporary blob file {} for did {} cid {}: {error}",
            blob_path.display(),
            parsed_did,
            parsed_cid
        );
        AppError::validation("Couldn't save a temporary media file for playback.")
    })?;

    Ok(TempBlobFile { path: blob_path.to_string_lossy().into_owned(), bytes_written: output.body.len() })
}

pub fn delete_blob_temp_file(path: &str, app: &AppHandle) -> Result<()> {
    let trimmed_path = path.trim();
    if trimmed_path.is_empty() {
        return Ok(());
    }

    let target_path = PathBuf::from(trimmed_path);
    if !target_path.exists() {
        return Ok(());
    }

    let blob_dir = resolve_blob_temp_dir(app)?;
    if !blob_dir.exists() {
        std::fs::create_dir_all(&blob_dir)?;
    }

    let canonical_blob_dir = std::fs::canonicalize(&blob_dir)?;
    let canonical_target = std::fs::canonicalize(&target_path).map_err(|error| {
        log::warn!(
            "failed to resolve blob temp file path {}: {error}",
            target_path.display()
        );
        AppError::validation("Couldn't remove the temporary media file.")
    })?;

    if !is_path_within_directory(&canonical_target, &canonical_blob_dir) {
        log::warn!(
            "refusing to delete temp blob outside managed directory: {} not in {}",
            canonical_target.display(),
            canonical_blob_dir.display()
        );
        return Err(AppError::validation("Couldn't remove the temporary media file."));
    }

    if canonical_target.is_file() {
        std::fs::remove_file(&canonical_target).map_err(|error| {
            log::warn!(
                "failed to remove temporary blob file {}: {error}",
                canonical_target.display()
            );
            AppError::validation("Couldn't remove the temporary media file.")
        })?;
    }

    Ok(())
}

pub async fn query_labels(uri: String) -> Result<Value> {
    let normalized_uri = normalize_at_uri(&uri)?;
    let client = public_client();
    let output = client
        .send(
            QueryLabels::new()
                .uri_patterns(vec![normalized_uri.into()])
                .limit(QUERY_LABELS_LIMIT)
                .build(),
        )
        .await
        .map_err(|error| AppError::validation(format!("queryLabels request failed: {error}")))?
        .into_output()
        .map_err(|error| AppError::validation(format!("queryLabels output failed: {error}")))?
        .into_static();

    serde_json::to_value(output).map_err(AppError::from)
}

pub async fn get_lexicon_favicons(
    collections: Vec<String>, app: &AppHandle,
) -> Result<HashMap<String, Option<String>>> {
    let client = match reqwest::Client::builder().timeout(FAVICON_FETCH_TIMEOUT).build() {
        Ok(client) => client,
        Err(error) => {
            log::warn!("failed to construct favicon client: {error}");
            return Ok(collections.into_iter().map(|collection| (collection, None)).collect());
        }
    };
    let cache_dir = match resolve_favicon_cache_dir(app) {
        Ok(cache_dir) => Some(cache_dir),
        Err(error) => {
            log::warn!("failed to resolve explorer favicon cache directory: {error}");
            None
        }
    };

    let mut icons = HashMap::with_capacity(collections.len());

    for collection in collections {
        let icon = resolve_lexicon_favicon_data_url(&client, cache_dir.as_deref(), &collection).await;
        icons.insert(collection, icon);
    }

    Ok(icons)
}

pub fn clear_lexicon_favicon_cache(app: &AppHandle) -> Result<()> {
    let cache_dir = resolve_favicon_cache_dir(app)?;
    clear_favicon_cache_dir(&cache_dir)
}

pub async fn emit_explorer_navigation(app: &AppHandle, raw: &str) -> Result<()> {
    let target = resolve_input(raw.to_string()).await?;
    app.emit(EXPLORER_NAVIGATION_EVENT, ExplorerNavigation { target })?;
    Ok(())
}

fn public_client() -> ExplorerClient {
    Agent::new(UnauthenticatedSession::new_public())
}

async fn client_for_base_uri(base_uri: &str) -> Result<ExplorerClient> {
    let client = public_client();
    let normalized = Uri::parse(base_uri)?;
    client.set_base_uri(normalized.to_owned()).await;
    Ok(client)
}

async fn client_for_repo(repo: &str) -> Result<ExplorerClient> {
    match parse_at_identifier(repo)? {
        AtIdentifier::Did(did) => client_for_repo_did(did.as_str()).await,
        AtIdentifier::Handle(handle) => {
            let did = resolve_handle_to_did(handle.as_str()).await?;
            client_for_repo_did(&did).await
        }
    }
}

async fn client_for_repo_did(did: &str) -> Result<ExplorerClient> {
    let metadata = resolve_repo_metadata(did).await?;
    let pds_url = metadata
        .pds_url
        .ok_or_else(|| AppError::validation(format!("missing PDS endpoint for repo {did}")))?;
    client_for_base_uri(&pds_url).await
}

async fn resolve_at_uri_input(input: &str) -> Result<ResolvedExplorerInput> {
    let parsed = AtUri::new(input)?;
    let (did, handle) = match parsed.authority() {
        AtIdentifier::Did(did) => (did.to_string(), None),
        AtIdentifier::Handle(handle) => (resolve_handle_to_did(handle.as_str()).await?, Some(handle.to_string())),
    };
    let repo_metadata = resolve_repo_metadata(&did).await?;

    Ok(build_resolved_at_uri(
        input,
        &did,
        handle.or(repo_metadata.handle),
        repo_metadata.pds_url,
        &parsed,
    ))
}

async fn resolve_handle_input(input: &str) -> Result<ResolvedExplorerInput> {
    let normalized_handle = normalize_handle(input).ok_or_else(|| AppError::validation("invalid handle input"))?;
    let did = resolve_handle_to_did(&normalized_handle).await?;
    let repo_metadata = resolve_repo_metadata(&did).await?;

    Ok(ResolvedExplorerInput {
        input: input.trim().to_string(),
        input_kind: ExplorerInputKind::Handle,
        target_kind: ExplorerTargetKind::Repo,
        normalized_input: did.clone(),
        uri: Some(format!("at://{did}")),
        did: Some(did),
        handle: repo_metadata.handle.or(Some(normalized_handle)),
        pds_url: repo_metadata.pds_url,
        collection: None,
        rkey: None,
    })
}

async fn resolve_did_input(input: &str) -> Result<ResolvedExplorerInput> {
    let did = Did::new(input.trim())?.to_string();
    let repo_metadata = resolve_repo_metadata(&did).await?;

    Ok(ResolvedExplorerInput {
        input: input.trim().to_string(),
        input_kind: ExplorerInputKind::Did,
        target_kind: ExplorerTargetKind::Repo,
        normalized_input: did.clone(),
        uri: Some(format!("at://{did}")),
        did: Some(did),
        handle: repo_metadata.handle,
        pds_url: repo_metadata.pds_url,
        collection: None,
        rkey: None,
    })
}

async fn describe_repo_output(
    repo: &str,
) -> Result<jacquard::api::com_atproto::repo::describe_repo::DescribeRepoOutput<'static>> {
    let client = client_for_repo(repo).await?;
    client
        .send(DescribeRepo::new().repo(parse_at_identifier(repo)?).build())
        .await
        .map_err(|error| AppError::validation(format!("describeRepo request failed: {error}")))?
        .into_output()
        .map_err(|error| AppError::validation(format!("describeRepo output failed: {error}")))
        .map(IntoStatic::into_static)
}

#[derive(Debug, Clone, Default)]
struct RepoMetadata {
    handle: Option<String>,
    pds_url: Option<String>,
}

async fn resolve_repo_metadata(did: &str) -> Result<RepoMetadata> {
    let did_doc = resolve_did_document(did).await?;
    Ok(repo_metadata_from_did_doc(&did_doc))
}

async fn resolve_did_document(did: &str) -> Result<DidDocument<'static>> {
    let client = public_client();
    let parsed_did = Did::new(did)?.into_static();

    client
        .resolve_did_doc(&parsed_did)
        .await
        .map_err(|error| AppError::validation(format!("resolveDid request failed: {error}")))?
        .into_owned()
        .map_err(|error| AppError::validation(format!("resolveDid output failed: {error}")))
}

fn repo_metadata_from_did_doc(did_doc: &DidDocument<'_>) -> RepoMetadata {
    let handle = did_doc.also_known_as.as_ref().and_then(|aliases| {
        aliases.iter().find_map(|alias| {
            let candidate = alias.as_ref().strip_prefix("at://")?;
            Handle::new(candidate).ok().map(|handle| handle.to_string())
        })
    });
    let pds_url = did_doc
        .pds_endpoint()
        .and_then(|uri| normalize_pds_url(uri.as_str()).ok());

    RepoMetadata { handle, pds_url }
}

async fn resolve_handle_to_did(handle: &str) -> Result<String> {
    let client = public_client();
    client
        .send(ResolveHandle::new().handle(Handle::new(handle)?.into_static()).build())
        .await
        .map_err(|error| AppError::validation(format!("resolveHandle request failed: {error}")))?
        .into_output()
        .map_err(|error| AppError::validation(format!("resolveHandle output failed: {error}")))
        .map(|output| output.did.to_string())
}

fn build_resolved_at_uri(
    input: &str, did: &str, handle: Option<String>, pds_url: Option<String>, parsed: &AtUri<'_>,
) -> ResolvedExplorerInput {
    let collection = parsed.collection().map(|collection| collection.to_string());
    let rkey = parsed.rkey().map(|rkey| rkey.as_ref().to_string());
    let target_kind = match (collection.as_ref(), rkey.as_ref()) {
        (Some(_), Some(_)) => ExplorerTargetKind::Record,
        (Some(_), None) => ExplorerTargetKind::Collection,
        (None, None) => ExplorerTargetKind::Repo,
        (None, Some(_)) => ExplorerTargetKind::Repo,
    };
    let normalized_input = canonical_at_uri(did, collection.as_deref(), rkey.as_deref());

    ResolvedExplorerInput {
        input: input.trim().to_string(),
        input_kind: ExplorerInputKind::AtUri,
        target_kind,
        normalized_input: normalized_input.clone(),
        uri: Some(normalized_input),
        did: Some(did.to_string()),
        handle,
        pds_url,
        collection,
        rkey,
    }
}

fn detect_input_kind(input: &str) -> Result<ExplorerInputKind> {
    let trimmed = input.trim();

    if trimmed.starts_with("at://") {
        normalize_at_uri(trimmed)?;
        return Ok(ExplorerInputKind::AtUri);
    }

    if normalize_handle(trimmed).is_some() {
        return Ok(ExplorerInputKind::Handle);
    }

    if Did::new(trimmed).is_ok() {
        return Ok(ExplorerInputKind::Did);
    }

    if looks_like_http_url(trimmed) {
        normalize_pds_url(trimmed)?;
        return Ok(ExplorerInputKind::PdsUrl);
    }

    Err(AppError::validation(
        "explorer input must be an at:// URI, handle, DID, or PDS URL",
    ))
}

fn normalize_at_uri(input: &str) -> Result<String> {
    Ok(AtUri::new(input)?.to_string())
}

fn normalize_handle(input: &str) -> Option<String> {
    let trimmed = input.trim().trim_start_matches('@');
    if trimmed.is_empty() {
        return None;
    }

    Handle::new(trimmed).ok().map(|handle| handle.to_string())
}

fn looks_like_http_url(input: &str) -> bool {
    input.starts_with("http://") || input.starts_with("https://")
}

fn normalize_pds_url(input: &str) -> Result<String> {
    let mut url =
        reqwest::Url::parse(input.trim()).map_err(|error| AppError::validation(format!("invalid PDS URL: {error}")))?;

    match url.scheme() {
        "http" | "https" => {}
        scheme => return Err(AppError::validation(format!("unsupported PDS URL scheme: {scheme}"))),
    }

    if url.host_str().is_none() {
        return Err(AppError::validation("PDS URL must include a host"));
    }

    url.set_path("");
    url.set_query(None);
    url.set_fragment(None);

    Ok(url.to_string().trim_end_matches('/').to_string())
}

fn canonical_at_uri(did: &str, collection: Option<&str>, rkey: Option<&str>) -> String {
    match (collection, rkey) {
        (Some(collection), Some(rkey)) => format!("at://{did}/{collection}/{rkey}"),
        (Some(collection), None) => format!("at://{did}/{collection}"),
        _ => format!("at://{did}"),
    }
}

fn parse_at_identifier(value: &str) -> Result<AtIdentifier<'static>> {
    AtIdentifier::new(value)
        .map(IntoStatic::into_static)
        .map_err(AppError::from)
}

fn parse_collection(collection: &str) -> Result<Nsid<'static>> {
    Nsid::new(collection)
        .map(IntoStatic::into_static)
        .map_err(AppError::from)
}

fn parse_record_key(rkey: &str) -> Result<RecordKey<Rkey<'static>>> {
    RecordKey::any(rkey)
        .map(IntoStatic::into_static)
        .map_err(AppError::from)
}

fn parse_cid(cid: &str) -> Result<Cid<'static>> {
    let trimmed = cid.trim();
    if trimmed.is_empty() {
        return Err(AppError::validation("CID cannot be empty"));
    }

    let parsed = Cid::str(trimmed).into_static();
    parsed
        .to_ipld()
        .map_err(|error| AppError::validation(format!("invalid CID: {error}")))?;
    Ok(parsed)
}

fn resolve_car_export_path(app: &AppHandle, did: &str) -> Result<PathBuf> {
    let mut app_data_dir = app
        .path()
        .app_data_dir()
        .map_err(|error| AppError::PathResolve(error.to_string()))?;
    app_data_dir.push("exports");
    app_data_dir.push(repo_car_filename(did));
    Ok(app_data_dir)
}

fn resolve_favicon_cache_dir(app: &AppHandle) -> Result<PathBuf> {
    let mut cache_dir = app
        .path()
        .app_cache_dir()
        .map_err(|error| AppError::PathResolve(error.to_string()))?;
    cache_dir.push("explorer");
    cache_dir.push("favicons");
    Ok(cache_dir)
}

fn resolve_blob_temp_dir(app: &AppHandle) -> Result<PathBuf> {
    let mut cache_dir = app
        .path()
        .app_cache_dir()
        .map_err(|error| AppError::PathResolve(error.to_string()))?;
    cache_dir.push("explorer");
    cache_dir.push("temp-blob");
    Ok(cache_dir)
}

fn resolve_blob_temp_path(app: &AppHandle, did: &str, cid: &str, extension: Option<&str>) -> Result<PathBuf> {
    let mut cache_dir = resolve_blob_temp_dir(app)?;
    let safe_extension = sanitize_blob_extension(extension).unwrap_or_else(|| "bin".to_string());
    let file_name = format!(
        "{}_{}_{}.{}",
        sanitize_did_for_filename(did),
        sanitize_cid_for_filename(cid),
        Uuid::new_v4(),
        safe_extension
    );
    cache_dir.push(file_name);
    Ok(cache_dir)
}

fn sanitize_cid_for_filename(cid: &str) -> String {
    cid.chars()
        .map(|character| match character {
            'a'..='z' | 'A'..='Z' | '0'..='9' | '-' | '_' => character,
            _ => '_',
        })
        .collect()
}

fn sanitize_blob_extension(extension: Option<&str>) -> Option<String> {
    let normalized = extension
        .map(str::trim)
        .filter(|value| !value.is_empty())
        .map(|value| value.trim_start_matches('.').to_ascii_lowercase())?;
    if normalized.is_empty() || normalized.len() > 12 {
        return None;
    }
    if normalized.chars().all(|character| character.is_ascii_alphanumeric()) {
        Some(normalized)
    } else {
        None
    }
}

fn is_path_within_directory(path: &std::path::Path, directory: &std::path::Path) -> bool {
    path.starts_with(directory)
}

fn clear_favicon_cache_dir(cache_dir: &std::path::Path) -> Result<()> {
    if !cache_dir.exists() {
        return Ok(());
    }

    std::fs::remove_dir_all(cache_dir)?;
    Ok(())
}

async fn resolve_lexicon_favicon_data_url(
    client: &reqwest::Client, cache_dir: Option<&std::path::Path>, collection: &str,
) -> Option<String> {
    let hosts = lexicon_favicon_hosts(collection)
        .map_err(|error| {
            log::warn!("failed to derive favicon hosts for {collection}: {error}");
            error
        })
        .ok()?;

    for host in hosts {
        if let Some(cache_dir) = cache_dir {
            if let Some(cached) = read_cached_favicon_data_url(cache_dir, &host) {
                return Some(cached);
            }
        }

        if let Some(icon) = fetch_host_favicon(client, &host).await {
            if let Some(cache_dir) = cache_dir {
                write_cached_favicon(cache_dir, &host, &icon);
            }
            return Some(icon.data_url);
        }
    }

    None
}

async fn fetch_host_favicon(client: &reqwest::Client, host: &str) -> Option<CachedFavicon> {
    let favicon_url = format!("https://{host}/favicon.ico");
    if let Some(icon) = fetch_favicon_from_url(client, &favicon_url).await {
        return Some(icon);
    }

    let root_url = format!("https://{host}/");
    let html = match fetch_html_document(client, &root_url).await {
        Some(html) => html,
        None => return None,
    };
    let base_url = match reqwest::Url::parse(&root_url) {
        Ok(url) => url,
        Err(error) => {
            log::warn!("failed to parse root favicon fallback URL {root_url}: {error}");
            return None;
        }
    };

    for candidate_url in extract_favicon_urls(&html, &base_url) {
        if let Some(icon) = fetch_favicon_from_url(client, candidate_url.as_str()).await {
            return Some(icon);
        }
    }

    None
}

async fn fetch_favicon_from_url(client: &reqwest::Client, favicon_url: &str) -> Option<CachedFavicon> {
    let response = match client.get(favicon_url).send().await {
        Ok(response) => response,
        Err(error) => {
            log::warn!("failed to fetch favicon from {favicon_url}: {error}");
            return None;
        }
    };

    if !response.status().is_success() {
        log::warn!("favicon request to {favicon_url} returned {}", response.status());
        return None;
    }

    let content_type = response
        .headers()
        .get(reqwest::header::CONTENT_TYPE)
        .and_then(|value| value.to_str().ok())
        .map(str::to_owned);
    let bytes = match response.bytes().await {
        Ok(bytes) => bytes.to_vec(),
        Err(error) => {
            log::warn!("failed to read favicon bytes from {favicon_url}: {error}");
            return None;
        }
    };
    let mime = match detect_favicon_mime(content_type.as_deref(), &bytes) {
        Some(mime) => mime,
        None => {
            log::warn!("favicon response from {favicon_url} was not a recognized image");
            return None;
        }
    };

    Some(CachedFavicon {
        bytes: bytes.clone(),
        mime: mime.clone(),
        data_url: format!("data:{mime};base64,{}", BASE64_STANDARD.encode(&bytes)),
    })
}

async fn fetch_html_document(client: &reqwest::Client, root_url: &str) -> Option<String> {
    let response = match client.get(root_url).send().await {
        Ok(response) => response,
        Err(error) => {
            log::warn!("failed to fetch HTML fallback document from {root_url}: {error}");
            return None;
        }
    };

    if !response.status().is_success() {
        log::warn!("HTML fallback request to {root_url} returned {}", response.status());
        return None;
    }

    match response.text().await {
        Ok(html) => Some(html),
        Err(error) => {
            log::warn!("failed to read HTML fallback document from {root_url}: {error}");
            None
        }
    }
}

fn extract_favicon_urls(html: &str, base_url: &reqwest::Url) -> Vec<reqwest::Url> {
    let resolved_base_url = resolve_html_base_url(html, base_url);
    let lowercase = html.to_ascii_lowercase();
    let mut cursor = 0;
    let mut urls = Vec::new();

    while let Some(relative_start) = lowercase[cursor..].find("<link") {
        let start = cursor + relative_start;
        let Some(relative_end) = lowercase[start..].find('>') else {
            break;
        };
        let end = start + relative_end + 1;
        let tag = &html[start..end];

        let rel = extract_html_attribute(tag, "rel");
        let href = extract_html_attribute(tag, "href");

        if let (Some(rel), Some(href)) = (rel, href) {
            if !rel_indicates_favicon(&rel) {
                cursor = end;
                continue;
            }

            if let Ok(url) = resolved_base_url.join(&href) {
                if matches!(url.scheme(), "http" | "https") && !urls.iter().any(|existing| existing == &url) {
                    urls.push(url);
                }
            }
        }

        cursor = end;
    }

    urls
}

fn extract_html_attribute(tag: &str, attribute: &str) -> Option<String> {
    let lowercase = tag.to_ascii_lowercase();
    let lowercase_bytes = lowercase.as_bytes();
    let bytes = tag.as_bytes();
    let attribute_bytes = attribute.as_bytes();
    let mut cursor = 0;

    while cursor + attribute_bytes.len() <= lowercase_bytes.len() {
        let start = lowercase[cursor..].find(attribute)? + cursor;
        let before = start
            .checked_sub(1)
            .and_then(|index| lowercase_bytes.get(index))
            .copied();
        let after = lowercase_bytes.get(start + attribute_bytes.len()).copied();

        let invalid_before = before
            .is_some_and(|character| character.is_ascii_alphanumeric() || matches!(character, b'-' | b'_' | b':'));
        let invalid_after =
            after.is_some_and(|character| character.is_ascii_alphanumeric() || matches!(character, b'-' | b'_' | b':'));

        if invalid_before || invalid_after {
            cursor = start + attribute_bytes.len();
            continue;
        }

        let mut value_start = start + attribute_bytes.len();
        while bytes.get(value_start).is_some_and(u8::is_ascii_whitespace) {
            value_start += 1;
        }

        if bytes.get(value_start) != Some(&b'=') {
            cursor = start + attribute_bytes.len();
            continue;
        }

        value_start += 1;
        while bytes.get(value_start).is_some_and(u8::is_ascii_whitespace) {
            value_start += 1;
        }

        let quote = *bytes.get(value_start)?;
        if quote == b'"' || quote == b'\'' {
            let value_end = tag[value_start + 1..].find(char::from(quote))?;
            return Some(tag[value_start + 1..value_start + 1 + value_end].trim().to_string());
        }

        let value_end = tag[value_start..]
            .find(|character: char| character.is_whitespace() || character == '>')
            .unwrap_or(tag.len() - value_start);
        return Some(tag[value_start..value_start + value_end].trim().to_string());
    }

    None
}

fn resolve_html_base_url(html: &str, request_url: &reqwest::Url) -> reqwest::Url {
    let lowercase = html.to_ascii_lowercase();
    let mut cursor = 0;

    while let Some(relative_start) = lowercase[cursor..].find("<base") {
        let start = cursor + relative_start;
        let Some(relative_end) = lowercase[start..].find('>') else {
            break;
        };
        let end = start + relative_end + 1;
        let tag = &html[start..end];

        if let Some(href) = extract_html_attribute(tag, "href") {
            if let Ok(base_url) = request_url.join(&href) {
                if matches!(base_url.scheme(), "http" | "https") {
                    return base_url;
                }
            }
        }

        cursor = end;
    }

    request_url.clone()
}

fn rel_indicates_favicon(rel: &str) -> bool {
    rel.to_ascii_lowercase().contains("icon")
}

fn lexicon_favicon_hosts(collection: &str) -> Result<Vec<String>> {
    let domain_authority = parse_collection(collection)?.domain_authority().to_string();
    let authority_labels: Vec<&str> = domain_authority.split('.').collect();
    let mut hosts = Vec::new();

    for (prefix, host) in LEXICON_FAVICON_HOST_OVERRIDES {
        if collection.starts_with(prefix) && !hosts.iter().any(|candidate| candidate == host) {
            hosts.push((*host).to_string());
        }
    }

    if authority_labels.len() >= 2 {
        let canonical_host = format!("{}.{}", authority_labels[1], authority_labels[0]);
        if !hosts.iter().any(|candidate| candidate == &canonical_host) {
            hosts.push(canonical_host);
        }
    }

    Ok(hosts)
}

fn read_cached_favicon_data_url(cache_dir: &std::path::Path, host: &str) -> Option<String> {
    let (bytes_path, mime_path) = favicon_cache_paths(cache_dir, host);
    let mime = match std::fs::read_to_string(&mime_path) {
        Ok(mime) => mime.trim().to_string(),
        Err(error) => {
            if mime_path.exists() {
                log::warn!("failed to read cached favicon mime for {host}: {error}");
            }
            return None;
        }
    };
    let bytes = match std::fs::read(&bytes_path) {
        Ok(bytes) => bytes,
        Err(error) => {
            if bytes_path.exists() {
                log::warn!("failed to read cached favicon bytes for {host}: {error}");
            }
            return None;
        }
    };

    Some(format!("data:{mime};base64,{}", BASE64_STANDARD.encode(bytes)))
}

fn write_cached_favicon(cache_dir: &std::path::Path, host: &str, icon: &CachedFavicon) {
    if let Err(error) = std::fs::create_dir_all(cache_dir) {
        log::warn!(
            "failed to create favicon cache directory {}: {error}",
            cache_dir.display()
        );
        return;
    }

    let (bytes_path, mime_path) = favicon_cache_paths(cache_dir, host);

    if let Err(error) = std::fs::write(&bytes_path, &icon.bytes) {
        log::warn!("failed to write cached favicon bytes for {host}: {error}");
        return;
    }

    if let Err(error) = std::fs::write(&mime_path, &icon.mime) {
        log::warn!("failed to write cached favicon mime for {host}: {error}");
    }
}

fn favicon_cache_paths(cache_dir: &std::path::Path, host: &str) -> (PathBuf, PathBuf) {
    let safe_host = sanitize_host_for_filename(host);
    (
        cache_dir.join(format!("{safe_host}.bin")),
        cache_dir.join(format!("{safe_host}.mime")),
    )
}

fn sanitize_host_for_filename(host: &str) -> String {
    host.chars()
        .map(|character| match character {
            'a'..='z' | 'A'..='Z' | '0'..='9' | '-' => character,
            _ => '_',
        })
        .collect()
}

fn detect_favicon_mime(content_type: Option<&str>, bytes: &[u8]) -> Option<String> {
    if let Some(content_type) = content_type {
        let mime = content_type.split(';').next()?.trim().to_ascii_lowercase();
        if mime.starts_with("image/") {
            return Some(mime);
        }
    }

    if bytes.starts_with(&[0x89, b'P', b'N', b'G']) {
        return Some("image/png".to_string());
    }

    if bytes.starts_with(&[0xFF, 0xD8, 0xFF]) {
        return Some("image/jpeg".to_string());
    }

    if bytes.starts_with(b"GIF87a") || bytes.starts_with(b"GIF89a") {
        return Some("image/gif".to_string());
    }

    if bytes.starts_with(&[0x00, 0x00, 0x01, 0x00]) {
        return Some("image/x-icon".to_string());
    }

    if String::from_utf8_lossy(bytes).contains("<svg") {
        return Some("image/svg+xml".to_string());
    }

    None
}

#[derive(Debug, Clone)]
struct CachedFavicon {
    bytes: Vec<u8>,
    mime: String,
    data_url: String,
}

fn repo_car_filename(did: &str) -> String {
    format!("{}.car", sanitize_did_for_filename(did))
}

fn sanitize_did_for_filename(did: &str) -> String {
    did.chars()
        .map(|character| match character {
            'a'..='z' | 'A'..='Z' | '0'..='9' | '-' | '_' => character,
            _ => '_',
        })
        .collect()
}

#[cfg(test)]
mod tests {
    use super::{
        build_resolved_at_uri, canonical_at_uri, clear_favicon_cache_dir, detect_favicon_mime, detect_input_kind,
        extract_favicon_urls, extract_html_attribute, is_path_within_directory, lexicon_favicon_hosts,
        normalize_handle, normalize_pds_url, read_cached_favicon_data_url, rel_indicates_favicon, repo_car_filename,
        repo_metadata_from_did_doc, resolve_html_base_url, resolve_lexicon_favicon_data_url, sanitize_blob_extension,
        sanitize_cid_for_filename, sanitize_did_for_filename, write_cached_favicon, CachedFavicon, ExplorerInputKind,
        ExplorerTargetKind,
    };
    use jacquard::types::aturi::AtUri;
    use jacquard::types::did_doc::DidDocument;
    use reqwest::Client;
    use std::fs;
    use std::time::Duration;
    use uuid::Uuid;

    #[test]
    fn detects_all_supported_input_kinds() {
        assert_eq!(
            detect_input_kind("at://did:plc:alice/app.bsky.feed.post/123").expect("at uri should detect"),
            ExplorerInputKind::AtUri
        );
        assert_eq!(
            detect_input_kind("@alice.bsky.social").expect("handle should detect"),
            ExplorerInputKind::Handle
        );
        assert_eq!(
            detect_input_kind("did:plc:alice123").expect("did should detect"),
            ExplorerInputKind::Did
        );
        assert_eq!(
            detect_input_kind("https://pds.example.com/xrpc/com.atproto.server.describeServer")
                .expect("pds url should detect"),
            ExplorerInputKind::PdsUrl
        );
    }

    #[test]
    fn normalizes_handles_and_pds_urls() {
        assert_eq!(
            normalize_handle("@alice.bsky.social").expect("handle should normalize"),
            "alice.bsky.social"
        );
        assert_eq!(
            normalize_pds_url("https://pds.example.com/xrpc/com.atproto.server.describeServer?foo=bar#hash")
                .expect("pds url should normalize"),
            "https://pds.example.com"
        );
    }

    #[test]
    fn canonicalizes_at_uri_targets() {
        assert_eq!(canonical_at_uri("did:plc:alice", None, None), "at://did:plc:alice");
        assert_eq!(
            canonical_at_uri("did:plc:alice", Some("app.bsky.feed.post"), None),
            "at://did:plc:alice/app.bsky.feed.post"
        );
        assert_eq!(
            canonical_at_uri("did:plc:alice", Some("app.bsky.feed.post"), Some("abc123")),
            "at://did:plc:alice/app.bsky.feed.post/abc123"
        );
    }

    #[test]
    fn extracts_repo_metadata_from_did_documents() {
        let did_doc: DidDocument<'_> = serde_json::from_str(
            r##"{
                "id": "did:plc:alice",
                "alsoKnownAs": ["at://alice.bsky.social"],
                "service": [
                    {
                        "id": "#pds",
                        "type": "AtprotoPersonalDataServer",
                        "serviceEndpoint": {
                            "url": "https://pds.object.example.com/xrpc"
                        }
                    }
                ]
            }"##,
        )
        .expect("did document should parse");

        let metadata = repo_metadata_from_did_doc(&did_doc);

        assert_eq!(metadata.handle, Some("alice.bsky.social".to_string()));
        assert_eq!(metadata.pds_url, Some("https://pds.object.example.com".to_string()));
    }

    #[test]
    fn repo_car_filenames_are_filesystem_safe() {
        assert_eq!(sanitize_did_for_filename("did:plc:alice-123"), "did_plc_alice-123");
        assert_eq!(repo_car_filename("did:plc:alice-123"), "did_plc_alice-123.car");
    }

    #[test]
    fn sanitizes_blob_filename_inputs() {
        assert_eq!(sanitize_cid_for_filename("bafy/beih?123"), "bafy_beih_123");
        assert_eq!(sanitize_blob_extension(Some(".mp4")), Some("mp4".to_string()));
        assert_eq!(sanitize_blob_extension(Some("webm")), Some("webm".to_string()));
        assert_eq!(sanitize_blob_extension(Some("m3u8?foo")), None);
        assert_eq!(sanitize_blob_extension(Some("   ")), None);
    }

    #[test]
    fn verifies_path_containment() {
        let base = std::path::Path::new("/tmp/base");
        let nested = std::path::Path::new("/tmp/base/nested/file.bin");
        let outside = std::path::Path::new("/tmp/other/file.bin");

        assert!(is_path_within_directory(nested, base));
        assert!(!is_path_within_directory(outside, base));
    }

    #[test]
    fn derives_candidate_hosts_from_lexicon_nsids() {
        assert_eq!(
            lexicon_favicon_hosts("app.bsky.feed.post").expect("nsid should parse"),
            vec!["bsky.app".to_string()]
        );
        assert_eq!(
            lexicon_favicon_hosts("sh.tangled.repo.issue").expect("override nsid should parse"),
            vec!["tangled.org".to_string(), "tangled.sh".to_string()]
        );
        assert!(lexicon_favicon_hosts("not-a-valid-nsid").is_err());
    }

    #[test]
    fn detects_supported_favicon_mime_types() {
        assert_eq!(
            detect_favicon_mime(Some("image/vnd.microsoft.icon"), &[0x00, 0x00, 0x01, 0x00]),
            Some("image/vnd.microsoft.icon".to_string())
        );
        assert_eq!(
            detect_favicon_mime(None, &[0x89, b'P', b'N', b'G', 0x0D, 0x0A]),
            Some("image/png".to_string())
        );
        assert!(detect_favicon_mime(Some("text/html"), b"<html></html>").is_none());
    }

    #[test]
    fn extracts_favicon_urls_from_html_link_elements() {
        let base_url = reqwest::Url::parse("https://bsky.app/").expect("base URL should parse");
        let urls = extract_favicon_urls(
            r#"
                <html>
                    <head>
                        <link rel="stylesheet" href="/styles.css">
                        <link rel="icon" href="/favicon-32.png">
                        <link rel="shortcut icon" href="https://cdn.example.com/favicon.ico">
                        <link rel="apple-touch-icon" href="/apple-touch.png">
                    </head>
                </html>
            "#,
            &base_url,
        );

        assert_eq!(
            urls,
            vec![
                reqwest::Url::parse("https://bsky.app/favicon-32.png").expect("relative favicon URL should resolve"),
                reqwest::Url::parse("https://cdn.example.com/favicon.ico").expect("absolute favicon URL should parse"),
                reqwest::Url::parse("https://bsky.app/apple-touch.png")
                    .expect("apple touch favicon URL should resolve"),
            ]
        );
    }

    #[test]
    fn resolves_relative_favicon_urls_like_tangled() {
        let base_url = reqwest::Url::parse("https://tangled.org/").expect("base URL should parse");
        let urls = extract_favicon_urls(
            r#"<link rel="icon" href="/static/logos/dolly.svg" sizes="any" type="image/svg+xml">"#,
            &base_url,
        );

        assert_eq!(
            urls,
            vec![reqwest::Url::parse("https://tangled.org/static/logos/dolly.svg")
                .expect("tangled favicon URL should resolve")]
        );
    }

    #[test]
    fn extracts_html_attributes_with_whitespace_and_quotes() {
        let tag = r#"<link rel = "icon" href = '/static/logos/dolly.svg' type="image/svg+xml">"#;

        assert_eq!(extract_html_attribute(tag, "rel"), Some("icon".to_string()));
        assert_eq!(
            extract_html_attribute(tag, "href"),
            Some("/static/logos/dolly.svg".to_string())
        );
        assert_eq!(extract_html_attribute(tag, "type"), Some("image/svg+xml".to_string()));
    }

    #[test]
    fn honors_html_base_href_when_resolving_favicon_urls() {
        let request_url = reqwest::Url::parse("https://example.com/app/").expect("request URL should parse");
        let html = r#"
            <head>
                <base href="https://cdn.example.com/assets/">
                <link rel="icon" href="favicons/app.svg">
            </head>
        "#;

        assert_eq!(
            resolve_html_base_url(html, &request_url),
            reqwest::Url::parse("https://cdn.example.com/assets/").expect("base href should resolve")
        );
        assert_eq!(
            extract_favicon_urls(html, &request_url),
            vec![reqwest::Url::parse("https://cdn.example.com/assets/favicons/app.svg")
                .expect("favicon URL should resolve against base href")]
        );
    }

    #[test]
    fn recognizes_common_favicon_rel_patterns() {
        assert!(rel_indicates_favicon("icon"));
        assert!(rel_indicates_favicon("shortcut icon"));
        assert!(rel_indicates_favicon("apple-touch-icon"));
        assert!(rel_indicates_favicon("mask-icon"));
        assert!(!rel_indicates_favicon("stylesheet"));
    }

    #[tokio::test]
    async fn returns_cached_lexicon_favicon_without_fetching() {
        let cache_dir = create_temp_cache_dir();
        write_cached_favicon(
            &cache_dir,
            "bsky.app",
            &CachedFavicon {
                bytes: vec![0x89, b'P', b'N', b'G', 0x0D, 0x0A],
                mime: "image/png".to_string(),
                data_url: "data:image/png;base64,ignored".to_string(),
            },
        );

        let client = Client::builder()
            .timeout(Duration::from_millis(200))
            .build()
            .expect("client should build");
        let icon = resolve_lexicon_favicon_data_url(&client, Some(cache_dir.as_path()), "app.bsky.feed.post").await;

        assert_eq!(icon, read_cached_favicon_data_url(&cache_dir, "bsky.app"),);

        fs::remove_dir_all(cache_dir).expect("temporary cache directory should be removed");
    }

    #[tokio::test]
    async fn failed_favicon_fetches_return_none() {
        let client = Client::builder()
            .timeout(Duration::from_millis(200))
            .build()
            .expect("client should build");

        assert!(super::fetch_host_favicon(&client, "127.0.0.1:9").await.is_none());
    }

    #[test]
    fn clears_favicon_cache_directory_contents() {
        let cache_dir = create_temp_cache_dir();
        fs::write(cache_dir.join("icon.bin"), [1_u8, 2_u8, 3_u8]).expect("test cache file should be written");
        fs::write(cache_dir.join("icon.mime"), "image/png").expect("test cache mime should be written");

        clear_favicon_cache_dir(&cache_dir).expect("cache directory should clear");

        assert!(!cache_dir.exists());
    }

    #[test]
    fn at_uri_parser_distinguishes_repo_collection_and_record_levels() {
        let repo_uri = AtUri::new("at://did:plc:alice").expect("repo uri should parse");
        let collection_uri = AtUri::new("at://did:plc:alice/app.bsky.feed.post").expect("collection uri should parse");
        let record_uri = AtUri::new("at://did:plc:alice/app.bsky.feed.post/abc123").expect("record uri should parse");

        assert!(repo_uri.collection().is_none());
        assert!(repo_uri.rkey().is_none());
        assert_eq!(
            collection_uri.collection().expect("collection should exist").as_str(),
            "app.bsky.feed.post"
        );
        assert!(collection_uri.rkey().is_none());
        assert_eq!(record_uri.rkey().expect("rkey should exist").as_ref(), "abc123");
    }

    #[test]
    fn build_resolved_at_uri_sets_expected_target_levels() {
        let repo = AtUri::new("at://did:plc:alice").expect("repo uri should parse");
        let collection = AtUri::new("at://did:plc:alice/app.bsky.feed.post").expect("collection uri should parse");
        let record = AtUri::new("at://did:plc:alice/app.bsky.feed.post/abc123").expect("record uri should parse");

        assert_eq!(
            build_resolved_at_uri("at://did:plc:alice", "did:plc:alice", None, None, &repo).target_kind,
            ExplorerTargetKind::Repo
        );
        assert_eq!(
            build_resolved_at_uri(
                "at://did:plc:alice/app.bsky.feed.post",
                "did:plc:alice",
                None,
                None,
                &collection
            )
            .target_kind,
            ExplorerTargetKind::Collection
        );
        assert_eq!(
            build_resolved_at_uri(
                "at://did:plc:alice/app.bsky.feed.post/abc123",
                "did:plc:alice",
                None,
                None,
                &record
            )
            .target_kind,
            ExplorerTargetKind::Record
        );
    }

    fn create_temp_cache_dir() -> std::path::PathBuf {
        let path = std::env::temp_dir().join(format!("lazurite-explorer-cache-{}", Uuid::new_v4()));
        fs::create_dir_all(&path).expect("temporary cache directory should be created");
        path
    }
}

use crate::error::{AppError, Result};
use jacquard::api::com_atproto::identity::resolve_handle::ResolveHandle;
use jacquard::api::com_atproto::label::query_labels::QueryLabels;
use jacquard::api::com_atproto::repo::describe_repo::DescribeRepo;
use jacquard::api::com_atproto::repo::get_record::GetRecord;
use jacquard::api::com_atproto::repo::list_records::ListRecords;
use jacquard::api::com_atproto::server::describe_server::DescribeServer;
use jacquard::api::com_atproto::sync::get_repo::GetRepo;
use jacquard::api::com_atproto::sync::list_repos::ListRepos;
use jacquard::client::{Agent, UnauthenticatedSession};
use jacquard::deps::fluent_uri::Uri;
use jacquard::identity::JacquardResolver;
use jacquard::types::aturi::AtUri;
use jacquard::types::did::Did;
use jacquard::types::handle::Handle;
use jacquard::types::ident::AtIdentifier;
use jacquard::types::nsid::Nsid;
use jacquard::types::recordkey::{RecordKey, Rkey};
use jacquard::xrpc::XrpcClient;
use jacquard::IntoStatic;
use serde::{Deserialize, Serialize};
use serde_json::Value;
use std::path::PathBuf;
use tauri::{AppHandle, Emitter, Manager};

pub const EXPLORER_NAVIGATION_EVENT: &str = "navigation:explorer-resolved";
const PDS_REPO_LIST_LIMIT: i64 = 100;
const QUERY_LABELS_LIMIT: i64 = 100;

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
    let client = public_client();
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
    let client = public_client();
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
    let client = public_client();
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

async fn resolve_at_uri_input(input: &str) -> Result<ResolvedExplorerInput> {
    let parsed = AtUri::new(input)?;
    let (did, handle) = match parsed.authority() {
        AtIdentifier::Did(did) => (did.to_string(), None),
        AtIdentifier::Handle(handle) => (resolve_handle_to_did(handle.as_str()).await?, Some(handle.to_string())),
    };
    let repo_metadata = describe_repo_metadata(&did).await?;

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
    let repo_metadata = describe_repo_metadata(&did).await?;

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
    let repo_metadata = describe_repo_metadata(&did).await?;

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
    let client = public_client();
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

async fn describe_repo_metadata(did: &str) -> Result<RepoMetadata> {
    let output = describe_repo_output(did).await?;
    let did_doc = serde_json::to_value(&output.did_doc)?;

    Ok(RepoMetadata { handle: Some(output.handle.to_string()), pds_url: extract_pds_url_from_did_doc_json(&did_doc) })
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

fn extract_pds_url_from_did_doc_json(did_doc: &Value) -> Option<String> {
    did_doc
        .get("service")
        .and_then(Value::as_array)
        .and_then(|services| {
            services.iter().find_map(|service| {
                let service_type = service.get("type").and_then(Value::as_str)?;
                if service_type != "AtprotoPersonalDataServer" {
                    return None;
                }

                match service.get("serviceEndpoint") {
                    Some(Value::String(url)) => Some(url.clone()),
                    Some(Value::Object(object)) => object.get("url").and_then(Value::as_str).map(str::to_owned),
                    _ => None,
                }
            })
        })
        .and_then(|url| normalize_pds_url(&url).ok())
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
        canonical_at_uri, detect_input_kind, extract_pds_url_from_did_doc_json, normalize_handle, normalize_pds_url,
        repo_car_filename, sanitize_did_for_filename, ExplorerInputKind,
    };
    use jacquard::types::aturi::AtUri;

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
    fn extracts_pds_url_from_did_doc_shapes() {
        let string_endpoint = serde_json::json!({
            "service": [
                {
                    "type": "AtprotoPersonalDataServer",
                    "serviceEndpoint": "https://pds.example.com/"
                }
            ]
        });
        let object_endpoint = serde_json::json!({
            "service": [
                {
                    "type": "AtprotoPersonalDataServer",
                    "serviceEndpoint": {
                        "url": "https://pds.object.example.com/xrpc"
                    }
                }
            ]
        });

        assert_eq!(
            extract_pds_url_from_did_doc_json(&string_endpoint),
            Some("https://pds.example.com".to_string())
        );
        assert_eq!(
            extract_pds_url_from_did_doc_json(&object_endpoint),
            Some("https://pds.object.example.com".to_string())
        );
    }

    #[test]
    fn repo_car_filenames_are_filesystem_safe() {
        assert_eq!(sanitize_did_for_filename("did:plc:alice-123"), "did_plc_alice-123");
        assert_eq!(repo_car_filename("did:plc:alice-123"), "did_plc_alice-123.car");
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
}

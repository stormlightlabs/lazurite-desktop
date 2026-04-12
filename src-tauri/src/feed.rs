use super::actors::{
    actor_unavailable_message, classify_actor_unavailability, requested_actor_hints, ActorAvailabilityReason,
};
use super::auth::LazuriteOAuthSession;
use super::error::{AppError, Result};
use super::state::AppState;
use jacquard::api::app_bsky::actor::get_preferences::GetPreferences;
use jacquard::api::app_bsky::actor::get_profile::GetProfile;
use jacquard::api::app_bsky::actor::get_profiles::GetProfiles;
use jacquard::api::app_bsky::actor::put_preferences::PutPreferences;
use jacquard::api::app_bsky::actor::{
    FeedViewPref, PreferencesItem, ProfileViewDetailed, SavedFeed, SavedFeedType, SavedFeedsPrefV2,
    SavedFeedsPrefV2Builder,
};
use jacquard::api::app_bsky::bookmark::create_bookmark::CreateBookmark;
use jacquard::api::app_bsky::bookmark::delete_bookmark::DeleteBookmark;
use jacquard::api::app_bsky::embed::record::Record;
use jacquard::api::app_bsky::feed::get_actor_likes::GetActorLikes;
use jacquard::api::app_bsky::feed::get_author_feed::GetAuthorFeed;
use jacquard::api::app_bsky::feed::get_feed::GetFeed;
use jacquard::api::app_bsky::feed::get_feed_generators::GetFeedGenerators;
use jacquard::api::app_bsky::feed::get_list_feed::GetListFeed;
use jacquard::api::app_bsky::feed::get_post_thread::GetPostThread;
use jacquard::api::app_bsky::feed::get_timeline::GetTimeline;
use jacquard::api::app_bsky::feed::like::Like;
use jacquard::api::app_bsky::feed::post::{Post, PostEmbed, ReplyRef};
use jacquard::api::app_bsky::feed::repost::Repost;
use jacquard::api::app_bsky::graph::block::Block;
use jacquard::api::app_bsky::graph::follow::Follow;
use jacquard::api::app_bsky::graph::get_followers::GetFollowers;
use jacquard::api::app_bsky::graph::get_follows::GetFollows;
use jacquard::api::com_atproto::label::Label;
use jacquard::api::com_atproto::repo::apply_writes::{
    ApplyWrites, ApplyWritesOutput, ApplyWritesOutputResultsItem, ApplyWritesWritesItem, Delete,
};
use jacquard::api::com_atproto::repo::create_record::CreateRecord;
use jacquard::api::com_atproto::repo::delete_record::DeleteRecord;
use jacquard::api::com_atproto::repo::list_records::{ListRecords, ListRecordsOutput, Record as RepoListRecord};
use jacquard::api::com_atproto::repo::strong_ref::StrongRef;
use jacquard::identity::{resolver::IdentityResolver, JacquardResolver};
use jacquard::richtext;
use jacquard::types::aturi::AtUri;
use jacquard::types::cid::Cid;
use jacquard::types::datetime::Datetime;
use jacquard::types::did::Did;
use jacquard::types::handle::Handle;
use jacquard::types::ident::AtIdentifier;
use jacquard::types::nsid::Nsid;
use jacquard::types::recordkey::RecordKey;
use jacquard::types::value::Data;
use jacquard::xrpc::XrpcClient;
use jacquard::IntoStatic;
use reqwest::StatusCode;
use serde::{Deserialize, Serialize};
use std::collections::{HashMap, HashSet};
use std::sync::Arc;
use std::time::Duration;
use tauri::{AppHandle, Emitter};
use tauri_plugin_log::log;
use tokio::sync::Semaphore;
use tokio::task::JoinSet;
use tokio::time::sleep;

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(tag = "status", rename_all = "camelCase")]
pub enum ProfileLookupResult {
    Available {
        profile: serde_json::Value,
    },
    Unavailable {
        requested_actor: String,
        did: Option<String>,
        handle: Option<String>,
        reason: ActorAvailabilityReason,
        message: String,
    },
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
        .ok_or_else(|| {
            log::error!("no active account");
            AppError::Validation("no active account".into())
        })?
        .did
        .clone();

    state
        .sessions
        .read()
        .map_err(|error| AppError::state_poisoned(format!("sessions {error}")))?
        .get(&did)
        .cloned()
        .ok_or_else(|| AppError::validation(format!("session not found for active account {did}")))
}

fn active_did(state: &AppState) -> Result<String> {
    state
        .active_session
        .read()
        .map_err(|error| AppError::state_poisoned(format!("active_session poisoned with error {error}")))?
        .as_ref()
        .ok_or_else(|| AppError::Validation("no active account".into()))
        .map(|s| s.did.clone())
}

fn parse_actor_identifier(actor: &str) -> Result<AtIdentifier<'static>> {
    let trimmed = actor.trim();
    if trimmed.is_empty() {
        return Err(AppError::validation("actor must not be empty"));
    }

    if let Ok(did) = Did::new(trimmed) {
        return Ok(AtIdentifier::Did(did.into_static()));
    }

    let normalized_handle = trimmed.trim_start_matches('@');
    if let Ok(handle) = Handle::new(normalized_handle) {
        return Ok(AtIdentifier::Handle(handle.into_static()));
    }

    Err(AppError::validation("actor must be a valid DID or handle"))
}

#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SavedFeedItem {
    pub id: String,
    pub r#type: String,
    pub value: String,
    pub pinned: bool,
}

#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct FeedViewPrefItem {
    pub feed: String,
    pub hide_replies: bool,
    pub hide_replies_by_unfollowed: bool,
    pub hide_replies_by_like_count: Option<i64>,
    pub hide_reposts: bool,
    pub hide_quote_posts: bool,
}

#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct UserPreferences {
    pub saved_feeds: Vec<SavedFeedItem>,
    pub feed_view_prefs: Vec<FeedViewPrefItem>,
}

type StoredPreferences = Vec<PreferencesItem<'static>>;

fn extract_saved_feeds(pref: &SavedFeedsPrefV2<'_>) -> Vec<SavedFeedItem> {
    pref.items
        .iter()
        .map(|f| SavedFeedItem {
            id: f.id.to_string(),
            r#type: match &f.r#type {
                SavedFeedType::Timeline => "timeline".into(),
                SavedFeedType::Feed => "feed".into(),
                SavedFeedType::List => "list".into(),
                SavedFeedType::Other(s) => s.to_string(),
            },
            value: f.value.to_string(),
            pinned: f.pinned,
        })
        .collect()
}

fn extract_feed_view_pref(pref: &FeedViewPref<'_>) -> FeedViewPrefItem {
    FeedViewPrefItem {
        feed: pref.feed.to_string(),
        hide_replies: pref.hide_replies.unwrap_or(false),
        hide_replies_by_unfollowed: pref.hide_replies_by_unfollowed.unwrap_or(true),
        hide_replies_by_like_count: pref.hide_replies_by_like_count,
        hide_reposts: pref.hide_reposts.unwrap_or(false),
        hide_quote_posts: pref.hide_quote_posts.unwrap_or(false),
    }
}

fn user_preferences_from_items(items: &[PreferencesItem<'_>]) -> UserPreferences {
    let mut saved_feeds = Vec::new();
    let mut feed_view_prefs = Vec::new();

    for item in items {
        match item {
            PreferencesItem::SavedFeedsPrefV2(pref) => saved_feeds = extract_saved_feeds(pref),
            PreferencesItem::FeedViewPref(pref) => feed_view_prefs.push(extract_feed_view_pref(pref)),
            _ => (),
        }
    }

    UserPreferences { saved_feeds, feed_view_prefs }
}

async fn fetch_preference_items(state: &AppState) -> Result<StoredPreferences> {
    let session = get_session(state).await?;
    fetch_preference_items_with_session(&session).await
}

async fn fetch_preference_items_with_session(session: &Arc<LazuriteOAuthSession>) -> Result<StoredPreferences> {
    let output = session
        .send(GetPreferences)
        .await
        .map_err(|error| {
            log::error!("fetch Preferences error: {error}");
            AppError::validation("fetch Preferences error")
        })?
        .into_output()
        .map_err(|error| {
            log::error!("fetch Preferences output error: {error}");
            AppError::validation("fetch Preferences output error")
        })?;

    Ok(output.preferences.into_iter().map(IntoStatic::into_static).collect())
}

fn accepts_empty_put_preferences_response(status: reqwest::StatusCode, body: &[u8]) -> bool {
    status.is_success() && body.is_empty()
}

fn accepts_empty_bookmark_response(status: reqwest::StatusCode, body: &[u8]) -> bool {
    status.is_success() && body.is_empty()
}

async fn store_preference_items(session: &Arc<LazuriteOAuthSession>, items: StoredPreferences) -> Result<()> {
    let response = session
        .send(PutPreferences::new().preferences(items).build())
        .await
        .map_err(|error| {
            log::error!("putPreferences error: {error}");
            AppError::validation("putPreferences error")
        })?;

    if accepts_empty_put_preferences_response(response.status(), response.buffer()) {
        return Ok(());
    }

    response.into_output().map_err(|error| {
        log::error!("putPreferences output error: {error}");
        AppError::validation("putPreferences output error")
    })?;

    Ok(())
}

fn build_saved_feeds_preference_item(feeds: Vec<SavedFeedItem>) -> PreferencesItem<'static> {
    let items = feeds
        .into_iter()
        .map(|feed| {
            SavedFeed::new()
                .id(feed.id)
                .r#type(match feed.r#type.as_str() {
                    "timeline" => SavedFeedType::Timeline,
                    "feed" => SavedFeedType::Feed,
                    "list" => SavedFeedType::List,
                    _ => SavedFeedType::Other(feed.r#type.into()),
                })
                .value(feed.value)
                .pinned(feed.pinned)
                .build()
        })
        .collect::<Vec<_>>();

    PreferencesItem::SavedFeedsPrefV2(Box::new(SavedFeedsPrefV2Builder::new().items(items).build()))
}

fn build_feed_view_pref_item(pref: FeedViewPrefItem) -> PreferencesItem<'static> {
    PreferencesItem::FeedViewPref(Box::new(FeedViewPref {
        feed: pref.feed.into(),
        hide_quote_posts: Some(pref.hide_quote_posts),
        hide_replies: Some(pref.hide_replies),
        hide_replies_by_like_count: pref.hide_replies_by_like_count,
        hide_replies_by_unfollowed: Some(pref.hide_replies_by_unfollowed),
        hide_reposts: Some(pref.hide_reposts),
        extra_data: Default::default(),
    }))
}

fn merge_saved_feeds_preferences(preferences: StoredPreferences, feeds: Vec<SavedFeedItem>) -> StoredPreferences {
    let mut merged = preferences
        .into_iter()
        .filter(|item| {
            !matches!(
                item,
                PreferencesItem::SavedFeedsPref(_) | PreferencesItem::SavedFeedsPrefV2(_)
            )
        })
        .collect::<Vec<_>>();
    merged.push(build_saved_feeds_preference_item(feeds));
    merged
}

fn merge_feed_view_preferences(preferences: StoredPreferences, pref: FeedViewPrefItem) -> StoredPreferences {
    let feed = pref.feed.clone();
    let mut merged = preferences
        .into_iter()
        .filter(|item| match item {
            PreferencesItem::FeedViewPref(existing) => existing.feed.as_ref() != feed.as_str(),
            _ => true,
        })
        .collect::<Vec<_>>();
    merged.push(build_feed_view_pref_item(pref));
    merged
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct StrongRefInput {
    pub uri: String,
    pub cid: String,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ReplyRefInput {
    pub parent: StrongRefInput,
    pub root: StrongRefInput,
}

#[derive(Debug, Deserialize)]
#[serde(tag = "type", rename_all = "camelCase")]
pub enum EmbedInput {
    Record { record: StrongRefInput },
}

#[derive(Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CreateRecordResult {
    pub uri: String,
    pub cid: String,
}

const FOLLOW_COLLECTION_NSID: &str = "app.bsky.graph.follow";
const FOLLOW_HYGIENE_PROGRESS_EVENT: &str = "follow-hygiene:progress";
const FOLLOW_AUDIT_PAGE_LIMIT: i64 = 100;
const FOLLOW_AUDIT_PROFILE_BATCH_SIZE: usize = 25;
const FOLLOW_AUDIT_PROFILE_BATCH_CONCURRENCY: usize = 3;
const FOLLOW_AUDIT_INTER_BATCH_DELAY: Duration = Duration::from_millis(250);
const FOLLOW_AUDIT_RETRY_AFTER_DEFAULT: Duration = Duration::from_secs(2);
const FOLLOW_AUDIT_MAX_RATE_LIMIT_RETRIES: usize = 5;
const FOLLOW_UNFOLLOW_WRITE_CHUNK_SIZE: usize = 200;

const FOLLOW_STATUS_DELETED: u8 = 1 << 0;
const FOLLOW_STATUS_DEACTIVATED: u8 = 1 << 1;
const FOLLOW_STATUS_SUSPENDED: u8 = 1 << 2;
const FOLLOW_STATUS_BLOCKED_BY: u8 = 1 << 3;
const FOLLOW_STATUS_BLOCKING: u8 = 1 << 4;
const FOLLOW_STATUS_HIDDEN: u8 = 1 << 5;
const FOLLOW_STATUS_SELF_FOLLOW: u8 = 1 << 6;

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct FlaggedFollow {
    pub did: String,
    pub handle: String,
    pub follow_uri: String,
    pub status: u8,
    pub status_label: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct BatchResult {
    pub deleted: usize,
    pub failed: Vec<String>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct FollowHygieneProgress {
    batch_size: usize,
    current: usize,
    total: usize,
}

#[derive(Debug, Clone, PartialEq, Eq)]
struct FollowRecordEntry {
    did: String,
    follow_uri: String,
}

#[derive(Debug, Clone, PartialEq, Eq)]
struct FollowStatusInfo {
    handle: String,
    status: u8,
}

#[derive(Debug, Clone, PartialEq, Eq)]
struct FollowDeleteTarget {
    uri: String,
    rkey: String,
}

pub async fn get_preferences(state: &AppState) -> Result<UserPreferences> {
    let preferences = fetch_preference_items(state).await?;
    Ok(user_preferences_from_items(&preferences))
}

pub async fn get_feed_generators(uris: Vec<String>, state: &AppState) -> Result<serde_json::Value> {
    if uris.is_empty() {
        return Ok(serde_json::json!({ "feeds": [] }));
    }

    let session = get_session(state).await?;
    let parsed: std::result::Result<Vec<AtUri<'_>>, _> = uris.iter().map(|u| AtUri::new(u)).collect();
    let feeds = parsed.map_err(|error| {
        log::warn!("invalid feed URI in get_feed_generators input: {:?}", error);
        AppError::validation("invalid feed URI")
    })?;

    let output = session
        .send(GetFeedGenerators::new().feeds(feeds).build())
        .await
        .map_err(|error| {
            log::error!("getFeedGenerators error: {error}");
            AppError::validation("getFeedGenerators error")
        })?
        .into_output()
        .map_err(|error| {
            log::error!("getFeedGenerators output error: {error}");
            AppError::validation("getFeedGenerators output error")
        })?;

    serde_json::to_value(&output).map_err(AppError::from)
}

pub async fn get_timeline(cursor: Option<String>, limit: u32, state: &AppState) -> Result<serde_json::Value> {
    let session = get_session(state).await?;
    let mut req = GetTimeline::new().limit(limit as i64);
    if let Some(c) = &cursor {
        req = req.cursor(Some(c.into()));
    }

    let output = session
        .send(req.build())
        .await
        .map_err(|error| {
            log::error!("getTimeline error: {error}");
            AppError::validation("getTimeline")
        })?
        .into_output()
        .map_err(|error| {
            log::error!("getTimeline output error: {error}");
            AppError::validation("getTimeline output")
        })?;

    serde_json::to_value(&output).map_err(AppError::from)
}

pub async fn get_feed(uri: String, cursor: Option<String>, limit: u32, state: &AppState) -> Result<serde_json::Value> {
    let session = get_session(state).await?;
    let feed_uri = AtUri::new(&uri).map_err(|_| AppError::validation("invalid feed URI"))?;
    let mut req = GetFeed::new().feed(feed_uri).limit(limit as i64);
    if let Some(c) = &cursor {
        req = req.cursor(Some(c.into()));
    }

    let output = session
        .send(req.build())
        .await
        .map_err(|error| {
            log::error!("getFeed error: {error}");
            AppError::validation("getFeed")
        })?
        .into_output()
        .map_err(|error| {
            log::error!("getFeed output error: {error}");
            AppError::validation("getFeed output")
        })?;

    serde_json::to_value(&output).map_err(AppError::from)
}

pub async fn get_list_feed(
    uri: String, cursor: Option<String>, limit: u32, state: &AppState,
) -> Result<serde_json::Value> {
    let session = get_session(state).await?;
    let list_uri = AtUri::new(&uri).map_err(|_| AppError::validation("invalid list URI"))?;
    let mut req = GetListFeed::new().list(list_uri).limit(limit as i64);
    if let Some(c) = &cursor {
        req = req.cursor(Some(c.into()));
    }

    let output = session
        .send(req.build())
        .await
        .map_err(|error| {
            log::error!("getListFeed error: {error}");
            AppError::validation("getListFeed")
        })?
        .into_output()
        .map_err(|error| {
            log::error!("getListFeed output error: {error}");
            AppError::validation("getListFeed output")
        })?;

    serde_json::to_value(&output).map_err(AppError::from)
}

pub async fn get_post_thread(uri: String, state: &AppState) -> Result<serde_json::Value> {
    let session = get_session(state).await?;
    let post_uri = AtUri::new(&uri).map_err(|_| AppError::validation("invalid post URI"))?;

    let output = session
        .send(GetPostThread::new().uri(post_uri).build())
        .await
        .map_err(|error| {
            log::error!("getPostThread error: {error}");
            AppError::validation("getPostThread")
        })?
        .into_output()
        .map_err(|error| {
            log::error!("getPostThread output error: {error}");
            AppError::validation("getPostThread output")
        })?;

    serde_json::to_value(&output).map_err(AppError::from)
}

pub async fn get_profile(actor: String, state: &AppState) -> Result<serde_json::Value> {
    let session = get_session(state).await?;
    let requested_actor = actor.trim().to_string();
    let (did, handle) = requested_actor_hints(&requested_actor);
    let actor = parse_actor_identifier(&actor)?;

    let output = match session.send(GetProfile::new().actor(actor).build()).await {
        Ok(output) => output,
        Err(error) => {
            log::error!("getProfile error: {error}");
            if let Some(reason) = classify_actor_unavailability(&error) {
                return serde_json::to_value(ProfileLookupResult::Unavailable {
                    requested_actor,
                    did,
                    handle,
                    reason,
                    message: actor_unavailable_message(reason).to_string(),
                })
                .map_err(AppError::from);
            }

            return Err(AppError::validation("Couldn't load this profile right now."));
        }
    };
    let output = match output.into_output() {
        Ok(output) => output,
        Err(error) => {
            log::error!("getProfile output error: {error}");
            if let Some(reason) = classify_actor_unavailability(&error) {
                return serde_json::to_value(ProfileLookupResult::Unavailable {
                    requested_actor,
                    did,
                    handle,
                    reason,
                    message: actor_unavailable_message(reason).to_string(),
                })
                .map_err(AppError::from);
            }

            return Err(AppError::validation("Couldn't load this profile right now."));
        }
    };

    serde_json::to_value(ProfileLookupResult::Available { profile: serde_json::to_value(output.value)? })
        .map_err(AppError::from)
}

pub async fn get_author_feed(
    actor: String, cursor: Option<String>, limit: Option<u32>, state: &AppState,
) -> Result<serde_json::Value> {
    let session = get_session(state).await?;
    let actor = parse_actor_identifier(&actor)?;
    let mut req = GetAuthorFeed::new().actor(actor).limit(limit.map(|value| value as i64));
    if let Some(c) = &cursor {
        req = req.cursor(Some(c.as_str().into()));
    }

    let output = session
        .send(req.build())
        .await
        .map_err(|error| {
            log::error!("getAuthorFeed error: {error}");
            AppError::validation("getAuthorFeed")
        })?
        .into_output()
        .map_err(|error| {
            log::error!("getAuthorFeed output error: {error}");
            AppError::validation("getAuthorFeed output")
        })?;

    serde_json::to_value(&output).map_err(AppError::from)
}

pub async fn get_actor_likes(
    actor: String, cursor: Option<String>, limit: Option<u32>, state: &AppState,
) -> Result<serde_json::Value> {
    let session = get_session(state).await?;
    let actor = parse_actor_identifier(&actor)?;
    let mut req = GetActorLikes::new().actor(actor).limit(limit.map(|value| value as i64));
    if let Some(c) = &cursor {
        req = req.cursor(Some(c.as_str().into()));
    }

    let output = session
        .send(req.build())
        .await
        .map_err(|error| {
            log::error!("getActorLikes error: {error}");
            AppError::validation("getActorLikes")
        })?
        .into_output()
        .map_err(|error| {
            log::error!("getActorLikes output error: {error}");
            AppError::validation("getActorLikes output")
        })?;

    serde_json::to_value(&output).map_err(AppError::from)
}

pub async fn create_post(
    text: String, reply_to: Option<ReplyRefInput>, embed: Option<EmbedInput>, state: &AppState,
) -> Result<CreateRecordResult> {
    if text.trim().is_empty() && embed.is_none() {
        return Err(AppError::validation("post requires text or embed"));
    }

    let session = get_session(state).await?;
    let did = active_did(state)?;

    let resolver = JacquardResolver::default();
    let rich = richtext::parse(&text).build_async(&resolver).await.map_err(|error| {
        log::error!("richtext parse error: {error}");
        AppError::validation("failed to parse post text")
    })?;

    let mut post = Post::new().text(rich.text).created_at(Datetime::now());

    if let Some(facets) = rich.facets {
        post = post.facets(facets);
    }

    if let Some(reply) = reply_to {
        let reply_ref = ReplyRef::new()
            .parent(strong_ref_from_input(&reply.parent)?)
            .root(strong_ref_from_input(&reply.root)?)
            .build();
        post = post.reply(reply_ref);
    }

    if let Some(embed) = embed {
        post = post.embed(post_embed_from_input(embed)?);
    }

    let record_json = serde_json::to_value(post.build())?;
    let record_data = Data::from_json_owned(record_json).map_err(|_| AppError::validation("serialize post"))?;

    let repo = AtIdentifier::Did(Did::new(&did)?);
    let collection = Nsid::new("app.bsky.feed.post").map_err(|_| AppError::validation("nsid"))?;

    let output = session
        .send(
            CreateRecord::new()
                .repo(repo)
                .collection(collection)
                .record(record_data)
                .build(),
        )
        .await
        .map_err(|error| {
            log::error!("createRecord (post) error: {error}");
            AppError::validation("failed to create record (post)")
        })?
        .into_output()
        .map_err(|error| {
            log::error!("createRecord (post) output error: {error}");
            AppError::validation("failed to create record (post) output")
        })?;

    Ok(CreateRecordResult { uri: output.uri.to_string(), cid: output.cid.to_string() })
}

pub async fn like_post(uri: String, cid: String, state: &AppState) -> Result<CreateRecordResult> {
    let session = get_session(state).await?;
    let did = active_did(state)?;

    let subject = StrongRef::new()
        .uri(AtUri::new(&uri).map_err(|_| AppError::validation("invalid post URI"))?)
        .cid(Cid::str(&cid))
        .build();

    let like = Like::new().created_at(Datetime::now()).subject(subject).build();

    let record_json = serde_json::to_value(&like)?;
    let record_data = Data::from_json_owned(record_json).map_err(|_| AppError::validation("serialize like"))?;

    let repo = AtIdentifier::Did(Did::new(&did)?);
    let collection = Nsid::new("app.bsky.feed.like").map_err(|_| AppError::validation("nsid"))?;

    let output = session
        .send(
            CreateRecord::new()
                .repo(repo)
                .collection(collection)
                .record(record_data)
                .build(),
        )
        .await
        .map_err(|error| {
            log::error!("createRecord (like) error: {error}");
            AppError::validation("failed to create record (like)")
        })?
        .into_output()
        .map_err(|error| {
            log::error!("createRecord (like) output error: {error}");
            AppError::validation("failed to create record (like) output")
        })?;

    Ok(CreateRecordResult { uri: output.uri.to_string(), cid: output.cid.to_string() })
}

pub async fn unlike_post(like_uri: String, state: &AppState) -> Result<()> {
    let session = get_session(state).await?;
    let did = active_did(state)?;

    let at_uri = AtUri::new(&like_uri).map_err(|_| AppError::validation("invalid like URI"))?;
    let RecordKey(rkey) = at_uri
        .rkey()
        .ok_or_else(|| AppError::Validation("like URI has no rkey".into()))?;
    let rkey_str = rkey.to_string();

    let repo = AtIdentifier::Did(Did::new(&did)?);
    let collection = Nsid::new("app.bsky.feed.like").map_err(|_| AppError::validation("nsid"))?;
    let rkey = RecordKey::any(&rkey_str).map_err(|_| AppError::validation("invalid rkey"))?;

    session
        .send(DeleteRecord::new().repo(repo).collection(collection).rkey(rkey).build())
        .await
        .map_err(|error| {
            log::error!("deleteRecord (unlike) error: {error}");
            AppError::validation("failed to delete record (unlike)")
        })?
        .into_output()
        .map_err(|error| {
            log::error!("deleteRecord (unlike) output error: {error}");
            AppError::validation("failed to delete record (unlike) output")
        })?;

    Ok(())
}

pub async fn repost(uri: String, cid: String, state: &AppState) -> Result<CreateRecordResult> {
    let session = get_session(state).await?;
    let did = active_did(state)?;

    let subject = StrongRef::new()
        .uri(AtUri::new(&uri).map_err(|_| AppError::validation("invalid post URI"))?)
        .cid(Cid::str(&cid))
        .build();

    let repost = Repost::new().created_at(Datetime::now()).subject(subject).build();

    let record_json = serde_json::to_value(&repost)?;
    let record_data = Data::from_json_owned(record_json).map_err(|_| AppError::validation("serialize repost"))?;

    let repo = AtIdentifier::Did(Did::new(&did)?);
    let collection = Nsid::new("app.bsky.feed.repost").map_err(|_| AppError::validation("nsid"))?;

    let output = session
        .send(
            CreateRecord::new()
                .repo(repo)
                .collection(collection)
                .record(record_data)
                .build(),
        )
        .await
        .map_err(|error| {
            log::error!("createRecord (repost) error: {error}");
            AppError::validation("failed to create record (repost)")
        })?
        .into_output()
        .map_err(|error| {
            log::error!("createRecord (repost) output error: {error}");
            AppError::validation("failed to create record (repost) output")
        })?;

    Ok(CreateRecordResult { uri: output.uri.to_string(), cid: output.cid.to_string() })
}

pub async fn unrepost(repost_uri: String, state: &AppState) -> Result<()> {
    let session = get_session(state).await?;
    let did = active_did(state)?;

    let at_uri = AtUri::new(&repost_uri).map_err(|_| AppError::validation("invalid repost URI"))?;
    let RecordKey(rkey) = at_uri
        .rkey()
        .ok_or_else(|| AppError::Validation("repost URI has no rkey".into()))?;

    let rkey_str = rkey.to_string();

    let repo = AtIdentifier::Did(Did::new(&did)?);
    let collection = Nsid::new("app.bsky.feed.repost").map_err(|_| AppError::validation("nsid"))?;
    let rkey = RecordKey::any(&rkey_str).map_err(|_| AppError::validation("invalid rkey"))?;

    session
        .send(DeleteRecord::new().repo(repo).collection(collection).rkey(rkey).build())
        .await
        .map_err(|error| {
            log::error!("deleteRecord (unrepost) error: {error}");
            AppError::validation("failed to delete record (unrepost)")
        })?
        .into_output()
        .map_err(|error| {
            log::error!("deleteRecord (unrepost) output error: {error}");
            AppError::validation("failed to delete record (unrepost) output")
        })?;

    Ok(())
}

pub async fn bookmark_post(uri: String, cid: String, state: &AppState) -> Result<()> {
    let session = get_session(state).await?;
    let post_uri = AtUri::new(&uri).map_err(|_| AppError::validation("invalid post URI"))?;

    let response = session
        .send(CreateBookmark::new().uri(post_uri).cid(Cid::str(&cid)).build())
        .await
        .map_err(|error| {
            log::error!("createBookmark error: {error}");
            AppError::validation("Could not save this post.")
        })?;

    if accepts_empty_bookmark_response(response.status(), response.buffer()) {
        return Ok(());
    }

    response.into_output().map_err(|error| {
        log::error!("createBookmark output error: {error}");
        AppError::validation("Could not save this post.")
    })?;

    Ok(())
}

pub async fn remove_bookmark(uri: String, state: &AppState) -> Result<()> {
    let session = get_session(state).await?;
    let post_uri = AtUri::new(&uri).map_err(|_| AppError::validation("invalid post URI"))?;

    let response = session
        .send(DeleteBookmark::new().uri(post_uri).build())
        .await
        .map_err(|error| {
            log::error!("deleteBookmark error: {error}");
            AppError::validation("Could not remove this saved post.")
        })?;

    if accepts_empty_bookmark_response(response.status(), response.buffer()) {
        return Ok(());
    }

    response.into_output().map_err(|error| {
        log::error!("deleteBookmark output error: {error}");
        AppError::validation("Could not remove this saved post.")
    })?;

    Ok(())
}

pub async fn follow_actor(did: String, state: &AppState) -> Result<CreateRecordResult> {
    let session = get_session(state).await?;
    let active_did = active_did(state)?;

    let follow = Follow::new()
        .created_at(Datetime::now())
        .subject(Did::new(&did)?)
        .build();

    let record_json = serde_json::to_value(&follow)?;
    let record_data = Data::from_json_owned(record_json).map_err(|_| AppError::validation("serialize follow"))?;

    let repo = AtIdentifier::Did(Did::new(&active_did)?);
    let collection = Nsid::new("app.bsky.graph.follow").map_err(|_| AppError::validation("nsid"))?;

    let output = session
        .send(
            CreateRecord::new()
                .repo(repo)
                .collection(collection)
                .record(record_data)
                .build(),
        )
        .await
        .map_err(|error| {
            log::error!("createRecord (follow) error: {error}");
            AppError::validation("Could not follow this account.")
        })?
        .into_output()
        .map_err(|error| {
            log::error!("createRecord (follow) output error: {error}");
            AppError::validation("Could not follow this account.")
        })?;

    Ok(CreateRecordResult { uri: output.uri.to_string(), cid: output.cid.to_string() })
}

pub async fn block_actor(did: String, state: &AppState) -> Result<CreateRecordResult> {
    let session = get_session(state).await?;
    let active_did = active_did(state)?;

    let block = Block::new()
        .created_at(Datetime::now())
        .subject(Did::new(&did).map_err(|_| AppError::validation("invalid account DID"))?)
        .build();

    let record_json = serde_json::to_value(&block)?;
    let record_data = Data::from_json_owned(record_json).map_err(|_| AppError::validation("serialize block"))?;

    let repo = AtIdentifier::Did(Did::new(&active_did)?);
    let collection = Nsid::new("app.bsky.graph.block").map_err(|_| AppError::validation("nsid"))?;

    let output = session
        .send(
            CreateRecord::new()
                .repo(repo)
                .collection(collection)
                .record(record_data)
                .build(),
        )
        .await
        .map_err(|error| {
            log::error!("createRecord (block) error: {error}");
            AppError::validation("Could not block this account.")
        })?
        .into_output()
        .map_err(|error| {
            log::error!("createRecord (block) output error: {error}");
            AppError::validation("Could not block this account.")
        })?;

    Ok(CreateRecordResult { uri: output.uri.to_string(), cid: output.cid.to_string() })
}

pub async fn unfollow_actor(follow_uri: String, state: &AppState) -> Result<()> {
    let session = get_session(state).await?;
    let did = active_did(state)?;

    let at_uri = AtUri::new(&follow_uri).map_err(|_| AppError::validation("invalid follow URI"))?;
    let RecordKey(rkey) = at_uri
        .rkey()
        .ok_or_else(|| AppError::Validation("follow URI has no rkey".into()))?;
    let rkey_str = rkey.to_string();

    let repo = AtIdentifier::Did(Did::new(&did)?);
    let collection = Nsid::new("app.bsky.graph.follow").map_err(|_| AppError::validation("nsid"))?;
    let rkey = RecordKey::any(&rkey_str).map_err(|_| AppError::validation("invalid rkey"))?;

    session
        .send(DeleteRecord::new().repo(repo).collection(collection).rkey(rkey).build())
        .await
        .map_err(|error| {
            log::error!("deleteRecord (unfollow) error: {error}");
            AppError::validation("Could not unfollow this account.")
        })?
        .into_output()
        .map_err(|error| {
            log::error!("deleteRecord (unfollow) output error: {error}");
            AppError::validation("Could not unfollow this account.")
        })?;

    Ok(())
}

pub async fn get_followers(
    actor: String, cursor: Option<String>, limit: Option<u32>, state: &AppState,
) -> Result<serde_json::Value> {
    let session = get_session(state).await?;
    let actor = parse_actor_identifier(&actor)?;
    let mut req = GetFollowers::new().actor(actor).limit(limit.map(|value| value as i64));
    if let Some(c) = &cursor {
        req = req.cursor(Some(c.as_str().into()));
    }

    let output = session
        .send(req.build())
        .await
        .map_err(|error| {
            log::error!("getFollowers error: {error}");
            AppError::validation("Could not load followers.")
        })?
        .into_output()
        .map_err(|error| {
            log::error!("getFollowers output error: {error}");
            AppError::validation("Could not load followers.")
        })?;

    serde_json::to_value(&output).map_err(AppError::from)
}

pub async fn get_follows(
    actor: String, cursor: Option<String>, limit: Option<u32>, state: &AppState,
) -> Result<serde_json::Value> {
    let session = get_session(state).await?;
    let actor = parse_actor_identifier(&actor)?;
    let mut req = GetFollows::new().actor(actor).limit(limit.map(|value| value as i64));
    if let Some(c) = &cursor {
        req = req.cursor(Some(c.as_str().into()));
    }

    let output = session
        .send(req.build())
        .await
        .map_err(|error| {
            log::error!("getFollows error: {error}");
            AppError::validation("Could not load following.")
        })?
        .into_output()
        .map_err(|error| {
            log::error!("getFollows output error: {error}");
            AppError::validation("Could not load following.")
        })?;

    serde_json::to_value(&output).map_err(AppError::from)
}

pub async fn audit_follows(app: &AppHandle, state: &AppState) -> Result<Vec<FlaggedFollow>> {
    let session = get_session(state).await?;
    let active_did = active_did(state)?;
    let follow_records = list_follow_records_for_audit(&session, &active_did).await?;
    if follow_records.is_empty() {
        return Ok(Vec::new());
    }

    let dids = follow_records
        .iter()
        .map(|record| record.did.clone())
        .collect::<Vec<_>>();
    let unique_dids = dedupe_preserve_order(dids);
    let follow_statuses = resolve_follow_statuses(&session, app, &active_did, unique_dids).await?;

    Ok(follow_records
        .into_iter()
        .filter_map(|record| {
            follow_statuses
                .get(&record.did)
                .map(|status| build_flagged_follow(record, status.clone()))
        })
        .collect())
}

pub async fn batch_unfollow(follow_uris: Vec<String>, state: &AppState) -> Result<BatchResult> {
    let session = get_session(state).await?;
    let active_did = active_did(state)?;

    if follow_uris.is_empty() {
        return Ok(BatchResult { deleted: 0, failed: Vec::new() });
    }

    let mut targets = Vec::new();
    let mut failed = Vec::new();

    for uri in follow_uris {
        match parse_follow_delete_target(&uri) {
            Ok(target) => targets.push(target),
            Err(reason) => {
                log::warn!("skipping invalid follow URI for batch unfollow: {uri} ({reason})");
                failed.push(uri);
            }
        }
    }

    let mut deleted = 0usize;
    for chunk in targets.chunks(FOLLOW_UNFOLLOW_WRITE_CHUNK_SIZE) {
        let (writes, chunk_uris, chunk_failed) = build_delete_writes(chunk);
        failed.extend(chunk_failed);

        if writes.is_empty() {
            continue;
        }

        match send_apply_writes_chunk_with_retry(&session, &active_did, writes).await {
            Ok(output) => {
                let (chunk_deleted, chunk_failures) = summarize_apply_writes_result(&chunk_uris, &output);
                deleted += chunk_deleted;
                failed.extend(chunk_failures);
            }
            Err(error) => {
                log::warn!(
                    "applyWrites failed for unfollow batch ({} items): {error}",
                    chunk_uris.len()
                );
                failed.extend(chunk_uris);
            }
        }
    }

    Ok(BatchResult { deleted, failed })
}

async fn list_follow_records_for_audit(
    session: &Arc<LazuriteOAuthSession>, active_did: &str,
) -> Result<Vec<FollowRecordEntry>> {
    let mut records = Vec::new();
    let mut cursor = None;

    loop {
        let output = list_follow_records_page_with_retry(session, active_did, cursor.clone()).await?;
        for record in output.records {
            if let Some(entry) = follow_record_entry_from_list_record(&record) {
                records.push(entry);
            }
        }

        cursor = output.cursor.map(|value| value.to_string());
        if cursor.is_none() {
            break;
        }

        sleep(FOLLOW_AUDIT_INTER_BATCH_DELAY).await;
    }

    Ok(records)
}

async fn list_follow_records_page_with_retry(
    session: &Arc<LazuriteOAuthSession>, active_did: &str, cursor: Option<String>,
) -> Result<ListRecordsOutput<'static>> {
    let repo = AtIdentifier::Did(Did::new(active_did)?.into_static());
    let collection = Nsid::new(FOLLOW_COLLECTION_NSID)
        .map_err(|_| AppError::validation("invalid follow collection NSID"))?
        .into_static();
    let mut retries = 0usize;

    loop {
        let response = session
            .send(
                ListRecords::new()
                    .repo(repo.clone())
                    .collection(collection.clone())
                    .limit(FOLLOW_AUDIT_PAGE_LIMIT)
                    .maybe_cursor(cursor.as_deref().map(Into::into))
                    .build(),
            )
            .await
            .map_err(|error| {
                log::error!("follow hygiene listRecords request failed: {error}");
                AppError::validation("Couldn't scan your follows right now.")
            })?;

        if response.status() == StatusCode::TOO_MANY_REQUESTS {
            retries += 1;
            if retries > FOLLOW_AUDIT_MAX_RATE_LIMIT_RETRIES {
                log::warn!("follow hygiene listRecords exceeded max rate-limit retries");
                return Err(AppError::validation("Couldn't scan your follows right now."));
            }

            let delay = retry_after_delay(response.buffer()).unwrap_or(FOLLOW_AUDIT_RETRY_AFTER_DEFAULT);
            log::warn!(
                "follow hygiene listRecords rate-limited (attempt {retries}/{}), retrying in {}s",
                FOLLOW_AUDIT_MAX_RATE_LIMIT_RETRIES,
                delay.as_secs()
            );
            sleep(delay).await;
            continue;
        }

        return response.into_output().map(IntoStatic::into_static).map_err(|error| {
            log::error!("follow hygiene listRecords output decode failed: {error}");
            AppError::validation("Couldn't scan your follows right now.")
        });
    }
}

async fn resolve_follow_statuses(
    session: &Arc<LazuriteOAuthSession>, app: &AppHandle, active_did: &str, dids: Vec<String>,
) -> Result<HashMap<String, FollowStatusInfo>> {
    let mut resolved = HashMap::new();
    if dids.is_empty() {
        return Ok(resolved);
    }

    let chunks = dids
        .chunks(FOLLOW_AUDIT_PROFILE_BATCH_SIZE)
        .map(|chunk| chunk.to_vec())
        .collect::<Vec<_>>();
    let total_batches = chunks.len();
    let semaphore = Arc::new(Semaphore::new(FOLLOW_AUDIT_PROFILE_BATCH_CONCURRENCY));
    let mut join_set = JoinSet::new();

    for did_chunk in chunks {
        let session = session.clone();
        let semaphore = semaphore.clone();
        join_set.spawn(async move {
            let _permit = semaphore.acquire_owned().await.map_err(|error| {
                log::error!("follow hygiene semaphore acquisition failed: {error}");
                AppError::validation("Couldn't scan your follows right now.")
            })?;
            let profiles = get_profiles_batch_with_retry(&session, &did_chunk).await?;
            sleep(FOLLOW_AUDIT_INTER_BATCH_DELAY).await;
            Ok::<(Vec<String>, Vec<ProfileViewDetailed<'static>>), AppError>((did_chunk, profiles))
        });
    }

    let mut missing = dids.into_iter().collect::<HashSet<_>>();
    let mut completed = 0usize;

    while let Some(joined) = join_set.join_next().await {
        let (requested_dids, profiles) = joined.map_err(|error| {
            log::error!("follow hygiene profile batch task failed: {error}");
            AppError::validation("Couldn't scan your follows right now.")
        })??;
        let mut found_dids = HashSet::new();

        for profile in profiles {
            let did = profile.did.to_string();
            found_dids.insert(did.clone());
            let status = follow_status_from_profile(&profile, active_did);
            if status != 0 {
                resolved.insert(
                    did.clone(),
                    FollowStatusInfo { handle: profile.handle.to_string(), status },
                );
            }
            missing.remove(&did);
        }

        for did in requested_dids {
            if !found_dids.contains(&did) {
                missing.insert(did);
            } else {
                missing.remove(&did);
            }
        }

        completed += 1;
        app.emit(
            FOLLOW_HYGIENE_PROGRESS_EVENT,
            FollowHygieneProgress {
                batch_size: FOLLOW_AUDIT_PROFILE_BATCH_SIZE,
                current: completed,
                total: total_batches,
            },
        )?;
    }

    for did in dedupe_preserve_order(missing.into_iter().collect()) {
        if let Some(status) = resolve_missing_follow_status(session, &did, active_did).await {
            resolved.insert(did, status);
        }
    }

    Ok(resolved)
}

async fn get_profiles_batch_with_retry(
    session: &Arc<LazuriteOAuthSession>, dids: &[String],
) -> Result<Vec<ProfileViewDetailed<'static>>> {
    let actors = dids
        .iter()
        .map(|did| Did::new(did).map(|parsed| AtIdentifier::Did(parsed.into_static())))
        .collect::<std::result::Result<Vec<_>, _>>()?;
    let mut retries = 0usize;

    loop {
        let response = session
            .send(GetProfiles::new().actors(actors.clone()).build())
            .await
            .map_err(|error| {
                log::error!("follow hygiene getProfiles request failed: {error}");
                AppError::validation("Couldn't scan your follows right now.")
            })?;

        if response.status() == StatusCode::TOO_MANY_REQUESTS {
            retries += 1;
            if retries > FOLLOW_AUDIT_MAX_RATE_LIMIT_RETRIES {
                log::warn!("follow hygiene getProfiles exceeded max rate-limit retries");
                return Err(AppError::validation("Couldn't scan your follows right now."));
            }

            let delay = retry_after_delay(response.buffer()).unwrap_or(FOLLOW_AUDIT_RETRY_AFTER_DEFAULT);
            log::warn!(
                "follow hygiene getProfiles rate-limited (attempt {retries}/{}), retrying in {}s",
                FOLLOW_AUDIT_MAX_RATE_LIMIT_RETRIES,
                delay.as_secs()
            );
            sleep(delay).await;
            continue;
        }

        let output = response.into_output().map_err(|error| {
            log::error!("follow hygiene getProfiles output decode failed: {error}");
            AppError::validation("Couldn't scan your follows right now.")
        })?;
        return Ok(output.profiles.into_iter().map(IntoStatic::into_static).collect());
    }
}

async fn resolve_missing_follow_status(
    session: &Arc<LazuriteOAuthSession>, did: &str, active_did: &str,
) -> Option<FollowStatusInfo> {
    let did_value = Did::new(did).ok()?.into_static();
    let self_follow = if did == active_did { FOLLOW_STATUS_SELF_FOLLOW } else { 0 };

    match get_profile_for_did_with_retry(session, &did_value).await {
        Ok(profile) => {
            let status = follow_status_from_profile(&profile, active_did);
            if status == 0 {
                None
            } else {
                Some(FollowStatusInfo { handle: profile.handle.to_string(), status })
            }
        }
        Err(error_message) => {
            let mut status = follow_status_from_unavailability_reason(classify_actor_unavailability(&error_message));
            status |= self_follow;

            if status == 0 {
                log::warn!("follow hygiene missing DID fallback unclassified for {did}: {error_message}");
                return None;
            }

            let handle = resolve_handle_from_did_document(session, &did_value)
                .await
                .unwrap_or_else(|| did.to_string());
            Some(FollowStatusInfo { handle, status })
        }
    }
}

async fn get_profile_for_did_with_retry(
    session: &Arc<LazuriteOAuthSession>, did: &Did<'_>,
) -> std::result::Result<ProfileViewDetailed<'static>, String> {
    let actor = AtIdentifier::Did(did.clone().into_static());
    let mut retries = 0usize;

    loop {
        let response = session
            .send(GetProfile::new().actor(actor.clone()).build())
            .await
            .map_err(|error| error.to_string())?;

        if response.status() == StatusCode::TOO_MANY_REQUESTS {
            retries += 1;
            if retries > FOLLOW_AUDIT_MAX_RATE_LIMIT_RETRIES {
                return Err("rate limit retries exhausted".into());
            }

            let delay = retry_after_delay(response.buffer()).unwrap_or(FOLLOW_AUDIT_RETRY_AFTER_DEFAULT);
            log::warn!(
                "follow hygiene getProfile rate-limited for {} (attempt {retries}/{}), retrying in {}s",
                did.as_ref(),
                FOLLOW_AUDIT_MAX_RATE_LIMIT_RETRIES,
                delay.as_secs()
            );
            sleep(delay).await;
            continue;
        }

        let output = response.into_output().map_err(|error| error.to_string())?;
        return Ok(output.value.into_static());
    }
}

async fn resolve_handle_from_did_document(session: &Arc<LazuriteOAuthSession>, did: &Did<'_>) -> Option<String> {
    let did_doc = session.resolve_did_doc(did).await.ok()?.into_owned().ok()?;

    did_doc.also_known_as.as_ref().and_then(|aliases| {
        aliases.iter().find_map(|alias| {
            alias
                .as_ref()
                .strip_prefix("at://")
                .and_then(|candidate| Handle::new(candidate).ok().map(|handle| handle.to_string()))
        })
    })
}

fn follow_status_from_unavailability_reason(reason: Option<ActorAvailabilityReason>) -> u8 {
    match reason {
        Some(ActorAvailabilityReason::NotFound) => FOLLOW_STATUS_DELETED,
        Some(ActorAvailabilityReason::Deactivated) => FOLLOW_STATUS_DEACTIVATED,
        Some(ActorAvailabilityReason::Suspended) => FOLLOW_STATUS_SUSPENDED,
        _ => 0,
    }
}

fn follow_status_from_profile(profile: &ProfileViewDetailed<'_>, active_did: &str) -> u8 {
    let mut status = 0u8;

    if profile.did.as_ref() == active_did {
        status |= FOLLOW_STATUS_SELF_FOLLOW;
    }

    if profile
        .viewer
        .as_ref()
        .and_then(|viewer| viewer.blocked_by)
        .unwrap_or(false)
    {
        status |= FOLLOW_STATUS_BLOCKED_BY;
    }

    let is_blocking = profile
        .viewer
        .as_ref()
        .and_then(|viewer| viewer.blocking.as_ref())
        .is_some()
        || profile
            .viewer
            .as_ref()
            .and_then(|viewer| viewer.blocking_by_list.as_ref())
            .is_some();
    if is_blocking {
        status |= FOLLOW_STATUS_BLOCKING;
    }

    if has_active_hide_label(profile.labels.as_deref()) {
        status |= FOLLOW_STATUS_HIDDEN;
    }

    status
}

fn has_active_hide_label(labels: Option<&[Label<'_>]>) -> bool {
    labels.is_some_and(|labels| {
        labels
            .iter()
            .any(|label| label.val.as_ref() == "!hide" && !label.neg.unwrap_or(false))
    })
}

fn build_flagged_follow(record: FollowRecordEntry, status: FollowStatusInfo) -> FlaggedFollow {
    FlaggedFollow {
        did: record.did,
        handle: status.handle,
        follow_uri: record.follow_uri,
        status: status.status,
        status_label: follow_status_label(status.status),
    }
}

fn follow_status_label(status: u8) -> String {
    if status == 0 {
        return "Unknown".to_string();
    }

    let mut labels = Vec::new();

    if status & FOLLOW_STATUS_DELETED != 0 {
        labels.push("Deleted");
    }
    if status & FOLLOW_STATUS_DEACTIVATED != 0 {
        labels.push("Deactivated");
    }
    if status & FOLLOW_STATUS_SUSPENDED != 0 {
        labels.push("Suspended");
    }

    let has_blocked_by = status & FOLLOW_STATUS_BLOCKED_BY != 0;
    let has_blocking = status & FOLLOW_STATUS_BLOCKING != 0;
    if has_blocked_by && has_blocking {
        labels.push("Mutual Block");
    } else if has_blocked_by {
        labels.push("Blocked By");
    } else if has_blocking {
        labels.push("Blocking");
    }

    if status & FOLLOW_STATUS_HIDDEN != 0 {
        labels.push("Hidden");
    }
    if status & FOLLOW_STATUS_SELF_FOLLOW != 0 {
        labels.push("Self-Follow");
    }

    labels.join(", ")
}

fn follow_record_entry_from_list_record(record: &RepoListRecord<'_>) -> Option<FollowRecordEntry> {
    let follow_uri = record.uri.to_string();
    let did = match record.value.get_at_path("subject").and_then(Data::as_str) {
        Some(subject) => match Did::new(subject) {
            Ok(did) => did.to_string(),
            Err(error) => {
                log::warn!("follow hygiene skipped invalid follow subject DID in {follow_uri}: {error}");
                return None;
            }
        },
        None => {
            log::warn!("follow hygiene skipped follow record with missing subject in {follow_uri}");
            return None;
        }
    };

    Some(FollowRecordEntry { did, follow_uri })
}

fn retry_after_delay(buffer: &[u8]) -> Option<Duration> {
    let payload = serde_json::from_slice::<serde_json::Value>(buffer).ok();
    if let Some(seconds) = payload
        .as_ref()
        .and_then(|value| value.get("retryAfter"))
        .and_then(serde_json::Value::as_u64)
    {
        return Some(Duration::from_secs(seconds));
    }

    let text = payload
        .as_ref()
        .and_then(|value| value.get("message"))
        .and_then(serde_json::Value::as_str)
        .or_else(|| std::str::from_utf8(buffer).ok())
        .unwrap_or_default();

    let lowered = text.to_ascii_lowercase();
    for marker in ["retry-after", "retry after", "retry_after"] {
        if let Some(index) = lowered.find(marker) {
            let seconds = lowered[index..]
                .chars()
                .skip_while(|ch| !ch.is_ascii_digit())
                .take_while(char::is_ascii_digit)
                .collect::<String>()
                .parse::<u64>()
                .ok()?;
            return Some(Duration::from_secs(seconds));
        }
    }

    None
}

fn parse_follow_delete_target(uri: &str) -> std::result::Result<FollowDeleteTarget, &'static str> {
    let at_uri = AtUri::new(uri).map_err(|_| "invalid URI")?;
    let collection = at_uri.collection().map(|value| value.to_string());
    if collection.as_deref() != Some(FOLLOW_COLLECTION_NSID) {
        return Err("URI does not point to follow collection");
    }

    let rkey = at_uri
        .rkey()
        .map(|value| value.as_ref().to_string())
        .ok_or("URI missing rkey")?;

    Ok(FollowDeleteTarget { uri: uri.to_string(), rkey })
}

fn build_delete_writes(
    targets: &[FollowDeleteTarget],
) -> (Vec<ApplyWritesWritesItem<'static>>, Vec<String>, Vec<String>) {
    let mut writes = Vec::with_capacity(targets.len());
    let mut chunk_uris = Vec::with_capacity(targets.len());
    let mut chunk_failed = Vec::new();
    let collection = match Nsid::new(FOLLOW_COLLECTION_NSID) {
        Ok(collection) => collection.into_static(),
        Err(_) => {
            return (
                writes,
                chunk_uris,
                targets.iter().map(|target| target.uri.clone()).collect(),
            )
        }
    };

    for target in targets {
        let rkey = match RecordKey::any(&target.rkey) {
            Ok(rkey) => rkey.into_static(),
            Err(error) => {
                log::warn!("failed to parse follow rkey from URI {}: {error}", target.uri);
                chunk_failed.push(target.uri.clone());
                continue;
            }
        };

        writes.push(ApplyWritesWritesItem::Delete(Box::new(
            Delete::new().collection(collection.clone()).rkey(rkey).build(),
        )));
        chunk_uris.push(target.uri.clone());
    }

    (writes, chunk_uris, chunk_failed)
}

fn summarize_apply_writes_result(chunk_uris: &[String], output: &ApplyWritesOutput<'_>) -> (usize, Vec<String>) {
    let Some(results) = output.results.as_ref() else {
        return (chunk_uris.len(), Vec::new());
    };

    let mut deleted = 0usize;
    let mut failed = Vec::new();

    for (idx, uri) in chunk_uris.iter().enumerate() {
        match results.get(idx) {
            Some(ApplyWritesOutputResultsItem::DeleteResult(_)) => deleted += 1,
            _ => failed.push(uri.clone()),
        }
    }

    (deleted, failed)
}

async fn send_apply_writes_chunk_with_retry(
    session: &Arc<LazuriteOAuthSession>, active_did: &str, writes: Vec<ApplyWritesWritesItem<'static>>,
) -> Result<ApplyWritesOutput<'static>> {
    let repo = AtIdentifier::Did(Did::new(active_did)?.into_static());
    let mut retries = 0usize;

    loop {
        let response = session
            .send(ApplyWrites::new().repo(repo.clone()).writes(writes.clone()).build())
            .await
            .map_err(|error| {
                log::warn!("follow hygiene applyWrites request failed: {error}");
                AppError::validation("Couldn't unfollow selected accounts right now.")
            })?;

        if response.status() == StatusCode::TOO_MANY_REQUESTS {
            retries += 1;
            if retries > FOLLOW_AUDIT_MAX_RATE_LIMIT_RETRIES {
                return Err(AppError::validation("Couldn't unfollow selected accounts right now."));
            }

            let delay = retry_after_delay(response.buffer()).unwrap_or(FOLLOW_AUDIT_RETRY_AFTER_DEFAULT);
            log::warn!(
                "follow hygiene applyWrites rate-limited (attempt {retries}/{}), retrying in {}s",
                FOLLOW_AUDIT_MAX_RATE_LIMIT_RETRIES,
                delay.as_secs()
            );
            sleep(delay).await;
            continue;
        }

        return response.into_output().map(IntoStatic::into_static).map_err(|error| {
            log::warn!("follow hygiene applyWrites output decode failed: {error}");
            AppError::validation("Couldn't unfollow selected accounts right now.")
        });
    }
}

fn dedupe_preserve_order(values: Vec<String>) -> Vec<String> {
    let mut seen = HashSet::new();
    values.into_iter().filter(|value| seen.insert(value.clone())).collect()
}

fn strong_ref_from_input(input: &StrongRefInput) -> Result<StrongRef<'static>> {
    Ok(StrongRef::new()
        .uri(
            AtUri::new(&input.uri)
                .map_err(|_| AppError::validation("invalid URI in StrongRef"))?
                .into_static(),
        )
        .cid(Cid::from(input.cid.clone()).into_static())
        .build())
}

fn post_embed_from_input(input: EmbedInput) -> Result<PostEmbed<'static>> {
    match input {
        EmbedInput::Record { record } => Ok(PostEmbed::Record(Box::new(
            Record::new().record(strong_ref_from_input(&record)?).build(),
        ))),
    }
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct UpdateSavedFeedsInput {
    pub feeds: Vec<SavedFeedItem>,
}

pub async fn update_saved_feeds(input: UpdateSavedFeedsInput, state: &AppState) -> Result<()> {
    let session = get_session(state).await?;
    let preferences = fetch_preference_items_with_session(&session).await?;
    let merged = merge_saved_feeds_preferences(preferences, input.feeds);
    store_preference_items(&session, merged).await
}

pub async fn update_feed_view_pref(pref: FeedViewPrefItem, state: &AppState) -> Result<()> {
    let session = get_session(state).await?;
    let preferences = fetch_preference_items_with_session(&session).await?;
    let merged = merge_feed_view_preferences(preferences, pref);
    store_preference_items(&session, merged).await
}

#[cfg(test)]
mod tests {
    use super::{
        accepts_empty_bookmark_response, accepts_empty_put_preferences_response, build_delete_writes,
        follow_status_from_profile, follow_status_label, merge_feed_view_preferences, merge_saved_feeds_preferences,
        parse_follow_delete_target, retry_after_delay, summarize_apply_writes_result, user_preferences_from_items,
        FeedViewPrefItem, FollowDeleteTarget, SavedFeedItem, FOLLOW_STATUS_BLOCKED_BY, FOLLOW_STATUS_BLOCKING,
        FOLLOW_STATUS_HIDDEN, FOLLOW_STATUS_SELF_FOLLOW,
    };
    use jacquard::api::app_bsky::actor::ProfileViewDetailed;
    use jacquard::api::app_bsky::actor::{AdultContentPref, FeedViewPref, PreferencesItem};
    use jacquard::api::app_bsky::richtext::facet::FacetFeaturesItem;
    use jacquard::api::com_atproto::repo::apply_writes::{
        ApplyWritesOutput, ApplyWritesOutputResultsItem, DeleteResult,
    };
    use jacquard::richtext;
    use jacquard::types::aturi::AtUri;
    use jacquard::types::did::Did;
    use jacquard::types::handle::Handle;
    use jacquard::IntoStatic;
    use reqwest::StatusCode;
    use std::time::Duration;

    fn adult_content_pref_item() -> PreferencesItem<'static> {
        PreferencesItem::AdultContentPref(Box::new(AdultContentPref::new().enabled(true).build()))
    }

    fn feed_view_pref_item(feed: &str, hide_reposts: bool) -> PreferencesItem<'static> {
        PreferencesItem::FeedViewPref(Box::new(FeedViewPref {
            feed: feed.to_owned().into(),
            hide_quote_posts: Some(false),
            hide_replies: Some(false),
            hide_replies_by_like_count: None,
            hide_replies_by_unfollowed: Some(true),
            hide_reposts: Some(hide_reposts),
            extra_data: Default::default(),
        }))
    }

    #[test]
    fn merging_saved_feeds_preserves_other_preferences() {
        let preferences = vec![adult_content_pref_item(), feed_view_pref_item("following", true)];
        let merged = merge_saved_feeds_preferences(
            preferences,
            vec![SavedFeedItem {
                id: "following".into(),
                r#type: "timeline".into(),
                value: "following".into(),
                pinned: true,
            }],
        );

        assert!(merged
            .iter()
            .any(|item| matches!(item, PreferencesItem::AdultContentPref(_))));
        assert!(merged
            .iter()
            .any(|item| matches!(item, PreferencesItem::FeedViewPref(_))));

        let user_preferences = user_preferences_from_items(&merged);
        assert_eq!(user_preferences.saved_feeds.len(), 1);
        assert_eq!(user_preferences.feed_view_prefs.len(), 1);
        assert!(user_preferences.feed_view_prefs[0].hide_reposts);
    }

    #[test]
    fn merging_feed_view_pref_replaces_only_matching_feed() {
        let preferences = vec![
            adult_content_pref_item(),
            feed_view_pref_item("following", true),
            feed_view_pref_item("at://feed/custom", false),
        ];
        let merged = merge_feed_view_preferences(
            preferences,
            FeedViewPrefItem {
                feed: "following".into(),
                hide_replies: true,
                hide_replies_by_unfollowed: false,
                hide_replies_by_like_count: Some(4),
                hide_reposts: false,
                hide_quote_posts: true,
            },
        );

        let user_preferences = user_preferences_from_items(&merged);
        assert_eq!(user_preferences.feed_view_prefs.len(), 2);

        let following = user_preferences
            .feed_view_prefs
            .iter()
            .find(|pref| pref.feed == "following")
            .expect("following pref should exist");
        assert!(!following.hide_reposts);
        assert!(following.hide_quote_posts);
        assert_eq!(following.hide_replies_by_like_count, Some(4));

        let custom = user_preferences
            .feed_view_prefs
            .iter()
            .find(|pref| pref.feed == "at://feed/custom")
            .expect("custom pref should exist");
        assert!(!custom.hide_quote_posts);
        assert!(!custom.hide_replies);
    }

    #[test]
    fn empty_success_put_preferences_response_is_treated_as_valid() {
        assert!(accepts_empty_put_preferences_response(StatusCode::OK, b""));
        assert!(!accepts_empty_put_preferences_response(StatusCode::OK, b"null"));
        assert!(!accepts_empty_put_preferences_response(StatusCode::BAD_REQUEST, b""));
    }

    #[test]
    fn empty_success_bookmark_response_is_treated_as_valid() {
        assert!(accepts_empty_bookmark_response(StatusCode::OK, b""));
        assert!(!accepts_empty_bookmark_response(StatusCode::OK, b"{}"));
        assert!(!accepts_empty_bookmark_response(StatusCode::BAD_REQUEST, b""));
    }

    #[test]
    fn follow_status_label_collapses_mutual_block() {
        let status = FOLLOW_STATUS_BLOCKED_BY | FOLLOW_STATUS_BLOCKING | FOLLOW_STATUS_HIDDEN;
        assert_eq!(follow_status_label(status), "Mutual Block, Hidden");
    }

    #[test]
    fn follow_status_from_profile_sets_expected_flags() {
        let mut viewer = jacquard::api::app_bsky::actor::ViewerState::default();
        viewer.blocked_by = Some(true);
        viewer.blocking = Some(
            AtUri::new("at://did:plc:me/app.bsky.graph.block/abc123")
                .expect("uri should parse")
                .into_static(),
        );

        let profile = ProfileViewDetailed::new()
            .did(Did::new("did:plc:alice").expect("did should parse").into_static())
            .handle(Handle::new("alice.test").expect("handle should parse").into_static())
            .viewer(Some(viewer))
            .build();

        let status = follow_status_from_profile(&profile, "did:plc:alice");

        assert_ne!(status & FOLLOW_STATUS_BLOCKED_BY, 0);
        assert_ne!(status & FOLLOW_STATUS_BLOCKING, 0);
        assert_ne!(status & FOLLOW_STATUS_SELF_FOLLOW, 0);
    }

    #[test]
    fn parse_follow_delete_target_rejects_invalid_inputs() {
        assert!(parse_follow_delete_target("at://did:plc:alice/app.bsky.graph.follow/abc123").is_ok());
        assert!(parse_follow_delete_target("at://did:plc:alice/app.bsky.feed.like/abc123").is_err());
        assert!(parse_follow_delete_target("at://did:plc:alice/app.bsky.graph.follow").is_err());
        assert!(parse_follow_delete_target("not-a-uri").is_err());
    }

    #[test]
    fn build_delete_writes_skips_invalid_rkeys() {
        let targets = vec![
            FollowDeleteTarget { uri: "at://did:plc:alice/app.bsky.graph.follow/abc123".into(), rkey: "abc123".into() },
            FollowDeleteTarget { uri: "at://did:plc:alice/app.bsky.graph.follow/bad".into(), rkey: "bad key".into() },
        ];

        let (writes, chunk_uris, failed) = build_delete_writes(&targets);
        assert_eq!(writes.len(), 1);
        assert_eq!(chunk_uris, vec!["at://did:plc:alice/app.bsky.graph.follow/abc123"]);
        assert_eq!(failed, vec!["at://did:plc:alice/app.bsky.graph.follow/bad"]);
    }

    #[test]
    fn summarize_apply_writes_result_handles_missing_entries_as_failures() {
        let output: ApplyWritesOutput<'_> = ApplyWritesOutput {
            results: Some(vec![ApplyWritesOutputResultsItem::DeleteResult(Box::new(
                DeleteResult::default(),
            ))]),
            ..Default::default()
        };
        let chunk_uris = vec![
            "at://did:plc:a/app.bsky.graph.follow/1".to_string(),
            "at://did:plc:b/app.bsky.graph.follow/2".to_string(),
        ];

        let (deleted, failed) = summarize_apply_writes_result(&chunk_uris, &output);
        assert_eq!(deleted, 1);
        assert_eq!(failed, vec!["at://did:plc:b/app.bsky.graph.follow/2"]);
    }

    #[test]
    fn summarize_apply_writes_result_treats_missing_results_as_all_successful() {
        let output: ApplyWritesOutput<'_> = ApplyWritesOutput::default();
        let chunk_uris = vec![
            "at://did:plc:a/app.bsky.graph.follow/1".to_string(),
            "at://did:plc:b/app.bsky.graph.follow/2".to_string(),
        ];

        let (deleted, failed) = summarize_apply_writes_result(&chunk_uris, &output);
        assert_eq!(deleted, 2);
        assert!(failed.is_empty());
    }

    #[test]
    fn retry_after_delay_reads_numeric_seconds_from_payload() {
        let body = br#"{"message":"rate limited, retry after 7 seconds"}"#;
        assert_eq!(retry_after_delay(body), Some(Duration::from_secs(7)));

        assert_eq!(retry_after_delay(br#"{"message":"slow down"}"#), None);
    }

    #[test]
    fn richtext_parse_converts_markdown_links_into_plain_text_and_link_facets() {
        let rich = tokio::runtime::Runtime::new()
            .expect("tokio runtime should build")
            .block_on(async {
                richtext::parse("[example](https://example.com)")
                    .build_async(&super::JacquardResolver::default())
                    .await
            })
            .expect("richtext should build");

        assert_eq!(rich.text.as_ref(), "example");
        let facets = rich.facets.expect("markdown link should create a facet");
        assert_eq!(facets.len(), 1);
        assert_eq!(facets[0].index.byte_start, 0);
        assert_eq!(facets[0].index.byte_end, 7);

        match &facets[0].features[0] {
            FacetFeaturesItem::Link(link) => assert_eq!(link.uri.as_ref(), "https://example.com"),
            other => panic!("expected link facet, got {other:?}"),
        }
    }

    #[test]
    fn richtext_parse_keeps_other_facets_after_markdown_link_normalization() {
        let rich = tokio::runtime::Runtime::new()
            .expect("tokio runtime should build")
            .block_on(async {
                richtext::parse("[example](https://example.com) #rust https://docs.rs @did:plc:alice")
                    .build_async(&super::JacquardResolver::default())
                    .await
            })
            .expect("richtext should build");

        assert_eq!(rich.text.as_ref(), "example #rust https://docs.rs @did:plc:alice");
        let facets = rich.facets.expect("text should produce facets");

        assert_eq!(facets.len(), 4);
        assert!(matches!(facets[0].features[0], FacetFeaturesItem::Link(_)));
        assert!(matches!(facets[1].features[0], FacetFeaturesItem::Tag(_)));
        assert!(matches!(facets[2].features[0], FacetFeaturesItem::Link(_)));
        assert!(matches!(facets[3].features[0], FacetFeaturesItem::Mention(_)));
    }

    #[test]
    fn richtext_parse_leaves_invalid_markdown_link_syntax_unchanged() {
        let rich = tokio::runtime::Runtime::new()
            .expect("tokio runtime should build")
            .block_on(async {
                richtext::parse("[broken](not a url")
                    .build_async(&super::JacquardResolver::default())
                    .await
            })
            .expect("richtext should build");

        assert_eq!(rich.text.as_ref(), "[broken](not a url");
        assert!(rich.facets.is_none(), "invalid markdown should not produce facets");
    }
}

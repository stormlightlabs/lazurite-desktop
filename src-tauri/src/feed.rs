use super::auth::LazuriteOAuthSession;
use super::error::{AppError, Result};
use super::state::AppState;
use jacquard::api::app_bsky::actor::get_preferences::GetPreferences;
use jacquard::api::app_bsky::actor::get_profile::GetProfile;
use jacquard::api::app_bsky::actor::put_preferences::PutPreferences;
use jacquard::api::app_bsky::actor::{
    FeedViewPref, PreferencesItem, SavedFeed, SavedFeedType, SavedFeedsPrefV2, SavedFeedsPrefV2Builder,
};
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
use jacquard::api::com_atproto::repo::create_record::CreateRecord;
use jacquard::api::com_atproto::repo::delete_record::DeleteRecord;
use jacquard::api::com_atproto::repo::strong_ref::StrongRef;
use jacquard::identity::JacquardResolver;
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
use serde::{Deserialize, Serialize};
use std::sync::Arc;
use tauri_plugin_log::log;

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
        .map_err(|error| {
            log::error!("sessions poisoned: {error}");
            AppError::StatePoisoned("sessions")
        })?
        .get(&did)
        .cloned()
        .ok_or_else(|| {
            log::error!("session not found for active account");
            AppError::Validation("session not found for active account".into())
        })
}

fn active_did(state: &AppState) -> Result<String> {
    state
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
        })
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

async fn store_preference_items(session: &Arc<LazuriteOAuthSession>, items: StoredPreferences) -> Result<()> {
    let response = session
        .send(PutPreferences::new().preferences(items).build())
        .await
        .map_err(|error| {
            log::error!("putPreferences error: {error}");
            AppError::validation("putPreferences error")
        })?;

    // Bluesky may return a 200 with no body for putPreferences. jacquard's default
    // unit decoder still tries to parse JSON, which raises an EOF on successful writes.
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
    let actor = parse_actor_identifier(&actor)?;

    let output = session
        .send(GetProfile::new().actor(actor).build())
        .await
        .map_err(|error| {
            log::error!("getProfile error: {error}");
            AppError::validation("getProfile")
        })?
        .into_output()
        .map_err(|error| {
            log::error!("getProfile output error: {error}");
            AppError::validation("getProfile output")
        })?;

    serde_json::to_value(output.value).map_err(AppError::from)
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
        accepts_empty_put_preferences_response, merge_feed_view_preferences, merge_saved_feeds_preferences,
        user_preferences_from_items, FeedViewPrefItem, SavedFeedItem,
    };
    use jacquard::api::app_bsky::actor::{AdultContentPref, FeedViewPref, PreferencesItem};
    use reqwest::StatusCode;

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
}

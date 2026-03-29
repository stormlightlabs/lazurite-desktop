use super::auth::LazuriteOAuthSession;
use super::error::{AppError, Result};
use super::state::AppState;
use jacquard::api::app_bsky::actor::get_preferences::GetPreferences;
use jacquard::api::app_bsky::actor::put_preferences::PutPreferences;
use jacquard::api::app_bsky::actor::{
    FeedViewPref, PreferencesItem, SavedFeed, SavedFeedType, SavedFeedsPrefV2, SavedFeedsPrefV2Builder,
};
use jacquard::api::app_bsky::embed::record::Record;
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
use jacquard::types::ident::AtIdentifier;
use jacquard::types::nsid::Nsid;
use jacquard::types::recordkey::RecordKey;
use jacquard::types::value::Data;
use jacquard::xrpc::XrpcClient;
use jacquard::IntoStatic;
use serde::{Deserialize, Serialize};
use std::sync::Arc;

async fn get_session(state: &AppState) -> Result<Arc<LazuriteOAuthSession>> {
    let did = state
        .active_session
        .read()
        .map_err(|_| AppError::StatePoisoned("active_session"))?
        .as_ref()
        .ok_or_else(|| AppError::Validation("no active account".into()))?
        .did
        .clone();

    state
        .sessions
        .read()
        .map_err(|_| AppError::StatePoisoned("sessions"))?
        .get(&did)
        .cloned()
        .ok_or_else(|| AppError::Validation("session not found for active account".into()))
}

fn active_did(state: &AppState) -> Result<String> {
    state
        .active_session
        .read()
        .map_err(|_| AppError::StatePoisoned("active_session"))?
        .as_ref()
        .ok_or_else(|| AppError::Validation("no active account".into()))
        .map(|s| s.did.clone())
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
    let session = get_session(state).await?;
    let output = session
        .send(GetPreferences)
        .await
        .map_err(|_| AppError::validation("getPreferences"))?
        .into_output()
        .map_err(|_| AppError::validation("getPreferences output"))?;

    let mut saved_feeds = Vec::new();
    let mut feed_view_prefs = Vec::new();

    for item in &output.preferences {
        match item {
            PreferencesItem::SavedFeedsPrefV2(pref) => {
                saved_feeds = extract_saved_feeds(pref);
            }
            PreferencesItem::FeedViewPref(pref) => {
                feed_view_prefs.push(extract_feed_view_pref(pref));
            }
            _ => {}
        }
    }

    Ok(UserPreferences { saved_feeds, feed_view_prefs })
}

pub async fn get_feed_generators(uris: Vec<String>, state: &AppState) -> Result<serde_json::Value> {
    if uris.is_empty() {
        return Ok(serde_json::json!({ "feeds": [] }));
    }

    let session = get_session(state).await?;
    let parsed: std::result::Result<Vec<AtUri<'_>>, _> = uris.iter().map(|u| AtUri::new(u)).collect();
    let feeds = parsed.map_err(|_| AppError::validation("invalid feed URI"))?;

    let output = session
        .send(GetFeedGenerators::new().feeds(feeds).build())
        .await
        .map_err(|_| AppError::validation("getFeedGenerators"))?
        .into_output()
        .map_err(|_| AppError::validation("getFeedGenerators output"))?;

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
        .map_err(|_| AppError::validation("getTimeline"))?
        .into_output()
        .map_err(|_| AppError::validation("getTimeline output"))?;

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
        .map_err(|_| AppError::validation("getFeed"))?
        .into_output()
        .map_err(|_| AppError::validation("getFeed output"))?;

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
        .map_err(|_| AppError::validation("getListFeed"))?
        .into_output()
        .map_err(|_| AppError::validation("getListFeed output"))?;

    serde_json::to_value(&output).map_err(AppError::from)
}

pub async fn get_post_thread(uri: String, state: &AppState) -> Result<serde_json::Value> {
    let session = get_session(state).await?;
    let post_uri = AtUri::new(&uri).map_err(|_| AppError::validation("invalid post URI"))?;

    let output = session
        .send(GetPostThread::new().uri(post_uri).build())
        .await
        .map_err(|_| AppError::validation("getPostThread"))?
        .into_output()
        .map_err(|_| AppError::validation("getPostThread output"))?;

    serde_json::to_value(&output).map_err(AppError::from)
}

pub async fn get_author_feed(did: String, cursor: Option<String>, state: &AppState) -> Result<serde_json::Value> {
    let session = get_session(state).await?;
    let actor = AtIdentifier::Did(Did::new(&did)?);
    let mut req = GetAuthorFeed::new().actor(actor);
    if let Some(c) = &cursor {
        req = req.cursor(Some(c.as_str().into()));
    }

    let output = session
        .send(req.build())
        .await
        .map_err(|_| AppError::validation("getAuthorFeed"))?
        .into_output()
        .map_err(|_| AppError::validation("getAuthorFeed output"))?;

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
    let rich = richtext::parse(&text)
        .build_async(&resolver)
        .await
        .map_err(|_| AppError::validation("richtext parse"))?;

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
        .map_err(|_| AppError::validation("createRecord (post)"))?
        .into_output()
        .map_err(|_| AppError::validation("createRecord (post) output"))?;

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
        .map_err(|_| AppError::validation("createRecord (like)"))?
        .into_output()
        .map_err(|_| AppError::validation("createRecord (like) output"))?;

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
        .map_err(|_| AppError::validation("deleteRecord (unlike)"))?
        .into_output()
        .map_err(|_| AppError::validation("deleteRecord (unlike) output"))?;

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
        .map_err(|_| AppError::validation("createRecord (repost)"))?
        .into_output()
        .map_err(|_| AppError::validation("createRecord (repost) output"))?;

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
        .map_err(|_| AppError::validation("deleteRecord (unrepost)"))?
        .into_output()
        .map_err(|_| AppError::validation("deleteRecord (unrepost) output"))?;

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

    let items: Vec<SavedFeed<'_>> = input
        .feeds
        .into_iter()
        .map(|f| {
            SavedFeed::new()
                .id(f.id)
                .r#type(match f.r#type.as_str() {
                    "timeline" => SavedFeedType::Timeline,
                    "feed" => SavedFeedType::Feed,
                    "list" => SavedFeedType::List,
                    _ => SavedFeedType::Other(f.r#type.into()),
                })
                .value(f.value)
                .pinned(f.pinned)
                .build()
        })
        .collect();

    let saved_feeds_pref = Box::new(SavedFeedsPrefV2Builder::new().items(items).build());
    let pref_item = PreferencesItem::SavedFeedsPrefV2(saved_feeds_pref);

    session
        .send(PutPreferences::new().preferences(vec![pref_item]).build())
        .await
        .map_err(|_| AppError::validation("putPreferences"))?
        .into_output()
        .map_err(|_| AppError::validation("putPreferences output"))?;

    Ok(())
}

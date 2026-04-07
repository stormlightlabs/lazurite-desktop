import { getFeedCommand, parseFeedGeneratorsResponse, parseFeedResponse, parseThreadResponse } from "$/lib/feeds";
import type {
  CreateRecordResult,
  EmbedInput,
  FeedViewPrefItem,
  ReplyRefInput,
  SavedFeedItem,
  UserPreferences,
} from "$/lib/types";
import { invoke } from "@tauri-apps/api/core";

function getPreferences() {
  return invoke<UserPreferences>("get_preferences");
}

async function getFeedGenerators(uris: string[]) {
  return parseFeedGeneratorsResponse(await invoke("get_feed_generators", { uris }));
}

async function getFeedPage(feed: SavedFeedItem, cursor: string | null, limit: number) {
  const command = getFeedCommand(feed);
  return parseFeedResponse(await invoke(command.name, command.args(cursor, limit)));
}

async function getPostThread(uri: string) {
  return parseThreadResponse(await invoke("get_post_thread", { uri }));
}

function createPost(text: string, replyTo: ReplyRefInput | null, embed: EmbedInput | null) {
  return invoke<CreateRecordResult>("create_post", { embed, replyTo, text });
}

function likePost(uri: string, cid: string) {
  return invoke<CreateRecordResult>("like_post", { cid, uri });
}

function unlikePost(likeUri: string) {
  return invoke("unlike_post", { likeUri });
}

function repost(uri: string, cid: string) {
  return invoke<CreateRecordResult>("repost", { cid, uri });
}

function unrepost(repostUri: string) {
  return invoke("unrepost", { repostUri });
}

function bookmarkPost(uri: string, cid: string) {
  return invoke("bookmark_post", { cid, uri });
}

function removeBookmark(uri: string) {
  return invoke("remove_bookmark", { uri });
}

function updateSavedFeeds(feeds: SavedFeedItem[]) {
  return invoke("update_saved_feeds", { feeds });
}

function updateFeedViewPref(pref: FeedViewPrefItem) {
  return invoke("update_feed_view_pref", { pref });
}

export const FeedController = {
  getPreferences,
  getFeedGenerators,
  getFeedPage,
  getPostThread,
  createPost,
  likePost,
  unlikePost,
  repost,
  unrepost,
  bookmarkPost,
  removeBookmark,
  updateSavedFeeds,
  updateFeedViewPref,
};

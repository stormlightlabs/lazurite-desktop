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

export function getPreferences() {
  return invoke<UserPreferences>("get_preferences");
}

export async function getFeedGenerators(uris: string[]) {
  return parseFeedGeneratorsResponse(await invoke("get_feed_generators", { uris }));
}

export async function getFeedPage(feed: SavedFeedItem, cursor: string | null, limit: number) {
  const command = getFeedCommand(feed);
  return parseFeedResponse(await invoke(command.name, command.args(cursor, limit)));
}

export async function getPostThread(uri: string) {
  return parseThreadResponse(await invoke("get_post_thread", { uri }));
}

export function createPost(text: string, replyTo: ReplyRefInput | null, embed: EmbedInput | null) {
  return invoke<CreateRecordResult>("create_post", { embed, replyTo, text });
}

export function likePost(uri: string, cid: string) {
  return invoke<CreateRecordResult>("like_post", { cid, uri });
}

export function unlikePost(likeUri: string) {
  return invoke("unlike_post", { likeUri });
}

export function repost(uri: string, cid: string) {
  return invoke<CreateRecordResult>("repost", { cid, uri });
}

export function unrepost(repostUri: string) {
  return invoke("unrepost", { repostUri });
}

export function updateSavedFeeds(feeds: SavedFeedItem[]) {
  return invoke("update_saved_feeds", { feeds });
}

export function updateFeedViewPref(pref: FeedViewPrefItem) {
  return invoke("update_feed_view_pref", { pref });
}

import { parseProfile, parseProfileFeed } from "$/lib/profile";
import { invoke } from "@tauri-apps/api/core";

export async function getProfile(actor: string) {
  return parseProfile(await invoke("get_profile", { actor }));
}

export async function getAuthorFeed(actor: string, cursor?: string | null, limit?: number) {
  return parseProfileFeed(await invoke("get_author_feed", { actor, cursor: cursor ?? null, limit: limit ?? null }));
}

export async function getActorLikes(actor: string, cursor?: string | null, limit?: number) {
  return parseProfileFeed(await invoke("get_actor_likes", { actor, cursor: cursor ?? null, limit: limit ?? null }));
}

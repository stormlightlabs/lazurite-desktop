import { parseActorList, parseProfile, parseProfileFeed } from "$/lib/profile";
import type { CreateRecordResult } from "$/lib/types";
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

export async function followActor(did: string): Promise<CreateRecordResult> {
  return invoke("follow_actor", { did });
}

export async function unfollowActor(followUri: string): Promise<void> {
  return invoke("unfollow_actor", { followUri });
}

export async function getFollowers(actor: string, cursor?: string | null, limit?: number) {
  return parseActorList(
    await invoke("get_followers", { actor, cursor: cursor ?? null, limit: limit ?? null }),
    "followers",
  );
}

export async function getFollows(actor: string, cursor?: string | null, limit?: number) {
  return parseActorList(
    await invoke("get_follows", { actor, cursor: cursor ?? null, limit: limit ?? null }),
    "follows",
  );
}

import { parseActorList, parseProfileFeed, parseProfileResult } from "$/lib/profile";
import type { CreateRecordResult, ProfileLookupResult } from "$/lib/types";
import { invoke } from "@tauri-apps/api/core";

async function getProfile(actor: string): Promise<ProfileLookupResult> {
  return parseProfileResult(await invoke("get_profile", { actor }));
}

async function getAuthorFeed(actor: string, cursor?: string | null, limit?: number) {
  return parseProfileFeed(await invoke("get_author_feed", { actor, cursor: cursor ?? null, limit: limit ?? null }));
}

async function getActorLikes(actor: string, cursor?: string | null, limit?: number) {
  return parseProfileFeed(await invoke("get_actor_likes", { actor, cursor: cursor ?? null, limit: limit ?? null }));
}

async function followActor(did: string): Promise<CreateRecordResult> {
  return invoke("follow_actor", { did });
}

async function unfollowActor(followUri: string): Promise<void> {
  return invoke("unfollow_actor", { followUri });
}

async function getFollowers(actor: string, cursor?: string | null, limit?: number) {
  return parseActorList(
    await invoke("get_followers", { actor, cursor: cursor ?? null, limit: limit ?? null }),
    "followers",
  );
}

async function getFollows(actor: string, cursor?: string | null, limit?: number) {
  return parseActorList(
    await invoke("get_follows", { actor, cursor: cursor ?? null, limit: limit ?? null }),
    "follows",
  );
}

export const ProfileController = {
  getProfile,
  getAuthorFeed,
  getActorLikes,
  followActor,
  unfollowActor,
  getFollowers,
  getFollows,
};

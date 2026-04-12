import { parseFeedResponse } from "$/lib/feeds";
import { isReplyItem } from "$/lib/feeds/type-guards";
import { asModerationLabels } from "$/lib/moderation";
import type {
  ActorListResponse,
  FeedResponse,
  FeedViewPost,
  ProfileLookupResult,
  ProfileUnavailableReason,
  ProfileViewBasic,
  ProfileViewDetailed,
} from "$/lib/types";
import { asArray, asRecord, optionalNumber, optionalString } from "./type-guards";

export type ProfileTab = "posts" | "replies" | "media" | "likes" | "context";

export function buildProfileRoute(actor?: string | null) {
  const trimmed = actor?.trim();
  if (!trimmed) {
    return "/profile";
  }

  return `/profile/${encodeURIComponent(trimmed)}`;
}

export function decodeProfileRouteActor(value?: string | null) {
  if (!value) {
    return null;
  }

  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

export function getProfileRouteActor(actor: { did: string; handle?: string | null }) {
  return actor.handle?.trim() || actor.did;
}

function parseProfile(value: unknown): ProfileViewDetailed {
  const record = asRecord(value);
  if (!record || typeof record.did !== "string" || typeof record.handle !== "string") {
    throw new Error("profile payload is invalid");
  }

  const pinnedPost = asRecord(record.pinnedPost);

  return {
    avatar: optionalString(record.avatar),
    banner: optionalString(record.banner),
    createdAt: optionalString(record.createdAt),
    description: optionalString(record.description),
    did: record.did,
    displayName: optionalString(record.displayName),
    followersCount: optionalNumber(record.followersCount),
    followsCount: optionalNumber(record.followsCount),
    handle: record.handle,
    indexedAt: optionalString(record.indexedAt),
    labels: asModerationLabels(record),
    pinnedPost: pinnedPost && typeof pinnedPost.uri === "string"
      ? { cid: optionalString(pinnedPost.cid), uri: pinnedPost.uri }
      : null,
    postsCount: optionalNumber(record.postsCount),
    pronouns: optionalString(record.pronouns),
    viewer: parseProfileViewer(record.viewer),
    website: optionalString(record.website),
  };
}

export function parseProfileResult(value: unknown): ProfileLookupResult {
  const record = asRecord(value);
  if (!record || record.status === "available" && !asRecord(record.profile)) {
    throw new Error("profile result payload is invalid");
  }

  if (record.status === "available") {
    return { status: "available", profile: parseProfile(record.profile) };
  }

  if (
    record.status !== "unavailable"
    || typeof record.requestedActor !== "string"
    || typeof record.message !== "string"
    || !isProfileUnavailableReason(record.reason)
  ) {
    throw new Error("profile result payload is invalid");
  }

  return {
    status: "unavailable",
    requestedActor: record.requestedActor,
    did: optionalString(record.did),
    handle: optionalString(record.handle),
    reason: record.reason,
    message: record.message,
  };
}

export function parseProfileFeed(value: unknown): FeedResponse {
  return parseFeedResponse(value);
}

export function parseActorList(value: unknown, listKey: "followers" | "follows"): ActorListResponse {
  const record = asRecord(value);
  if (!record) {
    throw new Error("actor list payload is invalid");
  }

  const rawActors = asArray(record[listKey]) ?? [];
  const actors = rawActors.map((item) => parseProfileBasic(item)).filter(Boolean) as ProfileViewBasic[];

  return { cursor: optionalString(record.cursor), actors };
}

function parseProfileBasic(value: unknown): ProfileViewBasic | null {
  const record = asRecord(value);
  if (!record || typeof record.did !== "string" || typeof record.handle !== "string") {
    return null;
  }

  return {
    did: record.did,
    handle: record.handle,
    displayName: optionalString(record.displayName),
    avatar: optionalString(record.avatar),
    description: optionalString(record.description),
    labels: asModerationLabels(record),
    viewer: asRecord(record.viewer) ? { following: optionalString(asRecord(record.viewer)?.following) } : null,
  };
}

export function filterProfileFeed(items: FeedViewPost[], tab: ProfileTab) {
  switch (tab) {
    case "posts": {
      return items.filter((item) => !isReplyItem(item));
    }
    case "replies": {
      return items.filter((item) => isReplyItem(item));
    }
    case "media": {
      return items.filter((item) => !!item.post.embed);
    }
    case "context": {
      return [];
    }
    default: {
      return items;
    }
  }
}

function parseProfileViewer(value: unknown) {
  const record = asRecord(value);
  if (!record) {
    return null;
  }

  return {
    blockedBy: typeof record.blockedBy === "boolean" ? record.blockedBy : null,
    followedBy: optionalString(record.followedBy),
    following: optionalString(record.following),
    muted: typeof record.muted === "boolean" ? record.muted : null,
  };
}

function isProfileUnavailableReason(value: unknown): value is ProfileUnavailableReason {
  return value === "notFound" || value === "suspended" || value === "deactivated" || value === "unavailable";
}

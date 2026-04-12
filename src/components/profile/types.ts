import { buildProfileRoute } from "$/lib/profile";
import type { FlaggedFollow } from "$/lib/types";

export type StatusCategoryKey =
  | "deleted"
  | "deactivated"
  | "suspended"
  | "blockedBy"
  | "blocking"
  | "hidden"
  | "selfFollow";

export type StatusCategoryState = { visible: boolean; selected: boolean };

export const FOLLOW_STATUS_DELETED = Math.trunc(1);
export const FOLLOW_STATUS_DEACTIVATED = 1 << 1;
export const FOLLOW_STATUS_SUSPENDED = 1 << 2;
export const FOLLOW_STATUS_BLOCKED_BY = 1 << 3;
export const FOLLOW_STATUS_BLOCKING = 1 << 4;
export const FOLLOW_STATUS_HIDDEN = 1 << 5;
export const FOLLOW_STATUS_SELF_FOLLOW = 1 << 6;
export const EXIT_ANIMATION_MS = 220;

export const STATUS_CATEGORIES: Array<{ key: StatusCategoryKey; label: string; bit: number }> = [
  { key: "deleted", label: "Deleted", bit: FOLLOW_STATUS_DELETED },
  { key: "deactivated", label: "Deactivated", bit: FOLLOW_STATUS_DEACTIVATED },
  { key: "suspended", label: "Suspended", bit: FOLLOW_STATUS_SUSPENDED },
  { key: "blockedBy", label: "Blocked by", bit: FOLLOW_STATUS_BLOCKED_BY },
  { key: "blocking", label: "Blocking", bit: FOLLOW_STATUS_BLOCKING },
  { key: "hidden", label: "Hidden", bit: FOLLOW_STATUS_HIDDEN },
  { key: "selfFollow", label: "Self-follow", bit: FOLLOW_STATUS_SELF_FOLLOW },
];

export function hasStatus(status: number, bit: number) {
  return (status & bit) !== 0;
}

export function statusChipClass(status: number) {
  if (hasStatus(status, FOLLOW_STATUS_DELETED)) {
    return "bg-red-400/16 text-red-300";
  }
  if (hasStatus(status, FOLLOW_STATUS_DEACTIVATED)) {
    return "bg-yellow-400/16 text-yellow-300";
  }
  if (hasStatus(status, FOLLOW_STATUS_SUSPENDED)) {
    return "bg-orange-400/16 text-orange-300";
  }
  if (hasStatus(status, FOLLOW_STATUS_BLOCKED_BY) || hasStatus(status, FOLLOW_STATUS_BLOCKING)) {
    return "bg-violet-400/16 text-violet-300";
  }
  if (hasStatus(status, FOLLOW_STATUS_HIDDEN)) {
    return "bg-pink-400/16 text-pink-300";
  }
  return "bg-slate-400/16 text-slate-300";
}

export type FollowHygienePhase = "idle" | "scanning" | "ready" | "unfollowing" | "done";

export function getAtExplorerHref(follow: FlaggedFollow) {
  return `#/explorer?target=${encodeURIComponent(follow.followUri)}`;
}

export function displayHandle(follow: FlaggedFollow) {
  if (follow.handle.startsWith("did:")) {
    return follow.handle;
  }

  return `@${follow.handle.replace(/^@/, "")}`;
}

export function getProfileHref(follow: FlaggedFollow) {
  const actor = follow.handle.startsWith("did:") ? follow.did : follow.handle.replace(/^@/, "");
  return `#${buildProfileRoute(actor)}`;
}

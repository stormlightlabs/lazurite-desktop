import type { NormalizedEmbed } from "../feeds";
import { asRecord } from "../type-guards";
import type {
  BlockedPost,
  EmbedView,
  FeedReplyNode,
  FeedViewPost,
  Maybe,
  NotFoundPost,
  PostView,
  ProfileViewBasic,
  ThreadNode,
  ThreadViewPost,
} from "../types";

export function isPostView(value: unknown): value is PostView {
  const record = asRecord(value);
  const author = asRecord(record?.author);
  const postRecord = asRecord(record?.record);

  return !!record
    && !!author
    && !!postRecord
    && typeof record.cid === "string"
    && typeof record.indexedAt === "string"
    && typeof record.uri === "string"
    && isProfileViewBasic(author);
}

export function isFeedViewPost(value: unknown): value is FeedViewPost {
  const record = asRecord(value);
  return !!record && isPostView(record.post);
}

export function isThreadNode(value: unknown): value is ThreadNode {
  const record = asRecord(value);
  if (!record || typeof record.$type !== "string") {
    return false;
  }

  if (record.$type === "app.bsky.feed.defs#threadViewPost") {
    return isPostView(record.post);
  }

  return record.$type === "app.bsky.feed.defs#blockedPost" || record.$type === "app.bsky.feed.defs#notFoundPost";
}

export function isRepostReason(item: FeedViewPost) {
  return item.reason?.$type === "app.bsky.feed.defs#reasonRepost";
}

export function isQuoteEmbed(embed: Maybe<EmbedView>) {
  return embed?.$type === "app.bsky.embed.record#view" || embed?.$type === "app.bsky.embed.recordWithMedia#view";
}

export function isReplyItem(item: FeedViewPost) {
  if (item.reply) {
    return true;
  }

  const record = asRecord(item.post.record);
  return !!asRecord(record?.reply);
}

export function isReplyByUnfollowed(item: FeedViewPost) {
  return isReplyItem(item) && !item.post.author.viewer?.following;
}

export function isThreadViewPost(node: Maybe<ThreadNode>): node is ThreadViewPost {
  return !!node && node.$type === "app.bsky.feed.defs#threadViewPost";
}

export function isBlockedNode(node: Maybe<ThreadNode | FeedReplyNode>): node is BlockedPost {
  return !!node && node.$type === "app.bsky.feed.defs#blockedPost";
}

export function isNotFoundNode(node: Maybe<ThreadNode | FeedReplyNode>): node is NotFoundPost {
  return !!node && node.$type === "app.bsky.feed.defs#notFoundPost";
}

export function isProfileViewBasic(value: unknown): value is ProfileViewBasic {
  const record = asRecord(value);
  return !!record && typeof record.did === "string" && typeof record.handle === "string";
}

export function isNormalizedEmbed(value: unknown): value is NormalizedEmbed {
  if (!value || typeof value !== "object") {
    return false;
  }

  const kind = (value as { kind?: unknown }).kind;
  return kind === "external"
    || kind === "images"
    || kind === "record"
    || kind === "recordWithMedia"
    || kind === "recognized-unrenderable"
    || kind === "unknown"
    || kind === "video";
}

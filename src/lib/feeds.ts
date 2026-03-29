import type {
  BlockedPost,
  EmbedView,
  FeedReplyNode,
  FeedViewPost,
  FeedViewPrefItem,
  Maybe,
  NotFoundPost,
  PostRecord,
  PostView,
  ProfileViewBasic,
  SavedFeedItem,
  StrongRefInput,
  ThreadNode,
  ThreadViewPost,
} from "./types";

export const TIMELINE_ROUTE = "/timeline";

export const THREAD_ROUTE_BASE = "/timeline/thread";

export function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }

  return value as Record<string, unknown>;
}

export function asPostRecord(value: unknown): PostRecord {
  return (asRecord(value) ?? {}) as PostRecord;
}

export function getPostText(post: PostView) {
  const text = post.record.text;
  return typeof text === "string" ? text.trim() : "";
}

export function getPostCreatedAt(post: PostView) {
  const createdAt = post.record.createdAt;
  return typeof createdAt === "string" ? createdAt : post.indexedAt;
}

export function getDisplayName(author: ProfileViewBasic) {
  return author.displayName?.trim() || author.handle;
}

export function getAvatarLabel(author: ProfileViewBasic) {
  return getDisplayName(author).slice(0, 1).toUpperCase() || "?";
}

export function formatRelativeTime(value: string) {
  const timestamp = new Date(value).getTime();
  if (Number.isNaN(timestamp)) {
    return "";
  }

  const deltaSeconds = Math.round((timestamp - Date.now()) / 1000);
  const formatter = new Intl.RelativeTimeFormat(undefined, { numeric: "auto" });
  const ranges = [
    ["year", 60 * 60 * 24 * 365],
    ["month", 60 * 60 * 24 * 30],
    ["day", 60 * 60 * 24],
    ["hour", 60 * 60],
    ["minute", 60],
  ] as const;

  for (const [unit, seconds] of ranges) {
    if (Math.abs(deltaSeconds) >= seconds) {
      return formatter.format(Math.round(deltaSeconds / seconds), unit);
    }
  }

  return formatter.format(deltaSeconds, "second");
}

export function formatCount(value: Maybe<number>) {
  if (!value) {
    return "0";
  }

  if (value >= 1000) {
    return `${(value / 1000).toFixed(value >= 10_000 ? 0 : 1)}K`;
  }

  return value.toString();
}

export function getFeedName(item: { type: string; value: string }, hydratedName?: string | null) {
  if (item.type === "timeline") {
    return item.value === "following" ? "Following" : "Timeline";
  }

  if (hydratedName) {
    return hydratedName;
  }

  const segment = item.value.split("/").at(-1)?.trim();
  if (segment) {
    return segment.replaceAll("-", " ");
  }

  return item.type === "list" ? "List" : "Custom feed";
}

export function getFeedCommand(feed: SavedFeedItem) {
  if (feed.type === "timeline") {
    return { args: (cursor: string | null, limit: number) => ({ cursor, limit }), name: "get_timeline" as const };
  }

  if (feed.type === "list") {
    return {
      args: (cursor: string | null, limit: number) => ({ cursor, limit, uri: feed.value }),
      name: "get_list_feed" as const,
    };
  }

  return {
    args: (cursor: string | null, limit: number) => ({ cursor, limit, uri: feed.value }),
    name: "get_feed" as const,
  };
}

export function isRepostReason(item: FeedViewPost) {
  return item.reason?.$type === "app.bsky.feed.defs#reasonRepost";
}

export function isQuoteEmbed(embed: Maybe<EmbedView>) {
  return embed?.$type === "app.bsky.embed.record#view" || embed?.$type === "app.bsky.embed.recordWithMedia#view";
}

export function isReplyItem(item: FeedViewPost) {
  return !!item.reply;
}

export function getRootRef(item: FeedViewPost) {
  if (item.reply?.root.$type === "app.bsky.feed.defs#postView") {
    return toStrongRef(item.reply.root);
  }

  return toStrongRef(item.post);
}

export function getReplyRootPost(item: FeedViewPost) {
  if (item.reply?.root.$type === "app.bsky.feed.defs#postView") {
    return item.reply.root;
  }

  return item.post;
}

export function toStrongRef(post: PostView) {
  return { cid: post.cid, uri: post.uri } satisfies StrongRefInput;
}

export function canUseStrongRef(
  post: Maybe<FeedReplyNode | ThreadNode>,
): post is { $type: "app.bsky.feed.defs#postView" } & PostView {
  return !!post && "$type" in post && post.$type === "app.bsky.feed.defs#postView";
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

export function extractHashtags(posts: PostView[]) {
  const tags = new Set<string>();
  for (const post of posts) {
    for (const match of getPostText(post).matchAll(/#[\p{L}\p{N}_-]+/gu)) {
      tags.add(match[0]);
    }
  }

  return [...tags].toSorted((left, right) => left.localeCompare(right));
}

export function extractHandles(posts: PostView[], activeHandle: string | null) {
  const handles = new Set<string>();
  for (const post of posts) {
    if (post.author.handle) {
      handles.add(`@${post.author.handle.replace(/^@/, "")}`);
    }
  }

  if (activeHandle) {
    handles.add(`@${activeHandle.replace(/^@/, "")}`);
  }

  return [...handles].toSorted((left, right) => left.localeCompare(right));
}

export function applyFeedPreferences(items: FeedViewPost[], pref: FeedViewPrefItem) {
  return items.filter((item) => {
    if (pref.hideReposts && isRepostReason(item)) {
      return false;
    }

    if (pref.hideReplies && isReplyItem(item)) {
      return false;
    }

    if (pref.hideQuotePosts && isQuoteEmbed(item.post.embed)) {
      return false;
    }

    if (pref.hideRepliesByLikeCount && isReplyItem(item) && (item.post.likeCount ?? 0) < pref.hideRepliesByLikeCount) {
      return false;
    }

    return true;
  });
}

export function getQuotedRecord(embed: Maybe<EmbedView>) {
  if (!embed) {
    return null;
  }

  if (embed.$type === "app.bsky.embed.record#view") {
    return embed.record;
  }

  if (embed.$type === "app.bsky.embed.recordWithMedia#view") {
    return embed.record?.record ?? null;
  }

  return null;
}

export function getQuotedText(embed: Maybe<EmbedView>) {
  const record = getQuotedRecord(embed);
  return asRecord(record?.value)?.text;
}

export function getQuotedAuthor(embed: Maybe<EmbedView>) {
  return getQuotedRecord(embed)?.author ?? null;
}

export function patchFeedItems(items: FeedViewPost[], uri: string, updater: (post: PostView) => PostView) {
  return items.map((item) => (item.post.uri === uri ? { ...item, post: updater(item.post) } : item));
}

export function patchThreadNode(node: ThreadNode, uri: string, updater: (post: PostView) => PostView): ThreadNode {
  if (node.$type !== "app.bsky.feed.defs#threadViewPost") {
    return node;
  }

  return {
    ...node,
    parent: node.parent ? patchThreadNode(node.parent, uri, updater) : node.parent,
    post: node.post.uri === uri ? updater(node.post) : node.post,
    replies: node.replies?.map((reply) => patchThreadNode(reply, uri, updater)) ?? node.replies,
  };
}

export function findRootPost(node: ThreadNode | null): PostView | null {
  if (!node || !isThreadViewPost(node)) {
    return null;
  }

  if (node.parent && isThreadViewPost(node.parent)) {
    return findRootPost(node.parent) ?? node.post;
  }

  return node.post;
}

export function encodeThreadRouteUri(uri: string) {
  return encodeURIComponent(uri);
}

export function decodeThreadRouteUri(value: Maybe<string>) {
  if (!value) {
    return null;
  }

  if (value.startsWith("at://")) {
    return value;
  }

  try {
    const decoded = decodeURIComponent(value);
    return decoded.startsWith("at://") ? decoded : null;
  } catch {
    return null;
  }
}

export function buildThreadRoute(uri: string) {
  return `${THREAD_ROUTE_BASE}/${encodeThreadRouteUri(uri)}`;
}

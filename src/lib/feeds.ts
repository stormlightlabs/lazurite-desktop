import { asArray, asRecord } from "./type-guards";
import type {
  BlockedPost,
  EmbedView,
  FeedGeneratorsResponse,
  FeedReplyNode,
  FeedResponse,
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
  ThreadResponse,
  ThreadViewPost,
} from "./types";

export const TIMELINE_ROUTE = "/timeline";
const THREAD_QUERY_PARAM = "thread";

function asPostRecord(value: unknown): PostRecord {
  return (asRecord(value) ?? {}) as PostRecord;
}

function isProfileViewBasic(value: unknown): boolean {
  const record = asRecord(value);
  return !!record && typeof record.did === "string" && typeof record.handle === "string";
}

function isPostView(value: unknown): value is PostView {
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

function isFeedViewPost(value: unknown): value is FeedViewPost {
  const record = asRecord(value);
  return !!record && isPostView(record.post);
}

function isThreadNode(value: unknown): value is ThreadNode {
  const record = asRecord(value);
  if (!record || typeof record.$type !== "string") {
    return false;
  }

  if (record.$type === "app.bsky.feed.defs#threadViewPost") {
    return isPostView(record.post);
  }

  return record.$type === "app.bsky.feed.defs#blockedPost" || record.$type === "app.bsky.feed.defs#notFoundPost";
}

export function parseFeedResponse(value: unknown): FeedResponse {
  const record = asRecord(value);
  const feed = asArray(record?.feed);

  if (!record || !feed || !feed.every((item) => isFeedViewPost(item))) {
    throw new Error("feed response payload is invalid");
  }

  if (record.cursor !== undefined && record.cursor !== null && typeof record.cursor !== "string") {
    throw new Error("feed response cursor is invalid");
  }

  return { cursor: (record.cursor as string | null | undefined) ?? null, feed };
}

export function parseThreadResponse(value: unknown): ThreadResponse {
  const record = asRecord(value);
  if (!record || !isThreadNode(record.thread)) {
    throw new Error("thread response payload is invalid");
  }

  return { thread: record.thread };
}

export function parseFeedGeneratorsResponse(value: unknown): FeedGeneratorsResponse {
  const record = asRecord(value);
  const feeds = asArray(record?.feeds);

  if (!record || !feeds) {
    throw new Error("feed generators payload is invalid");
  }

  return { feeds: feeds as FeedGeneratorsResponse["feeds"] };
}

export function getPostText(post: PostView) {
  const text = post.record.text;
  return typeof text === "string" ? text : "";
}

export function getPostFacets(post: PostView) {
  const facets = asPostRecord(post.record).facets;
  return Array.isArray(facets) ? facets : [];
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

function isRepostReason(item: FeedViewPost) {
  return item.reason?.$type === "app.bsky.feed.defs#reasonRepost";
}

function isQuoteEmbed(embed: Maybe<EmbedView>) {
  return embed?.$type === "app.bsky.embed.record#view" || embed?.$type === "app.bsky.embed.recordWithMedia#view";
}

export function isReplyItem(item: FeedViewPost) {
  if (item.reply) {
    return true;
  }

  const record = asRecord(item.post.record);
  return !!asRecord(record?.reply);
}

export function hasKnownThreadContext(post: PostView, item?: FeedViewPost) {
  if (item && isReplyItem(item)) {
    return true;
  }

  if (asRecord(asRecord(post.record)?.reply)) {
    return true;
  }

  return typeof post.replyCount === "number" && post.replyCount > 0;
}

function isReplyByUnfollowed(item: FeedViewPost) {
  return isReplyItem(item) && !item.post.author.viewer?.following;
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
    const handle = normalizeHandle(post.author.handle);
    if (handle) {
      handles.add(`@${handle}`);
    }
  }

  const normalizedActiveHandle = normalizeHandle(activeHandle);
  if (normalizedActiveHandle) {
    handles.add(`@${normalizedActiveHandle}`);
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

    if (pref.hideRepliesByUnfollowed && isReplyByUnfollowed(item)) {
      return false;
    }

    if (pref.hideQuotePosts && isQuoteEmbed(item.post.embed)) {
      return false;
    }

    if (
      pref.hideRepliesByLikeCount !== null
      && isReplyItem(item)
      && (item.post.likeCount ?? 0) < pref.hideRepliesByLikeCount
    ) {
      return false;
    }

    return true;
  });
}

function getQuotedRecord(embed: Maybe<EmbedView>) {
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

export function getQuotedUri(embed: Maybe<EmbedView>) {
  const uri = getQuotedRecord(embed)?.uri;
  return typeof uri === "string" && uri.trim() ? uri : null;
}

export function getQuotedHref(embed: Maybe<EmbedView>) {
  const record = getQuotedRecord(embed);
  return buildPublicPostHref(record?.author ?? null, record?.uri);
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

export function getThreadOverlayUri(search: string) {
  return decodeThreadRouteUri(new URLSearchParams(search).get(THREAD_QUERY_PARAM));
}

export function buildThreadOverlayRoute(pathname: string, search: string, uri: string | null) {
  const params = new URLSearchParams(search);
  if (uri) {
    params.set(THREAD_QUERY_PARAM, uri);
  } else {
    params.delete(THREAD_QUERY_PARAM);
  }

  const nextSearch = params.toString();
  return nextSearch ? `${pathname}?${nextSearch}` : pathname;
}

export function buildPublicPostUrl(post: Pick<PostView, "author" | "uri">) {
  return buildPublicPostHref(post.author, post.uri) ?? post.uri;
}

function buildPublicPostHref(author: Maybe<ProfileViewBasic>, uri: Maybe<string>) {
  if (!author || typeof uri !== "string") {
    return null;
  }

  const actor = normalizeHandle(author.handle) ?? normalizeDid(author.did);
  const segments = uri.split("/");
  const rkey = segments.at(-1)?.trim();

  if (actor && rkey) {
    return `https://bsky.app/profile/${encodeURIComponent(actor)}/post/${encodeURIComponent(rkey)}`;
  }

  return null;
}

function normalizeHandle(value: string | null | undefined) {
  if (typeof value !== "string") {
    return null;
  }

  const normalized = value.replace(/^@/, "").trim();
  return normalized || null;
}

function normalizeDid(value: string | null | undefined) {
  if (typeof value !== "string") {
    return null;
  }

  const normalized = value.trim();
  return normalized || null;
}

export function postRkeyFromUri(uri: string | null | undefined) {
  if (typeof uri !== "string") {
    return null;
  }

  const trimmed = uri.trim();
  if (!trimmed.startsWith("at://")) {
    return null;
  }

  const rkey = trimmed.split("/").at(-1)?.trim();
  return rkey || null;
}

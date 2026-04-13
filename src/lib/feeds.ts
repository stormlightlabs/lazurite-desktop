import * as logger from "@tauri-apps/plugin-log";
import {
  FEED_COLLECTION,
  LABELER_COLLECTION,
  LIST_COLLECTION,
  POST_COLLECTION,
  STARTER_PACK_COLLECTION,
} from "./constants/collections";
import {
  isFeedViewPost,
  isProfileViewBasic,
  isQuoteEmbed,
  isReplyByUnfollowed,
  isReplyItem,
  isRepostReason,
  isThreadNode,
  isThreadViewPost,
} from "./feeds/type-guards";
import { asArray, asRecord } from "./type-guards";
import type {
  EmbedView,
  FeedGeneratorsResponse,
  FeedResponse,
  FeedViewPost,
  FeedViewPrefItem,
  Maybe,
  PostRecord,
  PostView,
  ProfileViewBasic,
  RichTextFacet,
  SavedFeedItem,
  StrongRefInput,
  ThreadNode,
  ThreadResponse,
} from "./types";
import { hashString, stringifyUnknown } from "./utils/text";

export const TIMELINE_ROUTE = "/timeline";

const THREAD_QUERY_PARAM = "thread";

function asPostRecord(value: unknown): PostRecord {
  return (asRecord(value) ?? {}) as PostRecord;
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

  return { cursor: typeof record.cursor === "string" ? record.cursor : null, feed };
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

export function hasKnownThreadContext(post: PostView, item?: FeedViewPost) {
  if (item && isReplyItem(item)) {
    return true;
  }

  if (asRecord(asRecord(post.record)?.reply)) {
    return true;
  }

  return typeof post.replyCount === "number" && post.replyCount > 0;
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

type QuotedRecordKind =
  | "blocked"
  | "detached"
  | "feed"
  | "labeler"
  | "list"
  | "not-found"
  | "post"
  | "starter-pack"
  | "unknown";

type QuotedRecordVariant =
  | "generatorView"
  | "labelerView"
  | "listView"
  | "open-union"
  | "starterPackViewBasic"
  | "viewBlocked"
  | "viewDetached"
  | "viewNotFound"
  | "viewRecord";

type EmbedCanonicalKind = "external" | "images" | "record" | "recordWithMedia" | "video";

export type NormalizedEmbedSource =
  | "quoted"
  | "recordWithMedia.media"
  | "top"
  | "value.embed"
  | "value.embeds"
  | "viewRecord.embeds";

type NormalizationMeta = {
  cycle: boolean;
  depth: number;
  depthLimited: boolean;
  explicitType: string | null;
  inferred: boolean;
  source: NormalizedEmbedSource;
};

export type UnknownEmbedEntry = {
  explicitType: string | null;
  fingerprint: string;
  inferred: boolean;
  raw: unknown;
  source: NormalizedEmbedSource;
};

export type QuotedRecordPresentation = {
  author: ProfileViewBasic | null;
  emptyText: string;
  facets: RichTextFacet[] | null;
  href: string | null;
  kind: QuotedRecordKind;
  normalizedEmbeds: NormalizedEmbed[];
  text: string | null;
  title: string;
  unknownEmbeds: UnknownEmbedEntry[];
  uri: string | null;
};

export type NormalizedQuotedRecord = QuotedRecordPresentation & {
  cycle: boolean;
  depth: number;
  depthLimited: boolean;
  variant: QuotedRecordVariant;
};

export type NormalizedEmbed =
  | { embed: Extract<EmbedView, { $type: "app.bsky.embed.external#view" }>; kind: "external"; meta: NormalizationMeta }
  | { embed: Extract<EmbedView, { $type: "app.bsky.embed.images#view" }>; kind: "images"; meta: NormalizationMeta }
  | { kind: "record"; meta: NormalizationMeta; quoted: NormalizedQuotedRecord }
  | { kind: "recordWithMedia"; media: NormalizedEmbed | null; meta: NormalizationMeta; quoted: NormalizedQuotedRecord }
  | { kind: "recognized-unrenderable"; message: string; meta: NormalizationMeta; recognizedType: string }
  | { kind: "unknown"; meta: NormalizationMeta; unknown: UnknownEmbedEntry }
  | { embed: Extract<EmbedView, { $type: "app.bsky.embed.video#view" }>; kind: "video"; meta: NormalizationMeta };

type NormalizeEmbedOptions = {
  depth?: number;
  maxDepth?: number;
  source?: NormalizedEmbedSource;
  trail?: WeakSet<object>;
};

type NormalizeEmbedContext = { depth: number; maxDepth: number; source: NormalizedEmbedSource; trail: WeakSet<object> };
type QuotedRecordClassification = { kind: QuotedRecordKind; variant: QuotedRecordVariant };

const DEFAULT_NORMALIZE_EMBED_MAX_DEPTH = 6;
const UNKNOWN_EMBED_WARN_INTERVAL = 25;
const unknownEmbedTelemetry = new Map<string, number>();

const VIEW_TYPE_TO_KIND: Readonly<Record<string, EmbedCanonicalKind>> = {
  "app.bsky.embed.external#view": "external",
  "app.bsky.embed.images#view": "images",
  "app.bsky.embed.record#view": "record",
  "app.bsky.embed.recordWithMedia#view": "recordWithMedia",
  "app.bsky.embed.video#view": "video",
};

const MAIN_TYPE_TO_KIND: Readonly<Record<string, EmbedCanonicalKind>> = {
  "app.bsky.embed.external": "external",
  "app.bsky.embed.images": "images",
  "app.bsky.embed.record": "record",
  "app.bsky.embed.recordWithMedia": "recordWithMedia",
  "app.bsky.embed.video": "video",
};

const QUOTED_RECORD_TYPE_CLASSIFICATION: Readonly<Record<string, QuotedRecordClassification>> = {
  "app.bsky.embed.record#viewBlocked": { kind: "blocked", variant: "viewBlocked" },
  "app.bsky.embed.record#viewDetached": { kind: "detached", variant: "viewDetached" },
  "app.bsky.embed.record#viewNotFound": { kind: "not-found", variant: "viewNotFound" },
  "app.bsky.embed.record#viewRecord": { kind: "post", variant: "viewRecord" },
  "app.bsky.feed.defs#generatorView": { kind: "feed", variant: "generatorView" },
  "app.bsky.graph.defs#listView": { kind: "list", variant: "listView" },
  "app.bsky.graph.defs#starterPackViewBasic": { kind: "starter-pack", variant: "starterPackViewBasic" },
  "app.bsky.labeler.defs#labelerView": { kind: "labeler", variant: "labelerView" },
};

export function resetUnknownEmbedTelemetryForTests() {
  unknownEmbedTelemetry.clear();
}

export function getUnknownEmbedTelemetryForTests() {
  return new Map(unknownEmbedTelemetry);
}

function debugEmbedKey(unknown: UnknownEmbedEntry) {
  return `${unknown.source}|${unknown.inferred ? "inferred" : "explicit"}|${unknown.fingerprint}`;
}

function trackUnknownEmbedTelemetry(unknown: UnknownEmbedEntry) {
  const key = debugEmbedKey(unknown);
  const count = (unknownEmbedTelemetry.get(key) ?? 0) + 1;
  unknownEmbedTelemetry.set(key, count);
  if (count !== 1 && count % UNKNOWN_EMBED_WARN_INTERVAL !== 0) {
    return;
  }

  logger.warn("unknown embed shape encountered", {
    keyValues: {
      count: String(count),
      explicitType: unknown.explicitType ?? "none",
      fingerprint: unknown.fingerprint,
      inferred: String(unknown.inferred),
      payloadJson: stringifyUnknown(unknown.raw),
      source: unknown.source,
    },
  });
}

function assertNever(value: never): never {
  throw new Error(`Unhandled value: ${String(value)}`);
}

function shapeSignature(value: unknown, depth = 0, seen = new WeakSet<object>()): string {
  if (depth > 3) {
    return "depth-limit";
  }

  if (value === null) {
    return "null";
  }

  if (Array.isArray(value)) {
    const preview = value.slice(0, 3).map((item) => shapeSignature(item, depth + 1, seen));
    return `array(${value.length})[${preview.join(",")}]`;
  }

  const record = asRecord(value);
  if (record) {
    if (seen.has(record)) {
      return "cycle";
    }
    seen.add(record);
    const keys = Object.keys(record).toSorted().slice(0, 12);
    const parts = keys.map((key) => `${key}:${shapeSignature(record[key], depth + 1, seen)}`);
    seen.delete(record);
    return `object{${parts.join("|")}}`;
  }

  return typeof value;
}

function buildEmbedFingerprint(value: unknown, explicitType: string | null, inferred: boolean) {
  const shapeHash = hashString(shapeSignature(value));
  const typePart = explicitType ?? (inferred ? "inferred-shape" : "untyped");
  return `${typePart}:${shapeHash}`;
}

function asAspectRatio(value: unknown) {
  const ratio = asRecord(value);
  if (!ratio || typeof ratio.width !== "number" || typeof ratio.height !== "number") {
    return;
  }

  return { height: ratio.height, width: ratio.width };
}

function buildMeta(
  context: NormalizeEmbedContext,
  options: Partial<Pick<NormalizationMeta, "cycle" | "depthLimited" | "explicitType" | "inferred">> = {},
): NormalizationMeta {
  return {
    cycle: options.cycle ?? false,
    depth: context.depth,
    depthLimited: options.depthLimited ?? false,
    explicitType: options.explicitType ?? null,
    inferred: options.inferred ?? false,
    source: context.source,
  };
}

function childContext(parent: NormalizeEmbedContext, source: NormalizedEmbedSource): NormalizeEmbedContext {
  return { depth: parent.depth + 1, maxDepth: parent.maxDepth, source, trail: parent.trail };
}

function canonicalEmbedKindFromType(type: string | null) {
  if (!type) {
    return null;
  }
  if (Object.prototype.hasOwnProperty.call(VIEW_TYPE_TO_KIND, type)) {
    return VIEW_TYPE_TO_KIND[type];
  }
  if (Object.prototype.hasOwnProperty.call(MAIN_TYPE_TO_KIND, type)) {
    return MAIN_TYPE_TO_KIND[type];
  }

  return null;
}

function inferCanonicalEmbedKind(record: Record<string, unknown>): EmbedCanonicalKind | null {
  if (asRecord(record.record) && asRecord(record.media)) {
    return "recordWithMedia";
  }
  if (asRecord(record.record)) {
    return "record";
  }
  if (Array.isArray(record.images)) {
    return "images";
  }
  if (asRecord(record.external)) {
    return "external";
  }
  if (
    Object.prototype.hasOwnProperty.call(record, "playlist")
    || Object.prototype.hasOwnProperty.call(record, "thumbnail")
    || Object.prototype.hasOwnProperty.call(record, "video")
  ) {
    return "video";
  }

  return null;
}

function unknownNormalizedEmbed(
  value: unknown,
  context: NormalizeEmbedContext,
  explicitType: string | null,
  inferred: boolean,
): Extract<NormalizedEmbed, { kind: "unknown" }> {
  const unknown: UnknownEmbedEntry = {
    explicitType,
    fingerprint: buildEmbedFingerprint(value, explicitType, inferred),
    inferred,
    raw: value,
    source: context.source,
  };
  trackUnknownEmbedTelemetry(unknown);
  return { kind: "unknown", meta: buildMeta(context, { explicitType, inferred }), unknown };
}

function recognizedUnrenderableEmbed(
  context: NormalizeEmbedContext,
  recognizedType: string,
  message: string,
  raw: unknown,
  options: Partial<Pick<NormalizationMeta, "cycle" | "depthLimited" | "explicitType" | "inferred">> = {},
): Extract<NormalizedEmbed, { kind: "recognized-unrenderable" }> {
  logger.warn("recognized embed shape could not be rendered", {
    keyValues: {
      explicitType: options.explicitType ?? "none",
      inferred: String(options.inferred ?? false),
      message,
      payloadJson: stringifyUnknown(raw),
      recognizedType,
      source: context.source,
    },
  });
  return { kind: "recognized-unrenderable", message, meta: buildMeta(context, options), recognizedType };
}

function normalizeImagesEmbedView(record: Record<string, unknown>) {
  const images = asArray(record.images);
  if (!images) {
    return null;
  }

  const normalizedImages = images.map((item) => asRecord(item)).filter((item): item is Record<string, unknown> =>
    !!item
  ).map((item) => {
    const fullsize = typeof item.fullsize === "string" ? item.fullsize : undefined;
    const thumb = typeof item.thumb === "string" ? item.thumb : undefined;
    if (!fullsize && !thumb) {
      return null;
    }

    return {
      alt: typeof item.alt === "string" ? item.alt : undefined,
      aspectRatio: asAspectRatio(item.aspectRatio),
      fullsize,
      thumb,
    };
  }).filter((item): item is NonNullable<typeof item> => !!item);

  if (normalizedImages.length === 0) {
    return null;
  }

  return { $type: "app.bsky.embed.images#view", images: normalizedImages } as const;
}

function blobCidFromRecord(record: Record<string, unknown> | null) {
  if (!record) {
    return null;
  }

  if (typeof record.$link === "string" && record.$link.trim().length > 0) {
    return record.$link.trim();
  }

  if (typeof record.ref === "string" && record.ref.trim().length > 0) {
    return record.ref.trim();
  }

  const ref = asRecord(record.ref);
  if (ref && typeof ref.$link === "string" && ref.$link.trim().length > 0) {
    return ref.$link.trim();
  }

  return null;
}

function imageFormatFromMimeType(mimeType: unknown) {
  if (typeof mimeType !== "string") {
    return "jpeg";
  }

  const normalized = mimeType.trim().toLowerCase();
  if (normalized === "image/png") {
    return "png";
  }
  if (normalized === "image/webp") {
    return "webp";
  }
  if (normalized === "image/gif") {
    return "gif";
  }

  return "jpeg";
}

function withBlobBackedImageUrls(value: unknown, authorDid: string | null) {
  if (!authorDid) {
    return value;
  }

  const record = asRecord(value);
  if (!record) {
    return value;
  }

  const explicitType = typeof record.$type === "string" ? record.$type : null;
  if (explicitType && explicitType !== "app.bsky.embed.images" && explicitType !== "app.bsky.embed.images#view") {
    return value;
  }

  const images = asArray(record.images);
  if (!images || images.length === 0) {
    return value;
  }

  let changed = false;
  const resolvedImages = images.map((entry) => {
    const imageRecord = asRecord(entry);
    if (!imageRecord) {
      return entry;
    }

    const hasViewUrls = typeof imageRecord.fullsize === "string" || typeof imageRecord.thumb === "string";
    if (hasViewUrls) {
      return imageRecord;
    }

    const blobRecord = asRecord(imageRecord.image);
    const cid = blobCidFromRecord(blobRecord);
    if (!cid) {
      return imageRecord;
    }

    changed = true;
    const format = imageFormatFromMimeType(blobRecord?.mimeType);
    const encodedDid = encodeURIComponent(authorDid);
    const encodedCid = encodeURIComponent(cid);

    return {
      ...imageRecord,
      fullsize: `https://cdn.bsky.app/img/feed_fullsize/plain/${encodedDid}/${encodedCid}@${format}`,
      thumb: `https://cdn.bsky.app/img/feed_thumbnail/plain/${encodedDid}/${encodedCid}@${format}`,
    };
  });

  if (!changed) {
    return value;
  }

  return { ...record, images: resolvedImages };
}

function normalizeExternalEmbedView(record: Record<string, unknown>) {
  const external = asRecord(record.external);
  if (!external) {
    return null;
  }

  const normalized = {
    description: typeof external.description === "string" ? external.description : undefined,
    thumb: typeof external.thumb === "string" ? external.thumb : undefined,
    title: typeof external.title === "string" ? external.title : undefined,
    uri: typeof external.uri === "string" ? external.uri : undefined,
  };

  if (!normalized.description && !normalized.thumb && !normalized.title && !normalized.uri) {
    return null;
  }

  return { $type: "app.bsky.embed.external#view", external: normalized } as const;
}

function normalizeVideoEmbedView(record: Record<string, unknown>) {
  const normalized = {
    alt: typeof record.alt === "string" ? record.alt : undefined,
    aspectRatio: asAspectRatio(record.aspectRatio),
    playlist: typeof record.playlist === "string" ? record.playlist : undefined,
    thumbnail: typeof record.thumbnail === "string" ? record.thumbnail : undefined,
  };

  if (!normalized.alt && !normalized.aspectRatio && !normalized.playlist && !normalized.thumbnail) {
    return null;
  }

  return { $type: "app.bsky.embed.video#view", ...normalized } as const;
}

function getProfileFromRecord(record: Record<string, unknown>, keys: string[]) {
  for (const key of keys) {
    const candidate = asRecord(record[key]);
    if (candidate && isProfileViewBasic(candidate)) {
      return candidate;
    }
  }

  return null;
}

function atUriParts(value: Maybe<string>) {
  if (typeof value !== "string") {
    return null;
  }

  const trimmed = value.trim();
  if (!trimmed.startsWith("at://")) {
    return null;
  }

  const segments = trimmed.slice(5).split("/").map((segment) => segment.trim()).filter((segment) => segment.length > 0);
  if (segments.length === 0) {
    return null;
  }

  return {
    collection: segments.length > 1 ? segments[1] : null,
    did: segments[0],
    rkey: segments.length > 2 ? segments[2] : null,
    uri: trimmed,
  };
}

function classifyQuotedRecord(record: Record<string, unknown>): QuotedRecordClassification {
  const type = typeof record.$type === "string" ? record.$type : null;
  if (type && Object.prototype.hasOwnProperty.call(QUOTED_RECORD_TYPE_CLASSIFICATION, type)) {
    return QUOTED_RECORD_TYPE_CLASSIFICATION[type];
  }
  if (record.blocked === true) {
    return { kind: "blocked", variant: "viewBlocked" };
  }
  if (record.detached === true) {
    return { kind: "detached", variant: "viewDetached" };
  }
  if (record.notFound === true) {
    return { kind: "not-found", variant: "viewNotFound" };
  }

  const uriCollection = atUriParts(typeof record.uri === "string" ? record.uri : null)?.collection;
  if (uriCollection === POST_COLLECTION) {
    return { kind: "post", variant: "open-union" };
  }
  if (uriCollection === FEED_COLLECTION) {
    return { kind: "feed", variant: "open-union" };
  }
  if (uriCollection === LIST_COLLECTION) {
    return { kind: "list", variant: "open-union" };
  }
  if (uriCollection === STARTER_PACK_COLLECTION) {
    return { kind: "starter-pack", variant: "open-union" };
  }
  if (uriCollection === LABELER_COLLECTION) {
    return { kind: "labeler", variant: "open-union" };
  }

  const valueRecord = asRecord(record.value);
  if (valueRecord?.$type === POST_COLLECTION || typeof valueRecord?.text === "string") {
    return { kind: "post", variant: "open-union" };
  }

  return { kind: "unknown", variant: "open-union" };
}

function quotedRecordText(kind: QuotedRecordKind, record: Record<string, unknown>) {
  if (kind === "post") {
    const valueText = asRecord(record.value)?.text;
    if (typeof valueText === "string" && valueText.trim().length > 0) {
      return valueText;
    }

    const postRecordText = asRecord(record.record)?.text;
    const text = typeof postRecordText === "string" ? postRecordText : record.text;
    return typeof text === "string" && text.trim().length > 0 ? text : null;
  }
  if (kind === "feed") {
    const displayName = record.displayName;
    if (typeof displayName === "string" && displayName.trim().length > 0) {
      return displayName;
    }

    const description = record.description;
    return typeof description === "string" && description.trim().length > 0 ? description : null;
  }
  if (kind === "list") {
    const name = record.name;
    if (typeof name === "string" && name.trim().length > 0) {
      return name;
    }

    const description = record.description;
    return typeof description === "string" && description.trim().length > 0 ? description : null;
  }
  if (kind === "labeler") {
    return "Moderation service";
  }
  if (kind === "starter-pack") {
    const name = asRecord(record.record)?.name;
    if (typeof name === "string" && name.trim().length > 0) {
      return name;
    }
    return "Starter pack";
  }
  if (kind === "blocked") {
    return "This record is blocked.";
  }
  if (kind === "not-found") {
    return "This record was not found.";
  }
  if (kind === "detached") {
    return "This record has been detached.";
  }

  return "Unsupported embedded record.";
}

function quotedRecordTitles(kind: QuotedRecordKind) {
  if (kind === "post") {
    return { emptyText: "Quoted post", title: "Quoted post" };
  }
  if (kind === "feed") {
    return { emptyText: "Feed", title: "Embedded feed" };
  }
  if (kind === "list") {
    return { emptyText: "List", title: "Embedded list" };
  }
  if (kind === "labeler") {
    return { emptyText: "Labeler", title: "Embedded labeler" };
  }
  if (kind === "starter-pack") {
    return { emptyText: "Starter pack", title: "Embedded starter pack" };
  }
  if (kind === "blocked") {
    return { emptyText: "This record is blocked.", title: "Embedded record" };
  }
  if (kind === "not-found") {
    return { emptyText: "This record was not found.", title: "Embedded record" };
  }
  if (kind === "detached") {
    return { emptyText: "This record has been detached.", title: "Embedded record" };
  }

  return { emptyText: "Unsupported embedded record.", title: "Embedded record" };
}

function quotedRecordFacets(kind: QuotedRecordKind, record: Record<string, unknown>) {
  if (kind !== "post") {
    return null;
  }

  const facets = asRecord(record.value)?.facets ?? asRecord(record.record)?.facets;
  return Array.isArray(facets) ? (facets as RichTextFacet[]) : null;
}

type QuotedEmbedExtraction = { source: "value.embed" | "value.embeds" | "viewRecord.embeds"; values: unknown[] };

function quotedEmbedExtraction(record: Record<string, unknown>): QuotedEmbedExtraction | null {
  if (Object.prototype.hasOwnProperty.call(record, "embeds")) {
    const direct = asArray(record.embeds);
    return { source: "viewRecord.embeds", values: direct ?? (record.embeds === undefined ? [] : [record.embeds]) };
  }

  if (Object.prototype.hasOwnProperty.call(record, "embed")) {
    if (record.embed === null || record.embed === undefined) {
      return { source: "value.embed", values: [] };
    }
    return { source: "value.embed", values: [record.embed] };
  }

  const value = asRecord(record.value);
  if (value) {
    if (Object.prototype.hasOwnProperty.call(value, "embed")) {
      if (value.embed === null || value.embed === undefined) {
        return { source: "value.embed", values: [] };
      }
      return { source: "value.embed", values: [value.embed] };
    }

    if (Object.prototype.hasOwnProperty.call(value, "embeds")) {
      const embeds = asArray(value.embeds);
      return { source: "value.embeds", values: embeds ?? (value.embeds === undefined ? [] : [value.embeds]) };
    }
  }

  const postRecord = asRecord(record.record);
  if (!postRecord) {
    return null;
  }

  if (Object.prototype.hasOwnProperty.call(postRecord, "embed")) {
    if (postRecord.embed === null || postRecord.embed === undefined) {
      return { source: "value.embed", values: [] };
    }
    return { source: "value.embed", values: [postRecord.embed] };
  }

  if (Object.prototype.hasOwnProperty.call(postRecord, "embeds")) {
    const embeds = asArray(postRecord.embeds);
    return { source: "value.embeds", values: embeds ?? (postRecord.embeds === undefined ? [] : [postRecord.embeds]) };
  }

  return null;
}

function collectUnknownEmbeds(embed: NormalizedEmbed, unknowns: UnknownEmbedEntry[]) {
  if (embed.kind === "unknown") {
    unknowns.push(embed.unknown);
    return;
  }

  if (embed.kind === "record") {
    unknowns.push(...embed.quoted.unknownEmbeds);
    return;
  }

  if (embed.kind === "recordWithMedia") {
    if (embed.media) {
      collectUnknownEmbeds(embed.media, unknowns);
    }
    unknowns.push(...embed.quoted.unknownEmbeds);
  }
}

function recordPayloadFromRecordWithMedia(record: Record<string, unknown>) {
  const outer = asRecord(record.record);
  if (!outer) {
    return null;
  }

  const nested = asRecord(outer.record);
  if (nested) {
    return nested;
  }

  return outer;
}

function toPresentation(record: NormalizedQuotedRecord): QuotedRecordPresentation {
  return {
    author: record.author,
    emptyText: record.emptyText,
    facets: record.facets,
    href: record.href,
    kind: record.kind,
    normalizedEmbeds: record.normalizedEmbeds,
    text: record.text,
    title: record.title,
    unknownEmbeds: record.unknownEmbeds,
    uri: record.uri,
  };
}

function fallbackQuotedPresentation(kind: QuotedRecordKind, context: NormalizeEmbedContext): NormalizedQuotedRecord {
  const { emptyText, title } = quotedRecordTitles(kind);
  return {
    author: null,
    cycle: false,
    depth: context.depth,
    depthLimited: context.depth > context.maxDepth,
    emptyText,
    facets: null,
    href: null,
    kind,
    normalizedEmbeds: [],
    text: quotedRecordText(kind, {}),
    title,
    unknownEmbeds: [],
    uri: null,
    variant: "open-union",
  };
}

function normalizeQuotedEmbeds(record: Record<string, unknown>, context: NormalizeEmbedContext) {
  const extraction = quotedEmbedExtraction(record);
  if (!extraction) {
    return { normalizedEmbeds: [] as NormalizedEmbed[], unknownEmbeds: [] as UnknownEmbedEntry[] };
  }

  const authorDid = (() => {
    const author = asRecord(record.author);
    if (author && typeof author.did === "string" && author.did.trim().length > 0) {
      return author.did.trim();
    }

    const parts = atUriParts(typeof record.uri === "string" ? record.uri : null);
    return parts?.did ?? null;
  })();

  const normalizedEmbeds = extraction.values.map((value) =>
    normalizeEmbed(withBlobBackedImageUrls(value, authorDid), {
      depth: context.depth + 1,
      maxDepth: context.maxDepth,
      source: extraction.source,
      trail: context.trail,
    })
  );
  const unknownEmbeds: UnknownEmbedEntry[] = [];
  for (const normalized of normalizedEmbeds) {
    collectUnknownEmbeds(normalized, unknownEmbeds);
  }

  return { normalizedEmbeds, unknownEmbeds };
}

function normalizeQuotedRecord(recordValue: unknown, context: NormalizeEmbedContext): NormalizedQuotedRecord {
  const record = asRecord(recordValue);
  if (!record) {
    return fallbackQuotedPresentation("unknown", context);
  }

  if (context.depth > context.maxDepth) {
    return fallbackQuotedPresentation("unknown", context);
  }

  if (context.trail.has(record)) {
    const fallback = fallbackQuotedPresentation("unknown", context);
    return { ...fallback, cycle: true };
  }

  context.trail.add(record);
  try {
    const classification = classifyQuotedRecord(record);
    const { kind, variant } = classification;
    const author = getProfileFromRecord(record, ["author", "creator"]);
    const uri = typeof record.uri === "string" && record.uri.trim().length > 0 ? record.uri : null;
    const { emptyText, title } = quotedRecordTitles(kind);
    const normalized = kind === "post"
      ? normalizeQuotedEmbeds(record, context)
      : { normalizedEmbeds: [] as NormalizedEmbed[], unknownEmbeds: [] as UnknownEmbedEntry[] };

    return {
      author,
      cycle: false,
      depth: context.depth,
      depthLimited: false,
      emptyText,
      facets: quotedRecordFacets(kind, record),
      href: buildPublicRecordHref(author, uri, kind),
      kind,
      normalizedEmbeds: normalized.normalizedEmbeds,
      text: quotedRecordText(kind, record),
      title,
      unknownEmbeds: normalized.unknownEmbeds,
      uri: quotedRecordUri(kind, uri),
      variant,
    };
  } finally {
    context.trail.delete(record);
  }
}

function normalizedQuotedFromEmbed(embed: NormalizedEmbed): NormalizedQuotedRecord | null {
  if (embed.kind === "record") {
    return embed.quoted;
  }
  if (embed.kind === "recordWithMedia") {
    return embed.quoted;
  }
  return null;
}

type KnownEmbedNormalizationOptions = Pick<NormalizationMeta, "explicitType" | "inferred">;

function normalizeKnownEmbedKind(
  kind: EmbedCanonicalKind,
  record: Record<string, unknown>,
  context: NormalizeEmbedContext,
  options: KnownEmbedNormalizationOptions,
): Exclude<NormalizedEmbed, { kind: "unknown" }> {
  const { explicitType, inferred } = options;

  if (context.source === "recordWithMedia.media" && (kind === "record" || kind === "recordWithMedia")) {
    return recognizedUnrenderableEmbed(
      context,
      kind,
      "This recognized media type is not valid in recordWithMedia.media.",
      record,
      { explicitType, inferred },
    );
  }

  switch (kind) {
    case "images": {
      const embed = normalizeImagesEmbedView(record);
      if (!embed) {
        return recognizedUnrenderableEmbed(
          context,
          "app.bsky.embed.images#view",
          "Recognized image embed could not be rendered.",
          record,
          { explicitType, inferred },
        );
      }

      return { embed, kind: "images", meta: buildMeta(context, { explicitType, inferred }) };
    }
    case "external": {
      const embed = normalizeExternalEmbedView(record);
      if (!embed) {
        return recognizedUnrenderableEmbed(
          context,
          "app.bsky.embed.external#view",
          "Recognized external embed could not be rendered.",
          record,
          { explicitType, inferred },
        );
      }

      return { embed, kind: "external", meta: buildMeta(context, { explicitType, inferred }) };
    }
    case "video": {
      const embed = normalizeVideoEmbedView(record);
      if (!embed) {
        return recognizedUnrenderableEmbed(
          context,
          "app.bsky.embed.video#view",
          "Recognized video embed could not be rendered.",
          record,
          { explicitType, inferred },
        );
      }

      return { embed, kind: "video", meta: buildMeta(context, { explicitType, inferred }) };
    }
    case "record": {
      const recordPayload = asRecord(record.record);
      if (!recordPayload) {
        return recognizedUnrenderableEmbed(
          context,
          "app.bsky.embed.record#view",
          "Recognized quoted record embed could not be rendered.",
          record,
          { explicitType, inferred },
        );
      }

      return {
        kind: "record",
        meta: buildMeta(context, { explicitType, inferred }),
        quoted: normalizeQuotedRecord(recordPayload, childContext(context, "quoted")),
      };
    }
    case "recordWithMedia": {
      const media = record.media === undefined || record.media === null
        ? null
        : normalizeEmbedWithContext(record.media, childContext(context, "recordWithMedia.media"));
      const quotedRecord = normalizeQuotedRecord(
        recordPayloadFromRecordWithMedia(record),
        childContext(context, "quoted"),
      );
      return {
        kind: "recordWithMedia",
        media,
        meta: buildMeta(context, { explicitType, inferred }),
        quoted: quotedRecord,
      };
    }
    default: {
      return assertNever(kind);
    }
  }
}

function normalizeEmbedWithContext(value: unknown, context: NormalizeEmbedContext): NormalizedEmbed {
  if (context.depth > context.maxDepth) {
    return recognizedUnrenderableEmbed(context, "depth-limit", "Embed nesting limit reached.", value, {
      depthLimited: true,
    });
  }

  const record = asRecord(value);
  if (!record) {
    return unknownNormalizedEmbed(value, context, null, false);
  }

  if (context.trail.has(record)) {
    return recognizedUnrenderableEmbed(context, "cycle", "Embed cycle detected.", value, { cycle: true });
  }

  const explicitType = typeof record.$type === "string" ? record.$type : null;
  const explicitKind = canonicalEmbedKindFromType(explicitType);
  const inferredKind = explicitKind ? null : inferCanonicalEmbedKind(record);
  const kind = explicitKind ?? inferredKind;
  const inferred = !explicitKind && !!inferredKind;
  if (!kind) {
    return unknownNormalizedEmbed(value, context, explicitType, false);
  }

  context.trail.add(record);
  try {
    return normalizeKnownEmbedKind(kind, record, context, { explicitType, inferred });
  } finally {
    context.trail.delete(record);
  }
}

export function normalizeEmbed(value: unknown, options: NormalizeEmbedOptions = {}): NormalizedEmbed {
  const context: NormalizeEmbedContext = {
    depth: options.depth ?? 0,
    maxDepth: options.maxDepth ?? DEFAULT_NORMALIZE_EMBED_MAX_DEPTH,
    source: options.source ?? "top",
    trail: options.trail ?? new WeakSet<object>(),
  };
  return normalizeEmbedWithContext(value, context);
}

function buildPublicRecordHref(author: Maybe<ProfileViewBasic>, uri: Maybe<string>, kind: QuotedRecordKind) {
  const parts = atUriParts(uri);
  const actor = normalizeHandle(author?.handle) ?? normalizeDid(author?.did) ?? normalizeDid(parts?.did);
  if (kind === "labeler") {
    if (!actor) {
      return null;
    }
    return `https://bsky.app/profile/${encodeURIComponent(actor)}`;
  }

  if (kind === "post") {
    if (!parts?.rkey || !actor) {
      return null;
    }
    return `https://bsky.app/profile/${encodeURIComponent(actor)}/post/${encodeURIComponent(parts.rkey)}`;
  }
  if (kind === "feed") {
    if (!parts?.rkey || !actor) {
      return null;
    }
    return `https://bsky.app/profile/${encodeURIComponent(actor)}/feed/${encodeURIComponent(parts.rkey)}`;
  }
  if (kind === "list") {
    if (!parts?.rkey || !actor) {
      return null;
    }
    return `https://bsky.app/profile/${encodeURIComponent(actor)}/lists/${encodeURIComponent(parts.rkey)}`;
  }
  if (kind === "starter-pack") {
    if (!parts?.rkey) {
      return null;
    }
    return `https://bsky.app/starter-pack/${encodeURIComponent(parts.did)}/${encodeURIComponent(parts.rkey)}`;
  }

  return null;
}

function quotedRecordUri(kind: QuotedRecordKind, uri: string | null) {
  return kind === "post" ? uri : null;
}

export function getQuotedPresentation(embed: Maybe<EmbedView>): QuotedRecordPresentation {
  if (!embed) {
    return {
      author: null,
      emptyText: "Quoted post",
      facets: null,
      href: null,
      kind: "post",
      normalizedEmbeds: [],
      text: null,
      title: "Quoted post",
      unknownEmbeds: [],
      uri: null,
    };
  }

  const normalized = normalizeEmbed(embed, { source: "top" });
  const quoted = normalizedQuotedFromEmbed(normalized);
  if (!quoted) {
    return {
      author: null,
      emptyText: "Quoted post",
      facets: null,
      href: null,
      kind: "post",
      normalizedEmbeds: [],
      text: null,
      title: "Quoted post",
      unknownEmbeds: [],
      uri: null,
    };
  }

  return toPresentation(quoted);
}

export function getQuotedText(embed: Maybe<EmbedView>) {
  return getQuotedPresentation(embed).text;
}

export function getQuotedAuthor(embed: Maybe<EmbedView>) {
  return getQuotedPresentation(embed).author;
}

export function getQuotedUri(embed: Maybe<EmbedView>) {
  return getQuotedPresentation(embed).uri;
}

export function getQuotedHref(embed: Maybe<EmbedView>) {
  return getQuotedPresentation(embed).href;
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
  return buildPublicRecordHref(post.author, post.uri, "post") ?? post.uri;
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
  return atUriParts(uri)?.rkey ?? null;
}

export type Maybe<T> = T | null | undefined;

export type AccountSummary = { did: string; handle: string; pdsUrl: string; active: boolean };

export type ActiveSession = { did: string; handle: string };

export type AppBootstrap = { activeSession: ActiveSession | null; accountList: AccountSummary[] };

export type LoginSuggestion = { did: string; handle: string; displayName?: string | null; avatar?: string | null };

export type SavedFeedKind = "timeline" | "feed" | "list";

export type SavedFeedItem = { id: string; type: SavedFeedKind; value: string; pinned: boolean };

export type FeedViewPrefItem = {
  feed: string;
  hideReplies: boolean;
  hideRepliesByUnfollowed: boolean;
  hideRepliesByLikeCount: number | null;
  hideReposts: boolean;
  hideQuotePosts: boolean;
};

export type UserPreferences = { savedFeeds: SavedFeedItem[]; feedViewPrefs: FeedViewPrefItem[] };

export type AuthorViewerState = { following?: string | null };

export type ProfileViewBasic = {
  did: string;
  handle: string;
  displayName?: string | null;
  avatar?: string | null;
  viewer?: AuthorViewerState | null;
};

export type FeedGeneratorView = {
  uri: string;
  did: string;
  displayName: string;
  avatar?: string | null;
  description?: string | null;
  creator?: ProfileViewBasic | null;
};

export type FeedGeneratorsResponse = { feeds: FeedGeneratorView[] };

export type ViewerState = {
  bookmarked?: boolean | null;
  embeddingDisabled?: boolean | null;
  like?: string | null;
  pinned?: boolean | null;
  replyDisabled?: boolean | null;
  repost?: string | null;
  threadMuted?: boolean | null;
};

export type PostRecord = {
  $type?: string;
  createdAt?: string;
  embed?: Record<string, unknown> | null;
  facets?: unknown[] | null;
  text?: string;
  [key: string]: unknown;
};

type ImageEmbed = { alt?: string; aspectRatio?: { height: number; width: number }; fullsize?: string; thumb?: string };

export type ImagesEmbedView = { $type: "app.bsky.embed.images#view"; images: Array<ImageEmbed> };

export type ExternalEmbedView = {
  $type: "app.bsky.embed.external#view";
  external: { description?: string; thumb?: string; title?: string; uri?: string };
};

export type EmbeddedQuoteRecord = {
  $type?: string;
  author?: ProfileViewBasic;
  cid?: string;
  embeds?: EmbedView[];
  uri?: string;
  value?: Record<string, unknown>;
};

export type RecordEmbedView = { $type: "app.bsky.embed.record#view"; record: EmbeddedQuoteRecord };

export type RecordWithMediaEmbedView = {
  $type: "app.bsky.embed.recordWithMedia#view";
  media?: EmbedView;
  record?: RecordEmbedView;
};

export type VideoEmbedView = {
  $type: "app.bsky.embed.video#view";
  alt?: string;
  aspectRatio?: { height: number; width: number };
  playlist?: string;
  thumbnail?: string;
};

export type EmbedView =
  | ExternalEmbedView
  | ImagesEmbedView
  | RecordEmbedView
  | RecordWithMediaEmbedView
  | VideoEmbedView;

export type PostView = {
  author: ProfileViewBasic;
  cid: string;
  embed?: EmbedView | null;
  indexedAt: string;
  likeCount?: number | null;
  quoteCount?: number | null;
  record: PostRecord | Record<string, unknown>;
  replyCount?: number | null;
  repostCount?: number | null;
  uri: string;
  viewer?: ViewerState | null;
};

export type NotFoundPost = { $type: "app.bsky.feed.defs#notFoundPost"; notFound: boolean; uri: string };

export type BlockedPost = {
  $type: "app.bsky.feed.defs#blockedPost";
  blocked: boolean;
  uri: string;
  author?: ProfileViewBasic;
};

export type FeedReplyNode = ({ $type: "app.bsky.feed.defs#postView" } & PostView) | NotFoundPost | BlockedPost;

export type FeedReplyRef = { grandparentAuthor?: ProfileViewBasic | null; parent: FeedReplyNode; root: FeedReplyNode };

export type FeedReasonRepost = {
  $type: "app.bsky.feed.defs#reasonRepost";
  by: ProfileViewBasic;
  cid?: string | null;
  indexedAt: string;
  uri?: string | null;
};

export type FeedReasonPin = { $type: "app.bsky.feed.defs#reasonPin" };

export type FeedViewPost = {
  feedContext?: string | null;
  post: PostView;
  reason?: FeedReasonPin | FeedReasonRepost | null;
  reply?: FeedReplyRef | null;
  reqId?: string | null;
};

export type FeedResponse = { cursor?: string | null; feed: FeedViewPost[] };

export type ThreadViewPost = {
  $type: "app.bsky.feed.defs#threadViewPost";
  parent?: ThreadNode | null;
  post: PostView;
  replies?: ThreadNode[] | null;
};

export type ThreadNode = ThreadViewPost | NotFoundPost | BlockedPost;

export type ThreadResponse = { thread: ThreadNode };

export type StrongRefInput = { cid: string; uri: string };

export type ReplyRefInput = { parent: StrongRefInput; root: StrongRefInput };

export type EmbedInput = { type: "record"; record: StrongRefInput };

export type CreateRecordResult = { cid: string; uri: string };

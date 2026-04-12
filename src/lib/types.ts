export type Maybe<T> = T | null | undefined;

export type ModerationLabel = { src?: string; uri?: string; val?: string; [key: string]: unknown };

export type ModerationUiBadge = {
  label: string;
  source: string;
  description?: string | null;
  tone?: "alert" | "inform" | "label" | string;
};

export type ModerationUiDecision = {
  filter: boolean;
  blur: "none" | "content" | "media" | string;
  alert: boolean;
  inform: boolean;
  noOverride: boolean;
  badges?: ModerationUiBadge[] | null;
};

export type ModerationLabelVisibility = "ignore" | "warn" | "hide";

export type ModerationContext =
  | "contentList"
  | "contentView"
  | "contentMedia"
  | "avatar"
  | "profileList"
  | "profileView";

export type ModerationLabelPolicyLocale = { lang: string; name: string; description: string };

export type ModerationLabelPolicyDefinition = {
  identifier: string;
  adultOnly: boolean;
  defaultSetting?: string | null;
  severity: string;
  blurs: string;
  displayName?: string | null;
  description?: string | null;
  locales: ModerationLabelPolicyLocale[];
};

export type ModerationLabelerPolicyDefinition = {
  labelerDid: string;
  labelerHandle?: string | null;
  labelerDisplayName?: string | null;
  reasonTypes?: string[] | null;
  subjectTypes?: string[] | null;
  subjectCollections?: string[] | null;
  definitions: ModerationLabelPolicyDefinition[];
};

export type StoredModerationPrefs = {
  adultContentEnabled: boolean;
  subscribedLabelers: string[];
  labelPreferences: Record<string, Record<string, ModerationLabelVisibility | string>>;
};

export type DistributionChannel = "github" | "mac_app_store" | "microsoft_store";

export type ReportSubjectInput = { type: "repo"; did: string } | { type: "record"; uri: string; cid: string };

export type ModerationReasonType =
  | "com.atproto.moderation.defs#reasonSpam"
  | "com.atproto.moderation.defs#reasonViolation"
  | "com.atproto.moderation.defs#reasonMisleading"
  | "com.atproto.moderation.defs#reasonSexual"
  | "com.atproto.moderation.defs#reasonRude"
  | "com.atproto.moderation.defs#reasonOther";

export type AccountSummary = { did: string; handle: string; pdsUrl: string; active: boolean; avatar?: string | null };

export type ActiveSession = { did: string; handle: string };

export type AppBootstrap = { activeSession: ActiveSession | null; accountList: AccountSummary[] };

export type ActorSuggestion = { did: string; handle: string; displayName?: string | null; avatar?: string | null };

export type LoginSuggestion = ActorSuggestion;

type SavedFeedKind = "timeline" | "feed" | "list";

export type SavedFeedItem = { id: string; type: SavedFeedKind; value: string; pinned: boolean };

export type FeedViewPrefItem = {
  feed: string;
  hideReplies: boolean;
  hideRepliesByUnfollowed: boolean;
  hideRepliesByLikeCount: number | null;
  hideReposts: boolean;
  hideQuotePosts: boolean;
};

export type FeedViewPrefs = Array<FeedViewPrefItem>;

export type UserPreferences = { savedFeeds: SavedFeedItem[]; feedViewPrefs: FeedViewPrefs };

type AuthorViewerState = { following?: string | null };

export type ProfileViewBasic = {
  did: string;
  handle: string;
  displayName?: string | null;
  avatar?: string | null;
  description?: string | null;
  labels?: ModerationLabel[] | null;
  viewer?: AuthorViewerState | null;
};

type ProfileViewerState = {
  blockedBy?: boolean | null;
  followedBy?: string | null;
  following?: string | null;
  muted?: boolean | null;
};

export type ProfileUnavailableReason = "notFound" | "suspended" | "deactivated" | "unavailable";

export type ProfileViewDetailed = ProfileViewBasic & {
  banner?: string | null;
  createdAt?: string | null;
  description?: string | null;
  followersCount?: number | null;
  followsCount?: number | null;
  indexedAt?: string | null;
  pinnedPost?: { cid?: string | null; uri: string } | null;
  postsCount?: number | null;
  pronouns?: string | null;
  viewer?: ProfileViewerState | null;
  website?: string | null;
};

type ProfileLookupAvailable = { status: "available"; profile: ProfileViewDetailed };

export type ProfileLookupUnavailable = {
  status: "unavailable";
  requestedActor: string;
  did?: string | null;
  handle?: string | null;
  reason: ProfileUnavailableReason;
  message: string;
};

export type ProfileLookupResult = ProfileLookupAvailable | ProfileLookupUnavailable;

export type ActorListResponse = { cursor?: string | null; actors: ProfileViewBasic[] };

export type FlaggedFollow = { did: string; followUri: string; handle: string; status: number; statusLabel: string };

export type FollowBatchResult = { deleted: number; failed: string[] };

export type FollowHygieneProgress = { batchSize: number; current: number; total: number };

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
  facets?: RichTextFacet[] | null;
  text?: string;
  [key: string]: unknown;
};

type RichTextByteSlice = { byteEnd: number; byteStart: number };

type RichTextLinkFacet = { $type: "app.bsky.richtext.facet#link"; uri: string };

type RichTextMentionFacet = { $type: "app.bsky.richtext.facet#mention"; did: string };

type RichTextTagFacet = { $type: "app.bsky.richtext.facet#tag"; tag: string };

export type RichTextFacetFeature = RichTextLinkFacet | RichTextMentionFacet | RichTextTagFacet;

export type RichTextFacet = { features: RichTextFacetFeature[]; index: RichTextByteSlice };

type ImageEmbed = { alt?: string; aspectRatio?: { height: number; width: number }; fullsize?: string; thumb?: string };

export type ImagesEmbedView = { $type: "app.bsky.embed.images#view"; images: Array<ImageEmbed> };

type ExternalEmbedView = {
  $type: "app.bsky.embed.external#view";
  external: { description?: string; thumb?: string; title?: string; uri?: string };
};

type VideoEmbedView = {
  $type: "app.bsky.embed.video#view";
  alt?: string;
  aspectRatio?: { height: number; width: number };
  playlist?: string;
  thumbnail?: string;
};

type EmbeddedRecordViewRecord = {
  $type?: "app.bsky.embed.record#viewRecord";
  author?: ProfileViewBasic;
  cid?: string;
  embeds?: EmbedView[];
  indexedAt?: string;
  labels?: ModerationLabel[] | null;
  uri?: string;
  value?: Record<string, unknown>;
};

type EmbeddedRecordViewBlocked = {
  $type?: "app.bsky.embed.record#viewBlocked";
  author?: ProfileViewBasic;
  blocked?: boolean;
  uri?: string;
};

type EmbeddedRecordViewDetached = { $type?: "app.bsky.embed.record#viewDetached"; detached?: boolean; uri?: string };

type EmbeddedRecordViewNotFound = { $type?: "app.bsky.embed.record#viewNotFound"; notFound?: boolean; uri?: string };

type EmbeddedGeneratorView = {
  $type: "app.bsky.feed.defs#generatorView";
  creator?: ProfileViewBasic;
  description?: string;
  displayName?: string;
  uri?: string;
};

type EmbeddedListView = {
  $type: "app.bsky.graph.defs#listView";
  creator?: ProfileViewBasic;
  description?: string;
  name?: string;
  uri?: string;
};

type EmbeddedLabelerView = { $type: "app.bsky.labeler.defs#labelerView"; creator?: ProfileViewBasic; uri?: string };

type EmbeddedStarterPackView = {
  $type: "app.bsky.graph.defs#starterPackViewBasic";
  creator?: ProfileViewBasic;
  record?: Record<string, unknown>;
  uri?: string;
};

type EmbeddedUnknownRecord = { $type?: string; [key: string]: unknown };

export type EmbeddedRecordView =
  | EmbeddedGeneratorView
  | EmbeddedLabelerView
  | EmbeddedListView
  | EmbeddedRecordViewBlocked
  | EmbeddedRecordViewDetached
  | EmbeddedRecordViewNotFound
  | EmbeddedRecordViewRecord
  | EmbeddedStarterPackView
  | EmbeddedUnknownRecord;

type RecordEmbedView = { $type: "app.bsky.embed.record#view"; record: EmbeddedRecordView };

type RecordWithMediaEmbedView = {
  $type: "app.bsky.embed.recordWithMedia#view";
  media?: ExternalEmbedView | ImagesEmbedView | VideoEmbedView | EmbeddedUnknownRecord;
  record?: RecordEmbedView;
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
  labels?: ModerationLabel[] | null;
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

type FeedReplyRef = { grandparentAuthor?: ProfileViewBasic | null; parent: FeedReplyNode; root: FeedReplyNode };

type FeedReasonRepost = {
  $type: "app.bsky.feed.defs#reasonRepost";
  by: ProfileViewBasic;
  cid?: string | null;
  indexedAt: string;
  uri?: string | null;
};

type FeedReasonPin = { $type: "app.bsky.feed.defs#reasonPin" };

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

export type NotificationReason =
  | "like"
  | "repost"
  | "follow"
  | "mention"
  | "reply"
  | "quote"
  | "starterpack-joined"
  | "verified"
  | "unverified"
  | string;

export type NotificationView = {
  uri: string;
  cid: string;
  author: ProfileViewBasic;
  labels?: ModerationLabel[] | null;
  reason: NotificationReason;
  reasonSubject?: string | null;
  record: Record<string, unknown>;
  isRead: boolean;
  indexedAt: string;
};

export type ListNotificationsResponse = {
  cursor?: string | null;
  notifications: NotificationView[];
  seenAt?: string | null;
};

export type StrongRefInput = { cid: string; uri: string };

export type ReplyRefInput = { parent: StrongRefInput; root: StrongRefInput };

export type EmbedInput = { type: "record"; record: StrongRefInput };

export type CreateRecordResult = { cid: string; uri: string };

export type AppSettings = {
  theme: string;
  timelineRefreshSecs: number;
  notificationsDesktop: boolean;
  notificationsBadge: boolean;
  notificationsSound: boolean;
  embeddingsEnabled: boolean;
  constellationUrl: string;
  spacedustUrl: string;
  spacedustInstant: boolean;
  spacedustEnabled: boolean;
  globalShortcut: string;
  downloadDirectory: string;
};

export type CacheSize = { feedsBytes: number; embeddingsBytes: number; ftsBytes: number; totalBytes: number };

export type LogEntry = { timestamp: string | null; level: string; target: string | null; message: string };

export type CacheClearScope = "all" | "feeds" | "embeddings" | "fts";

export type ExportFormat = "json" | "csv";

export type LogLevelFilter = "all" | "info" | "warn" | "error";

export type RefreshInterval = 30 | 60 | 120 | 300 | 0;

export type Theme = "light" | "dark" | "auto";

type MessageViewSender = { did: string };

export type MessageView = {
  $type?: "chat.bsky.convo.defs#messageView";
  id: string;
  text: string;
  sender: MessageViewSender;
  sentAt: string;
  rev: string;
};

export type DeletedMessageView = {
  $type?: "chat.bsky.convo.defs#deletedMessageView";
  id: string;
  rev: string;
  sender: MessageViewSender;
  sentAt: string;
};

type ConvoLastMessage = MessageView | DeletedMessageView;

export type ConvoView = {
  id: string;
  members: ProfileViewBasic[];
  lastMessage?: ConvoLastMessage | null;
  unreadCount: number;
  muted: boolean;
  rev: string;
  status?: string | null;
};

export type ListConvosResponse = { convos: ConvoView[]; cursor?: string | null };

export type GetConvoForMembersResponse = { convo: ConvoView };

export type GetMessagesResponse = { messages: Array<MessageView | DeletedMessageView>; cursor?: string | null };

export type Draft = {
  id: string;
  accountDid: string;
  text: string;
  replyParentUri: string | null;
  replyParentCid: string | null;
  replyRootUri: string | null;
  replyRootCid: string | null;
  quoteUri: string | null;
  quoteCid: string | null;
  title: string | null;
  createdAt: string;
  updatedAt: string;
};

export type DraftInput = {
  id?: string | null;
  text: string;
  replyParentUri?: string | null;
  replyParentCid?: string | null;
  replyRootUri?: string | null;
  replyRootCid?: string | null;
  quoteUri?: string | null;
  quoteCid?: string | null;
  title?: string | null;
};

import type {
  FeedGeneratorView,
  FeedViewPost,
  FeedViewPrefItem,
  PostView,
  ThreadNode,
  UserPreferences,
} from "$/lib/types";

export type FeedState = {
  cursor: string | null;
  error: string | null;
  items: FeedViewPost[];
  loading: boolean;
  loadingMore: boolean;
};

export type ComposerState = {
  open: boolean;
  pending: boolean;
  quoteTarget: PostView | null;
  replyRoot: PostView | null;
  replyTarget: PostView | null;
  text: string;
};

export type ThreadState = { data: ThreadNode | null; error: string | null; loading: boolean; uri: string | null };

export type FeedWorkspaceState = {
  activeFeedId: string | null;
  composer: ComposerState;
  feedStates: Record<string, FeedState>;
  feedScrollTops: Record<string, number>;
  focusedIndex: number;
  generators: Record<string, FeedGeneratorView>;
  likePendingByUri: Record<string, boolean>;
  likePulseUri: string | null;
  localPrefs: Record<string, FeedViewPrefItem>;
  preferences: UserPreferences | null;
  repostPendingByUri: Record<string, boolean>;
  repostPulseUri: string | null;
  showFeedsDrawer: boolean;
  thread: ThreadState;
};

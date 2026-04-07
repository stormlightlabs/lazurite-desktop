import type { FeedGeneratorView, FeedViewPost, FeedViewPrefItem, PostView, UserPreferences } from "$/lib/types";

export type FeedState = {
  cursor: string | null;
  error: string | null;
  items: FeedViewPost[];
  loading: boolean;
  loadingMore: boolean;
};

type ComposerState = {
  open: boolean;
  pending: boolean;
  quoteTarget: PostView | null;
  replyRoot: PostView | null;
  replyTarget: PostView | null;
  text: string;
};

export type FeedWorkspaceState = {
  activeFeedId: string | null;
  composer: ComposerState;
  feedStates: Record<string, FeedState>;
  feedScrollTops: Record<string, number>;
  focusedIndex: number;
  generators: Record<string, FeedGeneratorView>;
  localPrefs: Record<string, FeedViewPrefItem>;
  preferences: UserPreferences | null;
  showFeedsDrawer: boolean;
};

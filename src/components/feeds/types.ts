import type {
  FeedGeneratorView,
  FeedViewPost,
  FeedViewPrefItem,
  PostView,
  StrongRefInput,
  UserPreferences,
} from "$/lib/types";

export type AutosaveStatus = "idle" | "saving" | "saved";

export type FeedState = {
  cursor: string | null;
  error: string | null;
  items: FeedViewPost[];
  loading: boolean;
  loadingMore: boolean;
};

type ComposerState = {
  autosaveStatus: AutosaveStatus;
  draftId: string | null;
  open: boolean;
  pending: boolean;
  quoteRef: StrongRefInput | null;
  quoteTarget: PostView | null;
  replyParentRef: StrongRefInput | null;
  replyRootRef: StrongRefInput | null;
  replyRoot: PostView | null;
  replyTarget: PostView | null;
  text: string;
};

export type FeedWorkspaceState = {
  activeFeedId: string | null;
  composer: ComposerState;
  draftCount: number;
  draftsListRefreshNonce: number;
  feedStates: Record<string, FeedState>;
  feedScrollTops: Record<string, number>;
  focusedIndex: number;
  generators: Record<string, FeedGeneratorView>;
  localPrefs: Record<string, FeedViewPrefItem>;
  preferences: UserPreferences | null;
  restoreDraftId: string | null;
  showDraftsList: boolean;
  showFeedsDrawer: boolean;
};

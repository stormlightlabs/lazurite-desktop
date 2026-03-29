import type { FeedViewPrefItem, FeedViewPrefs, SavedFeedItem, UserPreferences } from "$/lib/types";
import type { FeedState, FeedWorkspaceState, ThreadState } from "./types";

export const DEFAULT_TIMELINE: SavedFeedItem = { id: "following", type: "timeline", value: "following", pinned: true };

export function createDefaultFeedState(): FeedState {
  return { cursor: null, error: null, items: [], loading: false, loadingMore: false, scrollTop: 0 };
}

export const createDefaultThreadState = (): ThreadState => ({ data: null, error: null, loading: false, uri: null });

export const createDefaultFeedPref = (feed: SavedFeedItem): FeedViewPrefItem => ({
  feed: feed.value,
  hideQuotePosts: false,
  hideReplies: false,
  hideRepliesByLikeCount: null,
  hideRepliesByUnfollowed: true,
  hideReposts: false,
});

export function createInitialWorkspaceState(): FeedWorkspaceState {
  return {
    activeFeedId: null,
    composer: { open: false, pending: false, quoteTarget: null, replyRoot: null, replyTarget: null, text: "" },
    feedStates: {},
    focusedIndex: 0,
    generators: {},
    likePendingByUri: {},
    likePulseUri: null,
    localPrefs: {},
    preferences: null,
    repostPendingByUri: {},
    repostPulseUri: null,
    showFeedsDrawer: false,
    thread: createDefaultThreadState(),
  };
}

export function buildLocalPrefs(preferences: UserPreferences): Record<string, FeedViewPrefItem> {
  return Object.fromEntries(preferences.feedViewPrefs.map((pref) => [pref.feed, pref]));
}

export function upsertFeedViewPrefs(feedViewPrefs: FeedViewPrefs, nextPref: FeedViewPrefItem): FeedViewPrefs {
  return [...feedViewPrefs.filter((pref) => pref.feed !== nextPref.feed), nextPref];
}

export function getNextFocusedIndex(currentIndex: number, direction: "next" | "previous", totalItems: number): number {
  if (totalItems <= 0) {
    return 0;
  }

  if (direction === "next") {
    return Math.min(currentIndex + 1, totalItems - 1);
  }

  return Math.max(currentIndex - 1, 0);
}

export function updateFeedScrollState(state: FeedState | undefined, scrollTop: number): FeedState | null {
  const currentState = state ?? createDefaultFeedState();
  if (currentState.scrollTop === scrollTop) {
    return null;
  }

  return { ...currentState, scrollTop };
}

export function getNextFocusedScrollTop(
  currentScrollTop: number,
  viewportHeight: number,
  itemTop: number,
  itemHeight: number,
  padding = 16,
): number | null {
  const viewportTop = currentScrollTop;
  const viewportBottom = currentScrollTop + viewportHeight;
  const itemBottom = itemTop + itemHeight;

  if (itemTop < viewportTop + padding) {
    return Math.max(0, itemTop - padding);
  }

  if (itemBottom > viewportBottom - padding) {
    return Math.max(0, itemBottom - viewportHeight + padding);
  }

  return null;
}

import type { FeedViewPrefItem, UserPreferences } from "$/lib/types";
import { describe, expect, it } from "vitest";
import {
  buildLocalPrefs,
  createDefaultFeedPref,
  createDefaultFeedState,
  DEFAULT_TIMELINE,
  getNextFocusedIndex,
  getNextFocusedScrollTop,
  updateFeedScrollState,
  upsertFeedViewPrefs,
} from "./workspace-state";

const createFeedViewPref = (overrides: Partial<FeedViewPrefItem> = {}) => ({
  feed: "following",
  hideQuotePosts: false,
  hideReplies: false,
  hideRepliesByLikeCount: null,
  hideRepliesByUnfollowed: true,
  hideReposts: false,
  ...overrides,
});

describe("workspaceState", () => {
  it("builds default timeline preferences with unfollowed replies hidden", () => {
    expect(createDefaultFeedPref(DEFAULT_TIMELINE)).toEqual({
      feed: "following",
      hideQuotePosts: false,
      hideReplies: false,
      hideRepliesByLikeCount: null,
      hideRepliesByUnfollowed: true,
      hideReposts: false,
    });
  });

  it("indexes feed preferences by feed id", () => {
    const preferences = {
      savedFeeds: [],
      feedViewPrefs: [createFeedViewPref(), createFeedViewPref({ feed: "at://feed/custom", hideReposts: true })],
    } satisfies UserPreferences;

    expect(buildLocalPrefs(preferences)).toEqual({
      following: createFeedViewPref(),
      "at://feed/custom": createFeedViewPref({ feed: "at://feed/custom", hideReposts: true }),
    });
  });

  it("upserts a saved feed preference without dropping unrelated ones", () => {
    const current = [createFeedViewPref(), createFeedViewPref({ feed: "at://feed/custom", hideReplies: true })];
    const nextPref = createFeedViewPref({ hideReposts: true, hideRepliesByLikeCount: 5 });

    expect(upsertFeedViewPrefs(current, nextPref)).toEqual([
      createFeedViewPref({ feed: "at://feed/custom", hideReplies: true }),
      createFeedViewPref({ hideReposts: true, hideRepliesByLikeCount: 5 }),
    ]);
  });

  it("clamps keyboard focus movement within the rendered feed", () => {
    expect(getNextFocusedIndex(0, "next", 3)).toBe(1);
    expect(getNextFocusedIndex(2, "next", 3)).toBe(2);
    expect(getNextFocusedIndex(0, "previous", 3)).toBe(0);
    expect(getNextFocusedIndex(2, "previous", 3)).toBe(1);
    expect(getNextFocusedIndex(0, "next", 0)).toBe(0);
  });

  it("avoids scroll-state writes when the scroll position is unchanged", () => {
    const state = createDefaultFeedState();
    expect(updateFeedScrollState(state, 0)).toBeNull();
    expect(updateFeedScrollState(state, 48)).toEqual({ ...state, scrollTop: 48 });
  });

  it("computes focused-post scrolling without using browser focus", () => {
    expect(getNextFocusedScrollTop(120, 300, 100, 60)).toBe(84);
    expect(getNextFocusedScrollTop(120, 300, 380, 80)).toBe(176);
    expect(getNextFocusedScrollTop(120, 300, 180, 60)).toBeNull();
  });
});

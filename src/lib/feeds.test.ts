import { describe, expect, it } from "vitest";
import {
  applyFeedPreferences,
  buildThreadRoute,
  decodeThreadRouteUri,
  getFeedCommand,
} from "./feeds";
import type { FeedViewPost, FeedViewPrefItem, SavedFeedItem } from "./types";

function createFeedItem(overrides: Partial<FeedViewPost> = {}): FeedViewPost {
  return {
    post: {
      author: { did: "did:plc:alice", handle: "alice.test" },
      cid: "cid-1",
      indexedAt: "2026-03-28T12:00:00.000Z",
      likeCount: 10,
      record: { createdAt: "2026-03-28T12:00:00.000Z", text: "hello world" },
      uri: "at://did:plc:alice/app.bsky.feed.post/1",
    },
    ...overrides,
  };
}

function createPref(overrides: Partial<FeedViewPrefItem> = {}): FeedViewPrefItem {
  return {
    feed: "following",
    hideQuotePosts: false,
    hideReplies: false,
    hideRepliesByLikeCount: null,
    hideRepliesByUnfollowed: false,
    hideReposts: false,
    ...overrides,
  };
}

describe("feed helpers", () => {
  it("filters reposts, replies, quote posts, and low-like replies", () => {
    const base = createFeedItem();
    const repost = createFeedItem({
      post: { ...base.post, uri: "at://did:plc:alice/app.bsky.feed.post/2" },
      reason: {
        $type: "app.bsky.feed.defs#reasonRepost",
        by: { did: "did:plc:bob", handle: "bob.test" },
        indexedAt: "2026-03-28T12:10:00.000Z",
      },
    });
    const reply = createFeedItem({
      post: { ...base.post, likeCount: 2, uri: "at://did:plc:alice/app.bsky.feed.post/3" },
      reply: {
        parent: { $type: "app.bsky.feed.defs#postView", ...base.post },
        root: { $type: "app.bsky.feed.defs#postView", ...base.post },
      },
    });
    const quote = createFeedItem({
      post: {
        ...base.post,
        embed: {
          $type: "app.bsky.embed.record#view",
          record: { uri: "at://did:plc:bob/app.bsky.feed.post/9" },
        },
        uri: "at://did:plc:alice/app.bsky.feed.post/4",
      },
    });

    const filtered = applyFeedPreferences(
      [base, repost, reply, quote],
      createPref({ hideQuotePosts: true, hideReplies: true, hideReposts: true }),
    );

    expect(filtered).toEqual([base]);
    expect(applyFeedPreferences([reply], createPref({ hideRepliesByLikeCount: 5 }))).toEqual([]);
  });

  it("builds feed commands per saved feed type", () => {
    const timeline: SavedFeedItem = { id: "following", pinned: true, type: "timeline", value: "following" };
    const feed: SavedFeedItem = {
      id: "custom",
      pinned: true,
      type: "feed",
      value: "at://did:plc:alice/app.bsky.feed.generator/custom",
    };
    const list: SavedFeedItem = {
      id: "list",
      pinned: false,
      type: "list",
      value: "at://did:plc:alice/app.bsky.graph.list/list",
    };

    expect(getFeedCommand(timeline)).toEqual({
      args: expect.any(Function),
      name: "get_timeline",
    });
    expect(getFeedCommand(feed).name).toBe("get_feed");
    expect(getFeedCommand(list).name).toBe("get_list_feed");
    expect(getFeedCommand(list).args("cursor-1", 30)).toEqual({
      cursor: "cursor-1",
      limit: 30,
      uri: list.value,
    });
  });

  it("encodes and decodes thread routes", () => {
    const uri = "at://did:plc:alice/app.bsky.feed.post/abc123";

    expect(buildThreadRoute(uri)).toBe("/timeline/thread/at%3A%2F%2Fdid%3Aplc%3Aalice%2Fapp.bsky.feed.post%2Fabc123");
    expect(decodeThreadRouteUri("at%3A%2F%2Fdid%3Aplc%3Aalice%2Fapp.bsky.feed.post%2Fabc123")).toBe(uri);
    expect(decodeThreadRouteUri(uri)).toBe(uri);
    expect(decodeThreadRouteUri("https%3A%2F%2Fexample.com")).toBeNull();
  });
});

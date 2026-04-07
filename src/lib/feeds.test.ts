import { describe, expect, it } from "vitest";
import {
  applyFeedPreferences,
  buildPublicPostUrl,
  buildThreadOverlayRoute,
  decodeThreadRouteUri,
  getFeedCommand,
  getThreadOverlayUri,
  parseFeedResponse,
  parseThreadResponse,
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
        embed: { $type: "app.bsky.embed.record#view", record: { uri: "at://did:plc:bob/app.bsky.feed.post/9" } },
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

  it("treats zero as an active reply-like threshold", () => {
    const reply = createFeedItem({
      post: { ...createFeedItem().post, likeCount: 0, uri: "at://did:plc:alice/app.bsky.feed.post/zero" },
      reply: {
        parent: { $type: "app.bsky.feed.defs#postView", ...createFeedItem().post },
        root: { $type: "app.bsky.feed.defs#postView", ...createFeedItem().post },
      },
    });

    expect(applyFeedPreferences([reply], createPref({ hideRepliesByLikeCount: 0 }))).toEqual([reply]);
    expect(applyFeedPreferences([reply], createPref({ hideRepliesByLikeCount: 1 }))).toEqual([]);
  });

  it("detects replies from the embedded record and respects the unfollowed reply filter", () => {
    const base = createFeedItem();
    const unfollowedReply = createFeedItem({
      post: {
        ...base.post,
        author: { did: "did:plc:bob", handle: "bob.test", viewer: { following: null } },
        record: {
          createdAt: "2026-03-28T12:00:00.000Z",
          reply: { parent: { uri: "at://did:plc:alice/app.bsky.feed.post/1" } },
          text: "reply from unfollowed author",
        },
        uri: "at://did:plc:bob/app.bsky.feed.post/2",
      },
    });

    expect(applyFeedPreferences([unfollowedReply], createPref({ hideReplies: true }))).toEqual([]);
    expect(applyFeedPreferences([unfollowedReply], createPref({ hideRepliesByUnfollowed: true }))).toEqual([]);
    expect(applyFeedPreferences([unfollowedReply], createPref({ hideRepliesByUnfollowed: false }))).toEqual([
      unfollowedReply,
    ]);
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

    expect(getFeedCommand(timeline)).toEqual({ args: expect.any(Function), name: "get_timeline" });
    expect(getFeedCommand(feed).name).toBe("get_feed");
    expect(getFeedCommand(list).name).toBe("get_list_feed");
    expect(getFeedCommand(list).args("cursor-1", 30)).toEqual({ cursor: "cursor-1", limit: 30, uri: list.value });
  });

  it("encodes and decodes thread overlays", () => {
    const uri = "at://did:plc:alice/app.bsky.feed.post/abc123";

    expect(buildThreadOverlayRoute("/profile/alice", "", uri)).toBe(
      "/profile/alice?thread=at%3A%2F%2Fdid%3Aplc%3Aalice%2Fapp.bsky.feed.post%2Fabc123",
    );
    expect(buildThreadOverlayRoute("/profile/alice", "?foo=bar", uri)).toBe(
      "/profile/alice?foo=bar&thread=at%3A%2F%2Fdid%3Aplc%3Aalice%2Fapp.bsky.feed.post%2Fabc123",
    );
    expect(buildThreadOverlayRoute("/profile/alice", "?foo=bar&thread=old", null)).toBe("/profile/alice?foo=bar");
    expect(getThreadOverlayUri("?thread=at%3A%2F%2Fdid%3Aplc%3Aalice%2Fapp.bsky.feed.post%2Fabc123")).toBe(uri);
    expect(decodeThreadRouteUri("at%3A%2F%2Fdid%3Aplc%3Aalice%2Fapp.bsky.feed.post%2Fabc123")).toBe(uri);
    expect(decodeThreadRouteUri(uri)).toBe(uri);
    expect(decodeThreadRouteUri("https%3A%2F%2Fexample.com")).toBeNull();
  });

  it("builds public post urls from handles and post rkeys", () => {
    expect(buildPublicPostUrl(createFeedItem().post)).toBe("https://bsky.app/profile/alice.test/post/1");
  });

  it("falls back to did-based post urls when handle is missing", () => {
    const postWithoutHandle = {
      ...createFeedItem().post,
      author: { did: "did:plc:alice", handle: undefined as unknown as string },
    };

    expect(buildPublicPostUrl(postWithoutHandle)).toBe("https://bsky.app/profile/did%3Aplc%3Aalice/post/1");
  });

  it("rejects malformed feed payloads", () => {
    expect(() => parseFeedResponse({ cursor: null, feed: {} })).toThrow("feed response payload is invalid");
    expect(() => parseFeedResponse({ cursor: 42, feed: [] })).toThrow("feed response cursor is invalid");
  });

  it("rejects malformed thread payloads", () => {
    expect(() => parseThreadResponse({ thread: { nope: true } })).toThrow("thread response payload is invalid");
  });
});

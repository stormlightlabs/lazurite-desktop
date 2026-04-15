import { describe, expect, it } from "vitest";
import { filterProfileFeed, parseActorList, parseProfileResult } from "../profile";
import type { FeedViewPost } from "../types";

function createFeedItem(overrides: Partial<FeedViewPost> = {}): FeedViewPost {
  return {
    post: {
      author: { did: "did:plc:alice", handle: "alice.test" },
      cid: "cid-1",
      indexedAt: "2026-03-28T12:00:00.000Z",
      record: { createdAt: "2026-03-28T12:00:00.000Z", text: "hello world" },
      uri: "at://did:plc:alice/app.bsky.feed.post/1",
    },
    ...overrides,
  };
}

describe("profile helpers", () => {
  it("parses actor lists with bios and follow state", () => {
    const response = parseActorList({
      cursor: "cursor-1",
      followers: [{
        avatar: "https://example.com/avatar.png",
        description: "Writes about protocol design.",
        did: "did:plc:bob",
        displayName: "Bob",
        handle: "bob.test",
        viewer: { following: "at://did:plc:alice/app.bsky.graph.follow/1" },
      }],
    }, "followers");

    expect(response).toEqual({
      cursor: "cursor-1",
      actors: [{
        avatar: "https://example.com/avatar.png",
        description: "Writes about protocol design.",
        did: "did:plc:bob",
        displayName: "Bob",
        handle: "bob.test",
        labels: [],
        viewer: { following: "at://did:plc:alice/app.bsky.graph.follow/1" },
      }],
    });
  });

  it("filters profile feeds by tab semantics", () => {
    const base = createFeedItem();
    const reply = createFeedItem({
      post: { ...base.post, uri: "at://did:plc:alice/app.bsky.feed.post/2" },
      reply: {
        parent: { $type: "app.bsky.feed.defs#postView", ...base.post },
        root: { $type: "app.bsky.feed.defs#postView", ...base.post },
      },
    });
    const media = createFeedItem({
      post: {
        ...base.post,
        embed: { $type: "app.bsky.embed.images#view", images: [{ thumb: "https://example.com/thumb.png" }] },
        uri: "at://did:plc:alice/app.bsky.feed.post/3",
      },
    });

    expect(filterProfileFeed([base, reply, media], "posts")).toEqual([base, media]);
    expect(filterProfileFeed([base, reply, media], "replies")).toEqual([reply]);
    expect(filterProfileFeed([base, reply, media], "media")).toEqual([media]);
    expect(filterProfileFeed([base, reply, media], "likes")).toEqual([base, reply, media]);
  });

  it("parses available and unavailable profile results", () => {
    expect(
      parseProfileResult({
        status: "available",
        profile: { did: "did:plc:bob", handle: "bob.test", displayName: "Bob" },
      }),
    ).toEqual({
      status: "available",
      profile: {
        avatar: null,
        banner: null,
        createdAt: null,
        description: null,
        descriptionFacets: null,
        did: "did:plc:bob",
        displayName: "Bob",
        followersCount: null,
        followsCount: null,
        handle: "bob.test",
        indexedAt: null,
        labels: [],
        pinnedPost: null,
        postsCount: null,
        pronouns: null,
        viewer: null,
        website: null,
      },
    });

    expect(
      parseProfileResult({
        status: "unavailable",
        requestedActor: "missing.test",
        handle: "missing.test",
        reason: "notFound",
        message: "This profile could not be found.",
      }),
    ).toEqual({
      status: "unavailable",
      requestedActor: "missing.test",
      did: null,
      handle: "missing.test",
      reason: "notFound",
      message: "This profile could not be found.",
    });
  });
});

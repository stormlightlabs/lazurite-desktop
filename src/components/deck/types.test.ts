import { describe, expect, it } from "vitest";
import { parseFeedConfig, resolveFeedColumn } from "./types";

describe("deck feed column helpers", () => {
  it("rejects malformed feed configs", () => {
    expect(parseFeedConfig(JSON.stringify({ feedType: "timeline" }))).toBeNull();
    expect(parseFeedConfig(JSON.stringify({ feedType: "wat", feedUri: "following" }))).toBeNull();
    expect(parseFeedConfig(JSON.stringify({ feedType: "feed", feedUri: 42 }))).toBeNull();
    expect(parseFeedConfig(JSON.stringify({ feedType: "feed", feedUri: "at://feed", title: 42 }))).toBeNull();
  });

  it("resolves deck feed columns from the shared feed model", () => {
    const resolved = resolveFeedColumn({
      feedType: "feed",
      feedUri: "at://did:plc:alice/app.bsky.feed.generator/test-feed",
    }, {
      generator: {
        did: "did:plc:alice",
        displayName: "For You",
        uri: "at://did:plc:alice/app.bsky.feed.generator/test-feed",
      },
    });

    expect(resolved.feed).toEqual({
      id: "at://did:plc:alice/app.bsky.feed.generator/test-feed",
      pinned: false,
      type: "feed",
      value: "at://did:plc:alice/app.bsky.feed.generator/test-feed",
    });
    expect(resolved.title).toBe("For You");
    expect(resolved.generator?.displayName).toBe("For You");
  });
});

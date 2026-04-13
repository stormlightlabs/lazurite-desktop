import { beforeEach, describe, expect, it } from "vitest";
import {
  applyFeedPreferences,
  buildPublicPostUrl,
  buildThreadOverlayRoute,
  decodeThreadRouteUri,
  getFeedCommand,
  getQuotedPresentation,
  getThreadOverlayUri,
  getUnknownEmbedTelemetryForTests,
  type NormalizedEmbed,
  normalizeEmbed,
  parseFeedResponse,
  parseThreadResponse,
  resetUnknownEmbedTelemetryForTests,
} from "../feeds";
import type { FeedViewPost, FeedViewPrefItem, SavedFeedItem } from "../types";

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

function walkNormalizedEmbeds(root: NormalizedEmbed, visit: (embed: NormalizedEmbed) => void) {
  visit(root);
  if (root.kind === "record") {
    for (const nested of root.quoted.normalizedEmbeds) {
      walkNormalizedEmbeds(nested, visit);
    }
  }
  if (root.kind === "recordWithMedia") {
    if (root.media) {
      walkNormalizedEmbeds(root.media, visit);
    }
    for (const nested of root.quoted.normalizedEmbeds) {
      walkNormalizedEmbeds(nested, visit);
    }
  }
}

describe("feed helpers", () => {
  beforeEach(() => {
    resetUnknownEmbedTelemetryForTests();
  });

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

  it("builds feed/list quoted-record presentations without thread URIs", () => {
    const feedPresentation = getQuotedPresentation({
      $type: "app.bsky.embed.record#view",
      record: {
        $type: "app.bsky.feed.defs#generatorView",
        creator: { did: "did:plc:alice", handle: "alice.test" },
        displayName: "For You",
        uri: "at://did:plc:alice/app.bsky.feed.generator/for-you",
      },
    });
    const listPresentation = getQuotedPresentation({
      $type: "app.bsky.embed.record#view",
      record: {
        $type: "app.bsky.graph.defs#listView",
        creator: { did: "did:plc:alice", handle: "alice.test" },
        name: "Reading List",
        uri: "at://did:plc:alice/app.bsky.graph.list/reading-list",
      },
    });

    expect(feedPresentation).toMatchObject({
      href: "https://bsky.app/profile/alice.test/feed/for-you",
      kind: "feed",
      title: "Embedded feed",
      uri: null,
    });
    expect(listPresentation).toMatchObject({
      href: "https://bsky.app/profile/alice.test/lists/reading-list",
      kind: "list",
      title: "Embedded list",
      uri: null,
    });
  });

  it("keeps post quoted-record presentations thread-openable", () => {
    const postPresentation = getQuotedPresentation({
      $type: "app.bsky.embed.record#view",
      record: {
        $type: "app.bsky.embed.record#viewRecord",
        author: { did: "did:plc:bob", handle: "bob.test" },
        uri: "at://did:plc:bob/app.bsky.feed.post/123",
        value: { text: "quoted body" },
      },
    });

    expect(postPresentation).toMatchObject({
      href: "https://bsky.app/profile/bob.test/post/123",
      kind: "post",
      text: "quoted body",
      title: "Quoted post",
      uri: "at://did:plc:bob/app.bsky.feed.post/123",
    });
  });

  it("extracts text, facets, and embed media from quoted postView records", () => {
    const presentation = getQuotedPresentation({
      $type: "app.bsky.embed.record#view",
      record: {
        $type: "app.bsky.feed.defs#postView",
        author: { did: "did:plc:bob", handle: "bob.test" },
        record: {
          text: "quoted postView body",
          facets: [{
            features: [{ $type: "app.bsky.richtext.facet#link", uri: "https://example.com" }],
            index: { byteEnd: 20, byteStart: 0 },
          }],
          embed: {
            $type: "app.bsky.embed.images#view",
            images: [{ fullsize: "https://cdn.example.com/postview-image.png" }],
          },
        },
        uri: "at://did:plc:bob/app.bsky.feed.post/postview",
      },
    });

    expect(presentation).toMatchObject({
      href: "https://bsky.app/profile/bob.test/post/postview",
      kind: "post",
      text: "quoted postView body",
      uri: "at://did:plc:bob/app.bsky.feed.post/postview",
    });
    expect(presentation.facets).toHaveLength(1);
    expect(presentation.normalizedEmbeds.map((embed) => embed.kind)).toEqual(["images"]);
  });

  it("hydrates quoted record image blobs into renderable CDN URLs", () => {
    const presentation = getQuotedPresentation({
      $type: "app.bsky.embed.record#view",
      record: {
        $type: "app.bsky.feed.defs#postView",
        author: { did: "did:plc:bob", handle: "bob.test" },
        record: {
          embed: {
            $type: "app.bsky.embed.images",
            images: [{ alt: "Blob image", image: { mimeType: "image/jpeg", ref: { $link: "bafyblobimg" } } }],
          },
          text: "",
        },
        uri: "at://did:plc:bob/app.bsky.feed.post/blob-post",
      },
    });

    expect(presentation.normalizedEmbeds).toHaveLength(1);
    expect(presentation.normalizedEmbeds[0]?.kind).toBe("images");
    if (presentation.normalizedEmbeds[0]?.kind === "images") {
      expect(presentation.normalizedEmbeds[0].embed.images[0]).toMatchObject({
        fullsize: "https://cdn.bsky.app/img/feed_fullsize/plain/did%3Aplc%3Abob/bafyblobimg@jpeg",
        thumb: "https://cdn.bsky.app/img/feed_thumbnail/plain/did%3Aplc%3Abob/bafyblobimg@jpeg",
      });
    }
  });

  it("extracts quoted post embeds and keeps unknown custom embeds in the unknown list", () => {
    const presentation = getQuotedPresentation({
      $type: "app.bsky.embed.record#view",
      record: {
        $type: "app.bsky.embed.record#viewRecord",
        author: { did: "did:plc:bob", handle: "bob.test" },
        embeds: [
          { $type: "app.bsky.embed.images#view", images: [{ fullsize: "https://cdn.example.com/quoted-image.png" }] },
          { $type: "app.bsky.embed.video#view", playlist: "https://cdn.example.com/quoted-video.m3u8" },
          { $type: "app.bsky.embed.external#view", external: { uri: "https://example.com", title: "External card" } },
          { $type: "app.bsky.embed.unsupported#view" },
        ],
        uri: "at://did:plc:bob/app.bsky.feed.post/123",
        value: { text: "quoted body" },
      },
    });

    expect(presentation.normalizedEmbeds).toHaveLength(4);
    expect(presentation.normalizedEmbeds.map((embed) => embed.kind)).toEqual([
      "images",
      "video",
      "external",
      "unknown",
    ]);
    expect(presentation.unknownEmbeds).toHaveLength(1);
  });

  it("normalizes every official top-level embed kind without treating them as unknown", () => {
    const fixtures = [{
      expectedKind: "images",
      value: { $type: "app.bsky.embed.images#view", images: [{ fullsize: "https://cdn.example.com/top-image.png" }] },
    }, {
      expectedKind: "video",
      value: { $type: "app.bsky.embed.video#view", playlist: "https://cdn.example.com/top-video.m3u8" },
    }, {
      expectedKind: "external",
      value: { $type: "app.bsky.embed.external#view", external: { title: "External", uri: "https://example.com" } },
    }, {
      expectedKind: "record",
      value: {
        $type: "app.bsky.embed.record#view",
        record: {
          $type: "app.bsky.embed.record#viewRecord",
          author: { did: "did:plc:bob", handle: "bob.test" },
          uri: "at://did:plc:bob/app.bsky.feed.post/quoted-a",
          value: { text: "quoted a" },
        },
      },
    }, {
      expectedKind: "recordWithMedia",
      value: {
        $type: "app.bsky.embed.recordWithMedia#view",
        media: {
          $type: "app.bsky.embed.images#view",
          images: [{ fullsize: "https://cdn.example.com/top-rwm-image.png" }],
        },
        record: {
          $type: "app.bsky.embed.record#view",
          record: {
            $type: "app.bsky.embed.record#viewRecord",
            author: { did: "did:plc:bob", handle: "bob.test" },
            uri: "at://did:plc:bob/app.bsky.feed.post/quoted-b",
            value: { text: "quoted b" },
          },
        },
      },
    }] as const;

    for (const fixture of fixtures) {
      const normalized = normalizeEmbed(fixture.value, { source: "top" });
      expect(normalized.kind).toBe(fixture.expectedKind);
      expect(normalized.kind).not.toBe("unknown");
      if (normalized.kind === "record" || normalized.kind === "recordWithMedia") {
        expect(normalized.quoted.unknownEmbeds).toHaveLength(0);
      }
    }
  });

  it("covers official quoted record union variants without emitting unknown embeds", () => {
    const fixtures = [{
      expectedKind: "post",
      record: {
        $type: "app.bsky.embed.record#viewRecord",
        author: { did: "did:plc:bob", handle: "bob.test" },
        uri: "at://did:plc:bob/app.bsky.feed.post/1",
        value: { text: "post record" },
      },
    }, {
      expectedKind: "not-found",
      record: {
        $type: "app.bsky.embed.record#viewNotFound",
        notFound: true,
        uri: "at://did:plc:bob/app.bsky.feed.post/2",
      },
    }, {
      expectedKind: "blocked",
      record: {
        $type: "app.bsky.embed.record#viewBlocked",
        blocked: true,
        uri: "at://did:plc:bob/app.bsky.feed.post/3",
      },
    }, {
      expectedKind: "detached",
      record: {
        $type: "app.bsky.embed.record#viewDetached",
        detached: true,
        uri: "at://did:plc:bob/app.bsky.feed.post/4",
      },
    }, {
      expectedKind: "feed",
      record: {
        $type: "app.bsky.feed.defs#generatorView",
        creator: { did: "did:plc:bob", handle: "bob.test" },
        uri: "at://did:plc:bob/app.bsky.feed.generator/following",
      },
    }, {
      expectedKind: "list",
      record: {
        $type: "app.bsky.graph.defs#listView",
        creator: { did: "did:plc:bob", handle: "bob.test" },
        uri: "at://did:plc:bob/app.bsky.graph.list/curated",
      },
    }, {
      expectedKind: "labeler",
      record: {
        $type: "app.bsky.labeler.defs#labelerView",
        creator: { did: "did:plc:bob", handle: "bob.test" },
        uri: "at://did:plc:bob/app.bsky.labeler.service/self",
      },
    }, {
      expectedKind: "starter-pack",
      record: {
        $type: "app.bsky.graph.defs#starterPackViewBasic",
        creator: { did: "did:plc:bob", handle: "bob.test" },
        record: { name: "Starter Pack" },
        uri: "at://did:plc:bob/app.bsky.graph.starterpack/abc123",
      },
    }] as const;

    for (const fixture of fixtures) {
      const presentation = getQuotedPresentation({ $type: "app.bsky.embed.record#view", record: fixture.record });

      expect(presentation.kind).toBe(fixture.expectedKind);
      expect(presentation.unknownEmbeds).toHaveLength(0);
    }
  });

  it("infers malformed but recognizable embed shapes without adding unknown embeds", () => {
    const inferredImages = normalizeEmbed({ images: [{ fullsize: "https://cdn.example.com/inferred-image.png" }] }, {
      source: "quoted",
    });
    const inferredVideo = normalizeEmbed({ playlist: "https://cdn.example.com/inferred-video.m3u8" }, {
      source: "quoted",
    });
    const inferredExternal = normalizeEmbed({
      external: { title: "Inferred external", uri: "https://example.com/inferred" },
    }, { source: "quoted" });
    const inferredRecord = normalizeEmbed({ record: { uri: "at://did:plc:bob/app.bsky.feed.post/inferred" } }, {
      source: "quoted",
    });
    const inferredRecordWithMedia = normalizeEmbed({
      media: { images: [{ fullsize: "https://cdn.example.com/inferred-rwm.png" }] },
      record: { uri: "at://did:plc:bob/app.bsky.feed.post/inferred-rwm" },
    }, { source: "quoted" });

    expect(inferredImages.kind).toBe("images");
    expect(inferredVideo.kind).toBe("video");
    expect(inferredExternal.kind).toBe("external");
    expect(inferredRecord.kind).toBe("record");
    expect(inferredRecordWithMedia.kind).toBe("recordWithMedia");
  });

  it("uses quoted embed extraction precedence: embeds > value.embed > value.embeds", () => {
    const fromEmbeds = getQuotedPresentation({
      $type: "app.bsky.embed.record#view",
      record: {
        $type: "app.bsky.embed.record#viewRecord",
        embeds: [{ $type: "app.bsky.embed.images#view", images: [{ fullsize: "https://cdn.example.com/a.png" }] }],
        uri: "at://did:plc:bob/app.bsky.feed.post/a",
        value: {
          embed: { $type: "app.bsky.embed.video#view", playlist: "https://cdn.example.com/a.m3u8" },
          embeds: [{ $type: "app.bsky.embed.external#view", external: { title: "A", uri: "https://example.com/a" } }],
          text: "a",
        },
      },
    });
    const fromValueEmbed = getQuotedPresentation({
      $type: "app.bsky.embed.record#view",
      record: {
        $type: "app.bsky.embed.record#viewRecord",
        uri: "at://did:plc:bob/app.bsky.feed.post/b",
        value: {
          embed: { $type: "app.bsky.embed.video#view", playlist: "https://cdn.example.com/b.m3u8" },
          embeds: [{ $type: "app.bsky.embed.external#view", external: { title: "B", uri: "https://example.com/b" } }],
          text: "b",
        },
      },
    });
    const fromValueEmbeds = getQuotedPresentation({
      $type: "app.bsky.embed.record#view",
      record: {
        $type: "app.bsky.embed.record#viewRecord",
        uri: "at://did:plc:bob/app.bsky.feed.post/c",
        value: {
          embeds: [{ $type: "app.bsky.embed.external#view", external: { title: "C", uri: "https://example.com/c" } }],
          text: "c",
        },
      },
    });

    expect(fromEmbeds.normalizedEmbeds).toHaveLength(1);
    expect(fromEmbeds.normalizedEmbeds[0]?.kind).toBe("images");
    expect(fromEmbeds.normalizedEmbeds[0]?.meta.source).toBe("viewRecord.embeds");

    expect(fromValueEmbed.normalizedEmbeds).toHaveLength(1);
    expect(fromValueEmbed.normalizedEmbeds[0]?.kind).toBe("video");
    expect(fromValueEmbed.normalizedEmbeds[0]?.meta.source).toBe("value.embed");

    expect(fromValueEmbeds.normalizedEmbeds).toHaveLength(1);
    expect(fromValueEmbeds.normalizedEmbeds[0]?.kind).toBe("external");
    expect(fromValueEmbeds.normalizedEmbeds[0]?.meta.source).toBe("value.embeds");
  });

  it("keeps unknown custom embeds visible and aggregates telemetry by fingerprint", () => {
    const custom = { $type: "dev.example.embed#view", payload: { nested: { key: "value" } } };
    const topUnknownA = normalizeEmbed(custom, { source: "top" });
    const topUnknownB = normalizeEmbed(custom, { source: "top" });
    const quoted = getQuotedPresentation({
      $type: "app.bsky.embed.record#view",
      record: {
        $type: "app.bsky.embed.record#viewRecord",
        embeds: [
          { $type: "app.bsky.embed.images#view", images: [{ fullsize: "https://cdn.example.com/known.png" }] },
          custom,
        ],
        uri: "at://did:plc:bob/app.bsky.feed.post/custom",
        value: { text: "custom quote" },
      },
    });

    expect(topUnknownA.kind).toBe("unknown");
    expect(topUnknownB.kind).toBe("unknown");
    expect(quoted.normalizedEmbeds.map((embed) => embed.kind)).toEqual(["images", "unknown"]);
    expect(quoted.unknownEmbeds).toHaveLength(1);

    const telemetry = [...getUnknownEmbedTelemetryForTests().values()];
    expect(telemetry.length).toBeGreaterThan(0);
    expect(Math.max(...telemetry)).toBeGreaterThanOrEqual(2);
  });

  it("guards against deep nesting and embed cycles", () => {
    const deep = {
      $type: "app.bsky.embed.record#view",
      record: {
        $type: "app.bsky.embed.record#viewRecord",
        embeds: [{
          $type: "app.bsky.embed.record#view",
          record: {
            $type: "app.bsky.embed.record#viewRecord",
            embeds: [{
              $type: "app.bsky.embed.record#view",
              record: {
                $type: "app.bsky.embed.record#viewRecord",
                embeds: [{
                  $type: "app.bsky.embed.record#view",
                  record: {
                    $type: "app.bsky.embed.record#viewRecord",
                    embeds: [{
                      $type: "app.bsky.embed.record#view",
                      record: {
                        $type: "app.bsky.embed.record#viewRecord",
                        uri: "at://did:plc:bob/app.bsky.feed.post/deep-leaf",
                        value: { text: "leaf" },
                      },
                    }],
                    uri: "at://did:plc:bob/app.bsky.feed.post/deep-4",
                    value: { text: "deep-4" },
                  },
                }],
                uri: "at://did:plc:bob/app.bsky.feed.post/deep-3",
                value: { text: "deep-3" },
              },
            }],
            uri: "at://did:plc:bob/app.bsky.feed.post/deep-2",
            value: { text: "deep-2" },
          },
        }],
        uri: "at://did:plc:bob/app.bsky.feed.post/deep-root",
        value: { text: "deep-root" },
      },
    };
    const depthLimited = normalizeEmbed(deep, { maxDepth: 3, source: "top" });
    const seen: NormalizedEmbed[] = [];
    walkNormalizedEmbeds(depthLimited, (embed) => seen.push(embed));

    expect(seen.some((embed) => embed.meta.depthLimited)).toBe(true);

    const cycleRoot: Record<string, unknown> = {
      $type: "app.bsky.embed.record#view",
      record: {
        $type: "app.bsky.embed.record#viewRecord",
        uri: "at://did:plc:bob/app.bsky.feed.post/cycle-root",
        value: { text: "cycle root" },
      },
    };
    const cycleRecord = cycleRoot.record as Record<string, unknown>;
    cycleRecord.embeds = [cycleRoot];

    const cycleNormalized = normalizeEmbed(cycleRoot, { source: "top" });
    expect(cycleNormalized.kind).toBe("record");
    if (cycleNormalized.kind === "record") {
      expect(cycleNormalized.quoted.normalizedEmbeds).toHaveLength(1);
      expect(cycleNormalized.quoted.normalizedEmbeds[0]?.kind).toBe("recognized-unrenderable");
      expect(cycleNormalized.quoted.normalizedEmbeds[0]?.meta.cycle).toBe(true);
    }
  });

  it("builds starter-pack and labeler external links", () => {
    const starterPack = getQuotedPresentation({
      $type: "app.bsky.embed.record#view",
      record: {
        $type: "app.bsky.graph.defs#starterPackViewBasic",
        creator: { did: "did:plc:alice", handle: "alice.test" },
        uri: "at://did:plc:alice/app.bsky.graph.starterpack/3lxyx7z7p2f2u",
      },
    });
    const labeler = getQuotedPresentation({
      $type: "app.bsky.embed.record#view",
      record: {
        $type: "app.bsky.labeler.defs#labelerView",
        creator: { did: "did:plc:labeler123", handle: "labeler.example" },
        uri: "at://did:plc:labeler123/app.bsky.labeler.service/self",
      },
    });

    expect(starterPack.href).toBe("https://bsky.app/starter-pack/did%3Aplc%3Aalice/3lxyx7z7p2f2u");
    expect(labeler.href).toBe("https://bsky.app/profile/labeler.example");
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

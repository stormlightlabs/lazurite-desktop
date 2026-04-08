import { render } from "@solidjs/testing-library";
import { createSignal } from "solid-js";
import { describe, expect, it, vi } from "vitest";
import { FeedContent } from "../FeedContent";

function createFeedItem(id: string) {
  return {
    post: {
      author: { did: `did:plc:${id}`, handle: `${id}.test`, displayName: `Author ${id}` },
      cid: `cid-${id}`,
      indexedAt: "2026-03-28T12:00:00.000Z",
      likeCount: 0,
      record: { createdAt: "2026-03-28T12:00:00.000Z", text: `Post ${id}` },
      replyCount: 0,
      repostCount: 0,
      uri: `at://did:plc:${id}/app.bsky.feed.post/${id}`,
      viewer: {},
    },
  };
}

const baseProps = {
  activeFeedState: {
    cursor: null,
    error: null,
    items: [createFeedItem("1"), createFeedItem("2")],
    loading: false,
    loadingMore: false,
  },
  bookmarkPendingByUri: {},
  likePendingByUri: {},
  likePulseUri: null,
  onBookmark: vi.fn(async () => {}),
  onFocusIndex: vi.fn(),
  onLike: vi.fn(async () => {}),
  onOpenEngagement: vi.fn(async () => {}),
  onOpenThread: vi.fn(async () => {}),
  onQuote: vi.fn(),
  onReply: vi.fn(),
  onRepost: vi.fn(async () => {}),
  postRefs: new Map<string, HTMLElement>(),
  repostPendingByUri: {},
  repostPulseUri: null,
  sentinelRef: vi.fn(),
  visibleItems: [createFeedItem("1"), createFeedItem("2")],
};

describe("FeedContent", () => {
  it("keeps the active feed container stable for focus-only updates", () => {
    let setFocusedIndex!: (value: number) => void;

    const { container } = render(() => {
      const [focusedIndex, updateFocusedIndex] = createSignal(0);
      setFocusedIndex = updateFocusedIndex;

      return <FeedContent {...baseProps} activeFeedId="following" focusedIndex={focusedIndex()} />;
    });

    const before = container.querySelector("[data-feed-id='following']");
    expect(before).not.toBeNull();

    setFocusedIndex(1);

    const after = container.querySelector("[data-feed-id='following']");
    expect(after).toBe(before);
  });

  it("updates the rendered feed id without tearing down the list container", () => {
    let setActiveFeedId!: (value: string) => void;

    const { container } = render(() => {
      const [activeFeedId, updateActiveFeedId] = createSignal("following");
      setActiveFeedId = updateActiveFeedId;

      return <FeedContent {...baseProps} activeFeedId={activeFeedId()} focusedIndex={0} />;
    });

    const before = container.querySelector("[data-feed-id='following']");
    expect(before).not.toBeNull();

    setActiveFeedId("custom");

    const after = container.querySelector("[data-feed-id='custom']");
    expect(after).not.toBeNull();
    expect(after).toBe(before);
  });
});

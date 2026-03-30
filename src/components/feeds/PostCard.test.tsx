import { fireEvent, render, screen } from "@solidjs/testing-library";
import { describe, expect, it, vi } from "vitest";
import { PostCard } from "./PostCard";

function createPost() {
  return {
    author: { did: "did:plc:alice", handle: "alice.test", displayName: "Alice" },
    cid: "cid-post",
    indexedAt: "2026-03-28T12:00:00.000Z",
    likeCount: 4,
    record: { createdAt: "2026-03-28T12:00:00.000Z", text: "Visit https://example.com @bob.test #solid" },
    replyCount: 2,
    repostCount: 1,
    uri: "at://did:plc:alice/app.bsky.feed.post/123",
    viewer: {},
  } as const;
}

describe("PostCard", () => {
  it("linkifies urls and keeps mentions and hashtags visible", () => {
    render(() => <PostCard post={createPost()} />);

    expect(screen.getByRole("link", { name: "https://example.com" })).toHaveAttribute("href", "https://example.com");
    expect(screen.getByText("@bob.test")).toBeInTheDocument();
    expect(screen.getByText("#solid")).toBeInTheDocument();
  });

  it("opens the thread when Enter is pressed on the card", async () => {
    const onOpenThread = vi.fn();
    render(() => <PostCard post={createPost()} onOpenThread={onOpenThread} />);

    await new Promise((resolve) => {
      fireEvent.keyDown(screen.getByRole("article"), { key: "Enter" });
      resolve(void 0);
    });

    expect(onOpenThread).toHaveBeenCalledTimes(1);
  });

  it("shows reply context when the feed item is a reply", () => {
    render(() => (
      <PostCard
        item={{
          post: createPost(),
          reply: {
            parent: {
              $type: "app.bsky.feed.defs#postView",
              ...createPost(),
              author: { ...createPost().author, handle: "bob.test" },
            },
            root: { $type: "app.bsky.feed.defs#postView", ...createPost() },
          },
        }}
        post={createPost()} />
    ));

    expect(screen.getByText("Replying to @bob.test")).toBeInTheDocument();
  });
});

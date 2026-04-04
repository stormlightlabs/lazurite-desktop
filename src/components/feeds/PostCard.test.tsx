import { buildHashtagRoute } from "$/lib/search-routes";
import { fireEvent, render, screen, waitFor } from "@solidjs/testing-library";
import { describe, expect, it, vi } from "vitest";
import { PostCard } from "./PostCard";

function createPost() {
  return {
    author: { did: "did:plc:alice", handle: "alice.test", displayName: "Alice" },
    cid: "cid-post",
    indexedAt: "2026-03-28T12:00:00.000Z",
    likeCount: 4,
    record: {
      createdAt: "2026-03-28T12:00:00.000Z",
      facets: [{
        features: [{ $type: "app.bsky.richtext.facet#link", uri: "https://example.com" }],
        index: { byteEnd: 25, byteStart: 6 },
      }, {
        features: [{ $type: "app.bsky.richtext.facet#mention", did: "did:plc:bob" }],
        index: { byteEnd: 35, byteStart: 26 },
      }, { features: [{ $type: "app.bsky.richtext.facet#tag", tag: "solid" }], index: { byteEnd: 42, byteStart: 36 } }],
      text: "Visit https://example.com @bob.test #solid",
    },
    replyCount: 2,
    repostCount: 1,
    uri: "at://did:plc:alice/app.bsky.feed.post/123",
    viewer: {},
  } as const;
}

describe("PostCard", () => {
  it("renders links, mentions, and hashtags from facets", () => {
    render(() => <PostCard post={createPost()} />);

    expect(screen.getByRole("link", { name: "https://example.com" })).toHaveAttribute("href", "https://example.com");
    expect(screen.getByRole("link", { name: "@bob.test" })).toHaveAttribute("href", "#/profile/did%3Aplc%3Abob");
    expect(screen.getByRole("link", { name: "#solid" })).toHaveAttribute("href", `#${buildHashtagRoute("solid")}`);
  });

  it("opens the thread from the primary region on click and Enter", async () => {
    const onOpenThread = vi.fn();
    render(() => <PostCard post={createPost()} onOpenThread={onOpenThread} />);

    const primaryRegion = screen.getByRole("button", { name: "Open thread" });
    fireEvent.click(primaryRegion);
    fireEvent.keyDown(primaryRegion, { key: "Enter" });

    expect(onOpenThread).toHaveBeenCalledTimes(2);
  });

  it("does not open the thread when clicking the author link or an action button", () => {
    const onOpenThread = vi.fn();
    const onLike = vi.fn();
    render(() => <PostCard post={createPost()} onLike={onLike} onOpenThread={onOpenThread} />);

    fireEvent.click(screen.getByRole("link", { name: "Alice" }));
    fireEvent.click(screen.getByRole("button", { name: "4" }));

    expect(onOpenThread).not.toHaveBeenCalled();
    expect(onLike).toHaveBeenCalledTimes(1);
  });

  it("opens the shared menu from the overflow trigger and from right click", async () => {
    Object.assign(navigator, { clipboard: { writeText: vi.fn().mockResolvedValue(void 0) } });

    render(() => <PostCard post={createPost()} onOpenThread={vi.fn()} />);

    fireEvent.click(screen.getByRole("button", { name: "More actions" }));
    expect(screen.getByRole("menu", { name: "Post actions" })).toBeInTheDocument();

    fireEvent.pointerDown(document.body);
    await waitFor(() => expect(screen.queryByRole("menu", { name: "Post actions" })).not.toBeInTheDocument());

    fireEvent.contextMenu(screen.getByRole("article"));
    expect(screen.getByRole("menu", { name: "Post actions" })).toBeInTheDocument();
    expect(screen.getByRole("menuitem", { name: "Copy post link" })).toBeInTheDocument();
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

  it("renders recordWithMedia embeds as media plus quoted record", () => {
    render(() => (
      <PostCard
        post={{
          ...createPost(),
          embed: {
            $type: "app.bsky.embed.recordWithMedia#view",
            media: {
              $type: "app.bsky.embed.images#view",
              images: [{ alt: "Preview image", fullsize: "https://cdn.example.com/image.png" }],
            },
            record: {
              $type: "app.bsky.embed.record#view",
              record: {
                author: { did: "did:plc:bob", handle: "bob.test", displayName: "Bob" },
                uri: "at://did:plc:bob/app.bsky.feed.post/quoted",
                value: { text: "Quoted body" },
              },
            },
          },
        }} />
    ));

    expect(screen.getByAltText("Preview image")).toHaveAttribute("src", "https://cdn.example.com/image.png");
    expect(screen.getByText("Quoted post")).toBeInTheDocument();
    expect(screen.getByText("Quoted body")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /quoted body/i })).toHaveAttribute(
      "href",
      "https://bsky.app/profile/bob.test/post/quoted",
    );
  });
});

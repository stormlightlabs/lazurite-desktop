import { buildHashtagRoute } from "$/lib/search-routes";
import { fireEvent, render, screen, waitFor } from "@solidjs/testing-library";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { PostCard } from "../PostCard";

const downloadImageMock = vi.hoisted(() => vi.fn());
const downloadVideoMock = vi.hoisted(() => vi.fn());
const listenMock = vi.hoisted(() => vi.fn());
const moderateContentMock = vi.hoisted(() => vi.fn());
const createReportMock = vi.hoisted(() => vi.fn());
const blockActorMock = vi.hoisted(() => vi.fn());

vi.mock(
  "$/lib/api/media",
  () => ({ MediaController: { downloadImage: downloadImageMock, downloadVideo: downloadVideoMock } }),
);
vi.mock(
  "$/lib/api/moderation",
  () => ({
    MODERATION_REASON_OPTIONS: [{ label: "Spam", value: "com.atproto.moderation.defs#reasonSpam" }, {
      label: "Violation",
      value: "com.atproto.moderation.defs#reasonViolation",
    }],
    ModerationController: {
      moderateContent: moderateContentMock,
      createReport: createReportMock,
      blockActor: blockActorMock,
    },
  }),
);
vi.mock("@tauri-apps/api/event", () => ({ listen: listenMock }));

function createPost() {
  return {
    author: { did: "did:plc:alice", handle: "alice.test", displayName: "Alice" },
    cid: "cid-post",
    indexedAt: "2026-03-28T12:00:00.000Z",
    likeCount: 4,
    quoteCount: 2,
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
  beforeEach(() => {
    downloadImageMock.mockReset();
    downloadVideoMock.mockReset();
    listenMock.mockReset();
    moderateContentMock.mockReset();
    createReportMock.mockReset();
    blockActorMock.mockReset();
    listenMock.mockResolvedValue(() => {});
    moderateContentMock.mockResolvedValue({
      filter: false,
      blur: "none",
      alert: false,
      inform: false,
      noOverride: false,
    });
    createReportMock.mockResolvedValue(1);
    blockActorMock.mockResolvedValue({ uri: "at://did:plc:test/app.bsky.graph.block/1", cid: "cid-block" });
  });

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

  it("keeps profile navigation avatar/handle-only and does not open thread on profile/action clicks", () => {
    const onOpenThread = vi.fn();
    const onLike = vi.fn();
    render(() => <PostCard post={createPost()} onLike={onLike} onOpenThread={onOpenThread} />);

    expect(screen.getByRole("link", { name: "View @alice.test" })).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "Alice" })).not.toBeInTheDocument();
    expect(screen.getByRole("link", { name: "@alice.test" })).toBeInTheDocument();

    fireEvent.click(screen.getByRole("link", { name: "View @alice.test" }));
    fireEvent.click(screen.getByRole("link", { name: "@alice.test" }));
    fireEvent.click(screen.getByRole("button", { name: "Like" }));

    expect(onOpenThread).not.toHaveBeenCalled();
    expect(onLike).toHaveBeenCalledTimes(1);
  });

  it("opens the thread when clicking the author text region", () => {
    const onOpenThread = vi.fn();
    render(() => <PostCard post={createPost()} onOpenThread={onOpenThread} />);

    fireEvent.click(screen.getByText("Alice"));

    expect(onOpenThread).toHaveBeenCalledOnce();
  });

  it("opens the shared menu from the overflow trigger and from right click", async () => {
    Object.assign(navigator, { clipboard: { writeText: vi.fn().mockResolvedValue(void 0) } });
    const onOpenEngagement = vi.fn();

    render(() => <PostCard post={createPost()} onOpenEngagement={onOpenEngagement} onOpenThread={vi.fn()} />);

    fireEvent.click(screen.getByRole("button", { name: "More actions" }));
    expect(screen.getByRole("menu", { name: "Post actions" })).toBeInTheDocument();
    expect(screen.getByRole("menuitem", { name: "4 likes" })).toBeInTheDocument();
    expect(screen.getByRole("menuitem", { name: "1 repost" })).toBeInTheDocument();
    expect(screen.getByRole("menuitem", { name: "2 quotes" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("menuitem", { name: "4 likes" }));
    expect(onOpenEngagement).toHaveBeenCalledWith("likes");

    fireEvent.pointerDown(document.body);
    await waitFor(() => expect(screen.queryByRole("menu", { name: "Post actions" })).not.toBeInTheDocument());

    fireEvent.contextMenu(screen.getByRole("article"));
    expect(screen.getByRole("menu", { name: "Post actions" })).toBeInTheDocument();
    expect(screen.getByRole("menuitem", { name: "Copy post link" })).toBeInTheDocument();
  });

  it("uses shift-click on like/repost/quote to open engagement lists without toggling actions", () => {
    const onLike = vi.fn();
    const onQuote = vi.fn();
    const onRepost = vi.fn();
    const onOpenEngagement = vi.fn();
    render(() => (
      <PostCard
        post={createPost()}
        onLike={onLike}
        onOpenEngagement={onOpenEngagement}
        onQuote={onQuote}
        onRepost={onRepost} />
    ));

    fireEvent.click(screen.getByRole("button", { name: "Like" }), { shiftKey: true });
    fireEvent.click(screen.getByRole("button", { name: "Repost" }), { shiftKey: true });
    fireEvent.click(screen.getByRole("button", { name: "Quote" }), { shiftKey: true });

    expect(onOpenEngagement).toHaveBeenNthCalledWith(1, "likes");
    expect(onOpenEngagement).toHaveBeenNthCalledWith(2, "reposts");
    expect(onOpenEngagement).toHaveBeenNthCalledWith(3, "quotes");
    expect(onLike).not.toHaveBeenCalled();
    expect(onRepost).not.toHaveBeenCalled();
    expect(onQuote).not.toHaveBeenCalled();
  });

  it("hides Thread action when no known thread context exists", () => {
    render(() => (
      <PostCard
        post={{ ...createPost(), record: { ...createPost().record, reply: undefined }, replyCount: undefined }}
        onOpenThread={vi.fn()} />
    ));

    expect(screen.queryByRole("button", { name: "Thread" })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "More actions" }));
    expect(screen.queryByRole("menuitem", { name: "Open thread" })).not.toBeInTheDocument();
  });

  it("shows Thread action when reply count indicates known thread context", () => {
    render(() => <PostCard post={{ ...createPost(), replyCount: 1 }} onOpenThread={vi.fn()} />);

    expect(screen.getByRole("button", { name: "Thread" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "More actions" }));
    expect(screen.getByRole("menuitem", { name: "Open thread" })).toBeInTheDocument();
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

  it("falls back to did in reply context when parent handle is missing", () => {
    render(() => (
      <PostCard
        item={{
          post: createPost(),
          reply: {
            parent: {
              $type: "app.bsky.feed.defs#postView",
              ...createPost(),
              author: { did: "did:plc:bob", handle: undefined as unknown as string },
            },
            root: { $type: "app.bsky.feed.defs#postView", ...createPost() },
          },
        }}
        post={createPost()} />
    ));

    expect(screen.getByText("Replying to did:plc:bob")).toBeInTheDocument();
  });

  it("renders recordWithMedia embeds and opens quoted posts internally without bubbling", () => {
    const onOpenThread = vi.fn();
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
        }}
        onOpenThread={onOpenThread} />
    ));

    expect(screen.getByAltText("Preview image")).toHaveAttribute("src", "https://cdn.example.com/image.png");
    expect(screen.getByText("Quoted post")).toBeInTheDocument();
    expect(screen.getByText("Quoted body")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /quoted body/i }));

    expect(onOpenThread).toHaveBeenCalledTimes(1);
    expect(onOpenThread).toHaveBeenCalledWith("at://did:plc:bob/app.bsky.feed.post/quoted");
  });

  it("renders inline video embed player for video attachments", () => {
    render(() => (
      <PostCard
        post={{
          ...createPost(),
          embed: {
            $type: "app.bsky.embed.video#view",
            alt: "Attached clip",
            playlist: "https://cdn.example.com/video/master.m3u8",
            thumbnail: "https://cdn.example.com/video/thumb.jpg",
          },
        }} />
    ));

    expect(screen.getByRole("button", { name: "Play video" })).toBeInTheDocument();
    expect(screen.getByText("Attached clip")).toBeInTheDocument();
  });

  it("shows one moderation overlay when post and embed are both hidden", async () => {
    moderateContentMock.mockImplementation(async (_labels, context) => {
      if (context === "contentList") {
        return { filter: false, blur: "content", alert: false, inform: false, noOverride: false };
      }

      if (context === "contentMedia") {
        return { filter: false, blur: "media", alert: false, inform: false, noOverride: false };
      }

      return { filter: false, blur: "none", alert: false, inform: false, noOverride: false };
    });

    render(() => (
      <PostCard
        post={{
          ...createPost(),
          labels: [{ src: "did:plc:labeler", val: "sexual" }],
          embed: {
            $type: "app.bsky.embed.images#view",
            images: [{ alt: "Inline image", fullsize: "https://cdn.example.com/post-image.jpg" }],
          },
        }} />
    ));

    await waitFor(() => expect(screen.getAllByText("Content blurred")).toHaveLength(1));
    expect(screen.getAllByRole("button", { name: "Show content" })).toHaveLength(1);
  });

  it("opens gallery on image click and supports right-click save", async () => {
    downloadImageMock.mockResolvedValue({ bytes: 40, path: "/tmp/post-image.jpg" });
    render(() => (
      <PostCard
        post={{
          ...createPost(),
          embed: {
            $type: "app.bsky.embed.images#view",
            images: [{ alt: "Inline image", fullsize: "https://cdn.example.com/post-image.jpg" }],
          },
        }} />
    ));

    const inlineImage = screen.getByAltText("Inline image");
    fireEvent.click(inlineImage);
    expect(await screen.findByText("1 / 1")).toBeInTheDocument();

    fireEvent.contextMenu(inlineImage);
    fireEvent.click(screen.getByRole("menuitem", { name: "Save image" }));

    await waitFor(() =>
      expect(downloadImageMock).toHaveBeenCalledWith("https://cdn.example.com/post-image.jpg", "123")
    );
  });

  it("uses parent post rkey for video downloads", async () => {
    downloadVideoMock.mockResolvedValue({ bytes: 200, path: "/tmp/123.mp4" });
    render(() => (
      <PostCard
        post={{
          ...createPost(),
          embed: { $type: "app.bsky.embed.video#view", playlist: "https://cdn.example.com/video/master.m3u8" },
        }} />
    ));

    fireEvent.click(screen.getByRole("button", { name: "Download video" }));

    await waitFor(() =>
      expect(downloadVideoMock).toHaveBeenCalledWith("https://cdn.example.com/video/master.m3u8", "123")
    );
  });

  it("uses indexed parent post rkeys for multi-image downloads", async () => {
    downloadImageMock.mockResolvedValue({ bytes: 40, path: "/tmp/post-image.jpg" });
    render(() => (
      <PostCard
        post={{
          ...createPost(),
          embed: {
            $type: "app.bsky.embed.images#view",
            images: [{ alt: "Inline image one", fullsize: "https://cdn.example.com/post-image-one.jpg" }, {
              alt: "Inline image two",
              fullsize: "https://cdn.example.com/post-image-two.jpg",
            }],
          },
        }} />
    ));

    fireEvent.contextMenu(screen.getByAltText("Inline image two"));
    fireEvent.click(screen.getByRole("menuitem", { name: "Save image" }));

    await waitFor(() =>
      expect(downloadImageMock).toHaveBeenCalledWith("https://cdn.example.com/post-image-two.jpg", "123_2")
    );
  });

  it("submits a report for the current post", async () => {
    render(() => <PostCard post={createPost()} onOpenThread={vi.fn()} />);

    fireEvent.click(screen.getByRole("button", { name: "More actions" }));
    fireEvent.click(screen.getByRole("menuitem", { name: "Report post" }));

    expect(await screen.findByText("Report content")).toBeInTheDocument();
    fireEvent.input(screen.getByPlaceholderText("Add context for moderators"), {
      target: { value: "misleading link" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Submit report" }));

    await waitFor(() =>
      expect(createReportMock).toHaveBeenCalledWith(
        { type: "record", uri: "at://did:plc:alice/app.bsky.feed.post/123", cid: "cid-post" },
        "com.atproto.moderation.defs#reasonSpam",
        "misleading link",
      )
    );
  });

  it("blocks the post author from the context menu", async () => {
    const confirmSpy = vi.spyOn(globalThis, "confirm").mockReturnValue(true);
    render(() => <PostCard post={createPost()} onOpenThread={vi.fn()} />);

    fireEvent.click(screen.getByRole("button", { name: "More actions" }));
    fireEvent.click(screen.getByRole("menuitem", { name: "Block @alice.test" }));

    await waitFor(() => expect(blockActorMock).toHaveBeenCalledWith("did:plc:alice"));
    confirmSpy.mockRestore();
  });
});

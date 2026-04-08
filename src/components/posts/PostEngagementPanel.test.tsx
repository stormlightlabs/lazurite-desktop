import { HashRouter, Route } from "@solidjs/router";
import { fireEvent, render, screen, waitFor } from "@solidjs/testing-library";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { PostEngagementPanel } from "./PostEngagementPanel";

const getRecordBacklinksMock = vi.hoisted(() => vi.fn());
const postNavigationMock = vi.hoisted(() => ({
  backFromPost: vi.fn(),
  buildPostHref: vi.fn(),
  openPost: vi.fn(),
  openPostEngagement: vi.fn(),
  openPostScreen: vi.fn(),
}));

vi.mock("$/lib/api/diagnostics", () => ({ getRecordBacklinks: getRecordBacklinksMock }));
vi.mock("$/components/posts/usePostNavigation", () => ({ usePostNavigation: () => postNavigationMock }));

const POST_URI = "at://did:plc:alice/app.bsky.feed.post/123";

function renderPanel(hash = `#/post/${encodeURIComponent(POST_URI)}/engagement`) {
  globalThis.location.hash = hash;
  return render(() => (
    <HashRouter>
      <Route path="/post/:encodedUri/engagement" component={() => <PostEngagementPanel uri={POST_URI} />} />
    </HashRouter>
  ));
}

describe("PostEngagementPanel", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    getRecordBacklinksMock.mockResolvedValue({
      likes: {
        cursor: null,
        records: [{
          did: "did:plc:bob",
          profile: { handle: "bob.test", displayName: "Bob" },
          uri: "at://did:plc:bob/app.bsky.feed.like/1",
        }],
        total: 1,
      },
      quotes: {
        cursor: null,
        records: [{
          did: "did:plc:carol",
          profile: { handle: "carol.test", displayName: "Carol" },
          uri: "at://did:plc:carol/app.bsky.feed.post/9",
        }],
        total: 1,
      },
      replies: { cursor: null, records: [], total: 0 },
      reposts: {
        cursor: null,
        records: [{
          did: "did:plc:dana",
          profile: { handle: "dana.test", displayName: "Dana" },
          uri: "at://did:plc:dana/app.bsky.feed.repost/3",
        }],
        total: 1,
      },
    });
  });

  it("loads engagement and defaults to likes tab", async () => {
    renderPanel();

    expect(await screen.findByText("Post Engagement")).toBeInTheDocument();
    expect(await screen.findByText("Bob")).toBeInTheDocument();
    expect(getRecordBacklinksMock).toHaveBeenCalledWith(POST_URI);
  });

  it("opens quote posts from the quotes tab", async () => {
    renderPanel(`#/post/${encodeURIComponent(POST_URI)}/engagement?tab=quotes`);

    expect(await screen.findByText("Carol")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /carol/i }));

    expect(postNavigationMock.openPostScreen).toHaveBeenCalledWith("at://did:plc:carol/app.bsky.feed.post/9");
  });

  it("switches engagement tabs via query-state routing", async () => {
    renderPanel();

    await screen.findByText("Bob");
    fireEvent.click(screen.getByRole("button", { name: /Reposts/i }));

    await waitFor(() => expect(globalThis.location.hash).toContain("tab=reposts"));
    expect(await screen.findByText("Dana")).toBeInTheDocument();
  });
});

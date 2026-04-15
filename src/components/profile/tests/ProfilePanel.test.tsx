import { buildProfileRoute } from "$/lib/profile";
import { buildHashtagRoute } from "$/lib/search-routes";
import { AppTestProviders } from "$/test/providers";
import { fireEvent, render, screen, waitFor, within } from "@solidjs/testing-library";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ProfilePanel } from "../ProfilePanel";

const auditFollowsMock = vi.hoisted(() => vi.fn());
const batchUnfollowMock = vi.hoisted(() => vi.fn());
const followActorMock = vi.hoisted(() => vi.fn());
const getActorLikesMock = vi.hoisted(() => vi.fn());
const getAuthorFeedMock = vi.hoisted(() => vi.fn());
const getAccountBlockedByMock = vi.hoisted(() => vi.fn());
const getAccountBlockingMock = vi.hoisted(() => vi.fn());
const getAccountLabelsMock = vi.hoisted(() => vi.fn());
const getAccountListsMock = vi.hoisted(() => vi.fn());
const getAccountStarterPacksMock = vi.hoisted(() => vi.fn());
const getRecordBacklinksMock = vi.hoisted(() => vi.fn());
const getFollowersMock = vi.hoisted(() => vi.fn());
const getFollowsMock = vi.hoisted(() => vi.fn());
const getProfileMock = vi.hoisted(() => vi.fn());
const moderateContentMock = vi.hoisted(() => vi.fn());
const navigateMock = vi.hoisted(() => vi.fn());
const unfollowActorMock = vi.hoisted(() => vi.fn());
const postNavigationMock = vi.hoisted(() => ({
  backFromPost: vi.fn(),
  buildPostHref: vi.fn((uri: string | null) => (uri ? `/post/${encodeURIComponent(uri)}` : "/timeline")),
  openPost: vi.fn(),
}));

vi.mock(
  "$/lib/api/profile",
  () => ({
    ProfileController: {
      auditFollows: auditFollowsMock,
      batchUnfollow: batchUnfollowMock,
      followActor: followActorMock,
      getActorLikes: getActorLikesMock,
      getAuthorFeed: getAuthorFeedMock,
      getFollowers: getFollowersMock,
      getFollows: getFollowsMock,
      getProfile: getProfileMock,
      unfollowActor: unfollowActorMock,
    },
  }),
);

vi.mock(
  "$/lib/api/diagnostics",
  () => ({
    DiagnosticsController: {
      getAccountBlockedBy: getAccountBlockedByMock,
      getAccountBlocking: getAccountBlockingMock,
      getAccountLabels: getAccountLabelsMock,
      getAccountLists: getAccountListsMock,
      getAccountStarterPacks: getAccountStarterPacksMock,
      getRecordBacklinks: getRecordBacklinksMock,
    },
  }),
);

vi.mock("$/lib/api/moderation", () => ({ ModerationController: { moderateContent: moderateContentMock } }));

vi.mock("@solidjs/router", () => ({ useNavigate: () => navigateMock }));
vi.mock("$/components/posts/hooks/usePostNavigation", () => ({ usePostNavigation: () => postNavigationMock }));

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error?: unknown) => void;
  const promise = new Promise<T>((innerResolve, innerReject) => {
    resolve = innerResolve;
    reject = innerReject;
  });

  return { promise, reject, resolve };
}

function createProfile() {
  return {
    avatar: "https://example.com/bob.png",
    createdAt: "2024-01-15T12:00:00.000Z",
    description: "Building small, durable social software.",
    did: "did:plc:bob",
    displayName: "Bob Example",
    followersCount: 8,
    followsCount: 14,
    handle: "bob.test",
    postsCount: 22,
    viewer: { followedBy: null, following: null, muted: false },
    website: "https://bob.example.com",
  };
}

function renderProfilePanel(actor = "bob.test", session: Record<string, unknown> = {}) {
  render(() => (
    <AppTestProviders
      session={{
        activeDid: "did:plc:alice",
        activeHandle: "alice.test",
        activeSession: { did: "did:plc:alice", handle: "alice.test" },
        ...session,
      }}>
      <ProfilePanel actor={actor} />
    </AppTestProviders>
  ));
}

function getHeroFollowingButton() {
  return screen.getAllByRole("button").find((button) => button.className.includes("group inline-flex min-h-9"));
}

describe("ProfilePanel", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    getProfileMock.mockResolvedValue({ status: "available", profile: createProfile() });
    getAuthorFeedMock.mockResolvedValue({ cursor: null, feed: [] });
    getActorLikesMock.mockResolvedValue({ cursor: null, feed: [] });
    getAccountListsMock.mockResolvedValue({
      lists: [{
        description: "Builders and product people.",
        memberCount: 12,
        purpose: "curate",
        title: "Builders",
        creator: { handle: "mira.test" },
      }],
      total: 1,
      truncated: false,
    });
    getAccountLabelsMock.mockResolvedValue({ labels: [], sourceProfiles: {}, cursor: null });
    getAccountBlockedByMock.mockResolvedValue({ cursor: null, items: [], total: 0 });
    getAccountBlockingMock.mockResolvedValue({ cursor: null, items: [] });
    getAccountStarterPacksMock.mockResolvedValue({ starterPacks: [], total: 0, truncated: false });
    getRecordBacklinksMock.mockResolvedValue({
      likes: { cursor: null, records: [], total: 0 },
      quotes: { cursor: null, records: [], total: 0 },
      replies: { cursor: null, records: [], total: 0 },
      reposts: { cursor: null, records: [], total: 0 },
    });
    getFollowersMock.mockResolvedValue({ actors: [], cursor: null });
    getFollowsMock.mockResolvedValue({ actors: [], cursor: null });
    auditFollowsMock.mockResolvedValue([]);
    batchUnfollowMock.mockResolvedValue({ deleted: 0, failed: [] });
    followActorMock.mockResolvedValue({ cid: "cid-follow", uri: "at://did:plc:alice/app.bsky.graph.follow/1" });
    unfollowActorMock.mockResolvedValue(void 0);
    moderateContentMock.mockResolvedValue({
      alert: false,
      blur: "none",
      filter: false,
      inform: false,
      noOverride: false,
    });
  });

  it("shows follow hygiene entry on the signed-in profile", async () => {
    renderProfilePanel("bob.test", {
      activeDid: "did:plc:bob",
      activeHandle: "bob.test",
      activeSession: { did: "did:plc:bob", handle: "bob.test" },
    });

    expect(await screen.findByRole("button", { name: "Audit follows" })).toBeInTheDocument();
  });

  it("shows profile labels beneath the current account badge when labels are present", async () => {
    getProfileMock.mockResolvedValueOnce({
      status: "available",
      profile: { ...createProfile(), labels: [{ src: "did:plc:labeler", val: "my-label" }] },
    });

    renderProfilePanel("bob.test", {
      activeDid: "did:plc:bob",
      activeHandle: "bob.test",
      activeSession: { did: "did:plc:bob", handle: "bob.test" },
    });

    expect(await screen.findByText("Current account")).toBeInTheDocument();
    expect(await screen.findByText(/my-label/i)).toBeInTheDocument();
  });

  it("renders profile bio links, mentions, and hashtags", async () => {
    getProfileMock.mockResolvedValueOnce({
      status: "available",
      profile: {
        ...createProfile(),
        description:
          "A sincere engineer from #Austin building\n\n@flipper.social\n@lazurite.stormlightlabs.org\n@stormlightlabs.org\n\nhttps://github.com/sponsors/desertthunder/",
      },
    });

    renderProfilePanel();

    expect(await screen.findByRole("link", { name: "#Austin" })).toHaveAttribute(
      "href",
      `#${buildHashtagRoute("Austin")}`,
    );
    expect(screen.getByRole("link", { name: "@flipper.social" })).toHaveAttribute(
      "href",
      `#${buildProfileRoute("flipper.social")}`,
    );
    expect(screen.getByRole("link", { name: "@lazurite.stormlightlabs.org" })).toHaveAttribute(
      "href",
      `#${buildProfileRoute("lazurite.stormlightlabs.org")}`,
    );
    expect(screen.getByRole("link", { name: "@stormlightlabs.org" })).toHaveAttribute(
      "href",
      `#${buildProfileRoute("stormlightlabs.org")}`,
    );
    expect(screen.getByRole("link", { name: "https://github.com/sponsors/desertthunder/" })).toHaveAttribute(
      "href",
      "https://github.com/sponsors/desertthunder/",
    );
  });

  it("optimistically follows and unfollows from the hero while keeping badges in sync", async () => {
    const followRequest = deferred<{ cid: string; uri: string }>();
    followActorMock.mockReturnValueOnce(followRequest.promise);

    renderProfilePanel();

    expect(await screen.findByRole("button", { name: "Follow" })).toBeInTheDocument();
    const followersStat = screen.getByRole("button", { name: /followers/i });
    expect(followersStat).toHaveTextContent("8");

    fireEvent.click(screen.getByRole("button", { name: "Follow" }));

    await waitFor(() => {
      expect(followActorMock).toHaveBeenCalledWith("did:plc:bob");
      expect(followersStat).toHaveTextContent("9");
    });
    const heroFollowingButton = getHeroFollowingButton();
    expect(heroFollowingButton).toBeDefined();
    expect(heroFollowingButton?.textContent).toContain("Following");

    followRequest.resolve({ cid: "cid-follow", uri: "at://did:plc:alice/app.bsky.graph.follow/1" });

    await waitFor(() => {
      expect(getHeroFollowingButton()).toBeDefined();
    });

    fireEvent.click(getHeroFollowingButton() as HTMLButtonElement);

    await waitFor(() => {
      expect(unfollowActorMock).toHaveBeenCalledWith("at://did:plc:alice/app.bsky.graph.follow/1");
      expect(screen.getByRole("button", { name: "Follow" })).toBeInTheDocument();
      expect(followersStat).toHaveTextContent("8");
    });
  });

  it("only shows the compact sticky header after the profile hero scrolls away", async () => {
    renderProfilePanel();

    expect(await screen.findByRole("button", { name: "Follow" })).toBeInTheDocument();
    expect(screen.queryByTestId("profile-sticky-header")).not.toBeInTheDocument();

    const scrollRegion = screen.getByTestId("profile-scroll-region");
    Object.defineProperty(scrollRegion, "scrollTop", { configurable: true, value: 500, writable: true });
    fireEvent.scroll(scrollRegion);

    await waitFor(() => {
      expect(screen.getByTestId("profile-sticky-header")).toBeInTheDocument();
    });
  });

  it("opens the followers sheet with bios, inline follow controls, pagination, and escape-to-close", async () => {
    getFollowersMock.mockResolvedValueOnce({
      actors: [{
        description: "Writes about decentralised UI and protocol design.",
        did: "did:plc:charlie",
        displayName: "Charlie",
        handle: "charlie.test",
        viewer: { following: null },
      }],
      cursor: "cursor-2",
    }).mockResolvedValueOnce({
      actors: [{
        description: "Focuses on moderation tooling and trust signals.",
        did: "did:plc:dana",
        displayName: "Dana",
        handle: "dana.test",
        viewer: { following: null },
      }],
      cursor: null,
    });

    renderProfilePanel();

    expect(await screen.findByRole("button", { name: "Follow" })).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /followers/i }));

    const dialog = await screen.findByRole("dialog");
    expect(dialog).toBeInTheDocument();
    expect(await within(dialog).findByText("Followers")).toBeInTheDocument();
    expect(await within(dialog).findByText("Writes about decentralised UI and protocol design.")).toBeInTheDocument();

    fireEvent.click(within(dialog).getByRole("button", { name: "Follow" }));

    await waitFor(() => {
      expect(followActorMock).toHaveBeenCalledWith("did:plc:charlie");
      expect(within(dialog).getByRole("button", { name: /following/i })).toBeInTheDocument();
    });

    fireEvent.click(within(dialog).getByRole("button", { name: /load more/i }));

    await waitFor(() => {
      expect(getFollowersMock).toHaveBeenNthCalledWith(2, "bob.test", "cursor-2");
      expect(within(dialog).getByText("Dana")).toBeInTheDocument();
    });

    fireEvent.keyDown(dialog, { key: "Escape" });

    await waitFor(() => {
      expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    });
  });

  it("renders moderation badges in follower rows when labels are present", async () => {
    getFollowersMock.mockResolvedValueOnce({
      actors: [{
        description: "Writes about decentralised UI and protocol design.",
        did: "did:plc:charlie",
        displayName: "Charlie",
        handle: "charlie.test",
        labels: [{ src: "did:plc:labeler", val: "sexual" }],
        viewer: { following: null },
      }],
      cursor: null,
    });
    moderateContentMock.mockImplementation(async (_labels, context: string) => {
      if (context === "profileList") {
        return { alert: true, blur: "none", filter: false, inform: false, noOverride: false };
      }

      return { alert: false, blur: "none", filter: false, inform: false, noOverride: false };
    });

    renderProfilePanel();
    expect(await screen.findByRole("button", { name: "Follow" })).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /followers/i }));
    const dialog = await screen.findByRole("dialog");

    expect(await within(dialog).findByText("Alert")).toBeInTheDocument();
  });

  it("renders diagnostics in the Context tab without making it the default tab", async () => {
    renderProfilePanel();

    expect(await screen.findByRole("button", { name: "Follow" })).toBeInTheDocument();
    expect(screen.queryByTestId("profile-sticky-header")).not.toBeInTheDocument();
    expect(screen.queryByText("Social Diagnostics")).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Context" }));

    expect(await screen.findByText("Social Diagnostics")).toBeInTheDocument();
    expect(await screen.findByText("Builders")).toBeInTheDocument();
    expect(screen.getByText("Public social context for this account")).toBeInTheDocument();
  });

  it("shows an unavailable profile state and skips profile interactions when the actor is unavailable", async () => {
    getProfileMock.mockResolvedValueOnce({
      status: "unavailable",
      requestedActor: "missing.test",
      handle: "missing.test",
      reason: "notFound",
      message: "This profile could not be found.",
    });

    renderProfilePanel("missing.test");

    expect(await screen.findByText("Profile unavailable")).toBeInTheDocument();
    expect(screen.getByText("missing.test")).toBeInTheDocument();
    expect(screen.getByText("This profile could not be found.")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Follow" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Context" })).not.toBeInTheDocument();
    expect(getAuthorFeedMock).not.toHaveBeenCalled();
    expect(getActorLikesMock).not.toHaveBeenCalled();
  });
});

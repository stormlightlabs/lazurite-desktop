import { toLocalDayStartIso, toLocalDayUntilIso } from "$/lib/search-routes";
import { AppTestProviders } from "$/test/providers";
import { HashRouter, Route } from "@solidjs/router";
import { fireEvent, render, screen } from "@solidjs/testing-library";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { SearchPanel } from "../SearchPanel";

const searchActorTypeaheadMock = vi.hoisted(() => vi.fn());
const searchActorsMock = vi.hoisted(() => vi.fn());
const searchPostsMock = vi.hoisted(() => vi.fn());
const searchPostsNetworkMock = vi.hoisted(() => vi.fn());
const getSyncStatusMock = vi.hoisted(() => vi.fn());
const syncPostsMock = vi.hoisted(() => vi.fn());
const postNavigationMock = vi.hoisted(() => ({ backFromPost: vi.fn(), buildPostHref: vi.fn(), openPost: vi.fn() }));

vi.mock(
  "$/lib/api/search",
  () => ({
    SearchController: {
      getSyncStatus: getSyncStatusMock,
      searchActors: searchActorsMock,
      searchPosts: searchPostsMock,
      searchPostsNetwork: searchPostsNetworkMock,
      syncPosts: syncPostsMock,
    },
  }),
);
vi.mock(
  "$/lib/api/typeahead",
  () => ({
    TypeaheadController: {
      normalizeQuery: (value: string) => value.trim().replace(/^@/, ""),
      searchActor: searchActorTypeaheadMock,
    },
  }),
);
vi.mock("$/components/posts/usePostNavigation", () => ({ usePostNavigation: () => postNavigationMock }));

vi.mock("@tauri-apps/plugin-log", () => ({ info: vi.fn(), error: vi.fn(), warn: vi.fn() }));

async function flushRouter() {
  await Promise.resolve();
  await Promise.resolve();
}

function renderSearchPanel(hash = "#/search") {
  globalThis.location.hash = hash;

  render(() => (
    <AppTestProviders>
      <HashRouter>
        <Route path="/search" component={() => <SearchPanel />} />
        <Route path="/profile/:actor" component={() => <div data-testid="profile-route">profile</div>} />
      </HashRouter>
    </AppTestProviders>
  ));
}

describe("SearchPanel", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    searchActorTypeaheadMock.mockReset();
    searchActorsMock.mockReset();
    searchPostsMock.mockReset();
    searchPostsNetworkMock.mockReset();
    getSyncStatusMock.mockReset();
    syncPostsMock.mockReset();
    postNavigationMock.openPost.mockReset();

    getSyncStatusMock.mockResolvedValue([]);
    searchActorTypeaheadMock.mockResolvedValue([]);
    searchActorsMock.mockResolvedValue({ actors: [], cursor: null });
    syncPostsMock.mockResolvedValue({
      did: "did:plc:test",
      source: "like",
      postCount: 100,
      lastSyncedAt: "2026-03-29T12:00:00.000Z",
    });
  });

  it("renders the search panel with network filters", async () => {
    renderSearchPanel();

    expect(screen.getByPlaceholderText("Search public posts across Bluesky...")).toBeInTheDocument();
    expect(screen.getByText("Network Filters")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /show filters/i })).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: /top/i })).toHaveAttribute("aria-selected", "true");
    expect(screen.getByRole("button", { name: /hybrid/i })).toBeDisabled();
    expect(screen.getByRole("link", { name: /open settings/i })).toHaveAttribute("href", "#/settings");
  });

  it("expands and collapses the network filter details", async () => {
    renderSearchPanel();

    expect(screen.queryByLabelText("Author")).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /show filters/i }));
    expect(screen.getByLabelText("Author")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /hide filters/i }));
    expect(screen.queryByLabelText("Author")).not.toBeInTheDocument();
  });

  it("performs network search with URL-synced filters", async () => {
    searchPostsNetworkMock.mockResolvedValue({ posts: [] });

    renderSearchPanel(
      "#/search?q=test%20query&sort=latest&since=2026-04-01&until=2026-04-03&author=alice.test&mentions=bob.test&tags=solid&tags=rust",
    );

    await vi.advanceTimersByTimeAsync(350);

    expect(searchPostsNetworkMock).toHaveBeenCalledWith({
      author: "alice.test",
      limit: 25,
      mentions: "bob.test",
      query: "test query",
      since: toLocalDayStartIso("2026-04-01"),
      sort: "latest",
      tags: ["solid", "rust"],
      until: toLocalDayUntilIso("2026-04-03"),
    });
  });

  it("updates the URL and performs network search when typing", async () => {
    searchPostsNetworkMock.mockResolvedValue({ posts: [] });
    renderSearchPanel();

    const input = screen.getByPlaceholderText("Search public posts across Bluesky...");
    fireEvent.input(input, { target: { value: "test query" } });

    await flushRouter();
    await vi.advanceTimersByTimeAsync(350);

    expect(globalThis.location.hash).toContain("q=test+query");
    expect(searchPostsNetworkMock).toHaveBeenCalledWith({
      author: null,
      limit: 25,
      mentions: null,
      query: "test query",
      since: null,
      sort: "top",
      tags: [],
      until: null,
    });
  });

  it("performs local search in keyword mode and preserves filters in the URL", async () => {
    getSyncStatusMock.mockResolvedValue([{ did: "did:plc:test", source: "like", postCount: 12, lastSyncedAt: null }]);
    searchPostsMock.mockResolvedValue([{
      uri: "at://test",
      cid: "cid-1",
      authorDid: "did:plc:test",
      authorHandle: "test.bsky.social",
      text: "Local test post",
      createdAt: "2026-03-29T12:00:00.000Z",
      source: "like" as const,
      score: 1,
      keywordMatch: true,
      semanticMatch: false,
    }]);

    renderSearchPanel("#/search?author=alice.test");

    fireEvent.click(await screen.findByRole("button", { name: /keyword/i }));
    await flushRouter();

    const input = screen.getByPlaceholderText("Search your saved & liked posts...");
    fireEvent.input(input, { target: { value: "test query" } });

    await flushRouter();
    await vi.advanceTimersByTimeAsync(350);

    expect(globalThis.location.hash).toContain("author=alice.test");
    expect(globalThis.location.hash).toContain("mode=keyword");
    expect(searchPostsMock).toHaveBeenCalledWith("test query", "keyword", 50);
    expect(screen.getByText("Liked")).toBeInTheDocument();
  });

  it("shows a network-only notice outside network mode", async () => {
    renderSearchPanel("#/search?author=alice.test");

    fireEvent.click(screen.getByRole("button", { name: /keyword/i }));
    await flushRouter();

    expect(screen.queryByRole("button", { name: /show filters/i })).not.toBeInTheDocument();
    expect(screen.getByText(/network filters only apply in posts when network mode is active/i)).toBeInTheDocument();
  });

  it("cycles through modes with Tab key", async () => {
    renderSearchPanel();

    const input = screen.getByPlaceholderText("Search public posts across Bluesky...");
    input.focus();
    fireEvent.keyDown(input, { key: "Tab" });
    await flushRouter();

    expect(globalThis.location.hash).toContain("mode=keyword");
  });

  it("clears search with Escape key", async () => {
    searchPostsNetworkMock.mockResolvedValue({ posts: [] });
    renderSearchPanel();

    const input = screen.getByPlaceholderText("Search public posts across Bluesky...");
    fireEvent.input(input, { target: { value: "test" } });

    await flushRouter();
    await vi.advanceTimersByTimeAsync(350);
    fireEvent.keyDown(input, { key: "Escape" });
    await flushRouter();

    expect(input).toHaveValue("");
    expect(globalThis.location.hash).toBe("#/search");
  });

  it("searches profiles and opens a selected actor", async () => {
    searchActorTypeaheadMock.mockResolvedValue([{
      avatar: null,
      did: "did:plc:bob",
      displayName: "Bob Example",
      handle: "bob.test",
    }]);
    searchActorsMock.mockResolvedValue({
      actors: [{
        avatar: null,
        description: "Builds search systems.",
        did: "did:plc:bob",
        displayName: "Bob Example",
        handle: "bob.test",
      }],
      cursor: null,
    });

    renderSearchPanel();

    fireEvent.click(screen.getByRole("button", { name: /profiles/i }));
    await flushRouter();

    const input = screen.getByPlaceholderText("Search profiles by handle or display name...");
    fireEvent.input(input, { target: { value: "bob" } });

    await flushRouter();
    await vi.advanceTimersByTimeAsync(350);

    expect(searchActorsMock).toHaveBeenCalledWith("bob", 25);
    expect(await screen.findByText("Builds search systems.")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /bob example/i }));
    await flushRouter();

    expect(globalThis.location.hash).toBe("#/profile/bob.test");
  });
});

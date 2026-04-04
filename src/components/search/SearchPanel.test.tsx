import { AppTestProviders } from "$/test/providers";
import { fireEvent, render, screen, waitFor } from "@solidjs/testing-library";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { SearchPanel } from "./SearchPanel";

const searchPostsMock = vi.hoisted(() => vi.fn());
const searchPostsNetworkMock = vi.hoisted(() => vi.fn());
const getSyncStatusMock = vi.hoisted(() => vi.fn());
const syncPostsMock = vi.hoisted(() => vi.fn());
const threadOverlayMock = vi.hoisted(() => ({ openThread: vi.fn() }));

vi.mock(
  "$/lib/api/search",
  () => ({
    searchPosts: searchPostsMock,
    searchPostsNetwork: searchPostsNetworkMock,
    getSyncStatus: getSyncStatusMock,
    syncPosts: syncPostsMock,
  }),
);
vi.mock(
  "$/components/posts/useThreadOverlayNavigation",
  () => ({ useThreadOverlayNavigation: () => threadOverlayMock }),
);

vi.mock("@tauri-apps/plugin-log", () => ({ info: vi.fn(), error: vi.fn(), warn: vi.fn() }));

function renderSearchPanel() {
  render(() => (
    <AppTestProviders>
      <SearchPanel />
    </AppTestProviders>
  ));
}

describe("SearchPanel", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    searchPostsMock.mockReset();
    searchPostsNetworkMock.mockReset();
    getSyncStatusMock.mockReset();
    syncPostsMock.mockReset();

    getSyncStatusMock.mockResolvedValue([]);
    syncPostsMock.mockResolvedValue({
      did: "did:plc:test",
      source: "like",
      postCount: 100,
      lastSyncedAt: "2026-03-29T12:00:00.000Z",
    });
  });

  it("renders the search panel with initial state", async () => {
    renderSearchPanel();

    expect(await screen.findByPlaceholderText("Search public posts across Bluesky...")).toBeInTheDocument();
    expect(screen.getByText("Network")).toBeInTheDocument();
    expect(screen.getByText("Keyword")).toBeInTheDocument();
    expect(screen.getByText("Semantic")).toBeInTheDocument();
    expect(screen.getByText("Hybrid")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /open settings/i })).toHaveAttribute("href", "#/settings");
  });

  it("switches search modes when clicking mode buttons", async () => {
    renderSearchPanel();

    const keywordButton = screen.getByRole("button", { name: /keyword/i });
    fireEvent.click(keywordButton);

    await waitFor(() => {
      expect(keywordButton).toHaveAttribute("aria-pressed", "true");
    });
  });

  it("performs network search when typing", async () => {
    searchPostsNetworkMock.mockResolvedValue({
      posts: [{
        uri: "at://test",
        cid: "cid-1",
        author: { did: "did:plc:test", handle: "test.bsky.social" },
        indexedAt: "2026-03-29T12:00:00.000Z",
        record: { text: "Test post content" },
      }],
    });

    renderSearchPanel();

    const input = await screen.findByRole("textbox");
    fireEvent.input(input, { target: { value: "test query" } });

    vi.advanceTimersByTime(350);

    await waitFor(() => {
      expect(searchPostsNetworkMock).toHaveBeenCalledWith("test query", "top", 25);
    });

    expect(await screen.findByText(/post content/i)).toBeInTheDocument();
  });

  it("performs local search in keyword mode", async () => {
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

    renderSearchPanel();

    const keywordButton = screen.getByRole("button", { name: /keyword/i });
    fireEvent.click(keywordButton);
    expect(keywordButton).toHaveAttribute("aria-pressed", "true");

    const input = screen.getByRole("textbox");
    fireEvent.input(input, { target: { value: "test query" } });

    await vi.advanceTimersByTimeAsync(350);
    await Promise.resolve();
    await Promise.resolve();

    expect(searchPostsMock).toHaveBeenCalledWith("test query", "keyword", 50);
    expect(screen.getByText("Liked")).toBeInTheDocument();
  });

  it("cycles through modes with Tab key", async () => {
    renderSearchPanel();

    const input = await screen.findByRole("textbox");
    input.focus();
    fireEvent.keyDown(input, { key: "Tab" });

    expect(screen.getByRole("button", { name: /keyword/i })).toHaveAttribute("aria-pressed", "true");
  }, 5000);

  it("clears search with Escape key", async () => {
    searchPostsNetworkMock.mockResolvedValue({
      posts: [{
        uri: "at://test",
        cid: "cid-1",
        author: { did: "did:plc:test", handle: "test.bsky.social" },
        indexedAt: "2026-03-29T12:00:00.000Z",
        record: { text: "Test content" },
      }],
    });

    renderSearchPanel();

    const input = await screen.findByRole("textbox");
    fireEvent.input(input, { target: { value: "test" } });
    vi.advanceTimersByTime(350);

    await waitFor(() => expect(searchPostsNetworkMock).toHaveBeenCalled());

    fireEvent.keyDown(input, { key: "Escape" });

    await waitFor(() => {
      expect(input).toHaveValue("");
    });
  });

  it("displays error state when search fails", async () => {
    searchPostsNetworkMock.mockRejectedValue(new Error("Search failed"));

    renderSearchPanel();

    const input = await screen.findByRole("textbox");
    fireEvent.input(input, { target: { value: "test" } });
    vi.advanceTimersByTime(350);

    await waitFor(() => {
      expect(searchPostsNetworkMock).toHaveBeenCalled();
    });
  });

  it("shows empty state when no results found", async () => {
    getSyncStatusMock.mockResolvedValue([{ did: "did:plc:test", source: "like", postCount: 12, lastSyncedAt: null }]);
    searchPostsMock.mockResolvedValue([]);

    renderSearchPanel();

    const keywordButton = screen.getByRole("button", { name: /keyword/i });
    fireEvent.click(keywordButton);

    const input = await screen.findByRole("textbox");
    fireEvent.input(input, { target: { value: "nonexistent" } });
    vi.advanceTimersByTime(350);

    await waitFor(() => {
      expect(searchPostsMock).toHaveBeenCalled();
    });

    expect(await screen.findByText("No results found")).toBeInTheDocument();
  });
});

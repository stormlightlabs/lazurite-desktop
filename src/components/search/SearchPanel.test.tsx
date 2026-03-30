import { fireEvent, render, screen, waitFor } from "@solidjs/testing-library";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { SearchPanel } from "./SearchPanel";

const searchPostsMock = vi.hoisted(() => vi.fn());
const searchPostsNetworkMock = vi.hoisted(() => vi.fn());
const getSyncStatusMock = vi.hoisted(() => vi.fn());
const syncPostsMock = vi.hoisted(() => vi.fn());

vi.mock(
  "$/lib/api/search",
  () => ({
    searchPosts: searchPostsMock,
    searchPostsNetwork: searchPostsNetworkMock,
    getSyncStatus: getSyncStatusMock,
    syncPosts: syncPostsMock,
  }),
);

vi.mock("@tauri-apps/plugin-log", () => ({ info: vi.fn(), error: vi.fn(), warn: vi.fn() }));

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
      post_count: 100,
      last_synced_at: "2026-03-29T12:00:00.000Z",
    });
  });

  it("renders the search panel with initial state", async () => {
    render(() => <SearchPanel session={{ did: "did:plc:test", handle: "test.bsky.social" }} />);

    expect(await screen.findByPlaceholderText("Search posts...")).toBeInTheDocument();
    expect(screen.getByText("Network")).toBeInTheDocument();
    expect(screen.getByText("Keyword")).toBeInTheDocument();
    expect(screen.getByText("Semantic")).toBeInTheDocument();
    expect(screen.getByText("Hybrid")).toBeInTheDocument();
  });

  it("switches search modes when clicking mode buttons", async () => {
    render(() => <SearchPanel session={{ did: "did:plc:test", handle: "test.bsky.social" }} />);

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

    render(() => <SearchPanel session={{ did: "did:plc:test", handle: "test.bsky.social" }} />);

    const input = await screen.findByPlaceholderText("Search posts...");
    fireEvent.input(input, { target: { value: "test query" } });

    vi.advanceTimersByTime(350);

    await waitFor(() => {
      expect(searchPostsNetworkMock).toHaveBeenCalledWith("test query", "top", 25);
    });

    expect(await screen.findByText("Test post content")).toBeInTheDocument();
  });

  it("performs local search in keyword mode", async () => {
    searchPostsMock.mockResolvedValue([{
      uri: "at://test",
      cid: "cid-1",
      author_did: "did:plc:test",
      author_handle: "test.bsky.social",
      text: "Local test post",
      created_at: "2026-03-29T12:00:00.000Z",
      indexed_at: "2026-03-29T12:00:00.000Z",
      source: "like" as const,
    }]);

    render(() => <SearchPanel session={{ did: "did:plc:test", handle: "test.bsky.social" }} />);

    const keywordButton = screen.getByRole("button", { name: /keyword/i });
    fireEvent.click(keywordButton);

    const input = await screen.findByPlaceholderText("Search posts...");
    fireEvent.input(input, { target: { value: "test query" } });

    vi.advanceTimersByTime(350);

    await waitFor(() => {
      expect(searchPostsMock).toHaveBeenCalledWith("test query", "keyword", 50);
    });

    expect(await screen.findByText("Local test post")).toBeInTheDocument();
  });

  it("cycles through modes with Tab key", async () => {
    render(() => <SearchPanel session={{ did: "did:plc:test", handle: "test.bsky.social" }} />);

    const input = await screen.findByPlaceholderText("Search posts...");
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

    render(() => <SearchPanel session={{ did: "did:plc:test", handle: "test.bsky.social" }} />);

    const input = await screen.findByPlaceholderText("Search posts...");
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

    render(() => <SearchPanel session={{ did: "did:plc:test", handle: "test.bsky.social" }} />);

    const input = await screen.findByPlaceholderText("Search posts...");
    fireEvent.input(input, { target: { value: "test" } });
    vi.advanceTimersByTime(350);

    await waitFor(() => {
      expect(searchPostsNetworkMock).toHaveBeenCalled();
    });
  });

  it("shows empty state when no results found", async () => {
    searchPostsMock.mockResolvedValue([]);

    render(() => <SearchPanel session={{ did: "did:plc:test", handle: "test.bsky.social" }} />);

    const keywordButton = screen.getByRole("button", { name: /keyword/i });
    fireEvent.click(keywordButton);

    const input = await screen.findByPlaceholderText("Search posts...");
    fireEvent.input(input, { target: { value: "nonexistent" } });
    vi.advanceTimersByTime(350);

    await waitFor(() => {
      expect(searchPostsMock).toHaveBeenCalled();
    });

    expect(await screen.findByText("No results found")).toBeInTheDocument();
  });
});

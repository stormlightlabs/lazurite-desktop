import { AppTestProviders } from "$/test/providers";
import { fireEvent, render, screen, waitFor } from "@solidjs/testing-library";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { SavedPostsPanel } from "./SavedPostsPanel";

const getSyncStatusMock = vi.hoisted(() => vi.fn());
const listSavedPostsMock = vi.hoisted(() => vi.fn());
const syncPostsMock = vi.hoisted(() => vi.fn());
const loggerErrorMock = vi.hoisted(() => vi.fn());

vi.mock(
  "$/lib/api/search",
  () => ({ getSyncStatus: getSyncStatusMock, listSavedPosts: listSavedPostsMock, syncPosts: syncPostsMock }),
);
vi.mock("@tauri-apps/plugin-log", () => ({ error: loggerErrorMock }));

function createStatus(source: "bookmark" | "like", count: number) {
  return { cursor: null, did: "did:plc:alice", lastSyncedAt: "2026-04-03T12:00:00.000Z", postCount: count, source };
}

function createPost(source: "bookmark" | "like", id: string, text = `${source} post ${id}`) {
  return {
    authorDid: `did:plc:author:${id}`,
    authorHandle: `author-${id}.test`,
    cid: `cid-${id}`,
    createdAt: "2026-04-03T11:00:00.000Z",
    keywordMatch: false,
    score: 0,
    semanticMatch: false,
    source,
    text,
    uri: `at://did:plc:author:${id}/app.bsky.feed.post/${id}`,
  };
}

function renderPanel() {
  return render(() => (
    <AppTestProviders
      session={{
        activeDid: "did:plc:alice",
        activeHandle: "alice.test",
        activeSession: { did: "did:plc:alice", handle: "alice.test" },
      }}>
      <SavedPostsPanel />
    </AppTestProviders>
  ));
}

describe("SavedPostsPanel", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-04-03T12:30:00.000Z"));
    getSyncStatusMock.mockReset();
    listSavedPostsMock.mockReset();
    syncPostsMock.mockReset();
    loggerErrorMock.mockReset();
    getSyncStatusMock.mockResolvedValue([createStatus("bookmark", 2), createStatus("like", 1)]);
    syncPostsMock.mockResolvedValue({});
  });

  it("defaults to Saved, loads counts, and fetches Liked on first tab switch", async () => {
    listSavedPostsMock.mockResolvedValueOnce({ nextOffset: null, posts: [createPost("bookmark", "1")], total: 2 })
      .mockResolvedValueOnce({ nextOffset: null, posts: [createPost("like", "2")], total: 1 });

    renderPanel();

    expect(await screen.findByText("bookmark post 1")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /saved/i })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByText("3")).toBeInTheDocument();
    expect(listSavedPostsMock).toHaveBeenCalledWith("bookmark", 50, 0);

    fireEvent.click(screen.getByRole("button", { name: /liked/i }));

    expect(await screen.findByText("like post 2")).toBeInTheDocument();
    expect(listSavedPostsMock).toHaveBeenNthCalledWith(2, "like", 50, 0);
  });

  it("refreshes bookmarks then likes before reloading sync status and the active tab", async () => {
    listSavedPostsMock.mockResolvedValueOnce({
      nextOffset: null,
      posts: [createPost("bookmark", "1", "old bookmark")],
      total: 1,
    }).mockResolvedValueOnce({ nextOffset: null, posts: [createPost("bookmark", "2", "fresh bookmark")], total: 1 });

    renderPanel();

    expect(await screen.findByText("old bookmark")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /refresh/i }));

    await waitFor(() => {
      expect(syncPostsMock).toHaveBeenNthCalledWith(1, "did:plc:alice", "bookmark");
      expect(syncPostsMock).toHaveBeenNthCalledWith(2, "did:plc:alice", "like");
    });
    expect(await screen.findByText("fresh bookmark")).toBeInTheDocument();
    expect(getSyncStatusMock).toHaveBeenCalledTimes(2);
    expect(listSavedPostsMock).toHaveBeenNthCalledWith(2, "bookmark", 50, 0);
  });

  it("loads more posts for the active tab", async () => {
    listSavedPostsMock.mockResolvedValueOnce({ nextOffset: 50, posts: [createPost("bookmark", "1")], total: 2 })
      .mockResolvedValueOnce({ nextOffset: null, posts: [createPost("bookmark", "2")], total: 2 });

    renderPanel();

    expect(await screen.findByText("bookmark post 1")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /load more/i }));

    expect(await screen.findByText("bookmark post 2")).toBeInTheDocument();
    expect(listSavedPostsMock).toHaveBeenNthCalledWith(2, "bookmark", 50, 50);
  });

  it("renders tab-specific empty states", async () => {
    listSavedPostsMock.mockResolvedValueOnce({ nextOffset: null, posts: [], total: 0 }).mockResolvedValueOnce({
      nextOffset: null,
      posts: [],
      total: 0,
    });

    renderPanel();

    expect(await screen.findByText("No bookmarked posts synced yet.")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /liked/i }));

    expect(await screen.findByText("No liked posts synced yet.")).toBeInTheDocument();
  });

  it("renders a human-readable error state when loading fails", async () => {
    listSavedPostsMock.mockRejectedValue(new Error("saved posts unavailable"));

    renderPanel();

    expect(await screen.findByText("saved posts unavailable")).toBeInTheDocument();
    expect(loggerErrorMock).toHaveBeenCalled();
  });

  it("searches within the active tab and preserves tab-specific queries", async () => {
    listSavedPostsMock.mockResolvedValueOnce({ nextOffset: null, posts: [createPost("bookmark", "1")], total: 1 })
      .mockResolvedValueOnce({ nextOffset: null, posts: [createPost("bookmark", "2", "rust archive")], total: 1 })
      .mockResolvedValueOnce({ nextOffset: null, posts: [createPost("like", "3", "rust like")], total: 1 });

    renderPanel();

    expect(await screen.findByText("bookmark post 1")).toBeInTheDocument();

    fireEvent.input(screen.getByRole("textbox"), { target: { value: "rust" } });
    await vi.advanceTimersByTimeAsync(350);
    await Promise.resolve();
    await Promise.resolve();

    expect(listSavedPostsMock).toHaveBeenNthCalledWith(2, "bookmark", 50, 0, "rust");
    expect(screen.getByText((_, element) => element?.textContent === "rust archive")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /liked/i }));
    await Promise.resolve();
    await Promise.resolve();

    expect(listSavedPostsMock).toHaveBeenNthCalledWith(3, "like", 50, 0, "rust");
    expect(screen.getByText((_, element) => element?.textContent === "rust like")).toBeInTheDocument();
  }, 5000);
});

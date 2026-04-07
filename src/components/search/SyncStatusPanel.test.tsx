import { fireEvent, render, screen, waitFor } from "@solidjs/testing-library";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { SyncStatusPanel } from "./SyncStatusPanel";

const getSyncStatusMock = vi.hoisted(() => vi.fn());
const syncPostsMock = vi.hoisted(() => vi.fn());
const reindexEmbeddingsMock = vi.hoisted(() => vi.fn());

vi.mock(
  "$/lib/api/search",
  () => ({ getSyncStatus: getSyncStatusMock, syncPosts: syncPostsMock, reindexEmbeddings: reindexEmbeddingsMock }),
);

vi.mock("@tauri-apps/plugin-log", () => ({ info: vi.fn(), error: vi.fn(), warn: vi.fn() }));

describe("SyncStatusPanel", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    getSyncStatusMock.mockReset();
    syncPostsMock.mockReset();
    reindexEmbeddingsMock.mockReset();

    getSyncStatusMock.mockResolvedValue([{
      did: "did:plc:test",
      source: "like",
      postCount: 100,
      lastSyncedAt: "2026-03-29T12:00:00.000Z",
      cursor: "cursor-123",
    }, {
      did: "did:plc:test",
      source: "bookmark",
      postCount: 50,
      lastSyncedAt: "2026-03-29T11:00:00.000Z",
      cursor: null,
    }]);

    syncPostsMock.mockResolvedValue({
      did: "did:plc:test",
      source: "like",
      postCount: 150,
      lastSyncedAt: "2026-03-29T13:00:00.000Z",
    });

    reindexEmbeddingsMock.mockResolvedValue(150);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("renders sync status with post counts", async () => {
    render(() => <SyncStatusPanel did="did:plc:test" />);

    expect(await screen.findByText("Ready")).toBeInTheDocument();
    expect(await screen.findByText(/150/)).toBeInTheDocument();
    expect(await screen.findByText(/posts indexed/i)).toBeInTheDocument();
  });

  it("shows last sync time", async () => {
    render(() => <SyncStatusPanel did="did:plc:test" />);

    expect(await screen.findByText(/last sync/i)).toBeInTheDocument();
  });

  it("triggers sync when clicking sync button", async () => {
    render(() => <SyncStatusPanel did="did:plc:test" />);

    const syncButton = await screen.findByRole("button", { name: /sync now/i });
    fireEvent.click(syncButton);

    await waitFor(() => {
      expect(syncPostsMock).toHaveBeenCalledWith("did:plc:test", "like");
      expect(syncPostsMock).toHaveBeenCalledWith("did:plc:test", "bookmark");
    });
  });

  it("shows syncing state during sync", async () => {
    syncPostsMock.mockImplementation(() =>
      new Promise((resolve) =>
        setTimeout(
          () =>
            resolve({ did: "did:plc:test", source: "like", postCount: 150, lastSyncedAt: "2026-03-29T13:00:00.000Z" }),
          100,
        )
      )
    );

    render(() => <SyncStatusPanel did="did:plc:test" />);

    const syncButton = await screen.findByRole("button", { name: /sync now/i });
    fireEvent.click(syncButton);

    // Check that the button shows syncing state and is disabled
    await waitFor(() => {
      expect(screen.getByRole("button", { name: /syncing/i })).toBeDisabled();
    });
  }, 5000);

  it("shows reindex button when posts exist", async () => {
    render(() => <SyncStatusPanel did="did:plc:test" />);

    const reindexButton = await screen.findByRole("button", { name: /reindex/i });
    expect(reindexButton).toBeInTheDocument();
  });

  it("triggers reindex when clicking reindex button", async () => {
    render(() => <SyncStatusPanel did="did:plc:test" />);

    const reindexButton = await screen.findByRole("button", { name: /reindex/i });
    fireEvent.click(reindexButton);

    await waitFor(() => {
      expect(reindexEmbeddingsMock).toHaveBeenCalled();
    });
  });

  it("shows reindexing state during reindex", async () => {
    reindexEmbeddingsMock.mockImplementation(() => new Promise(() => {})); // Never resolves

    render(() => <SyncStatusPanel did="did:plc:test" />);

    const reindexButton = await screen.findByRole("button", { name: /reindex/i });
    fireEvent.click(reindexButton);

    await waitFor(() => {
      expect(screen.getByRole("button", { name: /reindexing/i })).toBeInTheDocument();
    });
  });

  it("shows progress bars during operations", async () => {
    syncPostsMock.mockImplementation(() => new Promise(() => {})); // Never resolves

    render(() => <SyncStatusPanel did="did:plc:test" />);

    const syncButton = await screen.findByRole("button", { name: /sync now/i });
    fireEvent.click(syncButton);

    await waitFor(() => {
      expect(screen.getByTestId("sync-activity-bar")).toBeInTheDocument();
    });
  });

  it("fades the activity bar out after sync completes", async () => {
    vi.useRealTimers();
    syncPostsMock.mockImplementation(() =>
      new Promise((resolve) => {
        setTimeout(() => {
          resolve({ did: "did:plc:test", source: "like", postCount: 150, lastSyncedAt: "2026-03-29T13:00:00.000Z" });
        }, 20);
      })
    );

    render(() => <SyncStatusPanel did="did:plc:test" />);

    fireEvent.click(await screen.findByRole("button", { name: /sync now/i }));

    await waitFor(() => {
      expect(screen.getByTestId("sync-activity-bar")).toBeInTheDocument();
    });

    await waitFor(() => {
      expect(screen.queryByTestId("sync-activity-bar")).not.toBeInTheDocument();
    });
  }, 10_000);

  it("shows source-specific progress bars", async () => {
    render(() => <SyncStatusPanel did="did:plc:test" />);

    expect(await screen.findByText(/liked posts/i)).toBeInTheDocument();
    expect(await screen.findByText(/bookmarked posts/i)).toBeInTheDocument();
  });

  it("hides reindex button when no posts exist", async () => {
    getSyncStatusMock.mockResolvedValue([{
      did: "did:plc:test",
      source: "like",
      postCount: 0,
      lastSyncedAt: null,
      cursor: null,
    }]);

    render(() => <SyncStatusPanel did="did:plc:test" />);

    await waitFor(() => {
      const reindexButton = screen.queryByRole("button", { name: /reindex/i });
      expect(reindexButton).not.toBeInTheDocument();
    });
  });

  it("polls for sync status updates", async () => {
    render(() => <SyncStatusPanel did="did:plc:test" />);

    await waitFor(() => {
      expect(getSyncStatusMock).toHaveBeenCalledTimes(1);
    });

    vi.advanceTimersByTime(60_000);

    await waitFor(() => {
      expect(getSyncStatusMock).toHaveBeenCalledTimes(2);
    });
  });

  it("handles sync errors gracefully", async () => {
    syncPostsMock.mockRejectedValue(new Error("Sync failed"));

    render(() => <SyncStatusPanel did="did:plc:test" />);

    const syncButton = await screen.findByRole("button", { name: /sync now/i });
    fireEvent.click(syncButton);

    await waitFor(() => {
      expect(syncPostsMock).toHaveBeenCalled();
    });

    // Should return to normal state after error
    expect(await screen.findByRole("button", { name: /sync now/i })).toBeEnabled();
  });

  it("disables buttons during operations", async () => {
    syncPostsMock.mockImplementation(() => new Promise(() => {}));

    render(() => <SyncStatusPanel did="did:plc:test" />);

    const syncButton = await screen.findByRole("button", { name: /sync now/i });
    const reindexButton = screen.getByRole("button", { name: /reindex/i });

    fireEvent.click(syncButton);

    await waitFor(() => {
      expect(syncButton).toBeDisabled();
      expect(reindexButton).toBeDisabled();
    });
  });
});

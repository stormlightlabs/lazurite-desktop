import { AppTestProviders } from "$/test/providers";
import { fireEvent, render, screen, waitFor } from "@solidjs/testing-library";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { FollowHygienePanel } from "../FollowHygienePanel";

const auditFollowsMock = vi.hoisted(() => vi.fn());
const batchUnfollowMock = vi.hoisted(() => vi.fn());
const listenMock = vi.hoisted(() => vi.fn());
const onCloseMock = vi.hoisted(() => vi.fn());
const reportErrorMock = vi.hoisted(() => vi.fn());

vi.mock(
  "$/lib/api/profile",
  () => ({ ProfileController: { auditFollows: auditFollowsMock, batchUnfollow: batchUnfollowMock } }),
);

vi.mock("@tauri-apps/api/event", () => ({ listen: listenMock }));

const FOLLOW_STATUS_DELETED = Math.trunc(1);
const FOLLOW_STATUS_DEACTIVATED = 1 << 1;
const FOLLOW_STATUS_BLOCKED_BY = 1 << 3;
const FOLLOW_STATUS_BLOCKING = 1 << 4;
const FOLLOW_STATUS_HIDDEN = 1 << 5;

function renderPanel() {
  render(() => (
    <AppTestProviders session={{ reportError: reportErrorMock }}>
      <FollowHygienePanel onClose={onCloseMock} />
    </AppTestProviders>
  ));
}

function createFlagged() {
  return [{
    did: "did:plc:ghost",
    followUri: "at://did:plc:alice/app.bsky.graph.follow/1",
    handle: "ghost.test",
    status: FOLLOW_STATUS_DELETED,
    statusLabel: "Deleted",
  }, {
    did: "did:plc:nap",
    followUri: "at://did:plc:alice/app.bsky.graph.follow/2",
    handle: "nap.test",
    status: FOLLOW_STATUS_DEACTIVATED | FOLLOW_STATUS_HIDDEN,
    statusLabel: "Deactivated, Hidden",
  }, {
    did: "did:plc:mutual",
    followUri: "at://did:plc:alice/app.bsky.graph.follow/3",
    handle: "mutual.test",
    status: FOLLOW_STATUS_BLOCKED_BY | FOLLOW_STATUS_BLOCKING,
    statusLabel: "Mutual Block",
  }];
}

describe("FollowHygienePanel", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    auditFollowsMock.mockResolvedValue(createFlagged());
    batchUnfollowMock.mockResolvedValue({ deleted: 0, failed: [] });
    listenMock.mockResolvedValue(vi.fn());
  });

  it("scans, renders progress, and applies category visibility filtering", async () => {
    renderPanel();

    fireEvent.click(screen.getByRole("button", { name: "Scan follows" }));

    const listener = listenMock.mock.calls[0]?.[1];
    expect(listener).toBeTypeOf("function");
    listener({ payload: { current: 1, total: 4 } });

    expect(await screen.findByText("@ghost.test")).toBeInTheDocument();
    expect(screen.getByText(/Scanning batches: [1-4] \/ 4/u)).toBeInTheDocument();
    expect(screen.getByText("3 of 3 visible selected (3 total).")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Hide Deleted" }));

    await waitFor(() => {
      expect(screen.queryByText("@ghost.test")).not.toBeInTheDocument();
      expect(screen.getByText("2 of 2 visible selected (3 total).")).toBeInTheDocument();
    });
  });

  it("supports keyboard shortcuts for space toggle and ctrl+a select all visible", async () => {
    renderPanel();

    fireEvent.click(screen.getByRole("button", { name: "Scan follows" }));
    expect(await screen.findByText("@ghost.test")).toBeInTheDocument();
    expect(screen.getByText("3 of 3 visible selected (3 total).")).toBeInTheDocument();

    const row = screen.getByText("@ghost.test").closest("article");
    expect(row).not.toBeNull();
    row?.focus();
    fireEvent.keyDown(row as HTMLElement, { key: " " });

    await waitFor(() => {
      expect(screen.getByText("2 of 3 visible selected (2 total).")).toBeInTheDocument();
    });

    fireEvent.keyDown(document, { key: "a", ctrlKey: true });

    await waitFor(() => {
      expect(screen.getByText("3 of 3 visible selected (3 total).")).toBeInTheDocument();
    });
  });

  it("unfollows selected accounts, keeps failures for retry, and supports escape behavior", async () => {
    batchUnfollowMock.mockResolvedValueOnce({ deleted: 2, failed: ["at://did:plc:alice/app.bsky.graph.follow/3"] })
      .mockResolvedValueOnce({ deleted: 1, failed: [] });

    renderPanel();

    fireEvent.click(screen.getByRole("button", { name: "Scan follows" }));
    expect(await screen.findByText("@ghost.test")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Unfollow selected" }));
    expect(await screen.findByText("Unfollow selected accounts?")).toBeInTheDocument();

    fireEvent.keyDown(document, { key: "Escape" });
    await waitFor(() => expect(screen.queryByText("Unfollow selected accounts?")).not.toBeInTheDocument());

    fireEvent.click(screen.getByRole("button", { name: "Unfollow selected" }));
    fireEvent.click(await screen.findByRole("button", { name: "Confirm unfollow" }));

    await waitFor(() => {
      expect(batchUnfollowMock).toHaveBeenNthCalledWith(1, [
        "at://did:plc:alice/app.bsky.graph.follow/1",
        "at://did:plc:alice/app.bsky.graph.follow/2",
        "at://did:plc:alice/app.bsky.graph.follow/3",
      ]);
      expect(screen.getByText("2 unfollowed, 1 failed.")).toBeInTheDocument();
    });

    await waitFor(() => {
      expect(screen.queryByText("@ghost.test")).not.toBeInTheDocument();
      expect(screen.queryByText("@nap.test")).not.toBeInTheDocument();
      expect(screen.getByText("@mutual.test")).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole("button", { name: "Retry failed" }));

    await waitFor(() => {
      expect(batchUnfollowMock).toHaveBeenNthCalledWith(2, ["at://did:plc:alice/app.bsky.graph.follow/3"]);
      expect(screen.getByText("1 unfollowed, 0 failed.")).toBeInTheDocument();
    });

    await waitFor(() => {
      expect(screen.queryByText("@mutual.test")).not.toBeInTheDocument();
    });

    fireEvent.keyDown(document, { key: "Escape" });
    expect(onCloseMock).toHaveBeenCalledTimes(1);
  });

  it("reports a friendly scan failure", async () => {
    auditFollowsMock.mockRejectedValueOnce(new Error("network down"));
    renderPanel();

    fireEvent.click(screen.getByRole("button", { name: "Scan follows" }));

    await waitFor(() => {
      expect(screen.getByText("Couldn't scan your follows right now.")).toBeInTheDocument();
      expect(reportErrorMock).toHaveBeenCalledWith("Couldn't scan your follows right now.");
    });
  });
});

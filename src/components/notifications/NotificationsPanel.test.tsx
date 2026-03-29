import { fireEvent, render, screen, waitFor } from "@solidjs/testing-library";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { NotificationsPanel } from "./NotificationsPanel";

const listNotificationsMock = vi.hoisted(() => vi.fn());
const updateSeenMock = vi.hoisted(() => vi.fn());
const listenMock = vi.hoisted(() => vi.fn());
const warnMock = vi.hoisted(() => vi.fn());

vi.mock("$/lib/api/notifications", () => ({ listNotifications: listNotificationsMock, updateSeen: updateSeenMock }));
vi.mock("@tauri-apps/api/event", () => ({ listen: listenMock }));
vi.mock("@tauri-apps/plugin-log", () => ({ warn: warnMock }));

function createNotification(reason: string, overrides: Record<string, unknown> = {}) {
  return {
    author: { did: `did:plc:${reason}`, displayName: `${reason} author`, handle: `${reason}.test` },
    cid: `cid-${reason}`,
    indexedAt: "2026-03-29T12:00:00.000Z",
    isRead: false,
    reason,
    record: { text: `${reason} detail` },
    uri: `at://did:plc:${reason}/app.bsky.notification/${reason}`,
    ...overrides,
  };
}

describe("NotificationsPanel", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-03-29T12:30:00.000Z"));
    listNotificationsMock.mockReset();
    updateSeenMock.mockReset();
    listenMock.mockReset();
    warnMock.mockReset();
    updateSeenMock.mockResolvedValue(void 0);
    listenMock.mockResolvedValue(() => {});
  });

  it("loads notifications, marks them seen, and switches between tabs", async () => {
    listNotificationsMock.mockResolvedValue({
      cursor: null,
      notifications: [createNotification("mention"), createNotification("like")],
      seenAt: null,
    });

    const onMarkSeen = vi.fn();
    render(() => <NotificationsPanel onMarkSeen={onMarkSeen} />);

    await screen.findByLabelText("mention author mentioned you");
    await waitFor(() => expect(updateSeenMock).toHaveBeenCalledOnce());
    await waitFor(() => expect(onMarkSeen).toHaveBeenCalledOnce());

    expect(screen.queryByLabelText("like author liked your post")).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /activity/i }));

    expect(await screen.findByLabelText("like author liked your post")).toBeInTheDocument();
  });

  it("reloads when the unread-count event arrives", async () => {
    let handleUnreadUpdate: (() => void) | undefined;

    listNotificationsMock.mockResolvedValueOnce({
      cursor: null,
      notifications: [createNotification("mention")],
      seenAt: null,
    }).mockResolvedValueOnce({
      cursor: null,
      notifications: [createNotification("mention"), createNotification("reply")],
      seenAt: null,
    });

    listenMock.mockImplementation((_event: string, callback: () => void) => {
      handleUnreadUpdate = callback;
      return Promise.resolve(() => {});
    });

    render(() => <NotificationsPanel onMarkSeen={vi.fn()} />);

    await screen.findByLabelText("mention author mentioned you");

    handleUnreadUpdate?.();

    await waitFor(() => expect(listNotificationsMock).toHaveBeenCalledTimes(2));
    expect(await screen.findByLabelText("reply author replied to you")).toBeInTheDocument();
  });

  it("shows the error state when loading fails", async () => {
    listNotificationsMock.mockRejectedValue(new Error("notification fetch failed"));

    render(() => <NotificationsPanel onMarkSeen={vi.fn()} />);

    expect(await screen.findByText("notification fetch failed")).toBeInTheDocument();
  });
});

import { AppTestProviders } from "$/test/providers";
import { HashRouter, Route } from "@solidjs/router";
import { fireEvent, render, screen, waitFor, within } from "@solidjs/testing-library";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { NotificationsPanel } from "../NotificationsPanel";

const listNotificationsMock = vi.hoisted(() => vi.fn());
const updateSeenMock = vi.hoisted(() => vi.fn());
const listenMock = vi.hoisted(() => vi.fn());
const warnMock = vi.hoisted(() => vi.fn());
const moderateContentMock = vi.hoisted(() => vi.fn());

vi.mock("$/lib/api/notifications", () => ({ listNotifications: listNotificationsMock, updateSeen: updateSeenMock }));
vi.mock("@tauri-apps/api/event", () => ({ listen: listenMock }));
vi.mock("@tauri-apps/plugin-log", () => ({ warn: warnMock }));
vi.mock("$/lib/api/moderation", () => ({ ModerationController: { moderateContent: moderateContentMock } }));

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

function renderNotificationsPanelWithRouter() {
  render(() => (
    <AppTestProviders>
      <HashRouter>
        <Route path="/notifications" component={() => <NotificationsPanel />} />
      </HashRouter>
    </AppTestProviders>
  ));
}

async function flushRouterNavigation() {
  await vi.runAllTimersAsync();
  await Promise.resolve();
  await Promise.resolve();
}

describe("NotificationsPanel", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-03-29T12:30:00.000Z"));
    globalThis.location.hash = "#/notifications";
    listNotificationsMock.mockReset();
    updateSeenMock.mockReset();
    listenMock.mockReset();
    warnMock.mockReset();
    moderateContentMock.mockReset();
    updateSeenMock.mockResolvedValue(void 0);
    listenMock.mockResolvedValue(() => {});
    moderateContentMock.mockResolvedValue({
      alert: false,
      blur: "none",
      filter: false,
      inform: false,
      noOverride: false,
    });
  });

  it("defaults to the all tab and does not auto-mark seen", async () => {
    listNotificationsMock.mockResolvedValue({
      cursor: null,
      notifications: [
        createNotification("mention", {
          indexedAt: "2026-03-29T12:10:00.000Z",
          uri: "at://did:plc:mention/app.bsky.notification/1",
        }),
        createNotification("like", {
          indexedAt: "2026-03-29T12:00:00.000Z",
          reasonSubject: "at://did:plc:post/app.bsky.feed.post/1",
          uri: "at://did:plc:like/app.bsky.notification/2",
        }),
      ],
      seenAt: null,
    });

    render(() => (
      <AppTestProviders>
        <NotificationsPanel />
      </AppTestProviders>
    ));

    await screen.findByLabelText("mention author mentioned you");
    expect(screen.getByRole("button", { name: /^All/ })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByLabelText("like author liked your post")).toBeInTheDocument();
    expect(updateSeenMock).not.toHaveBeenCalled();
  });

  it("marks everything read only when the user clicks mark all read", async () => {
    listNotificationsMock.mockResolvedValue({
      cursor: null,
      notifications: [createNotification("mention")],
      seenAt: null,
    });

    const markNotificationsSeen = vi.fn();
    render(() => (
      <AppTestProviders session={{ markNotificationsSeen }}>
        <NotificationsPanel />
      </AppTestProviders>
    ));

    await screen.findByLabelText("mention author mentioned you");
    expect(screen.getByRole("heading", { name: "New" })).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /mark all read/i }));

    await waitFor(() => expect(updateSeenMock).toHaveBeenCalledOnce());
    await waitFor(() => expect(markNotificationsSeen).toHaveBeenCalledOnce());
    expect(screen.queryByLabelText("Unread")).not.toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Earlier" })).toBeInTheDocument();
  });

  it("renders new and earlier sections", async () => {
    listNotificationsMock.mockResolvedValue({
      cursor: null,
      notifications: [
        createNotification("mention", {
          indexedAt: "2026-03-29T12:10:00.000Z",
          uri: "at://did:plc:mention/app.bsky.notification/1",
        }),
        createNotification("reply", {
          indexedAt: "2026-03-29T10:00:00.000Z",
          isRead: true,
          uri: "at://did:plc:reply/app.bsky.notification/2",
        }),
      ],
      seenAt: null,
    });

    render(() => (
      <AppTestProviders>
        <NotificationsPanel />
      </AppTestProviders>
    ));

    await screen.findByLabelText("mention author mentioned you");
    expect(screen.getByRole("heading", { name: "New" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Earlier" })).toBeInTheDocument();
  });

  it("groups activity by reason + reasonSubject in the activity tab", async () => {
    listNotificationsMock.mockResolvedValue({
      cursor: null,
      notifications: [
        createNotification("like", {
          author: { did: "did:plc:alice", displayName: "Alice", handle: "alice.test" },
          indexedAt: "2026-03-29T12:10:00.000Z",
          reasonSubject: "at://did:plc:post/app.bsky.feed.post/1",
          uri: "at://did:plc:like/app.bsky.notification/1",
        }),
        createNotification("like", {
          author: { did: "did:plc:bob", displayName: "Bob", handle: "bob.test" },
          indexedAt: "2026-03-29T12:05:00.000Z",
          reasonSubject: "at://did:plc:post/app.bsky.feed.post/1",
          uri: "at://did:plc:like/app.bsky.notification/2",
        }),
      ],
      seenAt: null,
    });

    render(() => (
      <AppTestProviders>
        <NotificationsPanel />
      </AppTestProviders>
    ));

    await screen.findByText(/liked your post/i);
    fireEvent.click(screen.getByRole("button", { name: /activity/i }));

    await waitFor(() => {
      const items = screen.getAllByRole("listitem");
      expect(items).toHaveLength(1);
    });

    expect(screen.getByText("Alice and Bob liked your post")).toBeInTheDocument();
    const aliceLink = screen.getByRole("link", { name: "View @alice.test" });
    const bobLink = screen.getByRole("link", { name: "View @bob.test" });
    expect(aliceLink).toHaveAttribute("href", "#/profile/alice.test");
    expect(bobLink).toHaveAttribute("href", "#/profile/bob.test");
    expect(screen.queryByLabelText("like author liked your post")).not.toBeInTheDocument();
  });

  it("opens the responded post when clicking a notification body", async () => {
    listNotificationsMock.mockResolvedValue({
      cursor: null,
      notifications: [
        createNotification("like", {
          reasonSubject: "at://did:plc:post/app.bsky.feed.post/1",
          uri: "at://did:plc:like/app.bsky.notification/1",
        }),
      ],
      seenAt: null,
    });

    renderNotificationsPanelWithRouter();

    const body = await screen.findByRole("button", { name: /like author liked your post/i });
    fireEvent.click(body);

    await flushRouterNavigation();
    expect(globalThis.location.hash).toBe(
      "#/notifications?thread=at%3A%2F%2Fdid%3Aplc%3Apost%2Fapp.bsky.feed.post%2F1",
    );
    expect(screen.queryByLabelText("Unread")).not.toBeInTheDocument();
  });

  it("opens the selected thread when clicking different notification rows", async () => {
    listNotificationsMock.mockResolvedValue({
      cursor: null,
      notifications: [
        createNotification("like", {
          author: { did: "did:plc:alice", displayName: "Alice", handle: "alice.test" },
          reasonSubject: "at://did:plc:post/app.bsky.feed.post/1",
          uri: "at://did:plc:like/app.bsky.notification/1",
        }),
        createNotification("like", {
          author: { did: "did:plc:bob", displayName: "Bob", handle: "bob.test" },
          reasonSubject: "at://did:plc:post/app.bsky.feed.post/2",
          uri: "at://did:plc:like/app.bsky.notification/2",
        }),
      ],
      seenAt: null,
    });

    renderNotificationsPanelWithRouter();

    const firstBody = await screen.findByRole("button", { name: /alice liked your post/i });
    fireEvent.click(firstBody);
    await flushRouterNavigation();
    expect(globalThis.location.hash).toBe(
      "#/notifications?thread=at%3A%2F%2Fdid%3Aplc%3Apost%2Fapp.bsky.feed.post%2F1",
    );

    const secondBody = screen.getByRole("button", { name: /bob liked your post/i });
    fireEvent.click(secondBody);
    await flushRouterNavigation();
    expect(globalThis.location.hash).toBe(
      "#/notifications?thread=at%3A%2F%2Fdid%3Aplc%3Apost%2Fapp.bsky.feed.post%2F2",
    );
  });

  it("opens reply/quote target on body click and links original as 'your post'", async () => {
    listNotificationsMock.mockResolvedValue({
      cursor: null,
      notifications: [
        createNotification("reply", {
          author: { did: "did:plc:alice", displayName: "Alice", handle: "alice.test" },
          reasonSubject: "at://did:plc:post/app.bsky.feed.post/original",
          uri: "at://did:plc:alice/app.bsky.feed.post/reply",
        }),
      ],
      seenAt: null,
    });

    renderNotificationsPanelWithRouter();

    const yourPost = await screen.findByRole("link", { name: "your post" });
    expect(yourPost).toHaveAttribute(
      "href",
      "#/notifications?thread=at%3A%2F%2Fdid%3Aplc%3Apost%2Fapp.bsky.feed.post%2Foriginal",
    );

    const body = screen.getByRole("button", { name: /alice replied to.*your post/i });
    fireEvent.click(body);
    await flushRouterNavigation();
    expect(globalThis.location.hash).toBe(
      "#/notifications?thread=at%3A%2F%2Fdid%3Aplc%3Aalice%2Fapp.bsky.feed.post%2Freply",
    );
    expect(screen.queryByLabelText("Unread")).not.toBeInTheDocument();
  });

  it("marks a notification read when profile avatar is clicked", async () => {
    listNotificationsMock.mockResolvedValue({
      cursor: null,
      notifications: [
        createNotification("mention", {
          author: { did: "did:plc:alice", displayName: "Alice", handle: "alice.test" },
          uri: "at://did:plc:mention/app.bsky.notification/1",
        }),
      ],
      seenAt: null,
    });

    render(() => (
      <AppTestProviders>
        <NotificationsPanel />
      </AppTestProviders>
    ));

    const avatarLink = await screen.findByRole("link", { name: "View @alice.test" });
    fireEvent.click(avatarLink);
    expect(screen.queryByLabelText("Unread")).not.toBeInTheDocument();
  });

  it("keeps mentions ungrouped in the mentions tab", async () => {
    listNotificationsMock.mockResolvedValue({
      cursor: null,
      notifications: [
        createNotification("mention", { uri: "at://did:plc:mention/app.bsky.notification/1" }),
        createNotification("reply", { uri: "at://did:plc:reply/app.bsky.notification/2" }),
      ],
      seenAt: null,
    });

    render(() => (
      <AppTestProviders>
        <NotificationsPanel />
      </AppTestProviders>
    ));

    await screen.findByLabelText("mention author mentioned you");
    fireEvent.click(screen.getByRole("button", { name: /mentions/i }));

    await waitFor(() => {
      const items = screen.getAllByRole("listitem");
      expect(items).toHaveLength(2);
    });
  });

  it("sorts all-tab rows by newest timestamp across mentions and grouped activity", async () => {
    listNotificationsMock.mockResolvedValue({
      cursor: null,
      notifications: [
        createNotification("like", {
          author: { did: "did:plc:alice", displayName: "Alice", handle: "alice.test" },
          indexedAt: "2026-03-29T12:10:00.000Z",
          reasonSubject: "at://did:plc:post/app.bsky.feed.post/1",
          uri: "at://did:plc:like/app.bsky.notification/1",
        }),
        createNotification("like", {
          author: { did: "did:plc:bob", displayName: "Bob", handle: "bob.test" },
          indexedAt: "2026-03-29T12:08:00.000Z",
          reasonSubject: "at://did:plc:post/app.bsky.feed.post/1",
          uri: "at://did:plc:like/app.bsky.notification/2",
        }),
        createNotification("mention", {
          author: { did: "did:plc:carol", displayName: "Carol", handle: "carol.test" },
          indexedAt: "2026-03-29T12:12:00.000Z",
          uri: "at://did:plc:mention/app.bsky.notification/3",
        }),
      ],
      seenAt: null,
    });

    render(() => (
      <AppTestProviders>
        <NotificationsPanel />
      </AppTestProviders>
    ));

    await screen.findByLabelText("Carol mentioned you");

    await waitFor(() => {
      const items = screen.getAllByRole("listitem");
      expect(items).toHaveLength(2);
      expect(within(items[0]).getByLabelText("Carol mentioned you")).toBeInTheDocument();
      expect(within(items[1]).getByText("Alice and Bob liked your post")).toBeInTheDocument();
    });
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

    render(() => (
      <AppTestProviders>
        <NotificationsPanel />
      </AppTestProviders>
    ));

    await screen.findByLabelText("mention author mentioned you");

    handleUnreadUpdate?.();

    await waitFor(() => expect(listNotificationsMock).toHaveBeenCalledTimes(2));
    expect(await screen.findByLabelText("reply author replied to you")).toBeInTheDocument();
    expect(updateSeenMock).not.toHaveBeenCalled();
  });

  it("shows the error state when loading fails", async () => {
    listNotificationsMock.mockRejectedValue(new Error("notification fetch failed"));

    render(() => (
      <AppTestProviders>
        <NotificationsPanel />
      </AppTestProviders>
    ));

    expect(await screen.findByText("notification fetch failed")).toBeInTheDocument();
    expect(updateSeenMock).not.toHaveBeenCalled();
    expect(warnMock).not.toHaveBeenCalled();
  });

  it("shows profile moderation badges for single and grouped activity rows", async () => {
    listNotificationsMock.mockResolvedValue({
      cursor: null,
      notifications: [
        createNotification("follow", {
          author: {
            did: "did:plc:single",
            displayName: "Single Author",
            handle: "single.test",
            labels: [{ src: "did:plc:labeler", val: "sexual" }],
          },
          uri: "at://did:plc:single/app.bsky.notification/1",
        }),
        createNotification("like", {
          author: {
            did: "did:plc:alice",
            displayName: "Alice",
            handle: "alice.test",
            labels: [{ src: "did:plc:labeler", val: "sexual" }],
          },
          reasonSubject: "at://did:plc:post/app.bsky.feed.post/1",
          uri: "at://did:plc:like/app.bsky.notification/2",
        }),
        createNotification("like", {
          author: {
            did: "did:plc:bob",
            displayName: "Bob",
            handle: "bob.test",
            labels: [{ src: "did:plc:labeler", val: "sexual" }],
          },
          reasonSubject: "at://did:plc:post/app.bsky.feed.post/1",
          uri: "at://did:plc:like/app.bsky.notification/3",
        }),
      ],
      seenAt: null,
    });
    moderateContentMock.mockImplementation(async (_labels, context: string) => {
      if (context === "profileList") {
        return { alert: true, blur: "none", filter: false, inform: false, noOverride: false };
      }

      return { alert: false, blur: "none", filter: false, inform: false, noOverride: false };
    });

    renderNotificationsPanelWithRouter();
    await screen.findByLabelText("Single Author followed you");
    await waitFor(() => expect(screen.getAllByText("Alert").length).toBeGreaterThan(0));

    fireEvent.click(screen.getByRole("button", { name: /activity/i }));
    await waitFor(() => expect(screen.getByText("Alice and Bob liked your post")).toBeInTheDocument());
    await waitFor(() => expect(screen.getAllByText("Alert").length).toBeGreaterThan(0));
  });
});

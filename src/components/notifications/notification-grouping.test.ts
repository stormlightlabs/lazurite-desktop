import type { NotificationView } from "$/lib/types";
import { describe, expect, it } from "vitest";
import {
  buildAllNotificationsFeed,
  groupActivityNotifications,
  splitByReadState,
  toSingleFeedItems,
} from "./notification-grouping";

function createNotification(reason: string, overrides: Partial<NotificationView> = {}): NotificationView {
  return {
    author: { did: `did:plc:${reason}`, displayName: `${reason} author`, handle: `${reason}.test` },
    cid: `cid-${reason}`,
    indexedAt: "2026-03-29T12:00:00.000Z",
    isRead: false,
    reason,
    record: { text: `${reason} text` },
    uri: `at://did:plc:${reason}/app.bsky.notification/${reason}`,
    ...overrides,
  };
}

describe("notification-grouping", () => {
  it("groups activity by reason + reasonSubject", () => {
    const notifications = [
      createNotification("like", {
        author: { did: "did:plc:alice", displayName: "Alice", handle: "alice.test" },
        indexedAt: "2026-03-29T12:10:00.000Z",
        reasonSubject: "at://did:plc:post/app.bsky.feed.post/1",
        uri: "at://did:plc:alice/app.bsky.notification/1",
      }),
      createNotification("like", {
        author: { did: "did:plc:bob", displayName: "Bob", handle: "bob.test" },
        indexedAt: "2026-03-29T12:08:00.000Z",
        reasonSubject: "at://did:plc:post/app.bsky.feed.post/1",
        uri: "at://did:plc:bob/app.bsky.notification/2",
      }),
      createNotification("repost", {
        author: { did: "did:plc:carol", displayName: "Carol", handle: "carol.test" },
        indexedAt: "2026-03-29T12:09:00.000Z",
        reasonSubject: "at://did:plc:post/app.bsky.feed.post/1",
        uri: "at://did:plc:carol/app.bsky.notification/3",
      }),
    ];

    const grouped = groupActivityNotifications(notifications);

    expect(grouped).toHaveLength(2);
    const likeGroup = grouped.find((item) => item.kind === "group" && item.reason === "like");
    if (!likeGroup || likeGroup.kind !== "group") {
      throw new Error("expected grouped like activity");
    }

    expect(likeGroup.count).toBe(2);
    expect(likeGroup.actorCount).toBe(2);
    expect(grouped.some((item) => item.kind === "single")).toBe(true);
  });

  it("does not group notifications without reasonSubject", () => {
    const notifications = [
      createNotification("like", { uri: "at://did:plc:alice/app.bsky.notification/1" }),
      createNotification("like", { uri: "at://did:plc:bob/app.bsky.notification/2" }),
    ];

    const grouped = groupActivityNotifications(notifications);

    expect(grouped).toHaveLength(2);
    expect(grouped.every((item) => item.kind === "single")).toBe(true);
  });

  it("propagates unread state and chooses the newest timestamp for grouped activity", () => {
    const notifications = [
      createNotification("like", {
        indexedAt: "2026-03-29T12:10:00.000Z",
        isRead: true,
        reasonSubject: "at://did:plc:post/app.bsky.feed.post/1",
        uri: "at://did:plc:alice/app.bsky.notification/1",
      }),
      createNotification("like", {
        indexedAt: "2026-03-29T12:08:00.000Z",
        isRead: false,
        reasonSubject: "at://did:plc:post/app.bsky.feed.post/1",
        uri: "at://did:plc:bob/app.bsky.notification/2",
      }),
    ];

    const grouped = groupActivityNotifications(notifications);

    expect(grouped).toHaveLength(1);
    expect(grouped[0].kind).toBe("group");
    expect(grouped[0].isUnread).toBe(true);
    expect(grouped[0].latestIndexedAt).toBe("2026-03-29T12:10:00.000Z");
  });

  it("sorts all feed items by newest timestamp across mentions and grouped activity", () => {
    const mentions = [
      createNotification("mention", {
        indexedAt: "2026-03-29T12:12:00.000Z",
        uri: "at://did:plc:mention/app.bsky.notification/1",
      }),
    ];

    const activity = groupActivityNotifications([
      createNotification("like", {
        indexedAt: "2026-03-29T12:10:00.000Z",
        reasonSubject: "at://did:plc:post/app.bsky.feed.post/1",
        uri: "at://did:plc:alice/app.bsky.notification/2",
      }),
      createNotification("like", {
        indexedAt: "2026-03-29T12:08:00.000Z",
        reasonSubject: "at://did:plc:post/app.bsky.feed.post/1",
        uri: "at://did:plc:bob/app.bsky.notification/3",
      }),
    ]);

    const all = buildAllNotificationsFeed(mentions, activity);

    expect(all).toHaveLength(2);
    if (all[0].kind !== "single") {
      throw new Error("expected mention row first");
    }

    if (all[1].kind !== "group") {
      throw new Error("expected grouped activity row second");
    }

    expect(all[0].notification.reason).toBe("mention");
  });

  it("splits feed rows into new and earlier sections", () => {
    const items = toSingleFeedItems([
      createNotification("mention", { isRead: false, uri: "at://did:plc:mention/app.bsky.notification/1" }),
      createNotification("reply", { isRead: true, uri: "at://did:plc:reply/app.bsky.notification/2" }),
    ]);

    const sections = splitByReadState(items);

    expect(sections.newer).toHaveLength(1);
    expect(sections.earlier).toHaveLength(1);
  });
});

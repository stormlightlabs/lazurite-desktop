import { asRecord } from "$/lib/type-guards";
import type { NotificationReason, NotificationView, ProfileViewBasic } from "$/lib/types";

export type NotificationFeedItem = SingleNotificationFeedItem | GroupedNotificationFeedItem;

export type SingleNotificationFeedItem = {
  isUnread: boolean;
  key: string;
  kind: "single";
  latestIndexedAt: string;
  notification: NotificationView;
};

export type GroupedNotificationFeedItem = {
  actorCount: number;
  actors: ProfileViewBasic[];
  count: number;
  isUnread: boolean;
  key: string;
  kind: "group";
  latestIndexedAt: string;
  notifications: NotificationView[];
  reason: NotificationReason;
  reasonSubject: string;
  sampleRecordText: string | null;
};

const MENTION_REASONS = new Set(["mention", "reply", "quote"]);

export function isMentionNotification(notification: NotificationView) {
  return MENTION_REASONS.has(notification.reason);
}

function toTimestamp(value: string) {
  const timestamp = Date.parse(value);
  return Number.isNaN(timestamp) ? 0 : timestamp;
}

function compareByNewest(left: { latestIndexedAt: string }, right: { latestIndexedAt: string }) {
  const timestampDelta = toTimestamp(right.latestIndexedAt) - toTimestamp(left.latestIndexedAt);
  if (timestampDelta !== 0) {
    return timestampDelta;
  }

  return right.latestIndexedAt.localeCompare(left.latestIndexedAt);
}

function compareNotificationsByNewest(left: NotificationView, right: NotificationView) {
  return compareByNewest({ latestIndexedAt: left.indexedAt }, { latestIndexedAt: right.indexedAt });
}

function recordText(notification: NotificationView) {
  const record = asRecord(notification.record);
  const text = record?.text;
  return typeof text === "string" && text.trim() ? text.trim() : null;
}

function isGroupableActivity(notification: NotificationView) {
  if (isMentionNotification(notification)) {
    return false;
  }

  return typeof notification.reasonSubject === "string" && notification.reasonSubject.trim().length > 0;
}

function dedupeActors(notifications: NotificationView[]) {
  const actorByDid = new Map<string, ProfileViewBasic>();

  for (const notification of notifications) {
    const actorDid = notification.author.did;
    if (!actorByDid.has(actorDid)) {
      actorByDid.set(actorDid, notification.author);
    }
  }

  return [...actorByDid.values()];
}

function toSingleNotificationFeedItem(notification: NotificationView): SingleNotificationFeedItem {
  return {
    isUnread: !notification.isRead,
    key: `single:${notification.uri}`,
    kind: "single",
    latestIndexedAt: notification.indexedAt,
    notification,
  };
}

export function groupActivityNotifications(notifications: NotificationView[]): NotificationFeedItem[] {
  const grouped = new Map<string, NotificationView[]>();
  const singles: NotificationFeedItem[] = [];

  for (const notification of notifications) {
    if (!isGroupableActivity(notification)) {
      singles.push(toSingleNotificationFeedItem(notification));
      continue;
    }

    const reasonSubject = notification.reasonSubject!.trim();
    const groupKey = `${notification.reason}:${reasonSubject}`;
    const current = grouped.get(groupKey);

    if (current) {
      current.push(notification);
    } else {
      grouped.set(groupKey, [notification]);
    }
  }

  const groupedItems: NotificationFeedItem[] = [];

  for (const [groupKey, items] of grouped) {
    if (items.length === 1) {
      groupedItems.push(toSingleNotificationFeedItem(items[0]));
      continue;
    }

    const sorted = [...items].toSorted(compareNotificationsByNewest);
    const latest = sorted[0];
    const actors = dedupeActors(sorted);

    groupedItems.push({
      actorCount: actors.length,
      actors,
      count: sorted.length,
      isUnread: sorted.some((notification) => !notification.isRead),
      key: `group:${groupKey}`,
      kind: "group",
      latestIndexedAt: latest.indexedAt,
      notifications: sorted,
      reason: latest.reason,
      reasonSubject: latest.reasonSubject!.trim(),
      sampleRecordText: sorted.map((notification) => recordText(notification)).find((text) => text !== null) ?? null,
    });
  }

  return [...singles, ...groupedItems].toSorted(compareByNewest);
}

export function toSingleFeedItems(notifications: NotificationView[]): SingleNotificationFeedItem[] {
  return notifications.map((notification) => toSingleNotificationFeedItem(notification));
}

export function buildAllNotificationsFeed(
  mentions: NotificationView[],
  activityItems: NotificationFeedItem[],
): NotificationFeedItem[] {
  const mentionItems = toSingleFeedItems(mentions);
  return [...mentionItems, ...activityItems].toSorted(compareByNewest);
}

export function splitByReadState(items: NotificationFeedItem[]) {
  const newer: NotificationFeedItem[] = [];
  const earlier: NotificationFeedItem[] = [];

  for (const item of items) {
    if (item.isUnread) {
      newer.push(item);
    } else {
      earlier.push(item);
    }
  }

  return { earlier, newer };
}

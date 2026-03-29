import type { ListNotificationsResponse, NotificationView } from "$/lib/types";
import { invoke } from "@tauri-apps/api/core";

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }

  return value as Record<string, unknown>;
}

function isNotificationView(value: unknown): value is NotificationView {
  const record = asRecord(value);
  const author = asRecord(record?.author);
  const notificationRecord = asRecord(record?.record);

  return !!record
    && !!author
    && !!notificationRecord
    && typeof record.uri === "string"
    && typeof record.cid === "string"
    && typeof author.did === "string"
    && typeof author.handle === "string"
    && typeof record.reason === "string"
    && typeof record.isRead === "boolean"
    && typeof record.indexedAt === "string";
}

export function parseListNotificationsResponse(value: unknown): ListNotificationsResponse {
  const record = asRecord(value);
  const notifications = record?.notifications;
  const seenAt = record?.seenAt;

  if (!record || !Array.isArray(notifications) || !notifications.every((item) => isNotificationView(item))) {
    throw new Error("notifications response payload is invalid");
  }

  if (record.cursor !== undefined && record.cursor !== null && typeof record.cursor !== "string") {
    throw new Error("notifications response cursor is invalid");
  }

  if (seenAt !== undefined && seenAt !== null && typeof seenAt !== "string") {
    throw new Error("notifications response seenAt is invalid");
  }

  return {
    cursor: (record.cursor as string | null | undefined) ?? null,
    notifications,
    seenAt: (seenAt as string | null | undefined) ?? null,
  };
}

export function listNotifications(cursor?: string | null) {
  return invoke("list_notifications", { cursor: cursor ?? null }).then(parseListNotificationsResponse);
}

export function updateSeen() {
  return invoke<void>("update_seen");
}

export function getUnreadCount() {
  return invoke<number>("get_unread_count");
}

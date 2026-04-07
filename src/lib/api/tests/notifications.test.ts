import { describe, expect, it } from "vitest";
import { parseListNotificationsResponse } from "../notifications";

function createNotification() {
  return {
    author: { did: "did:plc:alice", handle: "alice.test" },
    cid: "cid-1",
    indexedAt: "2026-03-29T12:00:00.000Z",
    isRead: false,
    reason: "mention",
    record: { text: "hello" },
    uri: "at://did:plc:alice/app.bsky.notification/1",
  };
}

describe("parseListNotificationsResponse", () => {
  it("returns a typed notifications payload", () => {
    const response = parseListNotificationsResponse({
      cursor: "cursor-1",
      notifications: [createNotification()],
      seenAt: "2026-03-29T12:00:00.000Z",
    });

    expect(response.cursor).toBe("cursor-1");
    expect(response.notifications).toHaveLength(1);
    expect(response.seenAt).toBe("2026-03-29T12:00:00.000Z");
  });

  it("rejects malformed notification entries", () => {
    expect(() => parseListNotificationsResponse({ notifications: [{ nope: true }] })).toThrow(
      "notifications response payload is invalid",
    );
  });

  it("rejects invalid cursor values", () => {
    expect(() => parseListNotificationsResponse({ cursor: 42, notifications: [createNotification()] })).toThrow(
      "notifications response cursor is invalid",
    );
  });
});

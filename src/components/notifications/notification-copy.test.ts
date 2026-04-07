import { describe, expect, it } from "vitest";
import {
  notificationBodyTargetUri,
  notificationOriginalPostUri,
  notificationReasonCopy,
  notificationReasonIcon,
} from "./notification-copy";

describe("notification-copy", () => {
  it("returns copy for known reasons", () => {
    expect(notificationReasonCopy("like")).toBe("liked your post");
    expect(notificationReasonCopy("reply")).toBe("replied to you");
    expect(notificationReasonCopy("follow")).toBe("followed you");
  });

  it("returns icon mapping for known reasons", () => {
    expect(notificationReasonIcon("like")).toEqual({ className: "text-[#ff6b6b]", kind: "heart" });
    expect(notificationReasonIcon("repost")).toEqual({ className: "text-[#4cd964]", kind: "repost" });
    expect(notificationReasonIcon("mention")).toEqual({ className: "text-primary", kind: "reply" });
    expect(notificationReasonIcon("quote")).toEqual({ className: "text-primary", kind: "quote" });
  });

  it("falls back for unknown reasons", () => {
    expect(notificationReasonCopy("unexpected-reason")).toBe("interacted with your post");
    expect(notificationReasonIcon("unexpected-reason")).toEqual({
      className: "text-on-surface-variant",
      kind: "notifications",
    });
  });

  it("chooses body target uri based on reason semantics", () => {
    expect(
      notificationBodyTargetUri({
        reason: "like",
        reasonSubject: "at://did:plc:post/app.bsky.feed.post/original",
        uri: "at://did:plc:alice/app.bsky.feed.like/1",
      }),
    ).toBe("at://did:plc:post/app.bsky.feed.post/original");

    expect(
      notificationBodyTargetUri({
        reason: "reply",
        reasonSubject: "at://did:plc:post/app.bsky.feed.post/original",
        uri: "at://did:plc:alice/app.bsky.feed.post/reply",
      }),
    ).toBe("at://did:plc:alice/app.bsky.feed.post/reply");

    expect(
      notificationBodyTargetUri({
        reason: "follow",
        reasonSubject: null,
        uri: "at://did:plc:alice/app.bsky.graph.follow/1",
      }),
    ).toBeNull();
  });

  it("returns original post uri for reply/quote links", () => {
    expect(
      notificationOriginalPostUri({
        reason: "reply",
        reasonSubject: "at://did:plc:post/app.bsky.feed.post/original",
        uri: "at://did:plc:alice/app.bsky.feed.post/reply",
      }),
    ).toBe("at://did:plc:post/app.bsky.feed.post/original");

    expect(
      notificationOriginalPostUri({
        reason: "like",
        reasonSubject: "at://did:plc:post/app.bsky.feed.post/original",
        uri: "at://did:plc:alice/app.bsky.feed.like/1",
      }),
    ).toBeNull();
  });
});

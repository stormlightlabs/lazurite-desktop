import type { NotificationReason, NotificationView } from "$/lib/types";
import type { IconKind } from "../shared/Icon";

type NotificationIconDescriptor = { className: string; kind: IconKind };
type NotificationTargetSource = Pick<NotificationView, "reason" | "reasonSubject" | "uri">;

export function notificationReasonCopy(reason: NotificationReason) {
  switch (reason) {
    case "like": {
      return "liked your post";
    }
    case "repost": {
      return "reposted your post";
    }
    case "mention": {
      return "mentioned you";
    }
    case "reply": {
      return "replied to you";
    }
    case "quote": {
      return "quoted your post";
    }
    case "follow": {
      return "followed you";
    }
    case "starterpack-joined": {
      return "joined via your starter pack";
    }
    case "verified": {
      return "triggered a verification update";
    }
    case "unverified": {
      return "triggered a verification update";
    }
    default: {
      return "interacted with your post";
    }
  }
}

export function notificationReasonIcon(reason: NotificationReason): NotificationIconDescriptor {
  switch (reason) {
    case "like": {
      return { className: "text-[#ff6b6b]", kind: "heart" };
    }
    case "repost": {
      return { className: "text-[#4cd964]", kind: "repost" };
    }
    case "mention":
    case "reply": {
      return { className: "text-primary", kind: "reply" };
    }
    case "quote": {
      return { className: "text-primary", kind: "quote" };
    }
    case "follow": {
      return { className: "text-primary", kind: "follow" };
    }
    default: {
      return { className: "text-on-surface-variant", kind: "notifications" };
    }
  }
}

function normalizeUri(value: string | null | undefined) {
  if (typeof value !== "string") {
    return null;
  }

  const uri = value.trim();
  return uri.length > 0 ? uri : null;
}

export function notificationOriginalPostUri(notification: NotificationTargetSource) {
  if (notification.reason !== "reply" && notification.reason !== "quote") {
    return null;
  }

  return normalizeUri(notification.reasonSubject);
}

export function notificationBodyTargetUri(notification: NotificationTargetSource) {
  const sourceUri = normalizeUri(notification.uri);
  const subjectUri = normalizeUri(notification.reasonSubject);

  if (notification.reason === "reply" || notification.reason === "quote") {
    return sourceUri ?? subjectUri;
  }

  return subjectUri;
}

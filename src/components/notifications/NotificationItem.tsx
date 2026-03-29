import { formatRelativeTime, getAvatarLabel, getDisplayName } from "$/lib/feeds";
import type { NotificationReason, NotificationView } from "$/lib/types";
import { createMemo, Show } from "solid-js";
import { Icon } from "../shared/Icon";

type ReasonStyle = { color: string; iconClass: string };

export function reasonStyle(reason: NotificationReason): ReasonStyle {
  switch (reason) {
    case "like": {
      return { color: "text-[#ff6b6b]", iconClass: "i-ri-heart-3-fill" };
    }
    case "repost": {
      return { color: "text-[#4cd964]", iconClass: "i-ri-repeat-2-line" };
    }
    case "mention":
    case "reply": {
      return { color: "text-primary", iconClass: "i-ri-chat-3-line" };
    }
    case "quote": {
      return { color: "text-primary", iconClass: "i-ri-chat-quote-line" };
    }
    case "follow": {
      return { color: "text-primary", iconClass: "i-ri-user-add-line" };
    }
    default: {
      return { color: "text-on-surface-variant", iconClass: "i-ri-notification-3-line" };
    }
  }
}

export function reasonText(reason: NotificationReason): string {
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
    default: {
      return "interacted with your post";
    }
  }
}

function AuthorAvatar(props: { avatar?: string | null; label: string }) {
  return (
    <span
      class="inline-flex h-8 w-8 shrink-0 items-center justify-center overflow-hidden rounded-full bg-surface-container-high text-xs font-semibold text-on-surface-variant"
      aria-hidden="true">
      {props.avatar ? <img src={props.avatar} alt="" class="h-full w-full object-cover" /> : props.label}
    </span>
  );
}

type NotificationItemProps = { notification: NotificationView };

export function NotificationItem(props: NotificationItemProps) {
  const style = createMemo(() => reasonStyle(props.notification.reason));
  const name = createMemo(() => getDisplayName(props.notification.author));
  const description = createMemo(() => reasonText(props.notification.reason));
  const time = createMemo(() => formatRelativeTime(props.notification.indexedAt));
  const avatarLabel = createMemo(() => getAvatarLabel(props.notification.author));
  const postText = createMemo<string | null>(() => {
    const record = props.notification.record;
    const text = record["text"];
    return typeof text === "string" && text.trim() ? text.trim() : null;
  });
  const detail = createMemo(() => postText() ?? followDetail(props.notification));

  return (
    <article
      class="flex items-start gap-4 rounded-2xl px-4 py-4 transition-colors duration-150 hover:bg-surface-container-high"
      classList={{ "opacity-60": props.notification.isRead }}
      aria-label={`${name()} ${description()}`}>
      <div class="flex w-8 shrink-0 justify-center pt-0.5">
        <Icon
          iconClass={style().iconClass}
          class={`text-base ${style().color}`}
          aria-hidden="true"
          name={`${name()} ${description()}`} />
      </div>

      <AuthorAvatar avatar={props.notification.author.avatar} label={avatarLabel()} />

      <div class="min-w-0 flex-1">
        <p class="m-0 text-sm leading-relaxed text-on-surface">
          <span class="font-semibold">{name()}</span> <span class="text-on-surface-variant">{description()}</span>
        </p>

        <Show when={detail()}>
          {(value) => <p class="mt-1 line-clamp-2 text-sm text-on-secondary-container">{value()}</p>}
        </Show>

        <p class="mt-2 text-xs text-on-surface-variant">{time()}</p>
      </div>

      <Show when={!props.notification.isRead}>
        <span class="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-primary" aria-label="Unread" role="status" />
      </Show>
    </article>
  );
}

function followDetail(notification: NotificationView) {
  if (notification.reason !== "follow") {
    return null;
  }

  return `@${notification.author.handle}`;
}

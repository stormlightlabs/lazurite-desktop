import { Icon } from "$/components/shared/Icon";
import { formatRelativeTime, getAvatarLabel, getDisplayName } from "$/lib/feeds";
import type { NotificationReason, NotificationView } from "$/lib/types";
import { createMemo, Match, Show, Switch } from "solid-js";

function ReasonIcon(props: { reason: NotificationReason }) {
  return (
    <div class="flex w-8 shrink-0 justify-center pt-0.5">
      <Switch fallback={<Icon kind="notifications" class="text-on-surface-variant" aria-hidden="true" />}>
        <Match when={props.reason === "like"}>
          <Icon kind="heart" class="text-[#ff6b6b]" aria-hidden="true" />
        </Match>
        <Match when={props.reason === "repost"}>
          <Icon kind="repost" class="text-[#4cd964]" aria-hidden="true" />
        </Match>
        <Match when={props.reason === "mention" || props.reason === "reply"}>
          <Icon kind="reply" class="text-primary" aria-hidden="true" />
        </Match>
        <Match when={props.reason === "quote"}>
          <Icon kind="quote" class="text-primary" aria-hidden="true" />
        </Match>
        <Match when={props.reason === "follow"}>
          <Icon kind="follow" class="text-primary" aria-hidden="true" />
        </Match>
      </Switch>
    </div>
  );
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
  const name = createMemo(() => getDisplayName(props.notification.author));
  const description = createMemo(() => {
    switch (props.notification.reason) {
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
  });
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
      <ReasonIcon reason={props.notification.reason} />
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

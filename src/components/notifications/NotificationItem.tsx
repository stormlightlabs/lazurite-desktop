import { useModerationDecision } from "$/components/moderation/hooks/useModerationDecision";
import { ModeratedAvatar } from "$/components/moderation/ModeratedAvatar";
import { ModeratedBlurOverlay } from "$/components/moderation/ModeratedBlurOverlay";
import { ModerationBadgeRow } from "$/components/moderation/ModerationBadgeRow";
import { Icon } from "$/components/shared/Icon";
import { getAvatarLabel, getDisplayName } from "$/lib/feeds";
import { collectModerationLabels } from "$/lib/moderation";
import { buildProfileRoute, getProfileRouteActor } from "$/lib/profile";
import type { NotificationReason, NotificationView } from "$/lib/types";
import { formatRelativeTime } from "$/lib/utils/text";
import { createMemo, Show } from "solid-js";
import {
  notificationBodyTargetUri,
  notificationOriginalPostUri,
  notificationReasonCopy,
  notificationReasonIcon,
} from "./notification-copy";

function ReasonIcon(props: { reason: NotificationReason }) {
  const icon = createMemo(() => notificationReasonIcon(props.reason));

  return (
    <div class="flex w-8 shrink-0 justify-center pt-0.5">
      <Icon kind={icon().kind} class={icon().className} aria-hidden />
    </div>
  );
}

type NotificationItemProps = { notification: NotificationView };
type NotificationInteractionProps = {
  buildThreadHref?: (uri: string | null) => string;
  onMarkRead?: (uris: string[]) => void;
  onOpenThread?: (uri: string) => void;
};

export function NotificationItem(props: NotificationItemProps & NotificationInteractionProps) {
  const name = createMemo(() => getDisplayName(props.notification.author));
  const description = createMemo(() => notificationReasonCopy(props.notification.reason));
  const time = createMemo(() => formatRelativeTime(props.notification.indexedAt));
  const avatarLabel = createMemo(() => getAvatarLabel(props.notification.author));
  const profileHref = createMemo(() => buildProfileRoute(getProfileRouteActor(props.notification.author)));
  const bodyTargetUri = createMemo(() => notificationBodyTargetUri(props.notification));
  const originalPostUri = createMemo(() => notificationOriginalPostUri(props.notification));
  const originalPostHref = createMemo(() => props.buildThreadHref?.(originalPostUri() ?? null) ?? null);
  const bodyInteractive = createMemo(() => !!props.onOpenThread && !!bodyTargetUri());
  const postText = createMemo<string | null>(() => {
    const record = props.notification.record;
    const text = record["text"];
    return typeof text === "string" && text.trim() ? text.trim() : null;
  });
  const detail = createMemo(() => postText() ?? followDetail(props.notification));
  const avatarLabels = () => collectModerationLabels(props.notification.author);
  const profileLabels = () => collectModerationLabels(props.notification.author);
  const contentLabels = () => collectModerationLabels(props.notification);
  const avatarDecision = useModerationDecision(avatarLabels, "avatar");
  const profileDecision = useModerationDecision(profileLabels, "profileList");
  const contentDecision = useModerationDecision(contentLabels, "contentList");

  function openBodyTarget() {
    const uri = bodyTargetUri();
    if (!uri || !props.onOpenThread) {
      return;
    }

    props.onMarkRead?.([props.notification.uri]);
    props.onOpenThread(uri);
  }

  function markRead() {
    props.onMarkRead?.([props.notification.uri]);
  }

  return (
    <article
      class="flex items-start gap-4 rounded-2xl px-4 py-4 transition-colors duration-150 hover:bg-surface-container-high"
      classList={{ "opacity-60": props.notification.isRead }}
      aria-label={`${name()} ${description()}`}>
      <ReasonIcon reason={props.notification.reason} />
      <a
        class="shrink-0 no-underline"
        href={`#${profileHref()}`}
        aria-label={`View @${props.notification.author.handle}`}
        onClick={() => markRead()}>
        <ModeratedAvatar
          avatar={props.notification.author.avatar}
          class="inline-flex h-8 w-8 shrink-0 items-center justify-center overflow-hidden rounded-full bg-surface-container-high text-xs font-semibold text-on-surface-variant"
          hidden={avatarDecision().filter || avatarDecision().blur !== "none"}
          label={avatarLabel()}
          fallbackClass="text-xs font-semibold text-on-surface-variant" />
      </a>

      <div
        class="min-w-0 flex-1 rounded-xl p-1.5 transition duration-150"
        classList={{
          "cursor-pointer hover:bg-white/2 focus-visible:bg-white/3 focus-visible:ring-1 focus-visible:ring-primary/30":
            bodyInteractive(),
        }}
        role={bodyInteractive() ? "button" : undefined}
        tabIndex={bodyInteractive() ? 0 : undefined}
        onClick={() => openBodyTarget()}
        onKeyDown={(event) => {
          if ((event.key === "Enter" || event.key === " ") && bodyInteractive()) {
            event.preventDefault();
            openBodyTarget();
          }
        }}>
        <p class="m-0 text-sm leading-relaxed text-on-surface">
          <a
            class="font-semibold text-on-surface no-underline transition hover:text-primary"
            href={`#${profileHref()}`}
            onClick={(event) => {
              event.stopPropagation();
              markRead();
            }}>
            {name()}
          </a>{" "}
          <NotificationDescription
            description={description()}
            onOpenOriginalPost={() => markRead()}
            originalPostHref={originalPostHref()}
            reason={props.notification.reason} />
        </p>

        <ModerationBadgeRow decision={profileDecision()} labels={profileLabels()} class="mt-1" />

        <ModerationBadgeRow decision={contentDecision()} labels={contentLabels()} class="mt-1" />

        <Show when={detail()}>
          {(value) => (
            <ModeratedBlurOverlay decision={contentDecision()} labels={contentLabels()} class="mt-1">
              <p class="m-0 line-clamp-2 text-sm text-on-secondary-container">{value()}</p>
            </ModeratedBlurOverlay>
          )}
        </Show>

        <p class="mt-2 text-xs text-on-surface-variant">{time()}</p>
      </div>

      <Show when={!props.notification.isRead}>
        <span class="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-primary" aria-label="Unread" role="status" />
      </Show>
    </article>
  );
}

function NotificationDescription(
  props: {
    description: string;
    onOpenOriginalPost: () => void;
    originalPostHref: string | null;
    reason: NotificationReason;
  },
) {
  const postHref = createMemo(() => props.originalPostHref);
  const shouldLinkToOriginal = createMemo(() => (props.reason === "reply" || props.reason === "quote") && !!postHref());

  return (
    <Show when={shouldLinkToOriginal()} fallback={<span class="text-on-surface-variant">{props.description}</span>}>
      <span class="text-on-surface-variant">
        <span>{props.reason === "reply" ? "replied to " : "quoted "}</span>
        <a
          class="font-medium text-on-surface no-underline transition hover:text-primary hover:underline"
          href={`#${postHref()}`}
          onClick={(event) => {
            event.stopPropagation();
            props.onOpenOriginalPost();
          }}>
          your post
        </a>
      </span>
    </Show>
  );
}

function followDetail(notification: NotificationView) {
  if (notification.reason !== "follow") {
    return null;
  }

  return `@${notification.author.handle}`;
}

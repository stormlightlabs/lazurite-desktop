import { ModeratedAvatar } from "$/components/moderation/ModeratedAvatar";
import { useModerationDecision } from "$/components/moderation/useModerationDecision";
import { useAppSession } from "$/contexts/app-session";
import { listNotifications, updateSeen } from "$/lib/api/notifications";
import { NOTIFICATIONS_UNREAD_COUNT_EVENT } from "$/lib/constants/events";
import { buildThreadOverlayRoute, formatRelativeTime, getAvatarLabel, getDisplayName } from "$/lib/feeds";
import { collectModerationLabels } from "$/lib/moderation";
import { buildProfileRoute, getProfileRouteActor } from "$/lib/profile";
import type { ListNotificationsResponse, NotificationReason, NotificationView, ProfileViewBasic } from "$/lib/types";
import { normalizeError } from "$/lib/utils/text";
import { listen } from "@tauri-apps/api/event";
import * as logger from "@tauri-apps/plugin-log";
import { createMemo, createSignal, For, Match, onCleanup, onMount, type ParentProps, Show, Switch } from "solid-js";
import { Motion, Presence } from "solid-motionone";
import { Icon } from "../shared/Icon";
import { notificationReasonCopy, notificationReasonIcon } from "./notification-copy";
import {
  buildAllNotificationsFeed,
  groupActivityNotifications,
  type GroupedNotificationFeedItem,
  isMentionNotification,
  type NotificationFeedItem,
  type SingleNotificationFeedItem,
  splitByReadState,
  toSingleFeedItems,
} from "./notification-grouping";
import { NotificationItem } from "./NotificationItem";

type Tab = "all" | "mentions" | "activity";

function getCurrentRouteFromHash() {
  const rawHash = globalThis.location.hash.replace(/^#/, "");
  const hashRoute = rawHash.length > 0 ? rawHash : "/notifications";
  const [pathname, ...searchTokens] = hashRoute.split("?");
  const search = searchTokens.length > 0 ? `?${searchTokens.join("?")}` : "";

  return { pathname: pathname || "/notifications", search };
}

function buildThreadHrefFromHash(uri: string | null) {
  const { pathname, search } = getCurrentRouteFromHash();
  return buildThreadOverlayRoute(pathname, search, uri);
}

function hasUnreadNotifications(items: NotificationView[]) {
  return items.some((notification) => !notification.isRead);
}

function groupedSummary(item: GroupedNotificationFeedItem) {
  const [first, second] = item.actors;
  const action = notificationReasonCopy(item.reason);

  if (!first) {
    return `${item.count} accounts ${action}`;
  }

  const firstName = getDisplayName(first);
  if (!second) {
    return `${firstName} ${action}`;
  }

  const secondName = getDisplayName(second);
  if (item.actorCount === 2) {
    return `${firstName} and ${secondName} ${action}`;
  }

  const others = item.actorCount - 2;
  const label = others === 1 ? "other" : "others";
  return `${firstName}, ${secondName}, and ${others} ${label} ${action}`;
}

export function NotificationsPanel() {
  const session = useAppSession();
  const [tab, setTab] = createSignal<Tab>("all");
  const [notifications, setNotifications] = createSignal<NotificationView[]>([]);
  const [loading, setLoading] = createSignal(true);
  const [error, setError] = createSignal<string | null>(null);
  let loadRequestId = 0;
  let markSeenPending = false;

  const mentionsRaw = createMemo(() => notifications().filter((notification) => isMentionNotification(notification)));
  const activityRaw = createMemo(() => notifications().filter((notification) => !isMentionNotification(notification)));
  const mentionsFeed = createMemo(() => toSingleFeedItems(mentionsRaw()));
  const activityGrouped = createMemo(() => groupActivityNotifications(activityRaw()));
  const allMixed = createMemo(() => buildAllNotificationsFeed(mentionsRaw(), activityGrouped()));
  const unreadAll = createMemo(() => notifications().filter((notification) => !notification.isRead).length);
  const unreadMentions = createMemo(() => mentionsRaw().filter((notification) => !notification.isRead).length);
  const unreadActivity = createMemo(() => activityRaw().filter((notification) => !notification.isRead).length);

  async function markSeen() {
    if (!hasUnreadNotifications(notifications()) || markSeenPending) {
      return;
    }

    markSeenPending = true;

    try {
      await updateSeen();
      setNotifications((previous) => previous.map((notification) => ({ ...notification, isRead: true })));
      session.markNotificationsSeen();
    } catch (err) {
      const errorMessage = normalizeError(err);
      logger.warn("failed to mark notifications as seen", { keyValues: { error: errorMessage } });
    } finally {
      markSeenPending = false;
    }
  }

  async function load() {
    const requestId = ++loadRequestId;
    setLoading(true);
    setError(null);

    try {
      const response: ListNotificationsResponse = await listNotifications();
      if (requestId !== loadRequestId) {
        return;
      }

      setNotifications(response.notifications);
    } catch (err) {
      if (requestId === loadRequestId) {
        setError(normalizeError(err));
      }
    } finally {
      if (requestId === loadRequestId) {
        setLoading(false);
      }
    }
  }

  function reloadNotifications() {
    void load();
  }

  function markReadByUris(uris: string[]) {
    if (uris.length === 0) {
      return;
    }

    const urisToRead = new Set(uris);
    const previous = notifications();
    let changed = false;
    const next = previous.map((notification) => {
      if (notification.isRead || !urisToRead.has(notification.uri)) {
        return notification;
      }

      changed = true;
      return { ...notification, isRead: true };
    });

    if (!changed) {
      return;
    }

    setNotifications(next);
    if (next.every((notification) => notification.isRead)) {
      session.markNotificationsSeen();
    }
  }

  function openThread(uri: string) {
    globalThis.location.hash = buildThreadHrefFromHash(uri);
  }

  onMount(() => {
    reloadNotifications();

    let unlisten: (() => void) | undefined;
    void listen<number>(NOTIFICATIONS_UNREAD_COUNT_EVENT, reloadNotifications).then((dispose) => {
      unlisten = dispose;
    });

    onCleanup(() => unlisten?.());
  });

  return (
    <article class="grid min-h-0 grid-rows-[auto_1fr] overflow-hidden rounded-4xl bg-surface-container shadow-[inset_0_0_0_1px_rgba(255,255,255,0.035)]">
      <NotificationsHeader
        activeTab={tab()}
        unreadActivity={unreadActivity()}
        unreadAll={unreadAll()}
        unreadMentions={unreadMentions()}
        onMarkSeen={() => void markSeen()}
        onSelectTab={setTab} />
      <NotificationsViewport
        activity={activityGrouped()}
        all={allMixed()}
        buildThreadHref={buildThreadHrefFromHash}
        error={error()}
        loading={loading()}
        mentions={mentionsFeed()}
        onMarkRead={markReadByUris}
        onOpenThread={openThread}
        tab={tab()} />
    </article>
  );
}

function NotificationsHeader(
  props: {
    activeTab: Tab;
    unreadActivity: number;
    unreadAll: number;
    unreadMentions: number;
    onMarkSeen: () => void;
    onSelectTab: (tab: Tab) => void;
  },
) {
  return (
    <header class="grid gap-5 px-6 pb-4 pt-6">
      <div class="flex items-center justify-between gap-4">
        <div class="grid gap-1">
          <p class="overline-copy text-xs text-on-surface-variant">Inbox</p>
          <h1 class="m-0 text-xl font-semibold tracking-tight text-on-surface">Notifications</h1>
        </div>
        <button
          type="button"
          class="inline-flex h-10 items-center gap-2 rounded-full border-0 bg-surface-container-high px-4 text-sm font-medium text-on-surface-variant transition duration-150 hover:-translate-y-px hover:text-on-surface"
          onClick={() => props.onMarkSeen()}
          title="Mark all as read">
          <Icon kind="complete" aria-hidden="true" />
          Mark all read
        </button>
      </div>

      <nav class="flex flex-wrap gap-2" aria-label="Notification tabs">
        <TabButton
          active={props.activeTab === "all"}
          badge={props.unreadAll}
          label="All"
          onClick={() => props.onSelectTab("all")} />
        <TabButton
          active={props.activeTab === "mentions"}
          badge={props.unreadMentions}
          label="Mentions"
          onClick={() => props.onSelectTab("mentions")} />
        <TabButton
          active={props.activeTab === "activity"}
          badge={props.unreadActivity}
          label="Activity"
          onClick={() => props.onSelectTab("activity")} />
      </nav>
    </header>
  );
}

function NotificationsViewport(
  props: {
    activity: NotificationFeedItem[];
    all: NotificationFeedItem[];
    buildThreadHref: (uri: string | null) => string;
    error: string | null;
    loading: boolean;
    mentions: SingleNotificationFeedItem[];
    onMarkRead: (uris: string[]) => void;
    onOpenThread: (uri: string) => void;
    tab: Tab;
  },
) {
  return (
    <div class="min-h-0 overflow-y-auto px-3 pb-3">
      <Show when={props.loading} fallback={<NotificationsState error={props.error} loading={false} />}>
        <div class="grid gap-2 py-1">
          <For each={Array.from({ length: 5 })}>{() => <NotificationSkeleton />}</For>
        </div>
      </Show>

      <Show when={!props.loading && !props.error}>
        <Presence>
          <Show when={props.tab === "all"} keyed>
            <NotificationList
              ariaLabel="All notifications"
              buildThreadHref={props.buildThreadHref}
              emptyLabel="No notifications yet"
              items={props.all}
              onMarkRead={props.onMarkRead}
              onOpenThread={props.onOpenThread} />
          </Show>
          <Show when={props.tab === "mentions"} keyed>
            <NotificationList
              ariaLabel="Mentions"
              buildThreadHref={props.buildThreadHref}
              emptyLabel="No mentions yet"
              items={props.mentions}
              onMarkRead={props.onMarkRead}
              onOpenThread={props.onOpenThread} />
          </Show>
          <Show when={props.tab === "activity"} keyed>
            <NotificationList
              ariaLabel="Activity"
              buildThreadHref={props.buildThreadHref}
              emptyLabel="No activity yet"
              items={props.activity}
              onMarkRead={props.onMarkRead}
              onOpenThread={props.onOpenThread} />
          </Show>
        </Presence>
      </Show>
    </div>
  );
}

function NotificationsState(props: { error: string | null; loading: boolean }) {
  return (
    <Show when={!props.loading && props.error}>
      {(message) => <div class="grid place-items-center px-6 py-16 text-sm text-on-surface-variant">{message()}</div>}
    </Show>
  );
}

function NotificationList(
  props: {
    ariaLabel: string;
    buildThreadHref: (uri: string | null) => string;
    emptyLabel: string;
    items: NotificationFeedItem[];
    onMarkRead: (uris: string[]) => void;
    onOpenThread: (uri: string) => void;
  },
) {
  const sections = createMemo(() => splitByReadState(props.items));

  return (
    <Motion.div
      class="grid gap-2"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.15 }}>
      <Show when={props.items.length > 0} fallback={<EmptyState label={props.emptyLabel} />}>
        <div class="grid gap-4">
          <Show when={sections().newer.length > 0}>
            <NotificationSection
              ariaLabel={`${props.ariaLabel} new`}
              buildThreadHref={props.buildThreadHref}
              items={sections().newer}
              label="New"
              onMarkRead={props.onMarkRead}
              onOpenThread={props.onOpenThread} />
          </Show>
          <Show when={sections().earlier.length > 0}>
            <NotificationSection
              ariaLabel={`${props.ariaLabel} earlier`}
              buildThreadHref={props.buildThreadHref}
              items={sections().earlier}
              label="Earlier"
              onMarkRead={props.onMarkRead}
              onOpenThread={props.onOpenThread} />
          </Show>
        </div>
      </Show>
    </Motion.div>
  );
}

function NotificationSection(
  props: {
    ariaLabel: string;
    buildThreadHref: (uri: string | null) => string;
    items: NotificationFeedItem[];
    label: string;
    onMarkRead: (uris: string[]) => void;
    onOpenThread: (uri: string) => void;
  },
) {
  return (
    <section class="grid gap-2">
      <h2 class="m-0 px-1 text-xs font-medium uppercase tracking-[0.14em] text-on-surface-variant">{props.label}</h2>
      <div role="list" aria-label={props.ariaLabel} class="grid gap-2">
        <For each={props.items}>
          {(item, index) => (
            <Motion.div
              initial={{ opacity: 0, y: -6 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.2, delay: Math.min(index() * 0.03, 0.18) }}
              role="listitem">
              <NotificationFeedRow
                buildThreadHref={props.buildThreadHref}
                item={item}
                onMarkRead={props.onMarkRead}
                onOpenThread={props.onOpenThread} />
            </Motion.div>
          )}
        </For>
      </div>
    </section>
  );
}

function NotificationFeedRow(
  props: {
    buildThreadHref: (uri: string | null) => string;
    item: NotificationFeedItem;
    onMarkRead: (uris: string[]) => void;
    onOpenThread: (uri: string) => void;
  },
) {
  return (
    <Switch>
      <Match when={props.item.kind === "single"}>
        <NotificationItem
          buildThreadHref={props.buildThreadHref}
          notification={(props.item as SingleNotificationFeedItem).notification}
          onMarkRead={props.onMarkRead}
          onOpenThread={props.onOpenThread} />
      </Match>
      <Match when={props.item.kind === "group"}>
        <GroupedNotificationItem
          item={props.item as GroupedNotificationFeedItem}
          onMarkRead={props.onMarkRead}
          onOpenThread={props.onOpenThread} />
      </Match>
    </Switch>
  );
}

function GroupedReasonIcon(props: { reason: NotificationReason }) {
  const icon = createMemo(() => notificationReasonIcon(props.reason));

  return (
    <div class="flex w-8 shrink-0 justify-center pt-0.5">
      <Icon kind={icon().kind} class={icon().className} aria-hidden="true" />
    </div>
  );
}

function GroupedAuthorAvatar(props: { actor: ProfileViewBasic; onClick: () => void }) {
  const label = createMemo(() => getAvatarLabel(props.actor));
  const profileHref = createMemo(() => buildProfileRoute(getProfileRouteActor(props.actor)));
  const labels = () => collectModerationLabels(props.actor);
  const decision = useModerationDecision(labels);

  return (
    <a
      class="block no-underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/60 focus-visible:ring-offset-2 focus-visible:ring-offset-surface-container"
      href={`#${profileHref()}`}
      aria-label={`View @${props.actor.handle}`}
      onClick={(event) => {
        event.stopPropagation();
        props.onClick();
      }}>
      <ModeratedAvatar
        avatar={props.actor.avatar}
        class="inline-flex h-8 w-8 shrink-0 items-center justify-center overflow-hidden rounded-full bg-surface-container-high text-xs font-semibold text-on-surface-variant shadow-[0_0_0_2px_var(--surface-container)]"
        hidden={decision().filter || decision().blur !== "none"}
        label={label()}
        fallbackClass="text-xs font-semibold text-on-surface-variant" />
    </a>
  );
}

function GroupedNotificationItem(
  props: {
    item: GroupedNotificationFeedItem;
    onMarkRead: (uris: string[]) => void;
    onOpenThread: (uri: string) => void;
  },
) {
  const time = createMemo(() => formatRelativeTime(props.item.latestIndexedAt));
  const summary = createMemo(() => groupedSummary(props.item));
  const actors = createMemo(() => props.item.actors.slice(0, 3));
  const bodyTargetUri = createMemo(() => props.item.reasonSubject ?? null);
  const bodyInteractive = createMemo(() => !!bodyTargetUri());
  const memberUris = createMemo(() => props.item.notifications.map((notification) => notification.uri));

  function openBodyTarget() {
    const uri = bodyTargetUri();
    if (!uri) {
      return;
    }

    props.onMarkRead(memberUris());
    props.onOpenThread(uri);
  }

  return (
    <article
      class="flex items-start gap-4 rounded-2xl px-4 py-4 transition-colors duration-150 hover:bg-surface-container-high"
      classList={{ "opacity-60": !props.item.isUnread }}
      aria-label={summary()}>
      <GroupedReasonIcon reason={props.item.reason} />

      <InteractiveBodyRegion active={bodyInteractive()} onActivate={openBodyTarget}>
        <div class="mb-1 flex items-center gap-2">
          <div class="flex -space-x-2">
            <For each={actors()}>
              {(actor) => <GroupedAuthorAvatar actor={actor} onClick={() => props.onMarkRead(memberUris())} />}
            </For>
          </div>
        </div>

        <p class="m-0 text-sm leading-relaxed text-on-surface">{summary()}</p>

        <Show when={props.item.sampleRecordText}>
          {(value) => <p class="mt-1 line-clamp-2 text-sm text-on-secondary-container">{value()}</p>}
        </Show>

        <p class="mt-2 text-xs text-on-surface-variant">{time()}</p>
      </InteractiveBodyRegion>

      <Show when={props.item.isUnread}>
        <span class="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-primary" aria-label="Unread" role="status" />
      </Show>
    </article>
  );
}

function InteractiveBodyRegion(props: ParentProps<{ active: boolean; onActivate: () => void }>) {
  return (
    <div
      class="min-w-0 flex-1 rounded-xl p-1.5 transition duration-150"
      classList={{
        "cursor-pointer hover:bg-white/2 focus-visible:bg-white/3 focus-visible:ring-1 focus-visible:ring-primary/30":
          props.active,
      }}
      role={props.active ? "button" : undefined}
      tabIndex={props.active ? 0 : undefined}
      onClick={() => props.onActivate()}
      onKeyDown={(event) => {
        if ((event.key === "Enter" || event.key === " ") && props.active) {
          event.preventDefault();
          props.onActivate();
        }
      }}>
      {props.children}
    </div>
  );
}

function TabButton(props: { active: boolean; badge: number; label: string; onClick: () => void }) {
  return (
    <button
      type="button"
      aria-pressed={props.active}
      class="inline-flex items-center gap-2 rounded-full border-0 px-4 py-2.5 text-sm font-medium transition duration-150"
      classList={{
        "bg-surface text-primary shadow-[inset_0_0_0_1px_rgba(125,175,255,0.18)]": props.active,
        "bg-transparent text-on-surface-variant hover:bg-surface-container-high hover:text-on-surface": !props.active,
      }}
      onClick={() => props.onClick()}>
      {props.label}
      <Show when={props.badge > 0}>
        <span class="min-w-5 rounded-full bg-white/10 px-1.5 py-0.5 text-center text-[0.7rem] leading-none">
          <Show when={props.badge > 99} fallback={props.badge}>{"99+"}</Show>
        </span>
      </Show>
    </button>
  );
}

function EmptyState(props: { label: string }) {
  return (
    <div class="grid place-items-center rounded-3xl bg-surface px-6 py-16 text-center text-sm text-on-surface-variant">
      {props.label}
    </div>
  );
}

function NotificationSkeleton() {
  return (
    <div class="flex animate-pulse items-start gap-4 rounded-2xl bg-surface px-4 py-4" aria-hidden="true">
      <div class="mt-1 h-5 w-5 shrink-0 rounded-full bg-white/5" />
      <div class="h-8 w-8 shrink-0 rounded-full bg-white/5" />
      <div class="min-w-0 flex-1 space-y-2">
        <div class="h-4 w-48 rounded-full bg-white/5" />
        <div class="h-3 w-36 rounded-full bg-white/5" />
      </div>
    </div>
  );
}

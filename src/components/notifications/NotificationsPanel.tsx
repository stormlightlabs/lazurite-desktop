import { useAppSession } from "$/contexts/app-session";
import { listNotifications, updateSeen } from "$/lib/api/notifications";
import { NOTIFICATIONS_UNREAD_COUNT_EVENT } from "$/lib/constants/events";
import type { ListNotificationsResponse, NotificationView } from "$/lib/types";
import { normalizeError } from "$/lib/utils/text";
import { listen } from "@tauri-apps/api/event";
import * as logger from "@tauri-apps/plugin-log";
import { createMemo, createSignal, For, onCleanup, onMount, Show } from "solid-js";
import { Motion, Presence } from "solid-motionone";
import { Icon } from "../shared/Icon";
import { NotificationItem } from "./NotificationItem";

type Tab = "mentions" | "activity";

const MENTION_REASONS = new Set(["mention", "reply", "quote"]);

function hasUnreadNotifications(items: NotificationView[]) {
  return items.some((notification) => !notification.isRead);
}

export function NotificationsPanel() {
  const session = useAppSession();
  // TODO: NotificationsStore via createStore
  const [tab, setTab] = createSignal<Tab>("mentions");
  const [notifications, setNotifications] = createSignal<NotificationView[]>([]);
  const [loading, setLoading] = createSignal(true);
  const [error, setError] = createSignal<string | null>(null);
  let loadRequestId = 0;
  let markSeenPending = false;

  const mentions = createMemo(() => notifications().filter((n) => MENTION_REASONS.has(n.reason)));
  const activity = createMemo(() => notifications().filter((n) => !MENTION_REASONS.has(n.reason)));
  const unreadMentions = createMemo(() => mentions().filter((n) => !n.isRead).length);
  const unreadActivity = createMemo(() => activity().filter((n) => !n.isRead).length);

  async function markSeen(options?: { notifications?: NotificationView[]; silent?: boolean }) {
    const items = options?.notifications ?? notifications();
    if (!hasUnreadNotifications(items) || markSeenPending) {
      return;
    }

    markSeenPending = true;

    try {
      await updateSeen();
      setNotifications((prev) => prev.map((notification) => ({ ...notification, isRead: true })));
      session.markNotificationsSeen();
    } catch (err) {
      const error = normalizeError(err);
      if (!options?.silent) {
        logger.warn("failed to mark notifications as seen", { keyValues: { error } });
      }
    } finally {
      markSeenPending = false;
    }
  }

  async function load(options?: { markSeen?: boolean }) {
    const requestId = ++loadRequestId;
    setLoading(true);
    setError(null);

    try {
      const response: ListNotificationsResponse = await listNotifications();
      if (requestId !== loadRequestId) {
        return;
      }

      setNotifications(response.notifications);

      if (options?.markSeen) {
        await markSeen({ notifications: response.notifications, silent: true });
      }
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
    void load({ markSeen: true });
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
        unreadMentions={unreadMentions()}
        onMarkSeen={() => void markSeen()}
        onSelectTab={setTab} />
      <NotificationsViewport
        activity={activity()}
        error={error()}
        loading={loading()}
        mentions={mentions()}
        tab={tab()} />
    </article>
  );
}

function NotificationsHeader(
  props: {
    activeTab: Tab;
    unreadActivity: number;
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
    activity: NotificationView[];
    error: string | null;
    loading: boolean;
    mentions: NotificationView[];
    tab: Tab;
  },
) {
  const activeItems = createMemo(() => (props.tab === "mentions" ? props.mentions : props.activity));
  const emptyLabel = createMemo(() => (props.tab === "mentions" ? "No mentions yet" : "No activity yet"));
  const ariaLabel = createMemo(() => (props.tab === "mentions" ? "Mentions" : "Activity"));

  return (
    <div class="min-h-0 overflow-y-auto px-3 pb-3">
      <Show when={props.loading} fallback={<NotificationsState error={props.error} loading={false} />}>
        <div class="grid gap-2 py-1">
          <For each={Array.from({ length: 5 })}>{() => <NotificationSkeleton />}</For>
        </div>
      </Show>

      <Show when={!props.loading && !props.error}>
        <Presence>
          <Show when={props.tab === "mentions"} keyed>
            <NotificationList ariaLabel={ariaLabel()} emptyLabel={emptyLabel()} items={activeItems()} />
          </Show>
          <Show when={props.tab === "activity"} keyed>
            <NotificationList ariaLabel={ariaLabel()} emptyLabel={emptyLabel()} items={activeItems()} />
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

function NotificationList(props: { ariaLabel: string; emptyLabel: string; items: NotificationView[] }) {
  return (
    <Motion.div
      class="grid gap-2"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.15 }}>
      <Show when={props.items.length > 0} fallback={<EmptyState label={props.emptyLabel} />}>
        <div role="list" aria-label={props.ariaLabel} class="grid gap-2">
          <For each={props.items}>
            {(notification, index) => (
              <Motion.div
                initial={{ opacity: 0, y: -6 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.2, delay: Math.min(index() * 0.03, 0.18) }}
                role="listitem">
                <NotificationItem notification={notification} />
              </Motion.div>
            )}
          </For>
        </div>
      </Show>
    </Motion.div>
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

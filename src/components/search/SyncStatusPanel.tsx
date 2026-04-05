import { Icon } from "$/components/shared/Icon";
import { getSyncStatus, reindexEmbeddings, syncPosts, type SyncStatus } from "$/lib/api/search";
import { formatRelativeTime } from "$/lib/feeds";
import * as logger from "@tauri-apps/plugin-log";
import { createMemo, createSignal, For, onCleanup, onMount, Show } from "solid-js";
import { Motion, Presence } from "solid-motionone";
import { PostCount } from "../shared/PostCount";

function SourceStatusRow(
  props: { count: number; cursor?: string | null; isActive: boolean; source: "like" | "bookmark" },
) {
  const label = createMemo(() => (props.source === "like" ? "Liked posts" : "Bookmarked posts"));

  return (
    <div class="grid gap-1.5">
      <div class="flex items-center justify-between gap-3 text-xs text-on-surface-variant">
        <span>{label()}</span>
        <span>{props.count} synced</span>
      </div>

      <div class="h-1.5 overflow-hidden rounded-full bg-white/8">
        <div
          class="h-full rounded-full bg-linear-to-r from-primary to-primary-dim transition-opacity"
          classList={{ "animate-pulse": props.isActive }}
          style={{ width: props.count > 0 ? "100%" : "0%" }} />
      </div>

      <Show when={props.cursor}>
        <p class="m-0 text-[0.68rem] text-on-surface-variant/70">Resume cursor saved for interrupted sync recovery.</p>
      </Show>
    </div>
  );
}

function ReindexButton(props: { isSyncing: boolean; isReindexing: boolean; onReindex: () => void }) {
  return (
    <button
      type="button"
      onClick={() => void props.onReindex()}
      disabled={props.isSyncing || props.isReindexing}
      class="inline-flex items-center gap-2 rounded-xl border-0 bg-white/6 px-3 py-2 text-xs font-medium text-on-surface-variant transition hover:bg-white/10 hover:text-on-surface disabled:cursor-not-allowed disabled:opacity-50">
      <Show when={props.isReindexing} fallback={<Icon kind="refresh" />}>
        <Icon iconClass="i-ri-loader-4-line animate-spin" />
      </Show>
      <Show when={props.isReindexing} fallback="Reindex">Reindexing...</Show>
    </button>
  );
}

function SyncButton(props: { isSyncing: boolean; isReindexing: boolean; onSync: () => void }) {
  return (
    <button
      type="button"
      onClick={() => void props.onSync()}
      disabled={props.isSyncing || props.isReindexing}
      class="inline-flex items-center gap-2 rounded-xl border-0 bg-white/6 px-3 py-2 text-xs font-medium text-on-surface-variant transition hover:bg-white/10 hover:text-on-surface disabled:cursor-not-allowed disabled:opacity-50">
      <Show when={props.isSyncing} fallback={<Icon kind="refresh" />}>
        <Icon iconClass="i-ri-loader-4-line animate-spin" />
      </Show>
      <Show when={props.isSyncing} fallback="Sync now">Syncing...</Show>
    </button>
  );
}

function SyncHeader(
  props: {
    hasAnyPosts: boolean;
    icon: "db";
    lastSync: string | null;
    totalPosts: number;
    tone: { className: string; label: string };
  },
) {
  return (
    <div class="flex items-center justify-between gap-3">
      <div class="grid gap-1">
        <div class="flex items-center gap-2">
          <p class="m-0 text-sm font-medium text-on-surface">Sync Status</p>
          <span class={`rounded-full px-2.5 py-1 text-[0.68rem] font-medium uppercase tracking-[0.12em] ${props.tone.className}`}>
            {props.tone.label}
          </span>
        </div>

        <Show
          when={props.hasAnyPosts}
          fallback={
            <p class="m-0 text-xs text-on-surface-variant">
              Local search stays empty until likes or bookmarks are indexed.
            </p>
          }>
          <PostCount totalPosts={props.totalPosts} lastSync={props.lastSync} />
        </Show>
      </div>

      <span class="grid h-10 w-10 place-items-center rounded-2xl bg-primary/10 text-primary">
        <Icon kind={props.icon} class="text-lg" />
      </span>
    </div>
  );
}

function SyncActions(props: {
  hasAnyPosts: boolean;
  isReindexing: boolean;
  isSyncing: boolean;
  onReindex: () => void;
  onSync: () => void;
}) {
  return (
    <div class="flex flex-wrap items-center gap-2">
      <Show when={props.hasAnyPosts}>
        <ReindexButton isSyncing={props.isSyncing} isReindexing={props.isReindexing} onReindex={props.onReindex} />
      </Show>

      <SyncButton isSyncing={props.isSyncing} isReindexing={props.isReindexing} onSync={props.onSync} />
    </div>
  );
}

type SyncStatusPanelProps = { did: string; onStatusChange?: (status: SyncStatus[]) => void };

export function SyncStatusPanel(props: SyncStatusPanelProps) {
  const [syncStatus, setSyncStatus] = createSignal<SyncStatus[]>([]);
  const [isSyncing, setIsSyncing] = createSignal(false);
  const [isReindexing, setIsReindexing] = createSignal(false);

  async function loadSyncStatus() {
    try {
      const status = await getSyncStatus(props.did);
      setSyncStatus(status);
      props.onStatusChange?.(status);
    } catch (error) {
      logger.error("failed to load sync status", { keyValues: { error: String(error) } });
    }
  }

  async function handleSync() {
    setIsSyncing(true);
    try {
      await syncPosts(props.did, "like");
      await syncPosts(props.did, "bookmark");
      await loadSyncStatus();
    } catch (error) {
      logger.error("sync failed", { keyValues: { error: String(error) } });
    } finally {
      setIsSyncing(false);
    }
  }

  async function handleReindex() {
    setIsReindexing(true);
    try {
      const count = await reindexEmbeddings();
      logger.info("reindex complete", { keyValues: { count: String(count) } });
      await loadSyncStatus();
    } catch (error) {
      logger.error("reindex failed", { keyValues: { error: String(error) } });
    } finally {
      setIsReindexing(false);
    }
  }

  onMount(() => {
    void loadSyncStatus();

    const interval = setInterval(() => {
      void loadSyncStatus();
    }, 60_000);

    onCleanup(() => clearInterval(interval));
  });

  const totalPosts = createMemo(() => syncStatus().reduce((sum, status) => sum + (status.postCount ?? 0), 0));
  const hasAnyPosts = createMemo(() => totalPosts() > 0);
  const lastSync = createMemo(() => {
    const timestamps = syncStatus().map((status) => status.lastSyncedAt).filter(Boolean) as string[];
    if (timestamps.length === 0) {
      return null;
    }

    const latest = timestamps.toSorted((left, right) => right.localeCompare(left))[0];
    return formatRelativeTime(latest);
  });
  const statusTone = createMemo(() => {
    if (isSyncing() || isReindexing()) {
      return { className: "bg-primary/15 text-primary", label: isReindexing() ? "Reindexing" : "Syncing" };
    }

    if (hasAnyPosts()) {
      return { className: "bg-emerald-400/15 text-emerald-300", label: "Ready" };
    }

    return { className: "bg-white/8 text-on-surface-variant", label: "Empty" };
  });

  return (
    <section class="panel-surface grid gap-4 p-5">
      <div class="grid gap-3">
        <SyncHeader
          hasAnyPosts={hasAnyPosts()}
          icon="db"
          lastSync={lastSync()}
          totalPosts={totalPosts()}
          tone={statusTone()} />
        <SyncActions
          hasAnyPosts={hasAnyPosts()}
          isReindexing={isReindexing()}
          isSyncing={isSyncing()}
          onReindex={handleReindex}
          onSync={handleSync} />
      </div>

      <Presence>
        <Show when={isSyncing() || isReindexing()}>
          <Motion.div
            data-testid="sync-activity-bar"
            class="h-1.5 overflow-hidden rounded-full bg-white/8"
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "0.375rem" }}
            exit={{ opacity: 0, height: 0 }}
            transition={{ duration: 0.2 }}>
            <Motion.div
              class="h-full w-2/3 rounded-full bg-linear-to-r from-primary to-primary-dim"
              animate={{ x: ["-40%", "120%"] }}
              transition={{ duration: isReindexing() ? 1.8 : 1.1, repeat: Infinity, easing: "linear" }} />
          </Motion.div>
        </Show>
      </Presence>

      <div class="grid gap-3 rounded-3xl bg-black/20 p-4 shadow-[inset_0_0_0_1px_rgba(255,255,255,0.035)]">
        <For each={syncStatus()}>
          {(status) => (
            <SourceStatusRow
              count={status.postCount ?? 0}
              isActive={isSyncing()}
              source={status.source}
              cursor={status.cursor} />
          )}
        </For>
      </div>
    </section>
  );
}

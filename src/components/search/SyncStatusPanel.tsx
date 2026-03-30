import { getSyncStatus, syncPosts, type SyncStatus } from "$/lib/api/search";
import * as logger from "@tauri-apps/plugin-log";
import { createSignal, onMount, Show } from "solid-js";
import { Motion } from "solid-motionone";

type SyncStatusPanelProps = { did: string };

export function SyncStatusPanel(props: SyncStatusPanelProps) {
  const [syncStatus, setSyncStatus] = createSignal<SyncStatus[]>([]);
  const [isSyncing, setIsSyncing] = createSignal(false);

  async function loadSyncStatus() {
    try {
      const status = await getSyncStatus(props.did);
      setSyncStatus(status);
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

  onMount(() => {
    void loadSyncStatus();

    const interval = setInterval(() => {
      void loadSyncStatus();
    }, 60_000);

    return () => clearInterval(interval);
  });

  const totalPosts = () => syncStatus().reduce((sum, s) => sum + (s.post_count ?? 0), 0);

  const lastSyncTime = () => {
    const times = syncStatus().map((s) => s.last_synced_at).filter(Boolean) as string[];
    if (times.length === 0) return null;
    const latest = times.toSorted().toReversed()[0];
    return formatRelativeTime(latest);
  };

  return (
    <Motion.div
      class="border-b border-white/5 px-6 py-3"
      initial={{ opacity: 0, height: 0 }}
      animate={{ opacity: 1, height: "auto" }}
      exit={{ opacity: 0, height: 0 }}
      transition={{ duration: 0.2 }}>
      <div class="flex items-center justify-between">
        <StatusInfo isSyncing={isSyncing()} totalPosts={totalPosts()} lastSync={lastSyncTime()} />
        <SyncButton isSyncing={isSyncing()} onSync={handleSync} />
      </div>
    </Motion.div>
  );
}

function StatusInfo(props: { isSyncing: boolean; totalPosts: number; lastSync: string | null }) {
  return (
    <div class="flex items-center gap-3">
      <div class="flex items-center gap-2">
        <StatusIndicator isSyncing={props.isSyncing} />
        <span class="text-sm font-medium text-on-surface">{props.isSyncing ? "Syncing..." : "Active"}</span>
      </div>

      <Show when={props.totalPosts > 0}>
        <span class="text-xs text-on-surface-variant">
          <span class="font-medium text-primary">{props.totalPosts}</span> posts indexed
        </span>
      </Show>

      <Show when={props.lastSync}>
        {(time) => <span class="text-xs text-on-surface-variant">· Last sync: {time()}</span>}
      </Show>
    </div>
  );
}

function StatusIndicator(props: { isSyncing: boolean }) {
  return (
    <Show when={props.isSyncing} fallback={<span class="flex h-2 w-2 rounded-full bg-green-500" />}>
      <span class="flex h-2 w-2 animate-pulse rounded-full bg-primary" />
    </Show>
  );
}

function SyncButton(props: { isSyncing: boolean; onSync: () => void }) {
  return (
    <button
      type="button"
      onClick={() => props.onSync()}
      disabled={props.isSyncing}
      class="inline-flex items-center gap-2 rounded-lg border-0 bg-white/5 px-3 py-1.5 text-xs font-medium text-on-surface-variant transition hover:bg-white/10 hover:text-on-surface disabled:cursor-not-allowed disabled:opacity-50">
      <span class="flex items-center">
        <i classList={{ "i-ri-refresh-line": !props.isSyncing, "i-ri-loader-4-line animate-spin": props.isSyncing }} />
      </span>
      <Show when={props.isSyncing} fallback={"Sync now"}>Syncing...</Show>
    </button>
  );
}

function formatRelativeTime(value: string) {
  const timestamp = new Date(value).getTime();
  if (Number.isNaN(timestamp)) {
    return "";
  }

  const deltaSeconds = Math.round((timestamp - Date.now()) / 1000);
  const formatter = new Intl.RelativeTimeFormat(undefined, { numeric: "auto" });
  const ranges = [
    ["year", 60 * 60 * 24 * 365],
    ["month", 60 * 60 * 24 * 30],
    ["day", 60 * 60 * 24],
    ["hour", 60 * 60],
    ["minute", 60],
  ] as const;

  for (const [unit, seconds] of ranges) {
    if (Math.abs(deltaSeconds) >= seconds) {
      return formatter.format(Math.round(deltaSeconds / seconds), unit);
    }
  }

  return formatter.format(deltaSeconds, "second");
}

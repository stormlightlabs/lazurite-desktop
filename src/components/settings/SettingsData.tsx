import { SettingsController } from "$/lib/api/settings";
import { formatBytes, normalizeError } from "$/lib/utils/text";
import { createSignal } from "solid-js";
import { SettingsCard } from "./SettingsCard";
import { SettingsInlineFeedback, useTransientFeedback } from "./SettingsInlineFeedback";

type CacheScope = "feeds" | "embeddings" | "fts" | "all";

type PendingAction = CacheScope | "json" | "csv" | null;

type SettingsDataProps = {
  cacheSize: { feedsBytes: number; embeddingsBytes: number; ftsBytes: number; totalBytes?: number } | null;
  handleClearCache: (scope: CacheScope) => Promise<void>;
  openConfirmation: (
    options: {
      title: string;
      message: string;
      confirmText?: string;
      type?: "default" | "danger";
      onConfirm: () => void;
    },
  ) => void;
};

type PendingCheck = (action: Exclude<PendingAction, null>) => boolean;

export function SettingsData(props: SettingsDataProps) {
  const [pendingAction, setPendingAction] = createSignal<PendingAction>(null);
  const { feedback, dismissFeedback, queueFeedback } = useTransientFeedback();
  const pending = (action: Exclude<PendingAction, null>) => pendingAction() === action;
  const busy = () => pendingAction() !== null;

  async function runClearCache(scope: CacheScope) {
    if (busy()) {
      return;
    }

    setPendingAction(scope);
    dismissFeedback();
    try {
      await props.handleClearCache(scope);
      queueFeedback({ kind: "success", message: toClearSuccessMessage(scope) });
    } catch (error) {
      queueFeedback({ kind: "error", message: toClearErrorMessage(error) });
    } finally {
      setPendingAction(null);
    }
  }

  async function runExport(format: "json" | "csv") {
    if (busy()) {
      return;
    }

    setPendingAction(format);
    dismissFeedback();
    try {
      await SettingsController.exportData(format);
      queueFeedback({ kind: "success", message: toExportSuccessMessage(format) });
    } catch (error) {
      queueFeedback({ kind: "error", message: toExportErrorMessage(error) });
    } finally {
      setPendingAction(null);
    }
  }

  return (
    <SettingsCard icon="db" title="Data">
      <div class="grid gap-4">
        <CacheSizeGrid cacheSize={props.cacheSize} />
        <CacheActions
          busy={busy()}
          pending={pending}
          openConfirmation={props.openConfirmation}
          onClear={runClearCache} />
        <ExportActions busy={busy()} pending={pending} onExport={runExport} />
        <SettingsInlineFeedback feedback={feedback()} />
      </div>
    </SettingsCard>
  );
}

function CacheSizeGrid(props: { cacheSize: SettingsDataProps["cacheSize"] }) {
  return (
    <div class="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
      <CacheTile label="Feeds cache" value={formatBytes(props.cacheSize?.feedsBytes ?? 0)} />
      <CacheTile label="Embeddings" value={formatBytes(props.cacheSize?.embeddingsBytes ?? 0)} />
      <CacheTile label="Search index" value={formatBytes(props.cacheSize?.ftsBytes ?? 0)} />
      <CacheTile label="Total local data" value={formatBytes(props.cacheSize?.totalBytes ?? 0)} />
    </div>
  );
}

function CacheTile(props: { label: string; value: string }) {
  return (
    <div class="rounded-xl bg-black/30 p-4 text-center">
      <p class="text-lg font-medium text-on-surface">{props.value}</p>
      <p class="text-xs text-on-surface-variant">{props.label}</p>
    </div>
  );
}

function CacheActions(
  props: {
    busy: boolean;
    pending: PendingCheck;
    onClear: (scope: CacheScope) => Promise<void>;
    openConfirmation: SettingsDataProps["openConfirmation"];
  },
) {
  return (
    <div class="flex gap-4">
      <button
        type="button"
        disabled={props.busy}
        onClick={() => void props.onClear("feeds")}
        class="flex-1 rounded-lg border border-white/20 px-4 py-2 text-sm font-medium text-on-surface transition hover:bg-white/5 disabled:cursor-wait disabled:opacity-60">
        {props.pending("feeds") ? "Clearing..." : "Clear feeds"}
      </button>
      <button
        type="button"
        disabled={props.busy}
        onClick={() => void props.onClear("embeddings")}
        class="flex-1 rounded-lg border border-white/20 px-4 py-2 text-sm font-medium text-on-surface transition hover:bg-white/5 disabled:cursor-wait disabled:opacity-60">
        {props.pending("embeddings") ? "Clearing..." : "Clear embeddings"}
      </button>
      <button
        type="button"
        disabled={props.busy}
        onClick={() => void props.onClear("fts")}
        class="flex-1 rounded-lg border border-white/20 px-4 py-2 text-sm font-medium text-on-surface transition hover:bg-white/5 disabled:cursor-wait disabled:opacity-60">
        {props.pending("fts") ? "Clearing..." : "Clear search index"}
      </button>
      <button
        type="button"
        disabled={props.busy}
        onClick={() =>
          props.openConfirmation({
            title: "Clear All Cache",
            message:
              "This will delete all cached data including feeds, embeddings, and search index. This action cannot be undone.",
            type: "danger",
            onConfirm: () => void props.onClear("all"),
          })}
        class="flex-1 rounded-lg border border-red-500/30 bg-red-500/10 px-4 py-2 text-sm font-medium text-red-400 transition hover:bg-red-500/20 disabled:cursor-wait disabled:opacity-60">
        {props.pending("all") ? "Clearing..." : "Clear all"}
      </button>
    </div>
  );
}

function ExportActions(
  props: { busy: boolean; pending: PendingCheck; onExport: (format: "json" | "csv") => Promise<void> },
) {
  return (
    <div class="border-t border-white/10 pt-4">
      <div class="flex items-center justify-between">
        <ExportDescription />
        <div class="flex gap-2">
          <button
            type="button"
            disabled={props.busy}
            onClick={() => void props.onExport("json")}
            class="rounded-lg border border-white/20 px-4 py-2 text-sm font-medium text-on-surface transition hover:bg-white/5 disabled:cursor-wait disabled:opacity-60">
            {props.pending("json") ? "Exporting..." : "JSON"}
          </button>
          <button
            type="button"
            disabled={props.busy}
            onClick={() => void props.onExport("csv")}
            class="rounded-lg border border-white/20 px-4 py-2 text-sm font-medium text-on-surface transition hover:bg-white/5 disabled:cursor-wait disabled:opacity-60">
            {props.pending("csv") ? "Exporting..." : "CSV"}
          </button>
        </div>
      </div>
    </div>
  );
}

function ExportDescription() {
  return (
    <div>
      <p class="text-sm font-medium text-on-surface">Export your data</p>
      <p class="text-xs text-on-surface-variant">Download all your data as JSON or CSV</p>
    </div>
  );
}

function toClearSuccessMessage(scope: CacheScope) {
  switch (scope) {
    case "feeds": {
      return "Cleared feeds cache.";
    }
    case "embeddings": {
      return "Cleared embeddings cache.";
    }
    case "fts": {
      return "Cleared search index cache.";
    }
    case "all": {
      return "Cleared all local cache.";
    }
    default: {
      return "Cleared cache.";
    }
  }
}

function toClearErrorMessage(error: unknown) {
  const message = normalizeError(error);
  if (/cache|clear/iu.test(message)) {
    return "Couldn't clear cache right now.";
  }

  return "Couldn't update local data right now.";
}

function toExportSuccessMessage(format: "json" | "csv") {
  return format === "json" ? "Exported data as JSON." : "Exported data as CSV.";
}

function toExportErrorMessage(error: unknown) {
  const message = normalizeError(error);
  if (/export|path|file|save|directory/iu.test(message)) {
    return "Couldn't export data — check that the destination path is valid.";
  }

  return "Couldn't export data right now.";
}

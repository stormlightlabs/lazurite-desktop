import { exportData } from "$/lib/api/settings";
import { formatBytes } from "$/lib/utils/text";
import { SettingsCard } from "./SettingsCard";

type SettingsDataProps = {
  cacheSize: { feedsBytes: number; embeddingsBytes: number; ftsBytes: number; totalBytes?: number } | null;
  handleClearCache: (scope: "feeds" | "embeddings" | "fts" | "all") => Promise<void>;
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
export function SettingsData(props: SettingsDataProps) {
  const cacheSize = () => props.cacheSize;

  return (
    <SettingsCard icon="db" title="Data">
      <div class="grid gap-4">
        <div class="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <div class="rounded-xl bg-black/30 p-4 text-center">
            <p class="text-lg font-medium text-on-surface">{formatBytes(cacheSize()?.feedsBytes ?? 0)}</p>
            <p class="text-xs text-on-surface-variant">Feeds cache</p>
          </div>
          <div class="rounded-xl bg-black/30 p-4 text-center">
            <p class="text-lg font-medium text-on-surface">{formatBytes(cacheSize()?.embeddingsBytes ?? 0)}</p>
            <p class="text-xs text-on-surface-variant">Embeddings</p>
          </div>
          <div class="rounded-xl bg-black/30 p-4 text-center">
            <p class="text-lg font-medium text-on-surface">{formatBytes(cacheSize()?.ftsBytes ?? 0)}</p>
            <p class="text-xs text-on-surface-variant">Search index</p>
          </div>
          <div class="rounded-xl bg-black/30 p-4 text-center">
            <p class="text-lg font-medium text-on-surface">{formatBytes(cacheSize()?.totalBytes ?? 0)}</p>
            <p class="text-xs text-on-surface-variant">Total local data</p>
          </div>
        </div>
        <div class="flex gap-4">
          <button
            type="button"
            onClick={() => void props.handleClearCache("feeds")}
            class="flex-1 rounded-lg border border-white/20 px-4 py-2 text-sm font-medium text-on-surface transition hover:bg-white/5">
            Clear feeds
          </button>
          <button
            type="button"
            onClick={() => void props.handleClearCache("embeddings")}
            class="flex-1 rounded-lg border border-white/20 px-4 py-2 text-sm font-medium text-on-surface transition hover:bg-white/5">
            Clear embeddings
          </button>
          <button
            type="button"
            onClick={() => void props.handleClearCache("fts")}
            class="flex-1 rounded-lg border border-white/20 px-4 py-2 text-sm font-medium text-on-surface transition hover:bg-white/5">
            Clear search index
          </button>
          <button
            type="button"
            onClick={() =>
              props.openConfirmation({
                title: "Clear All Cache",
                message:
                  "This will delete all cached data including feeds, embeddings, and search index. This action cannot be undone.",
                type: "danger",
                onConfirm: () => void props.handleClearCache("all"),
              })}
            class="flex-1 rounded-lg border border-red-500/30 bg-red-500/10 px-4 py-2 text-sm font-medium text-red-400 transition hover:bg-red-500/20">
            Clear all
          </button>
        </div>
        <ExportControl />
      </div>
    </SettingsCard>
  );
}

function ExportControl() {
  return (
    <div class="border-t border-white/10 pt-4">
      <div class="flex items-center justify-between">
        <div>
          <p class="text-sm font-medium text-on-surface">Export your data</p>
          <p class="text-xs text-on-surface-variant">Download all your data as JSON or CSV</p>
        </div>
        <div class="flex gap-2">
          <button
            type="button"
            onClick={() => void exportData("json")}
            class="rounded-lg border border-white/20 px-4 py-2 text-sm font-medium text-on-surface transition hover:bg-white/5">
            JSON
          </button>
          <button
            type="button"
            onClick={() => void exportData("csv")}
            class="rounded-lg border border-white/20 px-4 py-2 text-sm font-medium text-on-surface transition hover:bg-white/5">
            CSV
          </button>
        </div>
      </div>
    </div>
  );
}

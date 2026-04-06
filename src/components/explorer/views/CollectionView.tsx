import { LexiconIcon } from "$/components/explorer/LexiconIcon";
import { ArrowIcon } from "$/components/shared/Icon";
import { For, Show } from "solid-js";

interface CollectionViewProps {
  did: string;
  collection: string;
  lexiconIcon: string | null;
  records: Array<Record<string, unknown>>;
  cursor: string | null;
  loadingMore: boolean;
  onRecordClick: (rkey: string) => void;
  onLoadMore: () => void;
}

function extractRkey(uri: string): string {
  const parts = uri.split("/");
  return parts.at(-1) ?? uri;
}

function formatRecordPreview(record: Record<string, unknown>): string {
  if (record.text && typeof record.text === "string") {
    return record.text.slice(0, 100) + (record.text.length > 100 ? "..." : "");
  }
  const keys = Object.keys(record).filter(k => !k.startsWith("$"));
  return keys.slice(0, 3).join(", ") + (keys.length > 3 ? "..." : "");
}

export function CollectionView(props: CollectionViewProps) {
  const collectionName = () => {
    const parts = props.collection.split(".");
    return parts.at(-1) ?? props.collection;
  };

  return (
    <div class="grid gap-6">
      <section class="rounded-2xl border border-white/5 p-6">
        <div class="flex items-center gap-3 mb-4">
          <LexiconIcon class="h-12 w-12" src={props.lexiconIcon} title={props.collection} />
          <div>
            <h1 class="text-lg font-medium">{collectionName()}</h1>
            <p class="text-xs font-mono text-on-surface-variant">{props.collection}</p>
          </div>
        </div>

        <div class="p-3 rounded-xl bg-white/5">
          <p class="text-xs uppercase tracking-wider mb-1 text-on-surface-variant">Total Records</p>
          <p class="text-sm">{props.records.length}</p>
        </div>
      </section>

      <section class="rounded-2xl border border-white/5 overflow-hidden">
        <div class="px-6 py-4 border-b border-white/5 bg-white/5">
          <h2 class="text-lg font-medium">Records</h2>
        </div>

        <div class="divide-y divide-white/5">
          <For each={props.records}>
            {(record) => {
              const uri = (record.uri as string) || "";
              const rkey = extractRkey(uri);
              const cid = (record.cid as string) || "";

              return (
                <button
                  onClick={() => props.onRecordClick(rkey)}
                  class="w-full p-4 text-left hover:bg-white/5 transition-colors">
                  <div class="flex items-start justify-between gap-4">
                    <div class="flex-1 min-w-0">
                      <p class="text-sm font-mono text-primary truncate">{rkey}</p>
                      <p class="text-xs text-on-surface-variant mt-1 truncate">CID: {cid.slice(0, 24)}...</p>
                      <p class="text-xs text-on-surface-variant mt-2">
                        {formatRecordPreview((record.value as Record<string, unknown>) || {})}
                      </p>
                    </div>
                    <ArrowIcon direction="right" class="text-on-surface-variant shrink-0" />
                  </div>
                </button>
              );
            }}
          </For>
        </div>

        <Show when={props.cursor}>
          <div class="px-6 py-4 border-t border-white/5 bg-white/5">
            <button
              onClick={() => props.onLoadMore()}
              disabled={props.loadingMore}
              class="text-sm text-primary hover:underline disabled:cursor-not-allowed disabled:no-underline disabled:opacity-60">
              {props.loadingMore ? "Loading more..." : "Load more..."}
            </button>
          </div>
        </Show>
      </section>
    </div>
  );
}

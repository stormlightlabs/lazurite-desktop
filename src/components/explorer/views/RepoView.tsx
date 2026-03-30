import { ArrowIcon, Icon } from "$/components/shared/Icon";
import { For } from "solid-js";

type RepoViewProps = {
  did: string;
  handle: string;
  pdsUrl: string | null;
  collections: Array<{ nsid: string }>;
  onCollectionClick: (collection: string) => void;
  onPdsClick: () => void;
};

export function RepoView(props: RepoViewProps) {
  return (
    <div class="grid gap-6">
      <section class="rounded-2xl border border-white/5 p-6">
        <div class="flex items-center gap-3 mb-4">
          <div class="w-12 h-12 rounded-xl flex items-center justify-center bg-primary/15">
            <Icon kind="user" class="text-primary text-xl" />
          </div>
          <div>
            <h1 class="text-lg font-medium">{props.handle}</h1>
            <p class="text-xs font-mono text-on-surface-variant">{props.did}</p>
          </div>
        </div>

        <div class="grid grid-cols-2 gap-4">
          <div class="p-3 rounded-xl bg-white/5">
            <p class="text-xs uppercase tracking-wider mb-1 text-on-surface-variant">DID</p>
            <p class="text-xs font-mono truncate">{props.did}</p>
          </div>
          <button
            onClick={() => props.onPdsClick()}
            class="p-3 rounded-xl bg-white/5 text-left hover:bg-white/8 transition-colors">
            <p class="text-xs uppercase tracking-wider mb-1 text-on-surface-variant">PDS</p>
            <p class="text-xs font-mono truncate text-primary">{props.pdsUrl || "Unknown"}</p>
          </button>
        </div>
      </section>

      <section class="rounded-2xl border border-white/5 overflow-hidden">
        <div class="px-6 py-4 border-b border-white/5 bg-white/5">
          <h2 class="text-lg font-medium">Collections</h2>
        </div>

        <div class="divide-y divide-white/5">
          <For each={props.collections}>
            {(collection) => (
              <button
                onClick={() => props.onCollectionClick(collection.nsid)}
                class="w-full flex items-center justify-between p-4 text-left hover:bg-white/5 transition-colors">
                <div class="flex items-center gap-3">
                  <Icon kind="folder" class="text-on-surface-variant" />
                  <span class="text-sm">{collection.nsid}</span>
                </div>
                <ArrowIcon direction="right" class="text-on-surface-variant" />
              </button>
            )}
          </For>
        </div>
      </section>
    </div>
  );
}

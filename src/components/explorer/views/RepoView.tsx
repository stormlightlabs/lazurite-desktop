import { ArrowIcon, Icon } from "$/components/shared/Icon";
import { For, Show } from "solid-js";

type RepoViewProps = {
  collections: Array<{ nsid: string }>;
  did: string;
  handle: string;
  onCollectionClick: (collection: string) => void;
  onPdsClick: () => void;
  pdsUrl: string | null;
  socialSummary?: { followerCount: number | null; followingCount: number | null } | null;
};

function formatCount(value: number | null | undefined) {
  return value === null || value === undefined ? "Unavailable" : value.toLocaleString();
}

export function RepoView(props: RepoViewProps) {
  return (
    <div class="grid gap-6">
      <section class="rounded-2xl border border-white/5 p-6">
        <div class="mb-4 flex items-center gap-3">
          <div class="flex h-12 w-12 items-center justify-center rounded-xl bg-primary/15">
            <Icon kind="user" class="text-primary text-xl" />
          </div>
          <div>
            <h1 class="text-lg font-medium">{props.handle}</h1>
            <p class="text-xs font-mono text-on-surface-variant">{props.did}</p>
          </div>
        </div>

        <div class="grid gap-4 md:grid-cols-2">
          <div class="rounded-xl bg-white/5 p-3">
            <p class="mb-1 text-xs uppercase tracking-wider text-on-surface-variant">DID</p>
            <p class="text-xs font-mono truncate">{props.did}</p>
          </div>
          <button
            onClick={() => props.onPdsClick()}
            class="rounded-xl bg-white/5 p-3 text-left transition-colors hover:bg-white/8">
            <p class="mb-1 text-xs uppercase tracking-wider text-on-surface-variant">PDS</p>
            <p class="text-xs font-mono truncate text-primary">{props.pdsUrl || "Unknown"}</p>
          </button>
        </div>

        <Show when={props.socialSummary}>
          {(summary) => (
            <div class="mt-4 grid gap-3 sm:grid-cols-2">
              <div class="rounded-2xl bg-white/4 p-4">
                <p class="mb-1 text-xs uppercase tracking-[0.14em] text-on-surface-variant">Followers</p>
                <p class="text-2xl font-medium text-on-surface">{formatCount(summary().followerCount)}</p>
                <p class="mt-2 text-xs leading-relaxed text-on-surface-variant">
                  Public relationship context for this repository.
                </p>
              </div>
              <div class="rounded-2xl bg-white/4 p-4">
                <p class="mb-1 text-xs uppercase tracking-[0.14em] text-on-surface-variant">Following</p>
                <p class="text-2xl font-medium text-on-surface">{formatCount(summary().followingCount)}</p>
                <p class="mt-2 text-xs leading-relaxed text-on-surface-variant">
                  Summary only. Block counts stay inside diagnostics.
                </p>
              </div>
            </div>
          )}
        </Show>
      </section>

      <section class="overflow-hidden rounded-2xl border border-white/5">
        <div class="border-b border-white/5 bg-white/5 px-6 py-4">
          <h2 class="text-lg font-medium">Collections</h2>
        </div>

        <div class="divide-y divide-white/5">
          <For each={props.collections}>
            {(collection) => (
              <button
                onClick={() => props.onCollectionClick(collection.nsid)}
                class="flex w-full items-center justify-between p-4 text-left transition-colors hover:bg-white/5">
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

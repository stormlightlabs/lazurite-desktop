import { Icon } from "$/components/shared/Icon";
import { Match, Show, Switch } from "solid-js";

type SearchEmptyStateProps = { reason: "error" | "initial" | "no-results" | "no-sync"; scope?: "local" | "network" };

export function SearchEmptyState(props: SearchEmptyStateProps) {
  return (
    <div class="text-center">
      <EmptyStateIcon reason={props.reason} />
      <EmptyStateContent reason={props.reason} scope={props.scope ?? "local"} />
    </div>
  );
}

function EmptyStateIcon(props: { reason: string }) {
  return (
    <div class="mb-4 inline-flex h-16 w-16 items-center justify-center rounded-full bg-white/5 shadow-[inset_0_0_0_1px_rgba(255,255,255,0.04)]">
      <Show
        when={props.reason === "no-sync"}
        fallback={<Icon kind="search" class="text-3xl text-on-surface-variant" />}>
        <Icon kind="db" class="text-3xl text-on-surface-variant" />
      </Show>
    </div>
  );
}

function EmptyStateContent(props: { reason: string; scope: "local" | "network" }) {
  return (
    <Switch>
      <Match when={props.reason === "initial"}>
        <InitialContent scope={props.scope} />
      </Match>

      <Match when={props.reason === "no-results"}>
        <NoResultsContent scope={props.scope} />
      </Match>

      <Match when={props.reason === "no-sync"}>
        <NoSyncContent />
      </Match>

      <Match when={props.reason === "error"}>
        <ErrorContent scope={props.scope} />
      </Match>
    </Switch>
  );
}

function InitialContent(props: { scope: "local" | "network" }) {
  return (
    <>
      <Switch>
        <Match when={props.scope === "network"}>
          <h3 class="mb-1 text-base font-medium text-on-surface">Search public posts across the network</h3>
          <p class="m-0 text-sm text-on-surface-variant">
            Type a query above to search Bluesky directly without relying on your local index.
          </p>
        </Match>
        <Match when={props.scope === "local"}>
          <h3 class="mb-1 text-base font-medium text-on-surface">Search your saved & liked posts</h3>
          <p class="m-0 text-sm text-on-surface-variant">
            Type a query above to search through the posts you liked or bookmarked.
          </p>
        </Match>
      </Switch>
      <KeyboardShortcuts />
    </>
  );
}

function KeyboardShortcuts() {
  return (
    <div class="my-4 space-y-2 flex items-center justify-center flex-col text-xs text-on-surface-variant/60">
      <div class="flex items-center gap-2">
        <kbd class="rounded bg-white/10 px-1.5 py-0.5">/</kbd>
        Focus search from anywhere
      </div>
      <div class="flex items-center gap-2">
        <kbd class="rounded bg-white/10 px-1.5 py-0.5">Tab</kbd>
        Cycle search modes
      </div>
    </div>
  );
}

function NoResultsContent(props: { scope: "local" | "network" }) {
  return (
    <>
      <h3 class="mb-1 text-base font-medium text-on-surface">No results found</h3>
      <Switch>
        <Match when={props.scope === "network"}>
          <p class="m-0 text-sm text-on-surface-variant">
            Try a broader query or switch to local search if you want to search your synced posts instead.
          </p>
        </Match>
        <Match when={props.scope === "local"}>
          <p class="m-0 text-sm text-on-surface-variant">
            Try adjusting your search terms or switch to a different search mode.
          </p>
        </Match>
      </Switch>
    </>
  );
}

function NoSyncContent() {
  return (
    <>
      <h3 class="mb-1 text-base font-medium text-on-surface">No posts synced yet</h3>
      <p class="m-0 text-sm text-on-surface-variant">
        Sync your liked and bookmarked posts to build the local index for keyword and semantic search.
      </p>
    </>
  );
}

function ErrorContent(props: { scope: "local" | "network" }) {
  return (
    <>
      <h3 class="mb-1 text-base font-medium text-on-surface">Search failed</h3>
      <Switch>
        <Match when={props.scope === "network"}>
          <p class="m-0 text-sm text-on-surface-variant">
            The network request did not complete. Retry the query or switch to local search while the network recovers.
          </p>
        </Match>
        <Match when={props.scope === "local"}>
          <p class="m-0 text-sm text-on-surface-variant">
            The local index request did not complete. Retry the query or sync again if your index is stale.
          </p>
        </Match>
      </Switch>
    </>
  );
}

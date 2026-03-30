import { Match, Show, Switch } from "solid-js";
import { Icon } from "../shared/Icon";

type SearchEmptyStateProps = { reason: "initial" | "no-results" | "no-sync" };

export function SearchEmptyState(props: SearchEmptyStateProps) {
  return (
    <div class="text-center">
      <EmptyStateIcon reason={props.reason} />
      <EmptyStateContent reason={props.reason} />
    </div>
  );
}

function EmptyStateIcon(props: { reason: string }) {
  return (
    <div class="mb-4 inline-flex h-16 w-16 items-center justify-center rounded-2xl bg-white/5">
      <Show
        when={props.reason === "no-sync"}
        fallback={<Icon kind="search" class="text-3xl text-on-surface-variant" />}>
        <Icon kind="db" class="text-3xl text-on-surface-variant" />
      </Show>
    </div>
  );
}

function EmptyStateContent(props: { reason: string }) {
  return (
    <Switch>
      <Match when={props.reason === "initial"}>
        <InitialContent />
      </Match>

      <Match when={props.reason === "no-results"}>
        <NoResultsContent />
      </Match>

      <Match when={props.reason === "no-sync"}>
        <NoSyncContent />
      </Match>
    </Switch>
  );
}

function InitialContent() {
  return (
    <>
      <h3 class="mb-1 text-base font-medium text-on-surface">Search your saved posts</h3>
      <p class="m-0 text-sm text-on-surface-variant">
        Type a query above to search through your liked and bookmarked posts.
      </p>
      <KeyboardShortcuts />
    </>
  );
}

function KeyboardShortcuts() {
  return (
    <div class="mt-4 space-y-1 text-xs text-on-surface-variant/60">
      <p>
        <kbd class="rounded bg-white/10 px-1.5 py-0.5">/</kbd> Focus search from anywhere
      </p>
      <p>
        <kbd class="rounded bg-white/10 px-1.5 py-0.5">Tab</kbd> Cycle search modes
      </p>
    </div>
  );
}

function NoResultsContent() {
  return (
    <>
      <h3 class="mb-1 text-base font-medium text-on-surface">No results found</h3>
      <p class="m-0 text-sm text-on-surface-variant">
        Try adjusting your search terms or switch to a different search mode.
      </p>
    </>
  );
}

function NoSyncContent() {
  return (
    <>
      <h3 class="mb-1 text-base font-medium text-on-surface">No posts synced yet</h3>
      <p class="m-0 text-sm text-on-surface-variant">Sync your liked and bookmarked posts to enable local search.</p>
    </>
  );
}

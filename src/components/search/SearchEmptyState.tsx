import { Icon } from "$/components/shared/Icon";
import { Match, Show, Switch } from "solid-js";

type SearchEmptyStateScope = "local" | "network" | "profiles";

type SearchEmptyStateProps = { reason: "error" | "initial" | "no-results" | "no-sync"; scope?: SearchEmptyStateScope };

export function SearchEmptyState(props: SearchEmptyStateProps) {
  return (
    <div class="text-center">
      <EmptyStateVisual reason={props.reason} />
      <EmptyStateContent reason={props.reason} scope={props.scope ?? "local"} />
    </div>
  );
}

function EmptyStateVisual(props: { reason: string }) {
  return (
    <Show when={props.reason === "no-sync"} fallback={<EmptyStateIcon />}>
      <NoSyncIllustration />
    </Show>
  );
}

function EmptyStateIcon() {
  return (
    <div class="mb-4 inline-flex h-16 w-16 items-center justify-center rounded-full bg-white/5 shadow-[inset_0_0_0_1px_rgba(255,255,255,0.04)]">
      <Icon kind="search" class="text-3xl text-on-surface-variant" />
    </div>
  );
}

function NoSyncIllustration() {
  return (
    <div
      data-testid="no-sync-illustration"
      class="relative mx-auto mb-6 h-40 w-full max-w-xs overflow-hidden rounded-[2rem] bg-white/[0.025] shadow-[inset_0_0_0_1px_rgba(255,255,255,0.04)]">
      <div class="absolute inset-x-6 top-5 h-16 rounded-[1.25rem] bg-primary/10 blur-2xl" />
      <div class="absolute left-5 top-7 w-26 rounded-[1.4rem] bg-surface-container p-3 shadow-[inset_0_0_0_1px_rgba(255,255,255,0.04)]">
        <div class="mb-2 flex items-center gap-2">
          <span class="flex h-8 w-8 items-center justify-center rounded-xl bg-primary/14 text-primary">
            <Icon kind="bookmark" class="text-base" />
          </span>
          <span class="h-2.5 w-12 rounded-full bg-white/8" />
        </div>
        <div class="grid gap-1.5">
          <span class="h-2 rounded-full bg-white/7" />
          <span class="h-2 w-4/5 rounded-full bg-white/5" />
        </div>
      </div>

      <div class="absolute right-5 top-10 w-28 rounded-[1.4rem] bg-surface-container-high p-3 shadow-[inset_0_0_0_1px_rgba(255,255,255,0.05)]">
        <div class="mb-3 flex items-center justify-between">
          <span class="flex h-8 w-8 items-center justify-center rounded-xl bg-white/8 text-on-surface-variant">
            <Icon kind="db" class="text-base" />
          </span>
          <span class="rounded-full bg-white/8 px-2 py-0.5 text-[0.62rem] uppercase tracking-[0.12em] text-on-surface-variant">
            local
          </span>
        </div>
        <div class="grid gap-1.5">
          <span class="h-2 rounded-full bg-white/7" />
          <span class="h-2 w-3/4 rounded-full bg-primary/18" />
          <span class="h-2 w-2/3 rounded-full bg-white/5" />
        </div>
      </div>

      <div class="absolute bottom-4 left-1/2 flex -translate-x-1/2 items-center gap-2 rounded-full bg-black/35 px-3 py-1.5 text-[0.68rem] text-on-surface-variant shadow-[inset_0_0_0_1px_rgba(255,255,255,0.05)]">
        <Icon kind="refresh" class="text-primary" />
        <span>Run a sync to fill local search</span>
      </div>
    </div>
  );
}

function EmptyStateContent(props: { reason: string; scope: SearchEmptyStateScope }) {
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

function InitialContent(props: { scope: SearchEmptyStateScope }) {
  return (
    <>
      <Switch>
        <Match when={props.scope === "profiles"}>
          <h3 class="mb-1 text-base font-medium text-on-surface">Search people across Bluesky</h3>
          <p class="m-0 text-sm text-on-surface-variant">
            Type a handle or display name above to find profiles and jump directly into their profile view.
          </p>
        </Match>
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
      <div class="flex items-center gap-2">
        <kbd class="rounded bg-white/10 px-1.5 py-0.5">↑↓</kbd>
        Navigate profile suggestions
      </div>
    </div>
  );
}

function NoResultsContent(props: { scope: SearchEmptyStateScope }) {
  return (
    <>
      <h3 class="mb-1 text-base font-medium text-on-surface">
        {props.scope === "profiles" ? "No profiles found" : "No results found"}
      </h3>
      <Switch>
        <Match when={props.scope === "profiles"}>
          <p class="m-0 text-sm text-on-surface-variant">
            Try a broader handle fragment, a display name, or select one of the suggested profiles as you type.
          </p>
        </Match>
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
        Sync your liked and bookmarked posts to build the local index for keyword search now, then optionally unlock
        semantic search later.
      </p>
    </>
  );
}

function ErrorContent(props: { scope: SearchEmptyStateScope }) {
  return (
    <>
      <h3 class="mb-1 text-base font-medium text-on-surface">
        {props.scope === "profiles" ? "Profile search failed" : "Search failed"}
      </h3>
      <Switch>
        <Match when={props.scope === "profiles"}>
          <p class="m-0 text-sm text-on-surface-variant">
            The profile lookup did not complete. Retry the query or open a suggested profile if it appears.
          </p>
        </Match>
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

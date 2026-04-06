import { PostCard } from "$/components/feeds/PostCard";
import { useThreadOverlayNavigation } from "$/components/posts/useThreadOverlayNavigation";
import { Icon } from "$/components/shared/Icon";
import { type NetworkSearchResult, searchPostsNetwork } from "$/lib/api/search";
import {
  buildHashtagQuery,
  buildPostSearchRoute,
  decodeHashtagRouteTag,
  formatHashtagLabel,
  parsePostSearchFilters,
  type PostSearchFilters,
  toLocalDayStartIso,
  toLocalDayUntilIso,
} from "$/lib/search-routes";
import { normalizeError } from "$/lib/utils/text";
import { useLocation, useNavigate, useParams } from "@solidjs/router";
import * as logger from "@tauri-apps/plugin-log";
import { createEffect, createMemo, For, Match, Show, Switch } from "solid-js";
import { createStore } from "solid-js/store";
import { Motion, Presence } from "solid-motionone";
import { PostSearchFiltersRow } from "./PostSearchFilters";
import { SearchEmptyState } from "./SearchEmptyState";
import type { EmptyStateReason } from "./types";

type HashtagPanelState = {
  error: string | null;
  hasSearched: boolean;
  loading: boolean;
  results: NetworkSearchResult | null;
};

export function HashtagPanel() {
  const location = useLocation();
  const navigate = useNavigate();
  const params = useParams<{ hashtag: string }>();
  const threadOverlay = useThreadOverlayNavigation();
  const [state, setState] = createStore<HashtagPanelState>({
    error: null,
    hasSearched: false,
    loading: false,
    results: null,
  });
  let debounceTimer: ReturnType<typeof setTimeout> | undefined;

  const tag = createMemo(() => decodeHashtagRouteTag(params.hashtag));
  const filters = createMemo(() => parsePostSearchFilters(location.search));
  const hashtagLabel = createMemo(() => formatHashtagLabel(tag() ?? ""));

  function replaceRoute(next: Partial<PostSearchFilters>) {
    const currentTag = tag();
    if (!currentTag) {
      return;
    }

    void navigate(buildPostSearchRoute(location.pathname, location.search, { ...filters(), ...next }));
  }

  async function performSearch(f: PostSearchFilters, t: string) {
    try {
      const results = await searchPostsNetwork({
        author: f.author || null,
        limit: 25,
        mentions: f.mentions || null,
        query: buildHashtagQuery(t),
        since: f.since ? toLocalDayStartIso(f.since) : null,
        sort: f.sort,
        tags: f.tags,
        until: f.until ? toLocalDayUntilIso(f.until) : null,
      });
      setState({ error: null, hasSearched: true, loading: false, results });
    } catch (error) {
      const errorMessage = normalizeError(error);
      logger.error("hashtag search failed", { keyValues: { error: errorMessage, hashtag: t, sort: f.sort } });
      setState({ error: errorMessage, hasSearched: true, loading: false, results: null });
    }
  }

  createEffect(() => {
    const currentTag = tag();
    const activeFilters = filters();
    clearTimeout(debounceTimer);
    debounceTimer = setTimeout(() => {
      if (!currentTag) {
        setState({ error: "This hashtag could not be opened.", hasSearched: false, loading: false, results: null });
        return;
      }

      setState((previous) => ({ ...previous, error: null, loading: true }));
      void performSearch(activeFilters, currentTag);
    }, 300);
  });

  return (
    <section class="grid min-h-0 grid-rows-[auto_1fr] overflow-hidden rounded-4xl bg-surface-container shadow-[inset_0_0_0_1px_rgba(255,255,255,0.035)]">
      <header class="grid gap-4 px-6 pb-5 pt-6">
        <HashtagHero hashtagLabel={hashtagLabel()} />

        <PostSearchFiltersRow
          collapsible
          defaultExpanded={hasAdvancedNetworkFilters(filters())}
          filters={filters()}
          helperText="Filter this hashtag feed by date window, mentions, author, and additional tags."
          onChange={(next) => replaceRoute(next)} />
      </header>

      <div class="min-h-0 overflow-y-auto px-3 pb-3">
        <Show when={state.loading} fallback={<HashtagState {...state} onOpenThread={threadOverlay.openThread} />}>
          <div class="grid gap-2 py-1">
            <For each={Array.from({ length: 5 })}>
              {() => <div class="h-40 animate-pulse rounded-3xl bg-white/4" aria-hidden="true" />}
            </For>
          </div>
        </Show>
      </div>
    </section>
  );
}

function hasAdvancedNetworkFilters(filters: PostSearchFilters) {
  return !!(filters.author || filters.mentions || filters.since || filters.until || filters.tags.length > 0);
}

function HashtagState(props: HashtagPanelState & { onOpenThread: (uri: string) => void }) {
  return (
    <Presence>
      <Switch>
        <Match when={props.error}>
          <EmptyState reason="error" />
        </Match>
        <Match when={!props.hasSearched}>
          <EmptyState reason="initial" />
        </Match>
        <Match when={props.results?.posts.length === 0}>
          <EmptyState reason="no-results" />
        </Match>
        <Match when={props.results}>
          {(results) => (
            <Motion.div
              class="grid gap-2"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.15 }}>
              <div class="grid gap-2" role="list">
                <For each={results().posts}>
                  {(post, index) => (
                    <Motion.div
                      role="listitem"
                      initial={{ opacity: 0, y: -6 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ duration: 0.2, delay: Math.min(index() * 0.03, 0.18) }}>
                      <PostCard
                        post={post}
                        showActions={false}
                        onOpenThread={() => props.onOpenThread(post.uri)} />
                    </Motion.div>
                  )}
                </For>
              </div>
            </Motion.div>
          )}
        </Match>
      </Switch>
    </Presence>
  );
}

function EmptyState(props: { reason: EmptyStateReason }) {
  return (
    <Motion.div
      class="grid place-items-center px-6 py-16"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.15 }}>
      <SearchEmptyState reason={props.reason} scope="network" />
    </Motion.div>
  );
}

function HashtagHero(props: { hashtagLabel: string }) {
  return (
    <div class="flex flex-wrap items-center justify-between gap-4">
      <div class="grid gap-2">
        <div class="inline-flex items-center gap-2 rounded-full bg-primary/12 px-3 py-1.5 text-xs font-medium uppercase tracking-[0.12em] text-primary">
          <Icon kind="hashtag" class="text-sm" />
          <span>Hashtag</span>
        </div>
        <div class="grid gap-1">
          <h1 class="m-0 text-3xl font-semibold tracking-[-0.03em] text-on-surface">{props.hashtagLabel}</h1>
          <p class="m-0 text-sm text-on-surface-variant">
            Search Bluesky for this hashtag.
          </p>
        </div>
      </div>
    </div>
  );
}

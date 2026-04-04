import { useThreadOverlayNavigation } from "$/components/posts/useThreadOverlayNavigation";
import { Icon, SearchModeIcon } from "$/components/shared/Icon";
import { useAppPreferences } from "$/contexts/app-preferences";
import { useAppSession } from "$/contexts/app-session";
import {
  getSyncStatus,
  type LocalPostResult,
  type NetworkSearchResult,
  type SearchMode,
  searchPosts,
  searchPostsNetwork,
  type SyncStatus,
} from "$/lib/api/search";
import { formatRelativeTime } from "$/lib/feeds";
import { normalizeError } from "$/lib/utils/text";
import * as logger from "@tauri-apps/plugin-log";
import { createEffect, createMemo, createSignal, For, Match, onCleanup, onMount, Show, Switch } from "solid-js";
import { createStore } from "solid-js/store";
import { Motion, Presence } from "solid-motionone";
import { PostCount } from "../shared/PostCount";
import { EmbeddingsSettings } from "./EmbeddingsSettings";
import { LocalPostResultsList, LocalPostResultsSkeletons } from "./LocalPostResultsList";
import { SearchEmptyState } from "./SearchEmptyState";
import { SearchQueryInput } from "./SearchQueryInput";
import { SearchResultCard } from "./SearchResultCard";
import { SyncStatusPanel } from "./SyncStatusPanel";

const MODES: SearchMode[] = ["network", "keyword", "semantic", "hybrid"];

type SearchPanelState = {
  error: string | null;
  hasSearched: boolean;
  loading: boolean;
  mode: SearchMode;
  networkResults: NetworkSearchResult | null;
  query: string;
  resultCount: number;
  results: LocalPostResult[];
  syncStatus: SyncStatus[];
};

type SearchPanelProps = { embedded?: boolean; initialMode?: SearchMode; initialQuery?: string };

function ModeLabel(props: { mode: SearchMode }) {
  return (
    <span class="flex items-center gap-1.5">
      <SearchModeIcon mode={props.mode} class="text-base" />
      <Switch>
        <Match when={props.mode === "network"}>Network</Match>
        <Match when={props.mode === "keyword"}>Keyword</Match>
        <Match when={props.mode === "semantic"}>Semantic</Match>
        <Match when={props.mode === "hybrid"}>Hybrid</Match>
      </Switch>
    </span>
  );
}

export function SearchPanel(props: SearchPanelProps = {}) {
  const preferences = useAppPreferences();
  const session = useAppSession();
  const threadOverlay = useThreadOverlayNavigation();
  const [search, setSearch] = createStore<SearchPanelState>({
    error: null,
    hasSearched: false,
    loading: false,
    mode: props.initialMode ?? "network",
    networkResults: null,
    query: props.initialQuery ?? "",
    resultCount: 0,
    results: [],
    syncStatus: [],
  });

  let searchInputRef: HTMLInputElement | undefined;
  let debounceTimer: ReturnType<typeof setTimeout> | undefined;

  const isLocalMode = createMemo(() => search.mode !== "network");
  const semanticEnabled = createMemo(() => preferences.embeddingsEnabled);
  const totalIndexedPosts = createMemo(() =>
    search.syncStatus.reduce((sum, status) => sum + (status.postCount ?? 0), 0)
  );
  const hasLocalPosts = createMemo(() => totalIndexedPosts() > 0);
  const lastSync = createMemo(() => {
    const timestamps = search.syncStatus.map((status) => status.lastSyncedAt).filter(Boolean) as string[];
    if (timestamps.length === 0) {
      return null;
    }

    return formatRelativeTime(timestamps.toSorted((left, right) => right.localeCompare(left))[0]);
  });
  const cycleModes = createMemo(() => MODES.filter((candidate) => candidate !== "semantic" || semanticEnabled()));

  async function performSearch(searchQuery: string, searchMode: SearchMode) {
    if (!searchQuery.trim()) {
      clearResults();
      return;
    }

    if (searchMode === "semantic" && !semanticEnabled()) {
      setSearch({
        error: "Semantic search is disabled. Re-enable embeddings to use this mode.",
        hasSearched: true,
        networkResults: null,
        resultCount: 0,
        results: [],
      });
      return;
    }

    setSearch({ error: null, loading: true });

    try {
      if (searchMode === "network") {
        const response = await searchPostsNetwork(searchQuery, "top", 25);
        setSearch({ hasSearched: true, networkResults: response, resultCount: response.posts.length, results: [] });
      } else {
        const response = await searchPosts(searchQuery, searchMode, 50);
        setSearch({ hasSearched: true, networkResults: null, resultCount: response.length, results: response });
      }
    } catch (error) {
      const errorMessage = normalizeError(error);
      setSearch({ error: errorMessage, hasSearched: true, networkResults: null, resultCount: 0, results: [] });
      logger.error("search failed", { keyValues: { query: searchQuery, mode: searchMode, error: errorMessage } });
    } finally {
      setSearch("loading", false);
    }
  }

  function clearResults() {
    setSearch({ error: null, hasSearched: false, networkResults: null, resultCount: 0, results: [] });
  }

  function handleInput(value: string) {
    setSearch("query", value);
    clearTimeout(debounceTimer);
    debounceTimer = setTimeout(() => {
      void performSearch(value, search.mode);
    }, 300);
  }

  function handleModeChange(newMode: SearchMode) {
    if (newMode === "semantic" && !semanticEnabled()) {
      return;
    }

    setSearch("mode", newMode);
    if (search.query.trim()) {
      void performSearch(search.query, newMode);
      return;
    }

    setSearch("error", null);
  }

  function cycleMode() {
    const availableModes = cycleModes();
    const currentIndex = availableModes.indexOf(search.mode);
    const nextIndex = (currentIndex + 1) % availableModes.length;
    handleModeChange(availableModes[nextIndex] ?? availableModes[0] ?? "network");
  }

  function clearSearch() {
    setSearch("query", "");
    clearResults();
    searchInputRef?.focus();
  }

  function handleKeyDown(event: KeyboardEvent) {
    if (event.key === "Tab" && !event.shiftKey && document.activeElement === searchInputRef) {
      event.preventDefault();
      cycleMode();
      return;
    }

    if (event.key === "Escape" && search.query) {
      clearSearch();
    }
  }

  function handleGlobalKeyDown(event: KeyboardEvent) {
    if (event.key === "/" || ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "f")) {
      const target = event.target as HTMLElement;
      if (target.tagName !== "INPUT" && target.tagName !== "TEXTAREA") {
        event.preventDefault();
        searchInputRef?.focus();
      }
    }
  }

  onMount(() => {
    if (!props.embedded) {
      document.addEventListener("keydown", handleGlobalKeyDown);
    }
    if (props.embedded && session.activeDid) {
      void getSyncStatus(session.activeDid).then((status) => {
        setSearch("syncStatus", status);
      }).catch((error) => {
        logger.warn("failed to load embedded search sync status", { keyValues: { error: normalizeError(error) } });
      });
    }
    if (search.query.trim()) {
      void performSearch(search.query, search.mode);
    }

    onCleanup(() => {
      if (!props.embedded) {
        document.removeEventListener("keydown", handleGlobalKeyDown);
      }
      clearTimeout(debounceTimer);
    });
  });

  createEffect(() => {
    if (search.mode === "semantic" && !semanticEnabled()) {
      setSearch("mode", "keyword");
      if (search.query.trim()) {
        void performSearch(search.query, "keyword");
      }
    }
  });

  return (
    <div class="grid min-h-0 gap-6" classList={{ "xl:grid-cols-[minmax(0,1fr)_20rem]": !props.embedded }}>
      <section
        class="grid min-h-0 grid-rows-[auto_1fr] overflow-hidden"
        classList={{
          "rounded-4xl bg-surface-container shadow-[inset_0_0_0_1px_rgba(255,255,255,0.035)]": !props.embedded,
        }}>
        <SearchHeader
          error={search.error}
          hasSearched={search.hasSearched}
          inputRef={(element) => {
            searchInputRef = element;
          }}
          lastSync={lastSync()}
          loading={search.loading}
          mode={search.mode}
          onClear={clearSearch}
          onKeyDown={handleKeyDown}
          onModeChange={handleModeChange}
          onQueryChange={handleInput}
          query={search.query}
          resultCount={search.resultCount}
          semanticEnabled={semanticEnabled()}
          totalIndexedPosts={totalIndexedPosts()} />

        <SearchViewport
          error={search.error}
          hasLocalPosts={hasLocalPosts()}
          hasSearched={search.hasSearched}
          isLocalMode={isLocalMode()}
          loading={search.loading}
          localResults={search.results}
          networkResults={search.networkResults}
          onOpenThread={(uri) => void threadOverlay.openThread(uri)}
          query={search.query} />
      </section>

      <Show when={!props.embedded}>
        <aside class="grid content-start gap-4 overflow-y-auto">
          <Show when={session.activeDid}>
            {(did) => <SyncStatusPanel did={did()} onStatusChange={(status) => setSearch("syncStatus", status)} />}
          </Show>
          <EmbeddingsSettings />
          <SearchTipsCard />
        </aside>
      </Show>
    </div>
  );
}

function SearchHeader(
  props: {
    error: string | null;
    hasSearched: boolean;
    inputRef: (el: HTMLInputElement) => void;
    lastSync: string | null;
    loading: boolean;
    mode: SearchMode;
    onClear: () => void;
    onKeyDown: (event: KeyboardEvent) => void;
    onModeChange: (mode: SearchMode) => void;
    onQueryChange: (value: string) => void;
    query: string;
    resultCount: number;
    semanticEnabled: boolean;
    totalIndexedPosts: number;
  },
) {
  return (
    <header class="grid gap-4 px-6 pb-5 pt-6">
      <SearchQueryInput
        error={props.error}
        inputRef={props.inputRef}
        loading={props.loading}
        placeholder={props.mode === "network"
          ? "Search public posts across Bluesky..."
          : "Search your saved & liked posts..."}
        query={props.query}
        onClear={props.onClear}
        onKeyDown={props.onKeyDown}
        onQueryChange={props.onQueryChange} />

      <div class="flex items-center justify-between gap-4">
        <ModeSelector
          activeMode={props.mode}
          semanticEnabled={props.semanticEnabled}
          onModeChange={props.onModeChange} />
        <span class="text-xs text-on-surface-variant">
          <kbd class="rounded bg-white/10 px-1.5 py-0.5">Tab</kbd> to switch modes
        </span>
      </div>

      <ResultMeta
        hasSearched={props.hasSearched}
        lastSync={props.lastSync}
        mode={props.mode}
        resultCount={props.resultCount}
        totalIndexedPosts={props.totalIndexedPosts} />
    </header>
  );
}

function ResultMeta(
  props: {
    hasSearched: boolean;
    lastSync: string | null;
    mode: SearchMode;
    resultCount: number;
    totalIndexedPosts: number;
  },
) {
  return (
    <div class="flex items-center justify-between gap-4 border-t border-white/5 pt-3">
      <span class="text-sm text-on-surface-variant">
        <Show
          when={props.hasSearched}
          fallback={props.mode === "network"
            ? "Search public posts across Bluesky or switch to your synced archive."
            : "Search your liked and bookmarked posts locally, or search the network."}>
          <span>
            Found <span class="font-medium text-on-surface">{props.resultCount}</span> results
          </span>
        </Show>
      </span>

      <span class="text-xs text-on-surface-variant">
        <Show when={props.totalIndexedPosts > 0}>
          <PostCount totalPosts={props.totalIndexedPosts} lastSync={props.lastSync} inline />
        </Show>
      </span>
    </div>
  );
}

function ModeSelector(
  props: { activeMode: SearchMode; semanticEnabled: boolean; onModeChange: (mode: SearchMode) => void },
) {
  const [indicatorStyle, setIndicatorStyle] = createSignal({ left: "0px", width: "0px" });
  const [containerRef, setContainerRef] = createSignal<HTMLDivElement | undefined>();

  createEffect(() => {
    const ref = containerRef();
    if (!ref) {
      return;
    }

    const buttons = ref.querySelectorAll("button");
    const activeIndex = MODES.indexOf(props.activeMode);
    const activeButton = buttons[activeIndex];
    if (!activeButton) {
      return;
    }

    const rect = activeButton.getBoundingClientRect();
    const containerRect = ref.getBoundingClientRect();

    setIndicatorStyle({ left: `${rect.left - containerRect.left}px`, width: `${rect.width}px` });
  });

  return (
    <div ref={setContainerRef} class="relative flex flex-wrap gap-1 rounded-full bg-black/30 p-1">
      <Motion.div
        class="absolute inset-y-1 rounded-full bg-surface-container-high shadow-[inset_0_0_0_1px_rgba(125,175,255,0.18)]"
        animate={indicatorStyle()}
        transition={{ duration: 0.2, easing: [0.25, 0.1, 0.25, 1] }} />

      <For each={MODES}>
        {(searchMode) => {
          const disabled = searchMode === "semantic" && !props.semanticEnabled;
          return (
            <button
              type="button"
              aria-pressed={props.activeMode === searchMode}
              disabled={disabled}
              title={disabled ? "Enable embeddings to use semantic search." : undefined}
              class="relative z-10 inline-flex items-center gap-2 rounded-full px-4 py-2 text-sm font-medium transition-colors duration-150 disabled:cursor-not-allowed"
              classList={{
                "text-primary": props.activeMode === searchMode,
                "text-on-surface-variant hover:text-on-surface": props.activeMode !== searchMode && !disabled,
                "text-on-surface-variant/40": disabled,
              }}
              onClick={() => props.onModeChange(searchMode)}>
              <ModeLabel mode={searchMode} />
            </button>
          );
        }}
      </For>
    </div>
  );
}

function SearchViewport(
  props: {
    error: string | null;
    hasLocalPosts: boolean;
    hasSearched: boolean;
    isLocalMode: boolean;
    loading: boolean;
    localResults: LocalPostResult[];
    networkResults: NetworkSearchResult | null;
    onOpenThread: (uri: string) => void;
    query: string;
  },
) {
  return (
    <div class="min-h-0 overflow-y-auto px-3 pb-3">
      <Show when={props.loading} fallback={<SearchState {...props} />}>
        <LocalPostResultsSkeletons />
      </Show>
    </div>
  );
}

function SearchState(
  props: {
    error: string | null;
    hasLocalPosts: boolean;
    hasSearched: boolean;
    isLocalMode: boolean;
    localResults: LocalPostResult[];
    networkResults: NetworkSearchResult | null;
    onOpenThread: (uri: string) => void;
    query: string;
  },
) {
  return (
    <Presence>
      <Switch>
        <Match when={props.error && props.query}>
          <EmptyStateView reason="error" scope={props.isLocalMode ? "local" : "network"} />
        </Match>

        <Match when={props.isLocalMode && !props.hasLocalPosts}>
          <EmptyStateView reason="no-sync" scope="local" />
        </Match>

        <Match when={!props.hasSearched && !props.query}>
          <EmptyStateView reason="initial" scope={props.isLocalMode ? "local" : "network"} />
        </Match>

        <Match when={props.isLocalMode && props.localResults.length === 0}>
          <EmptyStateView reason="no-results" scope="local" />
        </Match>

        <Match when={!props.isLocalMode && props.networkResults?.posts.length === 0}>
          <EmptyStateView reason="no-results" scope="network" />
        </Match>

        <Match when={props.isLocalMode}>
          <LocalPostResultsList onOpenThread={props.onOpenThread} query={props.query} results={props.localResults} />
        </Match>

        <Match when={!props.isLocalMode && props.networkResults}>
          <NetworkResultsList onOpenThread={props.onOpenThread} query={props.query} results={props.networkResults} />
        </Match>
      </Switch>
    </Presence>
  );
}

function EmptyStateView(props: { reason: "error" | "initial" | "no-results" | "no-sync"; scope: "local" | "network" }) {
  return (
    <Motion.div
      class="grid place-items-center px-6 py-16"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.15 }}>
      <SearchEmptyState reason={props.reason} scope={props.scope} />
    </Motion.div>
  );
}

function NetworkResultsList(
  props: { onOpenThread: (uri: string) => void; query: string; results: NetworkSearchResult | null },
) {
  return (
    <Motion.div
      class="grid gap-2"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.15 }}>
      <div class="grid gap-2" role="list">
        <For each={props.results?.posts ?? []}>
          {(post, index) => (
            <Motion.div
              initial={{ opacity: 0, y: -6 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.2, delay: Math.min(index() * 0.03, 0.18) }}
              role="listitem">
              <SearchResultCard
                authorDid={post.author.did}
                authorHandle={post.author.handle}
                source="network"
                text={typeof post.record.text === "string" ? post.record.text : ""}
                createdAt={post.indexedAt}
                likeCount={post.likeCount ?? 0}
                onOpenThread={() => props.onOpenThread(post.uri)}
                replyCount={post.replyCount ?? 0}
                query={props.query} />
            </Motion.div>
          )}
        </For>
      </div>
    </Motion.div>
  );
}

function SearchTipsCard() {
  return (
    <section class="panel-surface grid gap-3 p-5">
      <p class="m-0 text-sm font-medium text-on-surface">Search Tips</p>
      <div class="grid grid-cols-2 gap-2 text-xs text-on-surface-variant">
        <p class="m-0 flex items-center gap-2">
          <kbd class="rounded bg-white/10 px-1.5 py-0.5">/</kbd>
          <span>Focus search from anywhere</span>
        </p>
        <p class="m-0 flex items-center gap-2">
          <kbd class="rounded bg-white/10 px-1.5 py-0.5">Tab</kbd>
          <span>Cycle search modes</span>
        </p>
        <div class="col-span-2 flex flex-col items-start gap-1">
          <div class="m-0 flex items-start gap-2">
            <div>·</div>
            <div>Use keyword mode for exact terms and hybrid mode for broader recall.</div>
          </div>
          <div class="m-0 flex items-start gap-2">
            <div>·</div>
            <div>Semantic mode follows the embeddings setting and model status shown above.</div>
          </div>
        </div>
      </div>
      <a
        class="inline-flex w-fit items-center gap-2 rounded-full bg-white/6 px-3 py-2 text-xs font-medium text-on-surface no-underline transition hover:bg-white/10 hover:text-primary"
        href="#/settings">
        <Icon kind="settings" class="text-sm" />
        <span>Open settings</span>
      </a>
    </section>
  );
}

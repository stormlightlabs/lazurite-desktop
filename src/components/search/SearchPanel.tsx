import { Icon, SearchModeIcon } from "$/components/shared/Icon";
import { useAppPreferences } from "$/contexts/app-preferences";
import { useAppSession } from "$/contexts/app-session";
import {
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
import { SearchEmptyState } from "./SearchEmptyState";
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

export function SearchPanel() {
  const preferences = useAppPreferences();
  const session = useAppSession();
  const [search, setSearch] = createStore<SearchPanelState>({
    error: null,
    hasSearched: false,
    loading: false,
    mode: "network",
    networkResults: null,
    query: "",
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
    document.addEventListener("keydown", handleGlobalKeyDown);

    onCleanup(() => {
      document.removeEventListener("keydown", handleGlobalKeyDown);
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
    <div class="grid min-h-0 gap-6 xl:grid-cols-[minmax(0,1fr)_20rem]">
      <section class="grid min-h-0 grid-rows-[auto_1fr] overflow-hidden rounded-4xl bg-surface-container shadow-[inset_0_0_0_1px_rgba(255,255,255,0.035)]">
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
          query={search.query} />
      </section>

      <aside class="grid content-start gap-4 overflow-y-auto">
        <Show when={session.activeDid}>
          {(did) => <SyncStatusPanel did={did()} onStatusChange={(status) => setSearch("syncStatus", status)} />}
        </Show>
        <EmbeddingsSettings />
        <SearchTipsCard />
      </aside>
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
      <SearchInput
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

function SearchInput(
  props: {
    error: string | null;
    inputRef: (el: HTMLInputElement) => void;
    loading: boolean;
    placeholder: string;
    query: string;
    onClear: () => void;
    onKeyDown: (event: KeyboardEvent) => void;
    onQueryChange: (value: string) => void;
  },
) {
  return (
    <div class="grid gap-2">
      <div class="relative">
        <div class="absolute left-4 top-1/2 -translate-y-1/2 text-on-surface-variant">
          <Icon kind="search" class="text-lg" />
        </div>

        <input
          ref={props.inputRef}
          type="text"
          value={props.query}
          placeholder={props.placeholder}
          class="w-full rounded-3xl border-0 bg-black/40 py-3.5 pl-12 pr-20 text-base text-on-surface placeholder:text-on-surface-variant/50 outline-none ring-1 ring-white/5 transition-all focus:ring-primary/50"
          onInput={(event) => props.onQueryChange(event.currentTarget.value)}
          onKeyDown={(event) => props.onKeyDown(event)} />

        <div class="absolute right-3 top-1/2 flex -translate-y-1/2 items-center gap-2">
          <LoadingIndicator loading={props.loading} />
          <ClearButton query={props.query} loading={props.loading} onClear={props.onClear} />
        </div>
      </div>

      <Show when={props.error}>
        {(message) => (
          <div class="rounded-2xl bg-red-500/10 px-3 py-2 text-sm text-red-200 shadow-[inset_0_0_0_1px_rgba(239,68,68,0.15)]">
            {message()}
          </div>
        )}
      </Show>
    </div>
  );
}

function LoadingIndicator(props: { loading: boolean }) {
  return (
    <Show when={props.loading}>
      <span class="flex items-center text-on-surface-variant">
        <Icon iconClass="i-ri-loader-4-line animate-spin" class="text-base" />
      </span>
    </Show>
  );
}

function ClearButton(props: { query: string; loading: boolean; onClear: () => void }) {
  return (
    <Show when={props.query && !props.loading}>
      <button
        type="button"
        onClick={() => props.onClear()}
        class="inline-flex items-center gap-1.5 rounded-lg border-0 bg-white/10 px-2 py-1 text-xs text-on-surface-variant transition hover:bg-white/20 hover:text-on-surface">
        <kbd class="rounded bg-white/10 px-1">ESC</kbd>
        clear
      </button>
    </Show>
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
    query: string;
  },
) {
  return (
    <div class="min-h-0 overflow-y-auto px-3 pb-3">
      <Show when={props.loading} fallback={<SearchState {...props} />}>
        <div class="grid gap-2 py-1">
          <For each={Array.from({ length: 5 })}>{() => <SearchSkeleton />}</For>
        </div>
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
          <LocalResultsList query={props.query} results={props.localResults} />
        </Match>

        <Match when={!props.isLocalMode && props.networkResults}>
          <NetworkResultsList query={props.query} results={props.networkResults} />
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

function LocalResultsList(props: { query: string; results: LocalPostResult[] }) {
  return (
    <Motion.div
      class="grid gap-2"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.15 }}>
      <div class="grid gap-2" role="list">
        <For each={props.results}>
          {(result, index) => (
            <Motion.div
              initial={{ opacity: 0, y: -6 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.2, delay: Math.min(index() * 0.03, 0.18) }}
              role="listitem">
              <SearchResultCard
                authorDid={result.authorDid}
                authorHandle={result.authorHandle ?? "unknown"}
                source={result.source}
                text={result.text ?? ""}
                createdAt={result.createdAt ?? ""}
                isSemanticMatch={result.semanticMatch && !result.keywordMatch}
                query={props.query} />
            </Motion.div>
          )}
        </For>
      </div>
    </Motion.div>
  );
}

function NetworkResultsList(props: { query: string; results: NetworkSearchResult | null }) {
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
                replyCount={post.replyCount ?? 0}
                query={props.query} />
            </Motion.div>
          )}
        </For>
      </div>
    </Motion.div>
  );
}

function SearchSkeleton() {
  return (
    <div class="flex animate-pulse items-start gap-4 rounded-2xl bg-surface px-4 py-4" aria-hidden="true">
      <div class="h-10 w-10 shrink-0 rounded-full bg-white/5" />
      <div class="min-w-0 flex-1 space-y-2">
        <div class="h-4 w-48 rounded-full bg-white/5" />
        <div class="h-3 w-full rounded-full bg-white/5" />
        <div class="h-3 w-2/3 rounded-full bg-white/5" />
      </div>
    </div>
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

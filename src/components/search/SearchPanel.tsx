import { Icon, SearchModeIcon } from "$/components/shared/Icon";
import { useAppSession } from "$/contexts/app-session";
import {
  type EmbeddingsConfig,
  getEmbeddingsConfig,
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
import { Motion, Presence } from "solid-motionone";
import { PostCount } from "../shared/PostCount";
import { EmbeddingsSettings } from "./EmbeddingsSettings";
import { SearchEmptyState } from "./SearchEmptyState";
import { SearchResultCard } from "./SearchResultCard";
import { SyncStatusPanel } from "./SyncStatusPanel";

const MODES: SearchMode[] = ["network", "keyword", "semantic", "hybrid"];

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
  const session = useAppSession();
  const [mode, setMode] = createSignal<SearchMode>("network");
  const [query, setQuery] = createSignal("");
  const [results, setResults] = createSignal<LocalPostResult[]>([]);
  const [networkResults, setNetworkResults] = createSignal<NetworkSearchResult | null>(null);
  const [loading, setLoading] = createSignal(false);
  const [error, setError] = createSignal<string | null>(null);
  const [resultCount, setResultCount] = createSignal(0);
  const [hasSearched, setHasSearched] = createSignal(false);
  const [syncStatus, setSyncStatus] = createSignal<SyncStatus[]>([]);
  const [embeddingsConfig, setEmbeddingsConfig] = createSignal<EmbeddingsConfig | null>(null);

  let searchInputRef: HTMLInputElement | undefined;
  let debounceTimer: ReturnType<typeof setTimeout> | undefined;

  const isLocalMode = createMemo(() => mode() !== "network");
  const semanticEnabled = createMemo(() => embeddingsConfig()?.enabled ?? true);
  const totalIndexedPosts = createMemo(() => syncStatus().reduce((sum, status) => sum + (status.postCount ?? 0), 0));
  const hasLocalPosts = createMemo(() => totalIndexedPosts() > 0);
  const lastSync = createMemo(() => {
    const timestamps = syncStatus().map((status) => status.lastSyncedAt).filter(Boolean) as string[];
    if (timestamps.length === 0) {
      return null;
    }

    return formatRelativeTime(timestamps.toSorted((left, right) => right.localeCompare(left))[0]);
  });
  const cycleModes = createMemo(() => MODES.filter((candidate) => candidate !== "semantic" || semanticEnabled()));

  async function loadEmbeddingsConfig() {
    try {
      setEmbeddingsConfig(await getEmbeddingsConfig());
    } catch (err) {
      logger.error("failed to load embeddings config", { keyValues: { error: normalizeError(err) } });
    }
  }

  async function performSearch(searchQuery: string, searchMode: SearchMode) {
    if (!searchQuery.trim()) {
      clearResults();
      return;
    }

    if (searchMode === "semantic" && !semanticEnabled()) {
      setError("Semantic search is disabled. Re-enable embeddings to use this mode.");
      setHasSearched(true);
      setResults([]);
      setNetworkResults(null);
      setResultCount(0);
      return;
    }

    setLoading(true);
    setError(null);

    try {
      if (searchMode === "network") {
        const response = await searchPostsNetwork(searchQuery, "top", 25);
        setNetworkResults(response);
        setResults([]);
        setResultCount(response.posts.length);
      } else {
        const response = await searchPosts(searchQuery, searchMode, 50);
        setResults(response);
        setNetworkResults(null);
        setResultCount(response.length);
      }
      setHasSearched(true);
    } catch (err) {
      const errorMsg = normalizeError(err);
      setError(errorMsg);
      setResults([]);
      setNetworkResults(null);
      setResultCount(0);
      setHasSearched(true);
      logger.error("search failed", { keyValues: { query: searchQuery, mode: searchMode, error: errorMsg } });
    } finally {
      setLoading(false);
    }
  }

  function clearResults() {
    setResults([]);
    setNetworkResults(null);
    setResultCount(0);
    setError(null);
    setHasSearched(false);
  }

  function handleInput(value: string) {
    setQuery(value);
    clearTimeout(debounceTimer);
    debounceTimer = setTimeout(() => {
      void performSearch(value, mode());
    }, 300);
  }

  function handleModeChange(newMode: SearchMode) {
    if (newMode === "semantic" && !semanticEnabled()) {
      return;
    }

    setMode(newMode);
    if (query().trim()) {
      void performSearch(query(), newMode);
    } else {
      setError(null);
    }
  }

  function cycleMode() {
    const availableModes = cycleModes();
    const currentIndex = availableModes.indexOf(mode());
    const nextIndex = (currentIndex + 1) % availableModes.length;
    handleModeChange(availableModes[nextIndex] ?? availableModes[0] ?? "network");
  }

  function clearSearch() {
    setQuery("");
    clearResults();
    searchInputRef?.focus();
  }

  function handleKeyDown(event: KeyboardEvent) {
    if (event.key === "Tab" && !event.shiftKey && document.activeElement === searchInputRef) {
      event.preventDefault();
      cycleMode();
    } else if (event.key === "Escape" && query()) {
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
    void loadEmbeddingsConfig();

    onCleanup(() => {
      document.removeEventListener("keydown", handleGlobalKeyDown);
      clearTimeout(debounceTimer);
    });
  });

  createEffect(() => {
    if (mode() === "semantic" && !semanticEnabled()) {
      setMode("keyword");
    }
  });

  return (
    <div class="grid min-h-0 gap-6 xl:grid-cols-[minmax(0,1fr)_20rem]">
      <section class="grid min-h-0 grid-rows-[auto_1fr] overflow-hidden rounded-4xl bg-surface-container shadow-[inset_0_0_0_1px_rgba(255,255,255,0.035)]">
        <SearchHeader
          error={error()}
          hasSearched={hasSearched()}
          loading={loading()}
          mode={mode()}
          query={query()}
          resultCount={resultCount()}
          semanticEnabled={semanticEnabled()}
          totalIndexedPosts={totalIndexedPosts()}
          lastSync={lastSync()}
          onModeChange={handleModeChange}
          onQueryChange={handleInput}
          inputRef={(element) => {
            searchInputRef = element;
          }}
          onKeyDown={handleKeyDown}
          onClear={clearSearch} />

        <SearchViewport
          error={error()}
          hasLocalPosts={hasLocalPosts()}
          hasSearched={hasSearched()}
          isLocalMode={isLocalMode()}
          loading={loading()}
          localResults={results()}
          mode={mode()}
          networkResults={networkResults()}
          query={query()} />
      </section>

      <aside class="grid content-start gap-4 overflow-y-auto">
        <Show when={session.activeDid}>{(did) => <SyncStatusPanel did={did()} onStatusChange={setSyncStatus} />}</Show>
        <EmbeddingsSettings
          onConfigChange={(nextConfig) => {
            setEmbeddingsConfig(nextConfig);
          }} />
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
        resultCount={props.resultCount}
        totalIndexedPosts={props.totalIndexedPosts}
        lastSync={props.lastSync} />
    </header>
  );
}

function ResultMeta(
  props: { hasSearched: boolean; lastSync: string | null; resultCount: number; totalIndexedPosts: number },
) {
  return (
    <div class="flex items-center justify-between gap-4 border-t border-white/5 pt-3">
      <span class="text-sm text-on-surface-variant">
        <Show
          when={props.hasSearched}
          fallback="Search your liked and bookmarked posts locally, or search the network.">
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
          placeholder="Search your saved & liked posts..."
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
    mode: SearchMode;
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
    loading: boolean;
    localResults: LocalPostResult[];
    mode: SearchMode;
    networkResults: NetworkSearchResult | null;
    query: string;
  },
) {
  return (
    <Presence>
      <Switch>
        <Match when={props.error && props.query}>
          <EmptyStateView reason={props.isLocalMode && !props.hasLocalPosts ? "no-sync" : "no-results"} />
        </Match>

        <Match when={props.isLocalMode && !props.hasLocalPosts}>
          <EmptyStateView reason="no-sync" />
        </Match>

        <Match when={!props.hasSearched && !props.query}>
          <EmptyStateView reason="initial" />
        </Match>

        <Match when={props.isLocalMode && props.localResults.length === 0}>
          <EmptyStateView reason="no-results" />
        </Match>

        <Match when={!props.isLocalMode && props.networkResults?.posts.length === 0}>
          <EmptyStateView reason="no-results" />
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

function EmptyStateView(props: { reason: "initial" | "no-results" | "no-sync" }) {
  return (
    <Motion.div
      class="grid place-items-center px-6 py-16"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.15 }}>
      <SearchEmptyState reason={props.reason} />
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
      <div class="grid gap-2 grid-cols-2 text-xs text-on-surface-variant">
        <p class="m-0 flex items-center gap-2">
          <kbd class="rounded bg-white/10 px-1.5 py-0.5">/</kbd>
          <span>Focus search from anywhere</span>
        </p>
        <p class="m-0 flex items-center gap-2">
          <kbd class="rounded bg-white/10 px-1.5 py-0.5">Tab</kbd>
          <span>Cycle search modes</span>
        </p>
        <div class="flex flex-col items-start gap-1 col-span-2">
          <div class="m-0 flex gap-2 items-start">
            <div>·</div>
            <div>Use keyword mode for exact terms and hybrid mode for broader recall.</div>
          </div>
          <div class="m-0 flex gap-2 items-start">
            <div>·</div>
            <div>Network search queries public Bluesky posts without using your local index.</div>
          </div>
        </div>
      </div>
    </section>
  );
}

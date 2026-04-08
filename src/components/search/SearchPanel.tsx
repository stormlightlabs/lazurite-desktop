import { ActorSuggestionList, getActorSuggestionHeadline, useActorSuggestions } from "$/components/actors/actor-search";
import { AvatarBadge } from "$/components/AvatarBadge";
import { PostCard } from "$/components/feeds/PostCard";
import { usePostNavigation } from "$/components/posts/usePostNavigation";
import { Icon, SearchModeIcon } from "$/components/shared/Icon";
import { useAppPreferences } from "$/contexts/app-preferences";
import { useAppSession } from "$/contexts/app-session";
import { SearchController } from "$/lib/api/search";
import type {
  ActorResult,
  ActorSearchResult,
  LocalPostResult,
  NetworkSearchParams,
  NetworkSearchResult,
  SearchMode,
  SyncStatus,
} from "$/lib/api/types/search";
import { formatRelativeTime } from "$/lib/feeds";
import { buildProfileRoute, getProfileRouteActor } from "$/lib/profile";
import { buildSearchRoute, parseSearchRouteState, toLocalDayStartIso, toLocalDayUntilIso } from "$/lib/search-routes";
import type { PostSearchFilters, SearchTab } from "$/lib/search-routes";
import type { ProfileViewBasic } from "$/lib/types";
import { normalizeError } from "$/lib/utils/text";
import { useLocation, useNavigate } from "@solidjs/router";
import * as logger from "@tauri-apps/plugin-log";
import { createEffect, createMemo, createSignal, For, Match, onCleanup, onMount, Show, Switch } from "solid-js";
import { createStore } from "solid-js/store";
import { Motion, Presence } from "solid-motionone";
import { PostCount } from "../shared/PostCount";
import { EmbeddingsSettings } from "./EmbeddingsSettings";
import { LocalPostResultsList, LocalPostResultsSkeletons } from "./LocalPostResultsList";
import { PostSearchFiltersRow } from "./PostSearchFilters";
import { SearchEmptyState } from "./SearchEmptyState";
import { SearchQueryInput } from "./SearchQueryInput";
import { SyncStatusPanel } from "./SyncStatusPanel";
import type { EmptyStateReason } from "./types";

const MODES: SearchMode[] = ["network", "keyword", "semantic", "hybrid"];

const SEARCH_TABS: SearchTab[] = ["posts", "profiles"];

type SearchPanelState = {
  actorResults: ActorSearchResult | null;
  error: string | null;
  hasSearched: boolean;
  loading: boolean;
  networkResults: NetworkSearchResult | null;
  resultCount: number;
  results: LocalPostResult[];
  syncStatus: SyncStatus[];
};

type SearchPanelProps = { embedded?: boolean; initialMode?: SearchMode; initialQuery?: string };

function ModeLabel(props: { mode: SearchMode }) {
  const text = createMemo(() => {
    switch (props.mode) {
      case "network": {
        return "Network";
      }
      case "keyword": {
        return "Keyword";
      }
      case "semantic": {
        return "Semantic";
      }
      case "hybrid": {
        return "Hybrid";
      }
    }
  });

  return (
    <span class="flex items-center gap-1.5">
      <SearchModeIcon mode={props.mode} class="text-base" />
      {text()}
    </span>
  );
}

export function SearchPanel(props: SearchPanelProps = {}) {
  const location = useLocation();
  const navigate = useNavigate();
  const preferences = useAppPreferences();
  const session = useAppSession();
  const postNavigation = usePostNavigation();
  const [search, setSearch] = createStore<SearchPanelState>({
    actorResults: null,
    error: null,
    hasSearched: false,
    loading: false,
    networkResults: null,
    resultCount: 0,
    results: [],
    syncStatus: [],
  });

  let actorSearchContainerRef: HTMLDivElement | undefined;
  let searchInputRef: HTMLInputElement | undefined;
  let debounceTimer: ReturnType<typeof setTimeout> | undefined;

  const routeState = createMemo(() => {
    const parsed = parseSearchRouteState(location.search);

    if (!parsed.q && props.initialQuery) {
      parsed.q = props.initialQuery;
    }

    if (props.initialMode && !new URLSearchParams(location.search).has("mode")) {
      parsed.mode = props.initialMode;
    }

    return parsed;
  });

  const actorSuggestions = useActorSuggestions({
    container: () => actorSearchContainerRef,
    disabled: () => routeState().tab !== "profiles",
    input: () => searchInputRef,
    onError: (error) =>
      logger.warn("failed to load actor search suggestions", { keyValues: { error: normalizeError(error) } }),
    value: () => routeState().q,
  });

  const isActorTab = createMemo(() => routeState().tab === "profiles");
  const isLocalMode = createMemo(() => routeState().tab === "posts" && routeState().mode !== "network");
  const networkFiltersEnabled = createMemo(() => routeState().tab === "posts" && routeState().mode === "network");
  const semanticEnabled = createMemo(() =>
    !!preferences.embeddingsConfig?.enabled && !!preferences.embeddingsConfig?.downloaded
  );

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

  const cycleModes = createMemo(() =>
    MODES.filter((candidate) => semanticEnabled() || (candidate !== "semantic" && candidate !== "hybrid"))
  );

  async function performSearch() {
    const state = routeState();
    const searchQuery = state.q.trim();

    if (!searchQuery) {
      clearResults();
      return;
    }

    if (state.tab === "profiles") {
      setSearch({ error: null, loading: true });

      try {
        const response = await SearchController.searchActors(searchQuery, 25);
        setSearch({
          actorResults: response,
          error: null,
          hasSearched: true,
          networkResults: null,
          resultCount: response.actors.length,
          results: [],
        });
      } catch (error) {
        const errorMessage = normalizeError(error);
        setSearch({
          actorResults: null,
          error: errorMessage,
          hasSearched: true,
          networkResults: null,
          resultCount: 0,
          results: [],
        });
        logger.error("actor search failed", { keyValues: { error: errorMessage, query: searchQuery } });
      } finally {
        setSearch("loading", false);
      }

      return;
    }

    if ((state.mode === "semantic" || state.mode === "hybrid") && !semanticEnabled()) {
      setSearch({
        actorResults: null,
        error: "Semantic search is optional and currently off. Use Search setup or Settings to enable embeddings.",
        hasSearched: true,
        networkResults: null,
        resultCount: 0,
        results: [],
      });
      return;
    }

    setSearch({ error: null, loading: true });

    try {
      if (state.mode === "network") {
        const response = await SearchController.searchPostsNetwork(buildNetworkSearchParams(state));
        setSearch({
          actorResults: null,
          hasSearched: true,
          networkResults: response,
          resultCount: response.posts.length,
          results: [],
        });
      } else {
        const response = await SearchController.searchPosts(searchQuery, state.mode, 50);
        setSearch({
          actorResults: null,
          hasSearched: true,
          networkResults: null,
          resultCount: response.length,
          results: response,
        });
      }
    } catch (error) {
      const errorMessage = normalizeError(error);
      setSearch({
        actorResults: null,
        error: errorMessage,
        hasSearched: true,
        networkResults: null,
        resultCount: 0,
        results: [],
      });
      logger.error("search failed", {
        keyValues: { error: errorMessage, mode: state.mode, query: searchQuery, tab: state.tab },
      });
    } finally {
      setSearch("loading", false);
    }
  }

  function clearResults() {
    setSearch({
      actorResults: null,
      error: null,
      hasSearched: false,
      networkResults: null,
      resultCount: 0,
      results: [],
    });
  }

  function replaceRoute(next: Partial<ReturnType<typeof routeState>>) {
    const state = routeState();
    void navigate(buildSearchRoute(location.pathname, location.search, { ...state, ...next }));
  }

  function handleInput(value: string) {
    replaceRoute({ q: value });
  }

  function handleModeChange(newMode: SearchMode) {
    if ((newMode === "semantic" || newMode === "hybrid") && !semanticEnabled()) {
      return;
    }

    replaceRoute({ mode: newMode, tab: "posts" });
  }

  function handleFilterChange(next: Partial<PostSearchFilters>) {
    replaceRoute(next);
  }

  function handleTabChange(nextTab: SearchTab) {
    if (nextTab === routeState().tab) {
      return;
    }

    setSearch({ error: null, hasSearched: false, resultCount: 0 });
    replaceRoute({ tab: nextTab });
  }

  function cycleMode() {
    const availableModes = cycleModes();
    const currentIndex = availableModes.indexOf(routeState().mode);
    const nextIndex = (currentIndex + 1) % availableModes.length;
    handleModeChange(availableModes[nextIndex] ?? availableModes[0] ?? "network");
  }

  function clearSearch() {
    actorSuggestions.close();
    replaceRoute({ q: "" });
    clearResults();
    searchInputRef?.focus();
  }

  function handleKeyDown(event: KeyboardEvent) {
    if (routeState().tab === "profiles") {
      if (event.key === "ArrowDown") {
        event.preventDefault();
        actorSuggestions.moveActiveIndex(1);
        return;
      }

      if (event.key === "ArrowUp") {
        event.preventDefault();
        actorSuggestions.moveActiveIndex(-1);
        return;
      }

      if (event.key === "Enter" && actorSuggestions.open() && actorSuggestions.activeSuggestion()) {
        event.preventDefault();
        openActor(actorSuggestions.activeSuggestion() as ProfileViewBasic);
        actorSuggestions.close();
        return;
      }
    }

    if (
      routeState().tab === "posts" && event.key === "Tab" && !event.shiftKey
      && document.activeElement === searchInputRef
    ) {
      event.preventDefault();
      cycleMode();
      return;
    }

    if (event.key === "Escape" && routeState().q) {
      clearSearch();
      return;
    }

    if (event.key === "Escape" && routeState().tab === "profiles") {
      actorSuggestions.close();
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
      void SearchController.getSyncStatus(session.activeDid).then((status) => {
        setSearch("syncStatus", status);
      }).catch((error) => {
        logger.warn("failed to load embedded search sync status", { keyValues: { error: normalizeError(error) } });
      });
    }

    onCleanup(() => {
      if (!props.embedded) {
        document.removeEventListener("keydown", handleGlobalKeyDown);
      }

      clearTimeout(debounceTimer);
    });
  });

  createEffect(() => {
    if ((routeState().mode === "semantic" || routeState().mode === "hybrid") && !semanticEnabled()) {
      replaceRoute({ mode: "keyword" });
    }
  });

  createEffect(() => {
    routeState();
    clearTimeout(debounceTimer);
    debounceTimer = setTimeout(() => {
      void performSearch();
    }, 300);
  });

  function openActor(actor: Pick<ProfileViewBasic, "did" | "handle">) {
    void navigate(buildProfileRoute(getProfileRouteActor(actor)));
  }

  return (
    <div class="grid min-h-0 gap-6" classList={{ "xl:grid-cols-[minmax(0,1fr)_22rem]": !props.embedded }}>
      <section
        class="grid min-h-0 grid-rows-[auto_1fr] overflow-hidden"
        classList={{
          "rounded-4xl bg-surface-container shadow-[inset_0_0_0_1px_rgba(255,255,255,0.035)]": !props.embedded,
        }}>
        <SearchHeader
          actorSearchContainerRef={(element) => {
            actorSearchContainerRef = element;
          }}
          actorSuggestions={actorSuggestions.suggestions()}
          error={search.error}
          filters={routeState()}
          filtersEnabled={networkFiltersEnabled()}
          hasSearched={search.hasSearched}
          inputRef={(element) => {
            searchInputRef = element;
          }}
          lastSync={lastSync()}
          loading={search.loading}
          mode={routeState().mode}
          onActorSuggestionFocus={actorSuggestions.focus}
          onActorSuggestionSelect={(suggestion) => openActor(suggestion)}
          onClear={clearSearch}
          onFilterChange={handleFilterChange}
          onKeyDown={handleKeyDown}
          onModeChange={handleModeChange}
          onQueryChange={handleInput}
          onTabChange={handleTabChange}
          query={routeState().q}
          resultCount={search.resultCount}
          semanticEnabled={semanticEnabled()}
          suggestionsActiveIndex={actorSuggestions.activeIndex()}
          suggestionsOpen={actorSuggestions.open()}
          tab={routeState().tab}
          totalIndexedPosts={totalIndexedPosts()} />

        <SearchViewport
          actorResults={search.actorResults}
          error={search.error}
          hasLocalPosts={hasLocalPosts()}
          hasSearched={search.hasSearched}
          isActorTab={isActorTab()}
          isLocalMode={isLocalMode()}
          loading={search.loading}
          localResults={search.results}
          networkResults={search.networkResults}
          onOpenActor={openActor}
          onOpenThread={(uri) => void postNavigation.openPost(uri)}
          query={routeState().q} />
      </section>

      <Show when={!props.embedded}>
        <aside class="grid content-start gap-3 overflow-y-auto xl:sticky xl:top-0 xl:max-h-[calc(100vh-2rem)] xl:pr-1">
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
    actorSearchContainerRef: (el: HTMLDivElement) => void;
    actorSuggestions: ProfileViewBasic[];
    error: string | null;
    filters: ReturnType<typeof parseSearchRouteState>;
    filtersEnabled: boolean;
    hasSearched: boolean;
    inputRef: (el: HTMLInputElement) => void;
    lastSync: string | null;
    loading: boolean;
    mode: SearchMode;
    onActorSuggestionFocus: () => void;
    onActorSuggestionSelect: (suggestion: ProfileViewBasic) => void;
    onClear: () => void;
    onFilterChange: (next: Partial<PostSearchFilters>) => void;
    onKeyDown: (event: KeyboardEvent) => void;
    onModeChange: (mode: SearchMode) => void;
    onQueryChange: (value: string) => void;
    onTabChange: (tab: SearchTab) => void;
    query: string;
    resultCount: number;
    semanticEnabled: boolean;
    suggestionsActiveIndex: number;
    suggestionsOpen: boolean;
    tab: SearchTab;
    totalIndexedPosts: number;
  },
) {
  return (
    <header class="grid gap-4 px-6 pb-5 pt-6">
      <SearchTabSelector activeTab={props.tab} onTabChange={props.onTabChange} />

      <div ref={props.actorSearchContainerRef} class="relative">
        <SearchQueryInput
          ariaActivedescendant={props.tab === "profiles" && props.suggestionsActiveIndex >= 0
            ? `search-actor-suggestions-option-${props.suggestionsActiveIndex}`
            : undefined}
          ariaAutocomplete={props.tab === "profiles" ? "list" : undefined}
          ariaControls={props.tab === "profiles" ? "search-actor-suggestions" : undefined}
          ariaExpanded={props.tab === "profiles" ? props.suggestionsOpen : undefined}
          autocomplete={props.tab === "profiles" ? "off" : undefined}
          error={props.error}
          inputRef={props.inputRef}
          loading={props.loading}
          onFocus={props.tab === "profiles" ? props.onActorSuggestionFocus : undefined}
          placeholder={props.tab === "profiles"
            ? "Search profiles by handle or display name..."
            : (props.mode === "network"
              ? "Search public posts across Bluesky..."
              : "Search your saved & liked posts...")}
          query={props.query}
          role={props.tab === "profiles" ? "combobox" : undefined}
          spellcheck={false}
          onClear={props.onClear}
          onKeyDown={props.onKeyDown}
          onQueryChange={props.onQueryChange}>
          <Show when={props.tab === "profiles"}>
            <ActorSuggestionList
              activeIndex={props.suggestionsActiveIndex}
              id="search-actor-suggestions"
              open={props.suggestionsOpen}
              suggestions={props.actorSuggestions}
              title="Suggested profiles"
              onSelect={props.onActorSuggestionSelect} />
          </Show>
        </SearchQueryInput>
      </div>

      <div class="flex items-center justify-between gap-4">
        <Show
          when={props.tab === "posts"}
          fallback={
            <span class="inline-flex items-center gap-2 rounded-full bg-black/30 px-3 py-2 text-xs text-on-surface-variant">
              <Icon kind="profile" class="text-sm text-primary" />
              Profiles are always searched across Bluesky.
            </span>
          }>
          <ModeSelector
            activeMode={props.mode}
            semanticEnabled={props.semanticEnabled}
            onModeChange={props.onModeChange} />
        </Show>
        <SearchHint tab={props.tab} />
      </div>

      <Show when={props.filtersEnabled} fallback={<NetworkFiltersNotice tab={props.tab} />}>
        <PostSearchFiltersRow
          collapsible
          defaultExpanded={hasAdvancedNetworkFilters(props.filters)}
          filters={props.filters}
          helperText="Filters update the URL and apply to network post search."
          onChange={props.onFilterChange} />
      </Show>

      <ResultMeta
        hasSearched={props.hasSearched}
        isActorTab={props.tab === "profiles"}
        lastSync={props.lastSync}
        mode={props.mode}
        resultCount={props.resultCount}
        totalIndexedPosts={props.totalIndexedPosts} />
    </header>
  );
}

function NetworkFiltersNotice(props: { tab: SearchTab }) {
  return (
    <section class="grid gap-2 rounded-3xl bg-black/20 px-4 py-3 shadow-[inset_0_0_0_1px_rgba(255,255,255,0.035)]">
      <div class="flex items-center gap-2 text-xs font-medium uppercase tracking-[0.12em] text-on-surface-variant">
        <Icon kind="search" class="text-sm text-primary" />
        <span>Network Filters</span>
      </div>
      <p class="m-0 text-sm text-on-surface-variant">
        <Show
          when={props.tab === "posts"}
          fallback="Network filters only apply to post search. Switch back to Posts and choose Network to use author, mention, date, or tag filters.">
          Network filters only apply in Posts when Network mode is active. Your current filter values stay in the URL
          and will reapply when you switch back.
        </Show>
      </p>
    </section>
  );
}

function SearchHint(props: { tab: SearchTab }) {
  return (
    <span class="text-xs text-on-surface-variant">
      <Show
        when={props.tab === "posts"}
        fallback={
          <>
            <kbd class="rounded bg-white/10 px-1.5 py-0.5">↑↓</kbd> to navigate suggestions
          </>
        }>
        <>
          <kbd class="rounded bg-white/10 px-1.5 py-0.5">Tab</kbd> to switch modes
        </>
      </Show>
    </span>
  );
}

function SearchTabSelector(props: { activeTab: SearchTab; onTabChange: (tab: SearchTab) => void }) {
  return (
    <nav class="flex items-center gap-2" aria-label="Search tabs">
      <For each={SEARCH_TABS}>
        {(tab) => (
          <button
            type="button"
            aria-pressed={props.activeTab === tab}
            class="inline-flex items-center gap-2 rounded-full border-0 px-4 py-2 text-sm font-medium transition duration-150"
            classList={{
              "bg-primary/16 text-primary shadow-[inset_0_0_0_1px_rgba(125,175,255,0.18)]": props.activeTab === tab,
              "bg-white/4 text-on-surface-variant hover:bg-white/8 hover:text-on-surface": props.activeTab !== tab,
            }}
            onClick={() => props.onTabChange(tab)}>
            <Icon kind={tab === "posts" ? "search" : "profile"} class="text-sm" />
            <span>{tab === "posts" ? "Posts" : "Profiles"}</span>
          </button>
        )}
      </For>
    </nav>
  );
}

type ResultMetaProps = {
  hasSearched: boolean;
  isActorTab: boolean;
  lastSync: string | null;
  mode: SearchMode;
  resultCount: number;
  totalIndexedPosts: number;
};

function ResultMeta(props: ResultMetaProps) {
  return (
    <div class="flex items-center justify-between gap-4 border-t border-white/5 pt-3">
      <span class="text-sm text-on-surface-variant">
        <Show
          when={props.hasSearched}
          fallback={props.isActorTab
            ? "Search people across Bluesky by handle or display name."
            : (props.mode === "network"
              ? "Search public posts across Bluesky or switch to your synced archive."
              : "Search your liked and bookmarked posts locally, or search the network.")}>
          <span>
            Found <span class="font-medium text-on-surface">{props.resultCount}</span>{" "}
            {props.isActorTab ? "profiles" : "results"}
          </span>
        </Show>
      </span>

      <span class="text-xs text-on-surface-variant">
        <Show when={!props.isActorTab && props.totalIndexedPosts > 0}>
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
          const disabled = (searchMode === "semantic" || searchMode === "hybrid") && !props.semanticEnabled;
          return (
            <button
              type="button"
              aria-pressed={props.activeMode === searchMode}
              disabled={disabled}
              title={disabled
                ? "Semantic and hybrid search stay unavailable until you opt into embeddings from Search setup or Settings."
                : undefined}
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

type SearchViewportProps = {
  actorResults: ActorSearchResult | null;
  error: string | null;
  hasLocalPosts: boolean;
  hasSearched: boolean;
  isActorTab: boolean;
  isLocalMode: boolean;
  loading: boolean;
  localResults: LocalPostResult[];
  networkResults: NetworkSearchResult | null;
  onOpenActor: (actor: Pick<ProfileViewBasic, "did" | "handle">) => void;
  onOpenThread: (uri: string) => void;
  query: string;
};

function SearchViewport(props: SearchViewportProps) {
  return (
    <div class="min-h-0 overflow-y-auto px-3 pb-3">
      <Show when={props.loading} fallback={<SearchState {...props} />}>
        <LocalPostResultsSkeletons />
      </Show>
    </div>
  );
}

type SearchStateProps = {
  actorResults: ActorSearchResult | null;
  error: string | null;
  hasLocalPosts: boolean;
  hasSearched: boolean;
  isActorTab: boolean;
  isLocalMode: boolean;
  localResults: LocalPostResult[];
  networkResults: NetworkSearchResult | null;
  onOpenActor: (actor: Pick<ProfileViewBasic, "did" | "handle">) => void;
  onOpenThread: (uri: string) => void;
  query: string;
};

function SearchState(props: SearchStateProps) {
  return (
    <Presence>
      <Switch>
        <Match when={props.error && props.query}>
          <EmptyStateView
            reason="error"
            scope={props.isActorTab ? "profiles" : (props.isLocalMode ? "local" : "network")} />
        </Match>

        <Match when={!props.isActorTab && props.isLocalMode && !props.hasLocalPosts}>
          <EmptyStateView reason="no-sync" scope="local" />
        </Match>

        <Match when={!props.hasSearched && !props.query}>
          <EmptyStateView
            reason="initial"
            scope={props.isActorTab ? "profiles" : (props.isLocalMode ? "local" : "network")} />
        </Match>

        <Match when={props.isActorTab && props.actorResults?.actors.length === 0}>
          <EmptyStateView reason="no-results" scope="profiles" />
        </Match>

        <Match when={!props.isActorTab && props.isLocalMode && props.localResults.length === 0}>
          <EmptyStateView reason="no-results" scope="local" />
        </Match>

        <Match when={!props.isActorTab && !props.isLocalMode && props.networkResults?.posts.length === 0}>
          <EmptyStateView reason="no-results" scope="network" />
        </Match>

        <Match when={props.isActorTab && props.actorResults}>
          <ActorResultsList onOpenActor={props.onOpenActor} results={props.actorResults} />
        </Match>

        <Match when={props.isLocalMode}>
          <LocalPostResultsList onOpenThread={props.onOpenThread} query={props.query} results={props.localResults} />
        </Match>

        <Match when={!props.isLocalMode && props.networkResults}>
          <NetworkResultsList onOpenThread={props.onOpenThread} results={props.networkResults} />
        </Match>
      </Switch>
    </Presence>
  );
}

function EmptyStateView(props: { reason: EmptyStateReason | "no-sync"; scope: "local" | "network" | "profiles" }) {
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

function ActorResultsList(
  props: { onOpenActor: (actor: Pick<ProfileViewBasic, "did" | "handle">) => void; results: ActorSearchResult | null },
) {
  return (
    <Motion.div
      class="grid gap-2"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.15 }}>
      <div class="grid gap-2" role="list">
        <For each={props.results?.actors ?? []}>
          {(actor, index) => (
            <Motion.div
              role="listitem"
              initial={{ opacity: 0, y: -6 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.2, delay: Math.min(index() * 0.03, 0.18) }}>
              <ActorResultCard actor={actor} onOpenActor={props.onOpenActor} />
            </Motion.div>
          )}
        </For>
      </div>
    </Motion.div>
  );
}

type ActorResultCardProps = {
  actor: ActorResult;
  onOpenActor: (actor: Pick<ProfileViewBasic, "did" | "handle">) => void;
};

function ActorResultCard(props: ActorResultCardProps) {
  return (
    <button
      type="button"
      aria-label={`Open profile ${getActorSuggestionHeadline(props.actor)}`}
      class="grid w-full gap-3 rounded-3xl border-0 bg-white/[0.035] p-4 text-left shadow-[inset_0_0_0_1px_rgba(255,255,255,0.04)] transition duration-150 hover:-translate-y-px hover:bg-white/5.5"
      onClick={() => props.onOpenActor(props.actor)}>
      <ActorResultHeader actor={props.actor} />
      <Show when={props.actor.description?.trim()}>
        <p class="m-0 text-sm leading-relaxed text-on-surface-variant">{props.actor.description?.trim()}</p>
      </Show>
      <p class="m-0 truncate font-mono text-[0.7rem] text-on-surface-variant/80">{props.actor.did}</p>
    </button>
  );
}

function ActorResultHeader(props: { actor: ActorSearchResult["actors"][number] }) {
  return (
    <div class="flex items-start gap-3">
      <Show when={props.actor.avatar} fallback={<AvatarBadge label={props.actor.handle} tone="muted" />}>
        {(avatar) => <img class="h-12 w-12 rounded-full object-cover" src={avatar()} alt="" loading="lazy" />}
      </Show>
      <div class="min-w-0 flex-1">
        <div class="flex flex-wrap items-center gap-2">
          <p class="m-0 truncate text-sm font-medium text-on-surface">{getActorSuggestionHeadline(props.actor)}</p>
          <span class="rounded-full bg-primary/12 px-2 py-0.5 text-[0.68rem] font-medium uppercase tracking-[0.12em] text-primary">
            Profile
          </span>
        </div>
        <p class="mt-1 truncate text-xs text-on-surface-variant">@{props.actor.handle.replace(/^@/, "")}</p>
      </div>
      <Icon kind="profile" class="mt-1 text-base text-on-surface-variant" />
    </div>
  );
}

function NetworkResultsList(props: { onOpenThread: (uri: string) => void; results: NetworkSearchResult | null }) {
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
              <PostCard
                post={post}
                showActions={false}
                onOpenThread={() => props.onOpenThread(post.uri)} />
            </Motion.div>
          )}
        </For>
      </div>
    </Motion.div>
  );
}

function SearchTipsCard() {
  return (
    <section class="panel-surface grid gap-4 p-4">
      <div class="flex items-center justify-between gap-3">
        <p class="m-0 text-sm font-medium text-on-surface">Search Tips</p>
        <span class="rounded-full bg-white/7 px-2.5 py-1 text-[0.68rem] uppercase tracking-[0.12em] text-on-surface-variant">
          Workflow
        </span>
      </div>

      <div class="grid gap-2">
        <div class="grid grid-cols-[auto_minmax(0,1fr)] items-center gap-3 rounded-2xl bg-black/25 px-3 py-2 text-xs text-on-surface-variant">
          <kbd class="rounded bg-white/10 px-1.5 py-0.5 text-on-surface">/</kbd>
          <span>Focus search from anywhere.</span>
        </div>
        <div class="grid grid-cols-[auto_minmax(0,1fr)] items-center gap-3 rounded-2xl bg-black/25 px-3 py-2 text-xs text-on-surface-variant">
          <kbd class="rounded bg-white/10 px-1.5 py-0.5 text-on-surface">Tab</kbd>
          <span>Cycle search modes while the query field is focused.</span>
        </div>
      </div>

      <div class="grid gap-2 text-xs leading-relaxed text-on-surface-variant">
        <p class="m-0 rounded-2xl bg-white/[0.035] px-3 py-2">
          Network filters stay in the URL, so exact search states are shareable and bookmarkable.
        </p>
        <p class="m-0 rounded-2xl bg-white/[0.035] px-3 py-2">
          Use keyword mode for exact terms. Hybrid becomes available after semantic search finishes setup.
        </p>
        <p class="m-0 rounded-2xl bg-white/[0.035] px-3 py-2">
          Switch to Profiles when you want people, not posts. Suggestions open immediately.
        </p>
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

function hasAdvancedNetworkFilters(filters: PostSearchFilters) {
  return !!(filters.author || filters.mentions || filters.since || filters.until || filters.tags.length > 0);
}

function buildNetworkSearchParams(state: ReturnType<typeof parseSearchRouteState>): NetworkSearchParams {
  return {
    author: state.author || null,
    limit: 25,
    mentions: state.mentions || null,
    query: state.q,
    since: state.since ? toLocalDayStartIso(state.since) : null,
    sort: state.sort,
    tags: state.tags,
    until: state.until ? toLocalDayUntilIso(state.until) : null,
  };
}

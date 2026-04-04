import { ActorSuggestionList, getActorSuggestionHeadline, useActorSuggestions } from "$/components/actors/actor-search";
import { AvatarBadge } from "$/components/AvatarBadge";
import { useThreadOverlayNavigation } from "$/components/posts/useThreadOverlayNavigation";
import { Icon, SearchModeIcon } from "$/components/shared/Icon";
import { useAppPreferences } from "$/contexts/app-preferences";
import { useAppSession } from "$/contexts/app-session";
import {
  type ActorSearchResult,
  getSyncStatus,
  type LocalPostResult,
  type NetworkSearchResult,
  searchActors,
  type SearchMode,
  searchPosts,
  searchPostsNetwork,
  type SyncStatus,
} from "$/lib/api/search";
import { formatRelativeTime } from "$/lib/feeds";
import { buildProfileRoute, getProfileRouteActor } from "$/lib/profile";
import type { ProfileViewBasic } from "$/lib/types";
import { normalizeError } from "$/lib/utils/text";
import { useNavigate } from "@solidjs/router";
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
const SEARCH_TABS = ["posts", "profiles"] as const;

type SearchTab = typeof SEARCH_TABS[number];

type SearchPanelState = {
  actorResults: ActorSearchResult | null;
  error: string | null;
  hasSearched: boolean;
  loading: boolean;
  mode: SearchMode;
  networkResults: NetworkSearchResult | null;
  query: string;
  resultCount: number;
  results: LocalPostResult[];
  tab: SearchTab;
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
  const navigate = useNavigate();
  const preferences = useAppPreferences();
  const session = useAppSession();
  const threadOverlay = useThreadOverlayNavigation();
  const [search, setSearch] = createStore<SearchPanelState>({
    actorResults: null,
    error: null,
    hasSearched: false,
    loading: false,
    mode: props.initialMode ?? "network",
    networkResults: null,
    query: props.initialQuery ?? "",
    resultCount: 0,
    results: [],
    tab: "posts",
    syncStatus: [],
  });

  let actorSearchContainerRef: HTMLDivElement | undefined;
  let searchInputRef: HTMLInputElement | undefined;
  let debounceTimer: ReturnType<typeof setTimeout> | undefined;

  const actorSuggestions = useActorSuggestions({
    container: () => actorSearchContainerRef,
    disabled: () => search.tab !== "profiles",
    input: () => searchInputRef,
    onError: (error) =>
      logger.warn("failed to load actor search suggestions", { keyValues: { error: normalizeError(error) } }),
    value: () => search.query,
  });
  const isActorTab = createMemo(() => search.tab === "profiles");
  const isLocalMode = createMemo(() => search.tab === "posts" && search.mode !== "network");
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

  async function performSearch(searchQuery: string, searchTab: SearchTab, searchMode: SearchMode) {
    if (!searchQuery.trim()) {
      clearResults();
      return;
    }

    if (searchTab === "profiles") {
      setSearch({ error: null, loading: true });

      try {
        const response = await searchActors(searchQuery, 25);
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
        logger.error("actor search failed", { keyValues: { query: searchQuery, error: errorMessage } });
      } finally {
        setSearch("loading", false);
      }

      return;
    }

    if (searchMode === "semantic" && !semanticEnabled()) {
      setSearch({
        actorResults: null,
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
        setSearch({
          actorResults: null,
          hasSearched: true,
          networkResults: response,
          resultCount: response.posts.length,
          results: [],
        });
      } else {
        const response = await searchPosts(searchQuery, searchMode, 50);
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
      logger.error("search failed", { keyValues: { query: searchQuery, mode: searchMode, error: errorMessage } });
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

  function handleInput(value: string) {
    setSearch("query", value);
    clearTimeout(debounceTimer);
    debounceTimer = setTimeout(() => {
      void performSearch(value, search.tab, search.mode);
    }, 300);
  }

  function handleModeChange(newMode: SearchMode) {
    if (newMode === "semantic" && !semanticEnabled()) {
      return;
    }

    setSearch("mode", newMode);
    if (search.query.trim()) {
      void performSearch(search.query, "posts", newMode);
      return;
    }

    setSearch("error", null);
  }

  function handleTabChange(nextTab: SearchTab) {
    if (nextTab === search.tab) {
      return;
    }

    setSearch({ error: null, hasSearched: false, resultCount: 0, tab: nextTab });
    if (search.query.trim()) {
      void performSearch(search.query, nextTab, search.mode);
    }
  }

  function cycleMode() {
    const availableModes = cycleModes();
    const currentIndex = availableModes.indexOf(search.mode);
    const nextIndex = (currentIndex + 1) % availableModes.length;
    handleModeChange(availableModes[nextIndex] ?? availableModes[0] ?? "network");
  }

  function clearSearch() {
    actorSuggestions.close();
    setSearch("query", "");
    clearResults();
    searchInputRef?.focus();
  }

  function handleKeyDown(event: KeyboardEvent) {
    if (search.tab === "profiles") {
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

    if (search.tab === "posts" && event.key === "Tab" && !event.shiftKey && document.activeElement === searchInputRef) {
      event.preventDefault();
      cycleMode();
      return;
    }

    if (event.key === "Escape" && search.query) {
      clearSearch();
      return;
    }

    if (event.key === "Escape" && search.tab === "profiles") {
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
      void getSyncStatus(session.activeDid).then((status) => {
        setSearch("syncStatus", status);
      }).catch((error) => {
        logger.warn("failed to load embedded search sync status", { keyValues: { error: normalizeError(error) } });
      });
    }
    if (search.query.trim()) {
      void performSearch(search.query, search.tab, search.mode);
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
        void performSearch(search.query, search.tab, "keyword");
      }
    }
  });

  function openActor(actor: Pick<ProfileViewBasic, "did" | "handle">) {
    void navigate(buildProfileRoute(getProfileRouteActor(actor)));
  }

  return (
    <div class="grid min-h-0 gap-6" classList={{ "xl:grid-cols-[minmax(0,1fr)_20rem]": !props.embedded }}>
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
          hasSearched={search.hasSearched}
          inputRef={(element) => {
            searchInputRef = element;
          }}
          lastSync={lastSync()}
          loading={search.loading}
          mode={search.mode}
          onActorSuggestionSelect={(suggestion) => openActor(suggestion)}
          onActorSuggestionFocus={actorSuggestions.focus}
          onClear={clearSearch}
          onKeyDown={handleKeyDown}
          onModeChange={handleModeChange}
          onQueryChange={handleInput}
          onTabChange={handleTabChange}
          query={search.query}
          resultCount={search.resultCount}
          tab={search.tab}
          semanticEnabled={semanticEnabled()}
          suggestionsActiveIndex={actorSuggestions.activeIndex()}
          suggestionsOpen={actorSuggestions.open()}
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
    actorSearchContainerRef: (el: HTMLDivElement) => void;
    actorSuggestions: ProfileViewBasic[];
    error: string | null;
    hasSearched: boolean;
    inputRef: (el: HTMLInputElement) => void;
    lastSync: string | null;
    loading: boolean;
    mode: SearchMode;
    onActorSuggestionSelect: (suggestion: ProfileViewBasic) => void;
    onActorSuggestionFocus: () => void;
    onClear: () => void;
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

function ResultMeta(
  props: {
    hasSearched: boolean;
    isActorTab: boolean;
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
  },
) {
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
          <NetworkResultsList onOpenThread={props.onOpenThread} query={props.query} results={props.networkResults} />
        </Match>
      </Switch>
    </Presence>
  );
}

function EmptyStateView(
  props: { reason: "error" | "initial" | "no-results" | "no-sync"; scope: "local" | "network" | "profiles" },
) {
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

function ActorResultCard(
  props: {
    actor: ActorSearchResult["actors"][number];
    onOpenActor: (actor: Pick<ProfileViewBasic, "did" | "handle">) => void;
  },
) {
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
          <div class="m-0 flex items-start gap-2">
            <div>·</div>
            <div>Switch to Profiles when you want people, not posts. Actor suggestions open immediately.</div>
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

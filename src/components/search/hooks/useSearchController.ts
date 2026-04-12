import { useActorSuggestions } from "$/components/actors/ActorSearch";
import { handleActorTypeaheadKeyDown } from "$/components/actors/hooks/useActorTypeaheadCombobox";
import { usePostNavigation } from "$/components/posts/hooks/usePostNavigation";
import { useAppPreferences } from "$/contexts/app-preferences";
import { useAppSession } from "$/contexts/app-session";
import { SearchController } from "$/lib/api/search";
import type {
  ActorSearchResult,
  LocalPostResult,
  NetworkSearchParams,
  NetworkSearchResult,
  SearchMode,
  SyncStatus,
} from "$/lib/api/types/search";
import { buildProfileRoute, getProfileRouteActor } from "$/lib/profile";
import { buildSearchRoute, parseSearchRouteState, toLocalDayStartIso, toLocalDayUntilIso } from "$/lib/search-routes";
import type { PostSearchFilters, SearchTab } from "$/lib/search-routes";
import type { ProfileViewBasic } from "$/lib/types";
import { formatRelativeTime } from "$/lib/utils/text";
import { normalizeError } from "$/lib/utils/text";
import { useLocation, useNavigate } from "@solidjs/router";
import * as logger from "@tauri-apps/plugin-log";
import { createEffect, createMemo, createSignal, onCleanup, onMount } from "solid-js";
import { createStore } from "solid-js/store";

const MODES: SearchMode[] = ["network", "keyword", "semantic", "hybrid"];
const SEARCH_DEBOUNCE_MS = 300;
const PROFILE_SEARCH_LIMIT = 25;
const LOCAL_SEARCH_LIMIT = 50;

type SearchControllerState = {
  actorResults: ActorSearchResult | null;
  error: string | null;
  hasSearched: boolean;
  loading: boolean;
  networkResults: NetworkSearchResult | null;
  resultCount: number;
  results: LocalPostResult[];
  syncStatus: SyncStatus[];
};

type SearchControllerOptions = { embedded?: boolean; initialMode?: SearchMode; initialQuery?: string };

type SearchRouteState = ReturnType<typeof parseSearchRouteState>;

function createSearchControllerState(): SearchControllerState {
  return {
    actorResults: null,
    error: null,
    hasSearched: false,
    loading: false,
    networkResults: null,
    resultCount: 0,
    results: [],
    syncStatus: [],
  };
}

function buildNetworkSearchParams(state: SearchRouteState): NetworkSearchParams {
  return {
    author: state.author || null,
    limit: PROFILE_SEARCH_LIMIT,
    mentions: state.mentions || null,
    query: state.q,
    since: state.since ? toLocalDayStartIso(state.since) : null,
    sort: state.sort,
    tags: state.tags,
    until: state.until ? toLocalDayUntilIso(state.until) : null,
  };
}

export function useSearchController(options: SearchControllerOptions = {}) {
  const location = useLocation();
  const navigate = useNavigate();
  const preferences = useAppPreferences();
  const session = useAppSession();
  const postNavigation = usePostNavigation();
  const [search, setSearch] = createStore<SearchControllerState>(createSearchControllerState());
  const [actorSearchContainerRef, setActorSearchContainerRef] = createSignal<HTMLDivElement>();
  const [searchInputRef, setSearchInputRef] = createSignal<HTMLInputElement>();
  let debounceTimer: ReturnType<typeof setTimeout> | undefined;

  const routeState = createMemo(() => {
    const parsed = parseSearchRouteState(location.search);

    if (!parsed.q && options.initialQuery) {
      parsed.q = options.initialQuery;
    }

    if (options.initialMode && !new URLSearchParams(location.search).has("mode")) {
      parsed.mode = options.initialMode;
    }

    return parsed;
  });

  const typeahead = useActorSuggestions({
    container: actorSearchContainerRef,
    disabled: () => routeState().tab !== "profiles",
    input: searchInputRef,
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
        const response = await SearchController.searchActors(searchQuery, PROFILE_SEARCH_LIMIT);
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
        const response = await SearchController.searchPosts(searchQuery, state.mode, LOCAL_SEARCH_LIMIT);
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

  function replaceRoute(next: Partial<SearchRouteState>) {
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
    typeahead.close();
    replaceRoute({ q: "" });
    clearResults();
    searchInputRef()?.focus();
  }

  function openActor(actor: Pick<ProfileViewBasic, "did" | "handle">) {
    void navigate(buildProfileRoute(getProfileRouteActor(actor)));
  }

  function openThread(uri: string) {
    void postNavigation.openPost(uri);
  }

  function handleKeyDown(event: KeyboardEvent) {
    if (routeState().tab === "profiles") {
      const handled = handleActorTypeaheadKeyDown(event, {
        onEscape: () => {
          if (routeState().q) {
            clearSearch();
            return;
          }

          typeahead.close();
        },
        onSelect: (suggestion) => {
          openActor(suggestion);
          typeahead.close();
        },
        typeahead,
      });

      if (handled) {
        return;
      }
    }

    if (
      routeState().tab === "posts" && event.key === "Tab" && !event.shiftKey
      && document.activeElement === searchInputRef()
    ) {
      event.preventDefault();
      cycleMode();
      return;
    }

    if (event.key === "Escape" && routeState().q) {
      clearSearch();
    }
  }

  function handleGlobalKeyDown(event: KeyboardEvent) {
    if (event.key !== "/" && !((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "f")) {
      return;
    }

    const target = event.target as HTMLElement;
    if (target.tagName === "INPUT" || target.tagName === "TEXTAREA") {
      return;
    }

    event.preventDefault();
    searchInputRef()?.focus();
  }

  function setSyncStatus(status: SyncStatus[]) {
    setSearch("syncStatus", status);
  }

  onMount(() => {
    if (!options.embedded) {
      document.addEventListener("keydown", handleGlobalKeyDown);
    }

    if (options.embedded && session.activeDid) {
      void SearchController.getSyncStatus(session.activeDid).then((status) => {
        setSearch("syncStatus", status);
      }).catch((error) => {
        logger.warn("failed to load embedded search sync status", { keyValues: { error: normalizeError(error) } });
      });
    }

    onCleanup(() => {
      if (!options.embedded) {
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
    }, SEARCH_DEBOUNCE_MS);
  });

  return {
    actions: {
      clearSearch,
      handleFilterChange,
      handleInput,
      handleKeyDown,
      handleModeChange,
      handleTabChange,
      openActor,
      openThread,
      setSyncStatus,
    },
    actorSuggestions: {
      activeIndex: typeahead.activeIndex,
      focus: typeahead.focus,
      open: typeahead.open,
      suggestions: typeahead.suggestions,
    },
    derived: {
      hasLocalPosts,
      isActorTab,
      isLocalMode,
      lastSync,
      networkFiltersEnabled,
      semanticEnabled,
      totalIndexedPosts,
    },
    refs: { setActorSearchContainerRef, setSearchInputRef },
    routeState,
    search,
    session: { activeDid: () => session.activeDid },
  };
}

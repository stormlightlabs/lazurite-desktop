import { usePostNavigation } from "$/components/posts/usePostNavigation";
import { LocalPostResultsList, LocalPostResultsSkeletons } from "$/components/search/LocalPostResultsList";
import { SearchEmptyState } from "$/components/search/SearchEmptyState";
import { SearchQueryInput } from "$/components/search/SearchQueryInput";
import { Icon } from "$/components/shared/Icon";
import { PostCount } from "$/components/shared/PostCount";
import { useAppSession } from "$/contexts/app-session";
import { SearchController } from "$/lib/api/search";
import type { LocalPostResult, SavedPostSource, SyncStatus } from "$/lib/api/types/search";
import { formatRelativeTime } from "$/lib/feeds";
import { subscribeBookmarkChanged } from "$/lib/post-events";
import { normalizeError } from "$/lib/utils/text";
import * as logger from "@tauri-apps/plugin-log";
import { createEffect, createMemo, createSignal, For, Match, onCleanup, Show, Switch } from "solid-js";
import { createStore } from "solid-js/store";
import { Motion, Presence } from "solid-motionone";

const PAGE_SIZE = 50;

const SEARCH_DEBOUNCE_MS = 300;

type TabKey = SavedPostSource;

type TabState = {
  error: string | null;
  items: LocalPostResult[];
  loaded: boolean;
  loading: boolean;
  loadingMore: boolean;
  nextOffset: number | null;
  total: number;
};

type SearchTabState = {
  error: string | null;
  items: LocalPostResult[];
  loadedQuery: string | null;
  loading: boolean;
  loadingMore: boolean;
  nextOffset: number | null;
  total: number;
};

type SavedPanelState = {
  query: string;
  refreshing: boolean;
  searchTabs: Record<TabKey, SearchTabState>;
  syncStatus: SyncStatus[];
  syncStatusLoading: boolean;
  tabs: Record<TabKey, TabState>;
};

const TAB_ITEMS: Array<{ key: TabKey; label: string }> = [{ key: "bookmark", label: "Saved" }, {
  key: "like",
  label: "Liked",
}];

function createTabState(): TabState {
  return { error: null, items: [], loaded: false, loading: false, loadingMore: false, nextOffset: null, total: 0 };
}

function createSearchTabState(): SearchTabState {
  return { error: null, items: [], loadedQuery: null, loading: false, loadingMore: false, nextOffset: null, total: 0 };
}

function createPanelState(): SavedPanelState {
  return {
    query: "",
    refreshing: false,
    searchTabs: { bookmark: createSearchTabState(), like: createSearchTabState() },
    syncStatus: [],
    syncStatusLoading: false,
    tabs: { bookmark: createTabState(), like: createTabState() },
  };
}

function LoadMoreButton(props: { next: number | null; onLoadMore: () => void; loadingMore: boolean }) {
  return (
    <Show when={props.next}>
      <div class="flex justify-center pt-2">
        <button
          type="button"
          class="inline-flex items-center gap-2 rounded-full border-0 bg-surface px-4 py-2.5 text-sm font-medium text-on-surface-variant transition duration-150 hover:-translate-y-px hover:text-on-surface disabled:cursor-not-allowed disabled:opacity-60"
          disabled={props.loadingMore}
          onClick={() => props.onLoadMore()}>
          <Show
            when={props.loadingMore}
            fallback={
              <>
                <Icon kind="bookmark" aria-hidden="true" />
                Load More
              </>
            }>
            <Icon iconClass="i-ri-loader-4-line animate-spin" aria-hidden="true" />
            Loading more...
          </Show>
        </button>
      </div>
    </Show>
  );
}

function SavedPostsMessage(props: { body: string; title: string }) {
  return (
    <Motion.div
      class="grid place-items-center px-6 py-16"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.15 }}>
      <div class="grid max-w-md gap-3 text-center">
        <p class="m-0 text-base font-medium text-on-surface">{props.title}</p>
        <p class="m-0 text-sm text-on-surface-variant">{props.body}</p>
      </div>
    </Motion.div>
  );
}

export function SavedPostsPanel() {
  const session = useAppSession();
  const postNavigation = usePostNavigation();
  const [activeTab, setActiveTab] = createSignal<TabKey>("bookmark");
  const [state, setState] = createStore<SavedPanelState>(createPanelState());
  const browseRequestIds: Record<TabKey, number> = { bookmark: 0, like: 0 };
  const searchRequestIds: Record<TabKey, number> = { bookmark: 0, like: 0 };
  const trimmedQuery = createMemo(() => state.query.trim());
  const isSearching = createMemo(() => trimmedQuery().length > 0);
  const activeTabState = createMemo(() => state.tabs[activeTab()]);
  const activeSearchState = createMemo(() => state.searchTabs[activeTab()]);
  const statusBySource = createMemo(() =>
    Object.fromEntries(state.syncStatus.map((status) => [status.source, status])) as Partial<Record<TabKey, SyncStatus>>
  );
  const totalIndexedPosts = createMemo(() =>
    state.syncStatus.reduce((sum, status) => sum + (status.postCount ?? 0), 0)
  );
  const lastSync = createMemo(() => {
    const timestamps = state.syncStatus.map((status) => status.lastSyncedAt).filter(Boolean) as string[];
    if (timestamps.length === 0) {
      return null;
    }

    return formatRelativeTime(timestamps.toSorted((left, right) => right.localeCompare(left))[0]);
  });
  const activeResultCount = createMemo(() => isSearching() ? activeSearchState().total : activeTabState().total);

  let activeDid: string | null = null;
  let debounceTimer: ReturnType<typeof setTimeout> | undefined;
  let searchInputRef: HTMLInputElement | undefined;

  createEffect(() => {
    void refreshForDid(session.activeDid);
  });

  onCleanup(() => clearTimeout(debounceTimer));

  createEffect(() => {
    const dispose = subscribeBookmarkChanged((detail) => {
      setState("tabs", "bookmark", "items", (items) => updateBookmarkResults(items, detail.uri, detail.bookmarked));
      setState(
        "searchTabs",
        "bookmark",
        "items",
        (items) => updateBookmarkResults(items, detail.uri, detail.bookmarked),
      );
      setState("tabs", "bookmark", "total", (current) => adjustBookmarkTotal(current, detail.bookmarked));
      setState("searchTabs", "bookmark", "total", (current) => adjustBookmarkTotal(current, detail.bookmarked));
    });
    onCleanup(dispose);
  });

  async function refreshForDid(did: string | null) {
    if (did === activeDid) {
      return;
    }

    activeDid = did;
    setActiveTab("bookmark");
    setState(createPanelState());

    if (!did) {
      return;
    }

    await Promise.all([loadSyncStatus(did), ensureActiveViewLoaded("bookmark", did)]);
  }

  async function loadSyncStatus(did = session.activeDid) {
    if (!did) {
      setState("syncStatus", []);
      return;
    }

    setState("syncStatusLoading", true);

    try {
      const status = await SearchController.getSyncStatus(did);
      if (did !== activeDid) {
        return;
      }

      setState("syncStatus", status);
    } catch (error) {
      logger.error("failed to load saved-post sync status", { keyValues: { did, error: normalizeError(error) } });
    } finally {
      if (did === activeDid) {
        setState("syncStatusLoading", false);
      }
    }
  }

  async function ensureActiveViewLoaded(source: TabKey, did = session.activeDid) {
    if (isSearching()) {
      await ensureSearchLoaded(source, trimmedQuery(), did);
      return;
    }

    await ensureBrowseLoaded(source, did);
  }

  async function ensureBrowseLoaded(source: TabKey, did = session.activeDid) {
    if (!did || state.tabs[source].loaded || state.tabs[source].loading) {
      return;
    }

    await loadBrowseTab(source, { did });
  }

  async function ensureSearchLoaded(source: TabKey, query: string, did = session.activeDid) {
    if (!did || !query) {
      return;
    }

    const current = state.searchTabs[source];
    if (current.loading || current.loadedQuery === query) {
      return;
    }

    await loadSearchTab(source, { did, query });
  }

  async function loadBrowseTab(source: TabKey, options: { append?: boolean; did?: string | null } = {}) {
    const did = options.did ?? session.activeDid;
    if (!did) {
      return;
    }

    const current = state.tabs[source];
    const offset = options.append ? current.nextOffset ?? 0 : 0;
    if (options.append && current.nextOffset === null) {
      return;
    }

    const requestId = ++browseRequestIds[source];
    setState("tabs", source, options.append ? "loadingMore" : "loading", true);
    setState("tabs", source, "error", null);

    try {
      const page = await SearchController.listSavedPosts(source, PAGE_SIZE, offset);
      if (did !== activeDid || requestId !== browseRequestIds[source]) {
        return;
      }

      setState("tabs", source, "items", options.append ? [...current.items, ...page.posts] : page.posts);
      setState("tabs", source, "total", page.total);
      setState("tabs", source, "nextOffset", page.nextOffset ?? null);
      setState("tabs", source, "loaded", true);
    } catch (error) {
      const message = normalizeError(error);
      if (did !== activeDid || requestId !== browseRequestIds[source]) {
        return;
      }

      setState("tabs", source, "error", message);
      logger.error("failed to load saved posts", { keyValues: { did, source, error: message } });
    } finally {
      if (did === activeDid && requestId === browseRequestIds[source]) {
        setState("tabs", source, "loading", false);
        setState("tabs", source, "loadingMore", false);
      }
    }
  }

  async function loadSearchTab(source: TabKey, options: { append?: boolean; did?: string | null; query: string }) {
    const did = options.did ?? session.activeDid;
    const query = options.query.trim();
    if (!did || !query) {
      return;
    }

    const current = state.searchTabs[source];
    const offset = options.append ? current.nextOffset ?? 0 : 0;
    if (options.append && current.nextOffset === null) {
      return;
    }

    const requestId = ++searchRequestIds[source];
    setState("searchTabs", source, options.append ? "loadingMore" : "loading", true);
    setState("searchTabs", source, "error", null);

    try {
      const page = await SearchController.listSavedPosts(source, PAGE_SIZE, offset, query);
      if (did !== activeDid || requestId !== searchRequestIds[source] || trimmedQuery() !== query) {
        return;
      }

      setState("searchTabs", source, "items", options.append ? [...current.items, ...page.posts] : page.posts);
      setState("searchTabs", source, "total", page.total);
      setState("searchTabs", source, "nextOffset", page.nextOffset ?? null);
      setState("searchTabs", source, "loadedQuery", query);
    } catch (error) {
      const message = normalizeError(error);
      if (did !== activeDid || requestId !== searchRequestIds[source] || trimmedQuery() !== query) {
        return;
      }

      setState("searchTabs", source, "error", message);
      logger.error("failed to search saved posts", { keyValues: { did, source, query, error: message } });
    } finally {
      if (did === activeDid && requestId === searchRequestIds[source] && trimmedQuery() === query) {
        setState("searchTabs", source, "loading", false);
        setState("searchTabs", source, "loadingMore", false);
      }
    }
  }

  function clearSearch() {
    clearTimeout(debounceTimer);
    setState("query", "");
    void ensureBrowseLoaded(activeTab());
    searchInputRef?.focus();
  }

  function handleSearchInput(value: string) {
    setState("query", value);
    clearTimeout(debounceTimer);

    const nextQuery = value.trim();
    if (!nextQuery) {
      void ensureBrowseLoaded(activeTab());
      return;
    }

    debounceTimer = setTimeout(() => {
      void loadSearchTab(activeTab(), { query: nextQuery });
    }, SEARCH_DEBOUNCE_MS);
  }

  function handleSearchKeyDown(event: KeyboardEvent) {
    if (event.key === "Escape" && state.query) {
      clearSearch();
    }
  }

  async function handleSelectTab(source: TabKey) {
    setActiveTab(source);
    await ensureActiveViewLoaded(source);
  }

  async function handleRefresh() {
    if (!session.activeDid || state.refreshing) {
      return;
    }

    setState("refreshing", true);

    try {
      await SearchController.syncPosts(session.activeDid, "bookmark");
      await SearchController.syncPosts(session.activeDid, "like");
      await Promise.all([
        loadSyncStatus(session.activeDid),
        isSearching()
          ? loadSearchTab(activeTab(), { did: session.activeDid, query: trimmedQuery() })
          : loadBrowseTab(activeTab(), { did: session.activeDid }),
      ]);
    } catch (error) {
      logger.error("failed to refresh saved posts", {
        keyValues: { did: session.activeDid, error: normalizeError(error) },
      });
    } finally {
      setState("refreshing", false);
    }
  }

  return (
    <article class="grid min-h-0 grid-rows-[auto_1fr] overflow-hidden rounded-4xl bg-surface-container shadow-[inset_0_0_0_1px_rgba(255,255,255,0.035)]">
      <SavedPostsHeader
        activeResultCount={activeResultCount()}
        activeTab={activeTab()}
        counts={{ bookmark: statusBySource().bookmark?.postCount ?? 0, like: statusBySource().like?.postCount ?? 0 }}
        loading={state.refreshing}
        onQueryChange={handleSearchInput}
        onRefresh={() => void handleRefresh()}
        onSearchClear={clearSearch}
        onSearchKeyDown={handleSearchKeyDown}
        onSelectTab={(tab) => void handleSelectTab(tab)}
        query={state.query}
        queryRef={(element) => {
          searchInputRef = element;
        }}
        searchLoading={activeSearchState().loading}
        searching={isSearching()}
        syncLoading={state.syncStatusLoading}
        totalIndexedPosts={totalIndexedPosts()}
        lastSync={lastSync()} />
      <SavedPostsViewport
        activeTab={activeTab()}
        browsingState={activeTabState()}
        onOpenThread={(uri) => void postNavigation.openPost(uri)}
        query={trimmedQuery()}
        searching={isSearching()}
        searchingState={activeSearchState()}
        onLoadMore={() => void (isSearching()
          ? loadSearchTab(activeTab(), { append: true, query: trimmedQuery() })
          : loadBrowseTab(activeTab(), { append: true }))} />
    </article>
  );
}

function updateBookmarkResults(items: LocalPostResult[], uri: string, bookmarked: boolean) {
  if (bookmarked) {
    return items;
  }

  return items.filter((item) => item.uri !== uri);
}

function adjustBookmarkTotal(total: number, bookmarked: boolean) {
  return bookmarked ? total : Math.max(0, total - 1);
}

function SavedPostsHeader(
  props: {
    activeResultCount: number;
    activeTab: TabKey;
    counts: Record<TabKey, number>;
    lastSync: string | null;
    loading: boolean;
    onQueryChange: (value: string) => void;
    onRefresh: () => void;
    onSearchClear: () => void;
    onSearchKeyDown: (event: KeyboardEvent) => void;
    onSelectTab: (tab: TabKey) => void;
    query: string;
    queryRef: (element: HTMLInputElement) => void;
    searchLoading: boolean;
    searching: boolean;
    syncLoading: boolean;
    totalIndexedPosts: number;
  },
) {
  return (
    <header class="grid gap-5 px-6 pb-4 pt-6">
      <div class="flex flex-wrap items-center justify-between gap-4">
        <div class="grid gap-1">
          <p class="overline-copy text-xs text-on-surface-variant">Library</p>
          <h1 class="m-0 text-xl font-semibold tracking-tight text-on-surface">Saved posts</h1>
          <Show
            when={props.syncLoading}
            fallback={<PostCount totalPosts={props.totalIndexedPosts} lastSync={props.lastSync} inline />}>
            <p class="m-0 text-xs text-on-surface-variant">Loading sync status...</p>
          </Show>
        </div>

        <button
          type="button"
          class="inline-flex h-10 items-center gap-2 rounded-full border-0 bg-surface-container-high px-4 text-sm font-medium text-on-surface-variant transition duration-150 hover:-translate-y-px hover:text-on-surface disabled:cursor-not-allowed disabled:opacity-60"
          disabled={props.loading}
          onClick={() => props.onRefresh()}>
          <Show when={props.loading} fallback={<Icon kind="refresh" aria-hidden="true" />}>
            <Icon iconClass="i-ri-loader-4-line animate-spin" aria-hidden="true" />
          </Show>
          <Show when={props.loading} fallback="Refresh">Refreshing...</Show>
        </button>
      </div>

      <SearchQueryInput
        error={null}
        inputRef={props.queryRef}
        loading={props.searchLoading}
        placeholder={props.activeTab === "bookmark" ? "Search saved posts..." : "Search liked posts..."}
        query={props.query}
        onClear={props.onSearchClear}
        onKeyDown={props.onSearchKeyDown}
        onQueryChange={props.onQueryChange} />

      <div class="flex items-center justify-between gap-4">
        <nav class="flex flex-wrap gap-2" aria-label="Saved post tabs">
          <For each={TAB_ITEMS}>
            {(tab) => (
              <button
                type="button"
                aria-pressed={props.activeTab === tab.key}
                class="inline-flex items-center gap-2 rounded-full border-0 px-4 py-2.5 text-sm font-medium transition duration-150"
                classList={{
                  "bg-surface text-primary shadow-[inset_0_0_0_1px_rgba(125,175,255,0.18)]":
                    props.activeTab === tab.key,
                  "bg-transparent text-on-surface-variant hover:bg-surface-container-high hover:text-on-surface":
                    props.activeTab !== tab.key,
                }}
                onClick={() => props.onSelectTab(tab.key)}>
                {tab.label}
                <span class="min-w-5 rounded-full bg-white/10 px-1.5 py-0.5 text-center text-[0.7rem] leading-none">
                  {props.counts[tab.key]}
                </span>
              </button>
            )}
          </For>
        </nav>

        <span class="text-xs text-on-surface-variant">
          <Show
            when={props.searching}
            fallback={`Browsing ${props.activeTab === "bookmark" ? "saved" : "liked"} posts`}>
            Found <span class="font-medium text-on-surface">{props.activeResultCount}</span> matches
          </Show>
        </span>
      </div>
    </header>
  );
}

function SavedPostsViewport(
  props: {
    activeTab: TabKey;
    browsingState: TabState;
    onOpenThread: (uri: string) => void;
    onLoadMore: () => void;
    query: string;
    searching: boolean;
    searchingState: SearchTabState;
  },
) {
  return (
    <div class="min-h-0 overflow-y-auto px-3 pb-3">
      <Presence>
        <Show when={props.activeTab === "bookmark"} keyed>
          <SavedPostsBody
            browsingState={props.browsingState}
            onOpenThread={props.onOpenThread}
            onLoadMore={props.onLoadMore}
            query={props.query}
            searching={props.searching}
            searchingState={props.searchingState}
            source={props.activeTab} />
        </Show>
        <Show when={props.activeTab === "like"} keyed>
          <SavedPostsBody
            browsingState={props.browsingState}
            onOpenThread={props.onOpenThread}
            onLoadMore={props.onLoadMore}
            query={props.query}
            searching={props.searching}
            searchingState={props.searchingState}
            source={props.activeTab} />
        </Show>
      </Presence>
    </div>
  );
}

function SavedPostsBody(
  props: {
    browsingState: TabState;
    onOpenThread: (uri: string) => void;
    onLoadMore: () => void;
    query: string;
    searching: boolean;
    searchingState: SearchTabState;
    source: TabKey;
  },
) {
  const activeState = createMemo(() => props.searching ? props.searchingState : props.browsingState);
  const emptyTitle = createMemo(() =>
    props.searching
      ? `No ${props.source === "bookmark" ? "saved" : "liked"} matches found`
      : `No ${props.source === "bookmark" ? "bookmarked" : "liked"} posts synced yet.`
  );

  return (
    <Motion.div
      class="grid gap-3"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.15 }}>
      <Switch>
        <Match when={activeState().loading && activeState().items.length === 0}>
          <LocalPostResultsSkeletons count={4} />
        </Match>
        <Match when={!!activeState().error}>
          <SavedPostsMessage
            body="Try the query again or refresh after syncing if the local archive is stale."
            title={activeState().error ?? "Search failed"} />
        </Match>
        <Match when={props.searching && activeState().items.length === 0}>
          <Motion.div
            class="grid place-items-center px-6 py-16"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.15 }}>
            <SearchEmptyState reason="no-results" scope="local" />
          </Motion.div>
        </Match>
        <Match when={!props.searching && activeState().items.length === 0}>
          <SavedPostsMessage
            body={`Refresh after syncing to populate your ${props.source === "bookmark" ? "saved" : "liked"} archive.`}
            title={emptyTitle()} />
        </Match>
        <Match when={activeState().items.length > 0}>
          <div class="grid gap-3">
            <LocalPostResultsList onOpenThread={props.onOpenThread} query={props.query} results={activeState().items} />
            <LoadMoreButton
              next={activeState().nextOffset}
              onLoadMore={props.onLoadMore}
              loadingMore={activeState().loadingMore} />
          </div>
        </Match>
      </Switch>
    </Motion.div>
  );
}

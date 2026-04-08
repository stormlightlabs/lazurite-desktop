import { ActorSuggestionList, getActorSuggestionHeadline } from "$/components/actors/ActorSearch";
import { AvatarBadge } from "$/components/AvatarBadge";
import { PostCard } from "$/components/feeds/PostCard";
import { Icon, SearchModeIcon } from "$/components/shared/Icon";
import type {
  ActorResult,
  ActorSearchResult,
  LocalPostResult,
  NetworkSearchResult,
  SearchMode,
} from "$/lib/api/types/search";
import type { PostSearchFilters, SearchTab } from "$/lib/search-routes";
import type { ProfileViewBasic } from "$/lib/types";
import { createContext, createEffect, createMemo, createSignal, For, Match, Show, Switch, useContext } from "solid-js";
import { Motion, Presence } from "solid-motionone";
import { PostCount } from "../shared/PostCount";
import { EmbeddingsSettings } from "./EmbeddingsSettings";
import { useSearchController } from "./hooks/useSearchController";
import { LocalPostResultsList, LocalPostResultsSkeletons } from "./LocalPostResultsList";
import { PostSearchFiltersRow } from "./PostSearchFilters";
import { SearchEmptyState } from "./SearchEmptyState";
import { SearchQueryInput } from "./SearchQueryInput";
import { SyncStatusPanel } from "./SyncStatusPanel";
import type { EmptyStateReason } from "./types";

const MODES: SearchMode[] = ["network", "keyword", "semantic", "hybrid"];

const SEARCH_TABS: SearchTab[] = ["posts", "profiles"];

type SearchPanelProps = { embedded?: boolean; initialMode?: SearchMode; initialQuery?: string };

type SearchPanelContextValue = ReturnType<typeof useSearchController>;

const SearchPanelContext = createContext<SearchPanelContextValue>();

type SearchHeaderState = {
  error: string | null;
  filters: PostSearchFilters;
  filtersEnabled: boolean;
  hasSearched: boolean;
  lastSync: string | null;
  loading: boolean;
  mode: SearchMode;
  query: string;
  resultCount: number;
  semanticEnabled: boolean;
  tab: SearchTab;
  totalIndexedPosts: number;
};

type SearchHeaderSuggestions = { activeIndex: number; items: ProfileViewBasic[]; open: boolean };

type SearchHeaderActions = {
  onActorSuggestionFocus: () => void;
  onActorSuggestionSelect: (suggestion: ProfileViewBasic) => void;
  onClear: () => void;
  onFilterChange: (next: Partial<PostSearchFilters>) => void;
  onKeyDown: (event: KeyboardEvent) => void;
  onModeChange: (mode: SearchMode) => void;
  onQueryChange: (value: string) => void;
  onTabChange: (tab: SearchTab) => void;
};

type SearchHeaderRefs = { actorContainerRef: (el: HTMLDivElement) => void; inputRef: (el: HTMLInputElement) => void };

type SearchViewState = {
  actorResults: ActorSearchResult | null;
  error: string | null;
  hasLocalPosts: boolean;
  hasSearched: boolean;
  isActorTab: boolean;
  isLocalMode: boolean;
  localResults: LocalPostResult[];
  networkResults: NetworkSearchResult | null;
  query: string;
};

type SearchViewActions = {
  onOpenActor: (actor: Pick<ProfileViewBasic, "did" | "handle">) => void;
  onOpenThread: (uri: string) => void;
};

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
  const controller = useSearchController(props);

  return (
    <SearchPanelContext.Provider value={controller}>
      <SearchPanelLayout embedded={!!props.embedded} />
    </SearchPanelContext.Provider>
  );
}

function useSearchPanelContext() {
  const context = useContext(SearchPanelContext);
  if (!context) {
    throw new Error("SearchPanel context is unavailable");
  }

  return context;
}

function SearchPanelLayout(props: { embedded: boolean }) {
  return (
    <div class="grid min-h-0 gap-6" classList={{ "xl:grid-cols-[minmax(0,1fr)_22rem]": !props.embedded }}>
      <SearchMainSurface embedded={props.embedded} />
      <SearchSidebar embedded={props.embedded} />
    </div>
  );
}

function SearchMainSurface(props: { embedded: boolean }) {
  return (
    <section
      class="grid min-h-0 grid-rows-[auto_1fr] overflow-hidden"
      classList={{
        "rounded-4xl bg-surface-container shadow-[inset_0_0_0_1px_rgba(255,255,255,0.035)]": !props.embedded,
      }}>
      <SearchHeaderSection />
      <SearchViewportSection />
    </section>
  );
}

function SearchHeaderSection() {
  const controller = useSearchPanelContext();
  const headerState = createMemo<SearchHeaderState>(() => {
    const routeState = controller.routeState();
    return {
      error: controller.search.error,
      filters: routeState,
      filtersEnabled: controller.derived.networkFiltersEnabled(),
      hasSearched: controller.search.hasSearched,
      lastSync: controller.derived.lastSync(),
      loading: controller.search.loading,
      mode: routeState.mode,
      query: routeState.q,
      resultCount: controller.search.resultCount,
      semanticEnabled: controller.derived.semanticEnabled(),
      tab: routeState.tab,
      totalIndexedPosts: controller.derived.totalIndexedPosts(),
    };
  });

  const headerSuggestions = createMemo<SearchHeaderSuggestions>(() => ({
    activeIndex: controller.actorSuggestions.activeIndex(),
    items: controller.actorSuggestions.suggestions(),
    open: controller.actorSuggestions.open(),
  }));

  return (
    <SearchHeader
      actions={{
        onActorSuggestionFocus: controller.actorSuggestions.focus,
        onActorSuggestionSelect: (suggestion) => controller.actions.openActor(suggestion),
        onClear: controller.actions.clearSearch,
        onFilterChange: controller.actions.handleFilterChange,
        onKeyDown: controller.actions.handleKeyDown,
        onModeChange: controller.actions.handleModeChange,
        onQueryChange: controller.actions.handleInput,
        onTabChange: controller.actions.handleTabChange,
      }}
      refs={{
        actorContainerRef: controller.refs.setActorSearchContainerRef,
        inputRef: controller.refs.setSearchInputRef,
      }}
      state={headerState()}
      suggestions={headerSuggestions()} />
  );
}

function SearchViewportSection() {
  const controller = useSearchPanelContext();
  const view = createMemo<SearchViewState>(() => {
    const routeState = controller.routeState();
    return {
      actorResults: controller.search.actorResults,
      error: controller.search.error,
      hasLocalPosts: controller.derived.hasLocalPosts(),
      hasSearched: controller.search.hasSearched,
      isActorTab: controller.derived.isActorTab(),
      isLocalMode: controller.derived.isLocalMode(),
      localResults: controller.search.results,
      networkResults: controller.search.networkResults,
      query: routeState.q,
    };
  });

  return (
    <SearchViewport
      actions={{ onOpenActor: controller.actions.openActor, onOpenThread: controller.actions.openThread }}
      loading={controller.search.loading}
      view={view()} />
  );
}

function SearchSidebar(props: { embedded: boolean }) {
  const controller = useSearchPanelContext();

  return (
    <Show when={!props.embedded}>
      <aside class="grid content-start gap-3 overflow-y-auto xl:sticky xl:top-0 xl:max-h-[calc(100vh-2rem)] xl:pr-1">
        <Show when={controller.session.activeDid()}>
          {(did) => (
            <SyncStatusPanel
              did={did()}
              onStatusChange={(status) => controller.actions.setSyncStatus(status)} />
          )}
        </Show>
        <EmbeddingsSettings />
        <SearchTipsCard />
      </aside>
    </Show>
  );
}

function SearchHeader(
  props: {
    actions: SearchHeaderActions;
    refs: SearchHeaderRefs;
    state: SearchHeaderState;
    suggestions: SearchHeaderSuggestions;
  },
) {
  return (
    <header class="grid gap-4 px-6 pb-5 pt-6">
      <SearchTabSelector activeTab={props.state.tab} onTabChange={props.actions.onTabChange} />
      <SearchQuerySection
        actions={props.actions}
        refs={props.refs}
        state={props.state}
        suggestions={props.suggestions} />
      <SearchModeRow
        mode={props.state.mode}
        semanticEnabled={props.state.semanticEnabled}
        tab={props.state.tab}
        onModeChange={props.actions.onModeChange} />
      <SearchFiltersSection
        filters={props.state.filters}
        filtersEnabled={props.state.filtersEnabled}
        tab={props.state.tab}
        onFilterChange={props.actions.onFilterChange} />
      <ResultMeta
        hasSearched={props.state.hasSearched}
        isActorTab={props.state.tab === "profiles"}
        lastSync={props.state.lastSync}
        mode={props.state.mode}
        resultCount={props.state.resultCount}
        totalIndexedPosts={props.state.totalIndexedPosts} />
    </header>
  );
}

function SearchQuerySection(
  props: {
    actions: SearchHeaderActions;
    refs: SearchHeaderRefs;
    state: SearchHeaderState;
    suggestions: SearchHeaderSuggestions;
  },
) {
  const placeholder = createMemo(() => {
    if (props.state.tab === "profiles") {
      return "Search profiles by handle or display name...";
    }

    return props.state.mode === "network"
      ? "Search public posts across Bluesky..."
      : "Search your saved & liked posts...";
  });

  return (
    <div ref={props.refs.actorContainerRef} class="relative">
      <SearchQueryInput
        a11y={{
          ariaActivedescendant: props.state.tab === "profiles" && props.suggestions.activeIndex >= 0
            ? `search-actor-suggestions-option-${props.suggestions.activeIndex}`
            : undefined,
          ariaAutocomplete: props.state.tab === "profiles" ? "list" : undefined,
          ariaControls: props.state.tab === "profiles" ? "search-actor-suggestions" : undefined,
          ariaExpanded: props.state.tab === "profiles" ? props.suggestions.open : undefined,
          autocomplete: props.state.tab === "profiles" ? "off" : undefined,
          role: props.state.tab === "profiles" ? "combobox" : undefined,
          spellcheck: false,
        }}
        actions={{
          onClear: props.actions.onClear,
          onFocus: props.state.tab === "profiles" ? props.actions.onActorSuggestionFocus : undefined,
          onKeyDown: props.actions.onKeyDown,
          onQueryChange: props.actions.onQueryChange,
        }}
        refs={{ inputRef: props.refs.inputRef }}
        state={{
          error: props.state.error,
          loading: props.state.loading,
          placeholder: placeholder(),
          query: props.state.query,
        }}>
        <Show when={props.state.tab === "profiles"}>
          <ActorSuggestionList
            activeIndex={props.suggestions.activeIndex}
            id="search-actor-suggestions"
            open={props.suggestions.open}
            suggestions={props.suggestions.items}
            title="Suggested profiles"
            onSelect={props.actions.onActorSuggestionSelect} />
        </Show>
      </SearchQueryInput>
    </div>
  );
}

function SearchModeRow(
  props: { mode: SearchMode; semanticEnabled: boolean; tab: SearchTab; onModeChange: (mode: SearchMode) => void },
) {
  return (
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
  );
}

function SearchFiltersSection(
  props: {
    filters: PostSearchFilters;
    filtersEnabled: boolean;
    tab: SearchTab;
    onFilterChange: (next: Partial<PostSearchFilters>) => void;
  },
) {
  return (
    <Show when={props.filtersEnabled} fallback={<NetworkFiltersNotice tab={props.tab} />}>
      <PostSearchFiltersRow
        collapsible
        defaultExpanded={hasAdvancedNetworkFilters(props.filters)}
        filters={props.filters}
        helperText="Filters update the URL and apply to network post search."
        onChange={props.onFilterChange} />
    </Show>
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
    <Show
      when={props.tab === "posts"}
      fallback={
        <span class="text-xs text-on-surface-variant">
          <kbd class="rounded bg-white/10 px-1.5 py-0.5">↑↓</kbd> to navigate suggestions
        </span>
      }>
      <span class="text-xs text-on-surface-variant">
        <kbd class="rounded bg-white/10 px-1.5 py-0.5">Tab</kbd> to switch modes
      </span>
    </Show>
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
            <Show
              when={tab === "posts"}
              fallback={
                <>
                  <Icon kind="profile" class="text-sm" />
                  <span>Profiles</span>
                </>
              }>
              <Icon kind="search" class="text-sm" />
              <span>Posts</span>
            </Show>
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
          fallback={
            <Switch fallback={"Search your liked and bookmarked posts locally, or search the network."}>
              <Match when={props.isActorTab}>Search people across Bluesky by handle or display name.</Match>
              <Match when={props.mode === "network"}>
                Search public posts across Bluesky or switch to your synced archive.
              </Match>
            </Switch>
          }>
          <span>
            Found <span class="font-medium text-on-surface">{props.resultCount}</span>{" "}
            <Show when={props.isActorTab} fallback={"results"}>profiles</Show>
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

function SearchViewport(props: { actions: SearchViewActions; loading: boolean; view: SearchViewState }) {
  return (
    <div class="min-h-0 overflow-y-auto px-3 pb-3">
      <Show when={props.loading} fallback={<SearchState actions={props.actions} view={props.view} />}>
        <LocalPostResultsSkeletons />
      </Show>
    </div>
  );
}

function SearchState(props: { actions: SearchViewActions; view: SearchViewState }) {
  const scope = () => {
    if (props.view.isActorTab) {
      return "profiles";
    } else if (props.view.isLocalMode) {
      return "local";
    } else {
      return "network";
    }
  };

  return (
    <Presence>
      <Switch>
        <Match when={props.view.error && props.view.query}>
          <EmptyStateView reason="error" scope={scope()} />
        </Match>
        <Match when={!props.view.isActorTab && props.view.isLocalMode && !props.view.hasLocalPosts}>
          <EmptyStateView reason="no-sync" scope="local" />
        </Match>
        <Match when={!props.view.hasSearched && !props.view.query}>
          <EmptyStateView reason="initial" scope={scope()} />
        </Match>
        <Match when={props.view.isActorTab && props.view.actorResults?.actors.length === 0}>
          <EmptyStateView reason="no-results" scope="profiles" />
        </Match>
        <Match when={!props.view.isActorTab && props.view.isLocalMode && props.view.localResults.length === 0}>
          <EmptyStateView reason="no-results" scope="local" />
        </Match>
        <Match
          when={!props.view.isActorTab && !props.view.isLocalMode && props.view.networkResults?.posts.length === 0}>
          <EmptyStateView reason="no-results" scope="network" />
        </Match>
        <Match when={props.view.isActorTab && props.view.actorResults}>
          <ActorResultsList onOpenActor={props.actions.onOpenActor} results={props.view.actorResults} />
        </Match>
        <Match when={props.view.isLocalMode}>
          <LocalPostResultsList
            onOpenThread={props.actions.onOpenThread}
            query={props.view.query}
            results={props.view.localResults} />
        </Match>
        <Match when={!props.view.isLocalMode && props.view.networkResults}>
          <NetworkResultsList onOpenThread={props.actions.onOpenThread} results={props.view.networkResults} />
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

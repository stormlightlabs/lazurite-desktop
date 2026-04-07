import { ActorSuggestionList, useActorSuggestions } from "$/components/actors/actor-search";
import { FeedController } from "$/lib/api/feeds";
import type { ColumnKind } from "$/lib/api/types/columns";
import type { SearchMode } from "$/lib/api/types/search";
import { getFeedName } from "$/lib/feeds";
import type { FeedGeneratorView, LoginSuggestion, SavedFeedItem } from "$/lib/types";
import * as logger from "@tauri-apps/plugin-log";
import { createEffect, createSignal, For, Match, onCleanup, onMount, Show, Switch } from "solid-js";
import { Portal } from "solid-js/web";
import { Motion, Presence } from "solid-motionone";
import { FeedChipAvatar } from "../feeds/FeedChipAvatar";
import { Icon, SearchModeIcon } from "../shared/Icon";

type AddColumnPanelProps = { onAdd: (kind: ColumnKind, config: string) => void; onClose: () => void; open: boolean };

type PanelTab = ColumnKind;

type FeedPickerSelection = { feed: SavedFeedItem; title: string };

function feedKindLabel(feed: SavedFeedItem) {
  switch (feed.type) {
    case "timeline": {
      return "Timeline";
    }
    case "list": {
      return "List";
    }
    default: {
      return "Feed";
    }
  }
}

function FeedPicker(props: { onSelect: (selection: FeedPickerSelection) => void }) {
  const [feeds, setFeeds] = createSignal<SavedFeedItem[]>([]);
  const [generators, setGenerators] = createSignal<Record<string, FeedGeneratorView>>({});
  const [loading, setLoading] = createSignal(true);

  onMount(async () => {
    try {
      const prefs = await FeedController.getPreferences();
      setFeeds(prefs.savedFeeds);

      const uris = [...new Set(prefs.savedFeeds.filter((feed) => feed.type === "feed").map((feed) => feed.value))];
      if (uris.length > 0) {
        const hydrated = await FeedController.getFeedGenerators(uris);
        setGenerators(Object.fromEntries(hydrated.feeds.map((generator) => [generator.uri, generator])));
      }
    } catch (err) {
      logger.error(`Failed to load feeds for column picker: ${String(err)}`);
    } finally {
      setLoading(false);
    }
  });

  return (
    <div class="grid gap-2">
      <Show when={loading()}>
        <div class="flex items-center justify-center py-6">
          <span class="flex items-center text-on-surface-variant">
            <i class="i-ri-loader-4-line animate-spin" />
          </span>
        </div>
      </Show>

      <Show when={!loading() && feeds().length === 0}>
        <p class="py-4 text-center text-sm text-on-surface-variant">No saved feeds found.</p>
      </Show>

      <For
        each={feeds()}
        fallback={
          <Show when={!loading()}>
            <p class="py-4 text-center text-sm text-on-surface-variant">No saved feeds found.</p>
          </Show>
        }>
        {(feed) => (
          <button
            type="button"
            class="flex w-full items-center gap-3 rounded-xl border-0 bg-white/4 px-4 py-3 text-left transition duration-150 hover:-translate-y-px hover:bg-white/8"
            onClick={() => props.onSelect({ feed, title: getFeedName(feed, generators()[feed.value]?.displayName) })}>
            <FeedChipAvatar feed={feed} generator={generators()[feed.value]} />
            <span class="min-w-0 flex-1">
              <span class="block truncate text-sm font-medium text-on-surface">
                {getFeedName(feed, generators()[feed.value]?.displayName)}
              </span>
              <span class="block truncate text-xs text-on-surface-variant">{feedKindLabel(feed)}</span>
            </span>
          </button>
        )}
      </For>
    </div>
  );
}

function ExplorerPicker(props: { onSubmit: (uri: string) => void }) {
  const [value, setValue] = createSignal("");

  function handleSubmit(e: Event) {
    e.preventDefault();
    const uri = value().trim();
    if (uri) {
      props.onSubmit(uri);
    }
  }

  return (
    <form onSubmit={handleSubmit} class="grid gap-3">
      <label class="grid gap-1.5">
        <span class="text-xs font-medium uppercase tracking-wide text-on-surface-variant">
          Target URI / handle / DID / PDS URL
        </span>
        <input
          type="text"
          class="rounded-xl border-0 bg-white/6 px-4 py-2.5 text-sm text-on-surface placeholder:text-on-surface-variant/50 shadow-[inset_0_0_0_1px_rgba(255,255,255,0.06)] outline-none focus:shadow-[inset_0_0_0_1px_rgba(125,175,255,0.4)]"
          placeholder="at://did:plc:… or handle.bsky.social"
          value={value()}
          onInput={(e) => setValue(e.currentTarget.value)} />
      </label>

      <button
        type="submit"
        disabled={!value().trim()}
        class="flex items-center justify-center gap-2 rounded-xl border-0 bg-primary/15 px-4 py-2.5 text-sm font-medium text-primary transition duration-150 hover:-translate-y-px hover:bg-primary/25 disabled:cursor-not-allowed disabled:opacity-40">
        <span class="flex items-center">
          <i class="i-ri-compass-discover-line" />
        </span>
        Open in column
      </button>
    </form>
  );
}

function DiagnosticsPicker(props: { onSubmit: (did: string) => void }) {
  const [value, setValue] = createSignal("");

  function handleSubmit(e: Event) {
    e.preventDefault();
    const did = value().trim();
    if (did) {
      props.onSubmit(did);
    }
  }

  return (
    <form onSubmit={handleSubmit} class="grid gap-3">
      <label class="grid gap-1.5">
        <span class="text-xs font-medium uppercase tracking-wide text-on-surface-variant">Handle or DID</span>
        <input
          type="text"
          class="rounded-xl border-0 bg-white/6 px-4 py-2.5 text-sm text-on-surface placeholder:text-on-surface-variant/50 shadow-[inset_0_0_0_1px_rgba(255,255,255,0.06)] outline-none focus:shadow-[inset_0_0_0_1px_rgba(125,175,255,0.4)]"
          placeholder="handle.bsky.social or did:plc:…"
          value={value()}
          onInput={(e) => setValue(e.currentTarget.value)} />
      </label>

      <button
        type="submit"
        disabled={!value().trim()}
        class="flex items-center justify-center gap-2 rounded-xl border-0 bg-primary/15 px-4 py-2.5 text-sm font-medium text-primary transition duration-150 hover:-translate-y-px hover:bg-primary/25 disabled:cursor-not-allowed disabled:opacity-40">
        <span class="flex items-center">
          <i class="i-ri-stethoscope-line" />
        </span>
        Open diagnostics
      </button>
    </form>
  );
}

function MessagesPicker(props: { onSubmit: () => void }) {
  return (
    <div class="grid gap-4">
      <div class="rounded-2xl bg-white/4 p-4 shadow-[inset_0_0_0_1px_rgba(255,255,255,0.04)]">
        <div class="flex items-start gap-3">
          <span class="mt-0.5 flex items-center text-primary">
            <i class="i-ri-message-3-line" />
          </span>
          <div class="grid gap-1.5">
            <p class="m-0 text-sm font-medium text-on-surface">Direct messages</p>
            <p class="m-0 text-xs leading-relaxed text-on-surface-variant">
              Opens your DM inbox inside the deck. Message content is blurred until you hover or focus the column.
            </p>
          </div>
        </div>
      </div>

      <button
        type="button"
        class="flex items-center justify-center gap-2 rounded-xl border-0 bg-primary/15 px-4 py-2.5 text-sm font-medium text-primary transition duration-150 hover:-translate-y-px hover:bg-primary/25"
        onClick={() => props.onSubmit()}>
        <span class="flex items-center">
          <i class="i-ri-layout-column-line" />
        </span>
        Add DM column
      </button>
    </div>
  );
}

function SearchModeButton(props: { active: boolean; disabled?: boolean; mode: SearchMode; onClick: () => void }) {
  return (
    <button
      type="button"
      disabled={props.disabled}
      class="inline-flex items-center justify-center gap-2 rounded-xl border-0 px-3 py-2 text-xs font-medium transition duration-150 disabled:cursor-not-allowed disabled:opacity-40"
      classList={{
        "bg-primary/15 text-primary": props.active,
        "bg-white/4 text-on-surface-variant hover:bg-white/8 hover:text-on-surface": !props.active && !props.disabled,
      }}
      onClick={() => props.onClick()}>
      <SearchModeIcon mode={props.mode} class="text-sm" />
      <span class="capitalize">{props.mode}</span>
    </button>
  );
}

function SearchPicker(props: { onSubmit: (query: string, mode: SearchMode) => void }) {
  const [mode, setMode] = createSignal<SearchMode>("network");
  const [query, setQuery] = createSignal("");

  function handleSubmit(event: Event) {
    event.preventDefault();
    const trimmed = query().trim();
    if (!trimmed) {
      return;
    }

    props.onSubmit(trimmed, mode());
  }

  return (
    <form onSubmit={handleSubmit} class="grid gap-3">
      <label class="grid gap-1.5">
        <span class="text-xs font-medium uppercase tracking-wide text-on-surface-variant">Search query</span>
        <input
          type="text"
          class="rounded-xl border-0 bg-white/6 px-4 py-2.5 text-sm text-on-surface placeholder:text-on-surface-variant/50 shadow-[inset_0_0_0_1px_rgba(255,255,255,0.06)] outline-none focus:shadow-[inset_0_0_0_1px_rgba(125,175,255,0.4)]"
          placeholder="from:alice at protocol"
          value={query()}
          onInput={(event) => setQuery(event.currentTarget.value)} />
      </label>

      <div class="grid gap-1.5">
        <span class="text-xs font-medium uppercase tracking-wide text-on-surface-variant">Search mode</span>
        <div class="grid grid-cols-2 gap-2">
          <SearchModeButton active={mode() === "network"} mode="network" onClick={() => setMode("network")} />
          <SearchModeButton active={mode() === "keyword"} mode="keyword" onClick={() => setMode("keyword")} />
          <SearchModeButton active={mode() === "semantic"} mode="semantic" onClick={() => setMode("semantic")} />
          <SearchModeButton active={mode() === "hybrid"} mode="hybrid" onClick={() => setMode("hybrid")} />
        </div>
      </div>

      <button
        type="submit"
        disabled={!query().trim()}
        class="flex items-center justify-center gap-2 rounded-xl border-0 bg-primary/15 px-4 py-2.5 text-sm font-medium text-primary transition duration-150 hover:-translate-y-px hover:bg-primary/25 disabled:cursor-not-allowed disabled:opacity-40">
        <span class="flex items-center">
          <i class="i-ri-search-line" />
        </span>
        Open search column
      </button>
    </form>
  );
}

function ProfilePicker(
  props: {
    onSubmit: (
      selection: { actor: string; did?: string | null; displayName?: string | null; handle?: string | null },
    ) => void;
  },
) {
  let container: HTMLDivElement | undefined;
  let input: HTMLInputElement | undefined;
  const [value, setValue] = createSignal("");
  const typeahead = useActorSuggestions({
    container: () => container,
    input: () => input,
    onError: (error) => logger.warn(`Failed to load profile suggestions: ${String(error)}`),
    value,
  });

  function submitManualActor() {
    const actor = value().trim();
    if (!actor) {
      return;
    }

    typeahead.close();
    props.onSubmit({ actor });
  }

  function submitSuggestion(suggestion: LoginSuggestion) {
    typeahead.close();
    props.onSubmit({
      actor: suggestion.handle,
      did: suggestion.did,
      displayName: suggestion.displayName ?? null,
      handle: suggestion.handle,
    });
  }

  function handleKeyDown(event: KeyboardEvent) {
    if (event.key === "ArrowDown") {
      event.preventDefault();
      typeahead.moveActiveIndex(1);
      return;
    }

    if (event.key === "ArrowUp") {
      event.preventDefault();
      typeahead.moveActiveIndex(-1);
      return;
    }

    if (event.key === "Escape") {
      typeahead.close();
      return;
    }

    if (event.key === "Enter" && typeahead.open() && typeahead.activeSuggestion()) {
      event.preventDefault();
      submitSuggestion(typeahead.activeSuggestion() as LoginSuggestion);
    }
  }

  return (
    <form
      class="grid gap-3"
      onSubmit={(event) => {
        event.preventDefault();
        submitManualActor();
      }}>
      <label class="grid gap-1.5">
        <span class="text-xs font-medium uppercase tracking-wide text-on-surface-variant">Handle or DID</span>
        <div
          class="relative"
          ref={(element) => {
            container = element as HTMLDivElement;
          }}>
          <input
            ref={(element) => {
              input = element;
            }}
            type="text"
            role="combobox"
            aria-autocomplete="list"
            aria-controls="profile-suggestions"
            aria-activedescendant={typeahead.activeIndex() >= 0
              ? `profile-suggestions-option-${typeahead.activeIndex()}`
              : undefined}
            aria-expanded={typeahead.open()}
            class="w-full rounded-xl border-0 bg-white/6 px-4 py-2.5 pr-10 text-sm text-on-surface placeholder:text-on-surface-variant/50 shadow-[inset_0_0_0_1px_rgba(255,255,255,0.06)] outline-none focus:shadow-[inset_0_0_0_1px_rgba(125,175,255,0.4)]"
            placeholder="alice.bsky.social"
            spellcheck={false}
            value={value()}
            onFocus={() => typeahead.focus()}
            onInput={(event) => setValue(event.currentTarget.value)}
            onKeyDown={(event) => handleKeyDown(event)} />

          <TypeaheadLoading visible={typeahead.loading()} />
          <ActorSuggestionList
            activeIndex={typeahead.activeIndex()}
            id="profile-suggestions"
            open={typeahead.open()}
            suggestions={typeahead.suggestions()}
            title="Suggested profiles"
            onSelect={submitSuggestion} />
        </div>
      </label>

      <button
        type="submit"
        disabled={!value().trim()}
        class="flex items-center justify-center gap-2 rounded-xl border-0 bg-primary/15 px-4 py-2.5 text-sm font-medium text-primary transition duration-150 hover:-translate-y-px hover:bg-primary/25 disabled:cursor-not-allowed disabled:opacity-40">
        <span class="flex items-center">
          <i class="i-ri-user-3-line" />
        </span>
        Open profile
      </button>
    </form>
  );
}

function TypeaheadLoading(props: { visible: boolean }) {
  return (
    <Show when={props.visible}>
      <span class="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-on-surface-variant">
        <Icon kind="loader" class="animate-spin text-sm" />
      </span>
    </Show>
  );
}

function PanelContent(
  props: {
    tab: PanelTab;
    onFeedSelect: (selection: FeedPickerSelection) => void;
    onExplorerSubmit: (uri: string) => void;
    onDiagnosticsSubmit: (did: string) => void;
    onMessagesSubmit: () => void;
    onProfileSubmit: (
      selection: { actor: string; did?: string | null; displayName?: string | null; handle?: string | null },
    ) => void;
    onSearchSubmit: (query: string, mode: SearchMode) => void;
  },
) {
  return (
    <div class="min-h-0 flex-1 overflow-y-auto px-4 pb-6">
      <Switch>
        <Match when={props.tab === "feed"}>
          <FeedPicker onSelect={props.onFeedSelect} />
        </Match>

        <Match when={props.tab === "explorer"}>
          <ExplorerPicker onSubmit={props.onExplorerSubmit} />
        </Match>

        <Match when={props.tab === "diagnostics"}>
          <DiagnosticsPicker onSubmit={props.onDiagnosticsSubmit} />
        </Match>

        <Match when={props.tab === "messages"}>
          <MessagesPicker onSubmit={props.onMessagesSubmit} />
        </Match>

        <Match when={props.tab === "search"}>
          <SearchPicker onSubmit={props.onSearchSubmit} />
        </Match>

        <Match when={props.tab === "profile"}>
          <ProfilePicker onSubmit={props.onProfileSubmit} />
        </Match>
      </Switch>
    </div>
  );
}

function AddColumnPanelHeader(props: { onClose: () => void }) {
  return (
    <div class="flex shrink-0 items-center justify-between gap-3 px-5 py-4 shadow-[inset_0_-1px_0_rgba(255,255,255,0.04)]">
      <div>
        <p id="add-column-panel-title" class="m-0 text-sm font-semibold text-on-surface">Add column</p>
        <p class="m-0 mt-1 text-xs uppercase tracking-[0.12em] text-on-surface-variant">Choose a view</p>
      </div>
      <button
        type="button"
        class="flex h-8 w-8 items-center justify-center rounded-full border-0 bg-transparent text-on-surface-variant transition duration-150 hover:bg-white/6 hover:text-on-surface"
        aria-label="Close panel"
        onClick={() => props.onClose()}>
        <Icon kind="close" />
      </button>
    </div>
  );
}

function AddColumnPanelTabs(
  props: {
    activeTab: PanelTab;
    onTabChange: (tab: PanelTab) => void;
    tabs: Array<{ icon: string; id: PanelTab; label: string }>;
  },
) {
  return (
    <div class="grid shrink-0 grid-cols-2 gap-1 px-5 py-3">
      <For each={props.tabs}>
        {(tab) => (
          <button
            type="button"
            class="flex items-center justify-center gap-1.5 rounded-lg border-0 px-3 py-2 text-xs font-medium transition duration-150"
            classList={{
              "bg-primary/15 text-primary": props.activeTab === tab.id,
              "bg-transparent text-on-surface-variant hover:bg-white/5 hover:text-on-surface":
                props.activeTab !== tab.id,
            }}
            onClick={() => props.onTabChange(tab.id)}>
            <span class="flex items-center">
              <i class={tab.icon} />
            </span>
            {tab.label}
          </button>
        )}
      </For>
    </div>
  );
}

function AddColumnPanelBody(
  props: {
    activeTab: PanelTab;
    onClose: () => void;
    onDiagnosticsSubmit: (did: string) => void;
    onExplorerSubmit: (uri: string) => void;
    onFeedSelect: (selection: FeedPickerSelection) => void;
    onMessagesSubmit: () => void;
    onProfileSubmit: (
      selection: { actor: string; did?: string | null; displayName?: string | null; handle?: string | null },
    ) => void;
    onSearchSubmit: (query: string, mode: SearchMode) => void;
    onTabChange: (tab: PanelTab) => void;
    tabs: Array<{ icon: string; id: PanelTab; label: string }>;
  },
) {
  return (
    <Motion.aside
      role="dialog"
      aria-modal="true"
      aria-labelledby="add-column-panel-title"
      class="relative z-10 flex h-full w-full max-w-88 flex-col bg-surface-container-highest shadow-[-18px_0_48px_rgba(0,0,0,0.38)] backdrop-blur-[20px]"
      initial={{ opacity: 0, x: 32 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: 40 }}
      transition={{ duration: 0.22, easing: [0.32, 0.72, 0, 1] }}>
      <AddColumnPanelHeader onClose={props.onClose} />
      <AddColumnPanelTabs activeTab={props.activeTab} tabs={props.tabs} onTabChange={props.onTabChange} />
      <PanelContent
        tab={props.activeTab}
        onFeedSelect={props.onFeedSelect}
        onExplorerSubmit={props.onExplorerSubmit}
        onDiagnosticsSubmit={props.onDiagnosticsSubmit}
        onMessagesSubmit={props.onMessagesSubmit}
        onProfileSubmit={props.onProfileSubmit}
        onSearchSubmit={props.onSearchSubmit} />
    </Motion.aside>
  );
}

export function AddColumnPanel(props: AddColumnPanelProps) {
  const [activeTab, setActiveTab] = createSignal<PanelTab>("feed");

  function handleFeedSelect(selection: FeedPickerSelection) {
    const config = JSON.stringify({
      feedType: selection.feed.type,
      feedUri: selection.feed.value,
      title: selection.title,
    });
    props.onAdd("feed", config);
  }

  function handleExplorerSubmit(uri: string) {
    const config = JSON.stringify({ targetUri: uri });
    props.onAdd("explorer", config);
  }

  function handleDiagnosticsSubmit(did: string) {
    const config = JSON.stringify({ did });
    props.onAdd("diagnostics", config);
  }

  function handleMessagesSubmit() {
    props.onAdd("messages", JSON.stringify({}));
  }

  function handleSearchSubmit(query: string, mode: SearchMode) {
    props.onAdd("search", JSON.stringify({ mode, query }));
  }

  function handleProfileSubmit(
    selection: { actor: string; did?: string | null; displayName?: string | null; handle?: string | null },
  ) {
    props.onAdd("profile", JSON.stringify(selection));
  }

  const tabs: Array<{ icon: string; id: PanelTab; label: string }> = [
    { icon: "i-ri-rss-line", id: "feed", label: "Feed" },
    { icon: "i-ri-compass-discover-line", id: "explorer", label: "Explorer" },
    { icon: "i-ri-stethoscope-line", id: "diagnostics", label: "Diagnostics" },
    { icon: "i-ri-message-3-line", id: "messages", label: "DMs" },
    { icon: "i-ri-search-line", id: "search", label: "Search" },
    { icon: "i-ri-user-3-line", id: "profile", label: "Profile" },
  ];

  createEffect(() => {
    if (!props.open) {
      setActiveTab("feed");
      return;
    }

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        props.onClose();
      }
    };

    globalThis.addEventListener("keydown", handleKeyDown);
    onCleanup(() => globalThis.removeEventListener("keydown", handleKeyDown));
  });

  return (
    <Presence exitBeforeEnter>
      <Show when={props.open}>
        <Portal>
          <div class="fixed inset-0 z-50 flex justify-end">
            <Motion.div
              class="absolute inset-0 bg-black/45 backdrop-blur-[20px]"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.15 }}
              onClick={() => props.onClose()} />

            <AddColumnPanelBody
              activeTab={activeTab()}
              tabs={tabs}
              onClose={props.onClose}
              onTabChange={setActiveTab}
              onFeedSelect={handleFeedSelect}
              onExplorerSubmit={handleExplorerSubmit}
              onDiagnosticsSubmit={handleDiagnosticsSubmit}
              onMessagesSubmit={handleMessagesSubmit}
              onProfileSubmit={handleProfileSubmit}
              onSearchSubmit={handleSearchSubmit} />
          </div>
        </Portal>
      </Show>
    </Presence>
  );
}

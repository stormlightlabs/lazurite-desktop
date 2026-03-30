import type { ColumnKind } from "$/lib/api/columns";
import { getPreferences } from "$/lib/api/feeds";
import { getFeedName } from "$/lib/feeds";
import type { SavedFeedItem } from "$/lib/types";
import * as logger from "@tauri-apps/plugin-log";
import { createSignal, For, Match, onMount, Show, Switch } from "solid-js";
import { Motion, Presence } from "solid-motionone";
import { Icon } from "../shared/Icon";

type AddColumnPanelProps = { onAdd: (kind: ColumnKind, config: string) => void; onClose: () => void; open: boolean };

type PanelTab = "feed" | "explorer" | "diagnostics";

function FeedPicker(props: { onSelect: (feed: SavedFeedItem) => void }) {
  const [feeds, setFeeds] = createSignal<SavedFeedItem[]>([]);
  const [loading, setLoading] = createSignal(true);

  onMount(async () => {
    try {
      const prefs = await getPreferences();
      setFeeds(prefs.savedFeeds);
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
            onClick={() => props.onSelect(feed)}>
            <Switch>
              <Match when={feed.type === "timeline"}>
                <Icon kind="timeline" class="text-primary" />
              </Match>
              <Match when={feed.type === "list"}>
                <Icon kind="list" class="text-primary" />
              </Match>
              <Match when={feed.type === "feed"}>
                <Icon kind="rss" class="text-primary" />
              </Match>
            </Switch>
            <span class="min-w-0 flex-1">
              <span class="block truncate text-sm font-medium text-on-surface">{getFeedName(feed, void 0)}</span>
              <span class="block truncate text-xs text-on-surface-variant capitalize">{feed.type}</span>
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

function PanelContent(
  props: {
    tab: PanelTab;
    onFeedSelect: (feed: SavedFeedItem) => void;
    onExplorerSubmit: (uri: string) => void;
    onDiagnosticsSubmit: (did: string) => void;
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
      </Switch>
    </div>
  );
}

function AddColumnPanelHeader(props: { onClose: () => void }) {
  return (
    <div class="flex shrink-0 items-center justify-between gap-3 border-b border-white/5 px-5 py-4">
      <p class="m-0 text-sm font-semibold text-on-surface">Add column</p>
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

export function AddColumnPanel(props: AddColumnPanelProps) {
  const [activeTab, setActiveTab] = createSignal<PanelTab>("feed");

  function handleFeedSelect(feed: SavedFeedItem) {
    const config = JSON.stringify({ feedType: feed.type, feedUri: feed.value });
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

  const tabs: Array<{ icon: string; id: PanelTab; label: string }> = [
    { icon: "i-ri-rss-line", id: "feed", label: "Feed" },
    { icon: "i-ri-compass-discover-line", id: "explorer", label: "Explorer" },
    { icon: "i-ri-stethoscope-line", id: "diagnostics", label: "Diagnostics" },
  ];

  return (
    <Presence exitBeforeEnter>
      <Show when={props.open}>
        {/* Backdrop */}
        <Motion.div
          class="fixed inset-0 z-40 bg-black/40 backdrop-blur-sm"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.15 }}
          onClick={() => props.onClose()} />

        {/* Panel */}
        <Motion.aside
          class="fixed right-0 top-0 z-50 flex h-full w-80 flex-col bg-surface-container shadow-[-8px_0_32px_rgba(0,0,0,0.4)]"
          initial={{ x: "100%" }}
          animate={{ x: "0%" }}
          exit={{ x: "100%" }}
          transition={{ duration: 0.22, easing: [0.32, 0.72, 0, 1] }}>
          {/* Header */}
          <AddColumnPanelHeader onClose={props.onClose} />

          {/* Tabs */}
          <div class="flex shrink-0 gap-1 px-4 py-3">
            <For each={tabs}>
              {(tab) => (
                <button
                  type="button"
                  class="flex flex-1 items-center justify-center gap-1.5 rounded-lg border-0 px-3 py-2 text-xs font-medium transition duration-150"
                  classList={{
                    "bg-primary/15 text-primary": activeTab() === tab.id,
                    "bg-transparent text-on-surface-variant hover:bg-white/5 hover:text-on-surface":
                      activeTab() !== tab.id,
                  }}
                  onClick={() => setActiveTab(tab.id)}>
                  <span class="flex items-center">
                    <i class={tab.icon} />
                  </span>
                  {tab.label}
                </button>
              )}
            </For>
          </div>

          {/* Content */}
          <PanelContent
            tab={activeTab()}
            onFeedSelect={handleFeedSelect}
            onExplorerSubmit={handleExplorerSubmit}
            onDiagnosticsSubmit={handleDiagnosticsSubmit} />
        </Motion.aside>
      </Show>
    </Presence>
  );
}

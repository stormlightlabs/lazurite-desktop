import type { ColumnKind } from "$/lib/api/types/columns";
import type { SearchMode } from "$/lib/api/types/search";
import { createEffect, createSignal, For, Match, onCleanup, Show, splitProps, Switch } from "solid-js";
import { Portal } from "solid-js/web";
import { Motion, Presence } from "solid-motionone";
import { Icon, type IconKind } from "../shared/Icon";
import { DiagnosticsPicker, ExplorerPicker, FeedPicker, MessagesPicker } from "./ColumnPicker";
import { ProfilePicker } from "./ColumnPicker/ProfileColumnPicker";
import { SearchPicker } from "./ColumnPicker/SearchPicker";
import type { FeedPickerSelection, ProfileSelection } from "./types";

type AddColumnPanelProps = { onAdd: (kind: ColumnKind, config: string) => void; onClose: () => void; open: boolean };

type PanelTab = ColumnKind;

type TabProps = { icon: IconKind; id: PanelTab; label: string };

type PanelSubmissionHandlers = {
  onDiagnosticsSubmit: (did: string) => void;
  onExplorerSubmit: (uri: string) => void;
  onFeedSelect: (selection: FeedPickerSelection) => void;
  onMessagesSubmit: () => void;
  onProfileSubmit: (selection: ProfileSelection) => void;
  onSearchSubmit: (query: string, mode: SearchMode) => void;
};

function PanelContent(props: { handlers: PanelSubmissionHandlers; tab: PanelTab }) {
  return (
    <div class="min-h-0 flex-1 overflow-y-auto px-4 pb-6">
      <Switch>
        <Match when={props.tab === "feed"}>
          <FeedPicker onSelect={props.handlers.onFeedSelect} />
        </Match>

        <Match when={props.tab === "explorer"}>
          <ExplorerPicker onSubmit={props.handlers.onExplorerSubmit} />
        </Match>

        <Match when={props.tab === "diagnostics"}>
          <DiagnosticsPicker onSubmit={props.handlers.onDiagnosticsSubmit} />
        </Match>

        <Match when={props.tab === "messages"}>
          <MessagesPicker onSubmit={props.handlers.onMessagesSubmit} />
        </Match>

        <Match when={props.tab === "search"}>
          <SearchPicker onSubmit={props.handlers.onSearchSubmit} />
        </Match>

        <Match when={props.tab === "profile"}>
          <ProfilePicker onSubmit={props.handlers.onProfileSubmit} />
        </Match>
      </Switch>
    </div>
  );
}

function AddColumnPanelHeader(props: { onClose: () => void }) {
  return (
    <div class="flex shrink-0 items-center justify-between gap-3 px-5 py-4 shadow-(--inset-shadow)">
      <div>
        <p id="add-column-panel-title" class="m-0 text-sm font-semibold text-on-surface">Add column</p>
        <p class="m-0 mt-1 text-xs uppercase tracking-[0.12em] text-on-surface-variant">Choose a view</p>
      </div>
      <button
        type="button"
        class="flex h-8 w-8 items-center justify-center rounded-full border-0 bg-transparent text-on-surface-variant transition duration-150 hover:bg-surface-bright hover:text-on-surface"
        aria-label="Close panel"
        onClick={() => props.onClose()}>
        <Icon kind="close" />
      </button>
    </div>
  );
}

type AddColumnPanelTabsProps = { activeTab: PanelTab; onTabChange: (tab: PanelTab) => void; tabs: TabProps[] };

function AddColumnPanelTabs(props: AddColumnPanelTabsProps) {
  return (
    <div class="grid shrink-0 grid-cols-2 gap-1 px-5 py-3">
      <For each={props.tabs}>
        {(tab) => (
          <button
            type="button"
            class="flex items-center justify-center gap-1.5 rounded-lg border-0 px-3 py-2 text-xs font-medium transition duration-150"
            classList={{
              "bg-primary/15 text-primary": props.activeTab === tab.id,
              "bg-transparent text-on-surface-variant hover:bg-surface-bright hover:text-on-surface":
                props.activeTab !== tab.id,
            }}
            onClick={() => props.onTabChange(tab.id)}>
            <Icon kind={tab.icon} />
            {tab.label}
          </button>
        )}
      </For>
    </div>
  );
}

type AddColumnPanelFrame = {
  activeTab: PanelTab;
  onClose: () => void;
  onTabChange: (tab: PanelTab) => void;
  tabs: TabProps[];
};

type AddColumnPanelBodyProps = { frame: AddColumnPanelFrame; handlers: PanelSubmissionHandlers };

function AddColumnPanelBody(props: AddColumnPanelBodyProps) {
  const [frameProps, contentProps] = splitProps(props, ["frame"], ["handlers"]);

  return (
    <Motion.aside
      role="dialog"
      aria-modal
      aria-labelledby="add-column-panel-title"
      class="ui-overlay-card relative z-10 flex h-full w-full max-w-88 flex-col bg-surface-container-highest backdrop-blur-[20px]"
      initial={{ opacity: 0, x: 32 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: 40 }}
      transition={{ duration: 0.22, easing: [0.32, 0.72, 0, 1] }}>
      <AddColumnPanelHeader onClose={frameProps.frame.onClose} />
      <AddColumnPanelTabs
        activeTab={frameProps.frame.activeTab}
        tabs={frameProps.frame.tabs}
        onTabChange={frameProps.frame.onTabChange} />
      <PanelContent tab={frameProps.frame.activeTab} handlers={contentProps.handlers} />
    </Motion.aside>
  );
}

export function AddColumnPanel(props: AddColumnPanelProps) {
  const [panelState, panelActions] = splitProps(props, ["open"], ["onAdd", "onClose"]);
  const [activeTab, setActiveTab] = createSignal<PanelTab>("feed");

  function handleFeedSelect(selection: FeedPickerSelection) {
    const config = JSON.stringify({
      feedType: selection.feed.type,
      feedUri: selection.feed.value,
      title: selection.title,
    });
    panelActions.onAdd("feed", config);
  }

  function handleExplorerSubmit(uri: string) {
    const config = JSON.stringify({ targetUri: uri });
    panelActions.onAdd("explorer", config);
  }

  function handleDiagnosticsSubmit(did: string) {
    const config = JSON.stringify({ did });
    panelActions.onAdd("diagnostics", config);
  }

  function handleMessagesSubmit() {
    panelActions.onAdd("messages", JSON.stringify({}));
  }

  function handleSearchSubmit(query: string, mode: SearchMode) {
    panelActions.onAdd("search", JSON.stringify({ mode, query }));
  }

  function handleProfileSubmit(selection: ProfileSelection) {
    panelActions.onAdd("profile", JSON.stringify(selection));
  }

  const tabs: TabProps[] = [
    { icon: "rss", id: "feed", label: "Feed" },
    { icon: "compass", id: "explorer", label: "Explorer" },
    { icon: "stethoscope", id: "diagnostics", label: "Diagnostics" },
    { icon: "messages", id: "messages", label: "DMs" },
    { icon: "search", id: "search", label: "Search" },
    { icon: "user", id: "profile", label: "Profile" },
  ];

  function handleKeyDown(event: KeyboardEvent) {
    if (event.key === "Escape") {
      panelActions.onClose();
    }
  }

  createEffect(() => {
    if (!panelState.open) {
      setActiveTab("feed");
      return;
    }

    globalThis.addEventListener("keydown", handleKeyDown);
    onCleanup(() => globalThis.removeEventListener("keydown", handleKeyDown));
  });

  return (
    <Presence exitBeforeEnter>
      <Show when={panelState.open}>
        <Portal>
          <div class="fixed inset-0 z-50 flex justify-end">
            <Motion.div
              class="ui-scrim absolute inset-0 backdrop-blur-[20px]"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.15 }}
              onClick={() => panelActions.onClose()} />

            <AddColumnPanelBody
              frame={{ activeTab: activeTab(), tabs, onClose: panelActions.onClose, onTabChange: setActiveTab }}
              handlers={{
                onDiagnosticsSubmit: handleDiagnosticsSubmit,
                onExplorerSubmit: handleExplorerSubmit,
                onFeedSelect: handleFeedSelect,
                onMessagesSubmit: handleMessagesSubmit,
                onProfileSubmit: handleProfileSubmit,
                onSearchSubmit: handleSearchSubmit,
              }} />
          </div>
        </Portal>
      </Show>
    </Presence>
  );
}

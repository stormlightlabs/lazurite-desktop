import { useThreadOverlayNavigation } from "$/components/posts/useThreadOverlayNavigation";
import { useAppSession } from "$/contexts/app-session";
import { addColumn, getColumns, removeColumn, reorderColumns, updateColumn } from "$/lib/api/columns";
import { FeedController } from "$/lib/api/feeds";
import type { Column, ColumnKind, ColumnWidth } from "$/lib/api/types/columns";
import { getFeedName } from "$/lib/feeds";
import type { FeedGeneratorView } from "$/lib/types";
import * as logger from "@tauri-apps/plugin-log";
import { createEffect, For, onCleanup, onMount, Show } from "solid-js";
import { createStore, produce } from "solid-js/store";
import { Motion } from "solid-motionone";
import { ActionIcon, Icon } from "../shared/Icon";
import { AddColumnPanel } from "./AddColumnPanel";
import { DeckColumn } from "./DeckColumn";
import { parseFeedConfig, type ResolvedFeedColumn, resolveFeedColumn } from "./types";

type DeckState = {
  addPanelOpen: boolean;
  columns: Column[];
  dragOverId: string | null;
  error: string | null;
  feedColumns: Record<string, ResolvedFeedColumn>;
  loading: boolean;
};

function DeckToolbar(props: { columnCount: number; onAdd: () => void }) {
  return (
    <div class="flex shrink-0 items-center justify-between gap-4 pb-5">
      <div class="min-w-0">
        <p class="m-0 text-xl font-semibold tracking-tight text-on-surface">Deck</p>
        <p class="m-0 mt-0.5 text-xs uppercase tracking-[0.12em] text-on-surface-variant">
          {props.columnCount === 0 ? "No columns" : `${props.columnCount} column${props.columnCount === 1 ? "" : "s"}`}
        </p>
      </div>
      <button
        type="button"
        class="inline-flex h-11 items-center gap-2 rounded-full border-0 bg-white/5 px-4 text-sm text-on-surface transition duration-150 ease-out hover:-translate-y-px hover:bg-white/8"
        aria-label="Add column (Ctrl+Shift+N)"
        title="Add column (Ctrl+Shift+N)"
        onClick={() => props.onAdd()}>
        <span class="flex items-center">
          <i class="i-ri-add-line" />
        </span>
        Add column
      </button>
    </div>
  );
}

function EmptyDeck(props: { onAdd: () => void }) {
  return (
    <div class="flex h-full min-h-104 flex-col items-center justify-center gap-4 rounded-[1.75rem] bg-white/3 px-6 text-center shadow-[inset_0_0_0_1px_rgba(255,255,255,0.035)]">
      <span class="flex items-center text-[2.5rem] text-on-surface-variant opacity-30">
        <i class="i-ri-layout-column-line" />
      </span>
      <div>
        <p class="m-0 text-sm font-medium text-on-surface">No columns yet</p>
        <p class="m-0 mt-1 text-xs text-on-surface-variant">
          Add a feed, explorer, or diagnostics column to get started.
        </p>
      </div>
      <button
        type="button"
        class="inline-flex h-9 items-center gap-2 rounded-full border-0 bg-primary/15 px-4 text-sm font-medium text-primary transition duration-150 hover:-translate-y-px hover:bg-primary/25"
        onClick={() => props.onAdd()}>
        <ActionIcon kind="add" />
        Add first column
      </button>
    </div>
  );
}

function ColumnList(
  props: {
    columns: Column[];
    dragOverId: string | null;
    feedColumns: Record<string, ResolvedFeedColumn>;
    onClose: (id: string) => void;
    onDragEnd: () => void;
    onDragOver: (id: string) => void;
    onDragStart: (id: string) => void;
    onDrop: (targetId: string) => void;
    onMoveLeft: (id: string) => void;
    onMoveRight: (id: string) => void;
    onOpenThread: (uri: string) => void;
    onWidthChange: (id: string, width: ColumnWidth) => void;
  },
) {
  return (
    <div class="flex h-full min-h-0 items-stretch gap-4 pb-3">
      <For each={props.columns}>
        {(column) => (
          <Motion.div
            class="flex h-full shrink-0"
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ duration: 0.18, easing: [0.34, 1.56, 0.64, 1] }}>
            <DeckColumn
              column={column}
              feedColumn={props.feedColumns[column.id]}
              isDragOver={props.dragOverId === column.id}
              onClose={props.onClose}
              onDragEnd={props.onDragEnd}
              onDragOver={props.onDragOver}
              onDragStart={props.onDragStart}
              onDrop={props.onDrop}
              onMoveLeft={props.onMoveLeft}
              onMoveRight={props.onMoveRight}
              onOpenThread={props.onOpenThread}
              onWidthChange={props.onWidthChange} />
          </Motion.div>
        )}
      </For>
    </div>
  );
}

function createDeckKeyboardHandler(onAddColumn: () => void, onCloseLastColumn: () => void) {
  return (e: KeyboardEvent) => {
    if (!e.ctrlKey && !e.metaKey) return;
    if (!e.shiftKey) return;

    if (e.key === "N" || e.key === "n") {
      e.preventDefault();
      onAddColumn();
    } else if (e.key === "W" || e.key === "w") {
      e.preventDefault();
      onCloseLastColumn();
    }
  };
}

export function DeckWorkspace() {
  const session = useAppSession();
  const threadOverlay = useThreadOverlayNavigation();
  let feedColumnRequest = 0;
  let draggingColumnId: string | null = null;

  const [state, setState] = createStore<DeckState>({
    addPanelOpen: false,
    columns: [],
    dragOverId: null,
    error: null,
    feedColumns: {},
    loading: true,
  });

  const activeDid = () => session.activeDid;

  async function loadColumns() {
    const did = activeDid();
    if (!did) return;
    try {
      const cols = await getColumns(did);
      setState("columns", cols);
      setState("error", null);
      void hydrateFeedColumns(cols);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      logger.error(`Failed to load deck columns: ${message}`);
      setState("error", message);
    } finally {
      setState("loading", false);
    }
  }

  async function hydrateFeedColumns(columns: Column[]) {
    const currentRequest = ++feedColumnRequest;
    const parsedFeedColumns = columns.flatMap((column) => {
      if (column.kind !== "feed") {
        return [];
      }

      const config = parseFeedConfig(column.config);
      return config ? [{ columnId: column.id, config }] : [];
    });

    if (parsedFeedColumns.length === 0) {
      setState("feedColumns", {});
      return;
    }

    setState(
      "feedColumns",
      Object.fromEntries(parsedFeedColumns.map(({ columnId, config }) => [columnId, resolveFeedColumn(config)])),
    );

    try {
      const preferences = await FeedController.getPreferences();
      const savedFeedTitles = Object.fromEntries(
        preferences.savedFeeds.map((feed) => [feed.value, getFeedName(feed, void 0)]),
      );

      const generatorUris = [
        ...new Set(
          parsedFeedColumns.filter(({ config }) => config.feedType === "feed").map(({ config }) =>
            config.feedUri
          ),
        ),
      ];
      let generators: Record<string, FeedGeneratorView> = {};

      if (generatorUris.length > 0) {
        const hydrated = await FeedController.getFeedGenerators(generatorUris);
        generators = Object.fromEntries(hydrated.feeds.map((generator) => [generator.uri, generator]));
      }

      const nextFeedColumns = Object.fromEntries(
        parsedFeedColumns.map((
          { columnId, config },
        ) => [
          columnId,
          resolveFeedColumn(config, {
            generator: generators[config.feedUri],
            savedFeedTitle: savedFeedTitles[config.feedUri],
          }),
        ]),
      );

      if (currentRequest !== feedColumnRequest) {
        return;
      }

      setState("feedColumns", nextFeedColumns);
    } catch (err) {
      logger.warn(`Failed to hydrate deck feed columns: ${String(err)}`);
    }
  }

  async function handleAdd(kind: ColumnKind, config: string) {
    const did = activeDid();
    if (!did) return;
    try {
      const col = await addColumn(did, kind, config);
      const nextColumns = [...state.columns, col];
      setState("columns", nextColumns);
      setState("addPanelOpen", false);
      if (kind === "feed") {
        void hydrateFeedColumns(nextColumns);
      }
    } catch (err) {
      logger.error(`Failed to add column: ${String(err)}`);
    }
  }

  async function handleClose(id: string) {
    try {
      await removeColumn(id);
      const nextColumns = state.columns.filter((column) => column.id !== id);
      setState("columns", nextColumns);
      void hydrateFeedColumns(nextColumns);
    } catch (err) {
      logger.error(`Failed to remove column: ${String(err)}`);
    }
  }

  async function handleWidthChange(id: string, width: ColumnWidth) {
    try {
      const updated = await updateColumn(id, { width });
      setState("columns", (prev) => prev.map((c) => (c.id === id ? updated : c)));
    } catch (err) {
      logger.error(`Failed to update column width: ${String(err)}`);
    }
  }

  async function handleMoveLeft(id: string) {
    const cols = state.columns;
    const idx = cols.findIndex((c) => c.id === id);
    if (idx === -1 || idx === 0) return;

    const newOrder = cols.map((c) => c.id);
    newOrder.splice(idx, 1);
    newOrder.splice(idx - 1, 0, id);

    try {
      await reorderColumns(newOrder);
      setState(
        "columns",
        produce((draft) => {
          const item = draft.splice(idx, 1)[0];
          if (item) draft.splice(idx - 1, 0, item);
        }),
      );
    } catch (err) {
      logger.error(`Failed to reorder columns: ${String(err)}`);
    }
  }

  async function handleMoveRight(id: string) {
    const cols = state.columns;
    const idx = cols.findIndex((c) => c.id === id);
    if (idx === -1 || idx >= cols.length - 1) return;

    const newOrder = cols.map((c) => c.id);
    newOrder.splice(idx, 1);
    newOrder.splice(idx + 1, 0, id);

    try {
      await reorderColumns(newOrder);
      setState(
        "columns",
        produce((draft) => {
          const item = draft.splice(idx, 1)[0];
          if (item) draft.splice(idx + 1, 0, item);
        }),
      );
    } catch (err) {
      logger.error(`Failed to reorder columns: ${String(err)}`);
    }
  }

  function handleDragStart(id: string) {
    draggingColumnId = id;
  }

  function handleDragEnd() {
    draggingColumnId = null;
    setState("dragOverId", null);
  }

  function handleDragOver(id: string) {
    if (draggingColumnId && draggingColumnId !== id) {
      setState("dragOverId", id);
    }
  }

  async function handleDrop(targetId: string) {
    const sourceId = draggingColumnId;
    draggingColumnId = null;
    setState("dragOverId", null);

    if (!sourceId || sourceId === targetId) return;

    const cols = state.columns;
    const fromIdx = cols.findIndex((c) => c.id === sourceId);
    const toIdx = cols.findIndex((c) => c.id === targetId);
    if (fromIdx === -1 || toIdx === -1) return;

    const newOrder = cols.map((c) => c.id);
    newOrder.splice(fromIdx, 1);
    newOrder.splice(toIdx, 0, sourceId);

    try {
      await reorderColumns(newOrder);
      setState(
        "columns",
        produce((draft) => {
          const item = draft.splice(fromIdx, 1)[0];
          if (item) draft.splice(toIdx, 0, item);
        }),
      );
    } catch (err) {
      logger.error(`Failed to reorder columns via drag: ${String(err)}`);
    }
  }

  function handleOpenThread(uri: string) {
    void threadOverlay.openThread(uri);
  }

  createEffect(() => {
    const handler = createDeckKeyboardHandler(() => setState("addPanelOpen", true), () => {
      const last = state.columns.at(-1);
      if (last) void handleClose(last.id);
    });
    globalThis.addEventListener("keydown", handler);
    onCleanup(() => globalThis.removeEventListener("keydown", handler));
  });

  onMount(() => {
    void loadColumns();
  });

  return (
    <div class="relative flex h-full min-h-0 min-w-0 flex-col overflow-hidden px-6 py-5 max-[900px]:px-4 max-[900px]:py-4 max-[640px]:px-3 max-[640px]:py-3">
      <DeckToolbar columnCount={state.columns.length} onAdd={() => setState("addPanelOpen", true)} />

      <div class="min-h-0 flex-1 overflow-x-auto overflow-y-hidden overscroll-contain">
        <Show when={state.loading}>
          <div class="flex h-full min-h-80 items-center justify-center">
            <Icon iconClass="i-ri-loader-4-line animate-spin text-2xl text-on-surface-variant" />
          </div>
        </Show>

        <Show when={!state.loading && state.error}>
          <div class="rounded-2xl bg-[rgba(138,31,31,0.2)] p-4 text-sm text-error shadow-[inset_0_0_0_1px_rgba(255,128,128,0.2)]">
            {state.error}
          </div>
        </Show>

        <Show when={!state.loading && !state.error && state.columns.length === 0}>
          <EmptyDeck onAdd={() => setState("addPanelOpen", true)} />
        </Show>

        <Show when={!state.loading && state.columns.length > 0}>
          <ColumnList
            columns={state.columns}
            dragOverId={state.dragOverId}
            feedColumns={state.feedColumns}
            onClose={handleClose}
            onDragEnd={handleDragEnd}
            onDragOver={handleDragOver}
            onDragStart={handleDragStart}
            onDrop={handleDrop}
            onMoveLeft={handleMoveLeft}
            onMoveRight={handleMoveRight}
            onOpenThread={handleOpenThread}
            onWidthChange={handleWidthChange} />
        </Show>
      </div>

      <AddColumnPanel open={state.addPanelOpen} onAdd={handleAdd} onClose={() => setState("addPanelOpen", false)} />
    </div>
  );
}

import { useAppSession } from "$/contexts/app-session";
import { addColumn, getColumns, removeColumn, reorderColumns, updateColumn } from "$/lib/api/columns";
import type { Column, ColumnKind, ColumnWidth } from "$/lib/api/columns";
import { useNavigate } from "@solidjs/router";
import * as logger from "@tauri-apps/plugin-log";
import { createEffect, For, onCleanup, onMount, Show } from "solid-js";
import { createStore, produce } from "solid-js/store";
import { Motion } from "solid-motionone";
import { Icon } from "../shared/Icon";
import { AddColumnPanel } from "./AddColumnPanel";
import { DeckColumn } from "./DeckColumn";

type DeckState = { addPanelOpen: boolean; columns: Column[]; error: string | null; loading: boolean };

function DeckToolbar(props: { columnCount: number; onAdd: () => void }) {
  return (
    <div class="flex shrink-0 items-center justify-between gap-4 pb-4">
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
    <div class="flex h-64 flex-col items-center justify-center gap-4 text-center">
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
        <span class="flex items-center">
          <i class="i-ri-add-line" />
        </span>
        Add first column
      </button>
    </div>
  );
}

function ColumnList(
  props: {
    columns: Column[];
    onClose: (id: string) => void;
    onMoveLeft: (id: string) => void;
    onMoveRight: (id: string) => void;
    onOpenThread: (uri: string) => void;
    onWidthChange: (id: string, width: ColumnWidth) => void;
  },
) {
  return (
    <div class="flex h-full min-h-96 gap-3 pb-2">
      <For each={props.columns}>
        {(column) => (
          <Motion.div
            class="flex shrink-0"
            style={{ height: "calc(100vh - 12rem)" }}
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ duration: 0.18, easing: [0.34, 1.56, 0.64, 1] }}>
            <DeckColumn
              column={column}
              onClose={props.onClose}
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
  const navigate = useNavigate();

  const [state, setState] = createStore<DeckState>({ addPanelOpen: false, columns: [], error: null, loading: true });

  const activeDid = () => session.activeDid;

  async function loadColumns() {
    const did = activeDid();
    if (!did) return;
    try {
      const cols = await getColumns(did);
      setState("columns", cols);
      setState("error", null);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      logger.error(`Failed to load deck columns: ${message}`);
      setState("error", message);
    } finally {
      setState("loading", false);
    }
  }

  async function handleAdd(kind: ColumnKind, config: string) {
    const did = activeDid();
    if (!did) return;
    try {
      const col = await addColumn(did, kind, config);
      setState("columns", (prev) => [...prev, col]);
      setState("addPanelOpen", false);
    } catch (err) {
      logger.error(`Failed to add column: ${String(err)}`);
    }
  }

  async function handleClose(id: string) {
    try {
      await removeColumn(id);
      setState("columns", (prev) => prev.filter((c) => c.id !== id));
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

  function handleOpenThread(uri: string) {
    navigate(`/timeline/thread/${encodeURIComponent(uri)}`);
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
    <div class="relative flex min-h-0 min-w-0 flex-col">
      <DeckToolbar columnCount={state.columns.length} onAdd={() => setState("addPanelOpen", true)} />

      <div class="min-h-0 flex-1 overflow-x-auto overscroll-contain">
        <Show when={state.loading}>
          <div class="flex h-64 items-center justify-center">
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
            onClose={handleClose}
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

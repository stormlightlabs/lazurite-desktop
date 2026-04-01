import { ExplorerPanel } from "$/components/explorer/ExplorerPanel";
import { FeedContent } from "$/components/feeds/FeedContent";
import { MessagesPanel } from "$/components/messages/MessagesPanel";
import { ProfilePanel } from "$/components/profile/ProfilePanel";
import { SearchPanel } from "$/components/search/SearchPanel";
import type { Column, ColumnWidth } from "$/lib/api/types/columns";
import type { PostView, SavedFeedItem } from "$/lib/types";
import { createSignal, Match, Show, Switch } from "solid-js";
import { DiagnosticsColumn } from "./DiagnosticsColumn";
import {
  COLUMN_WIDTH_PX,
  columnTitle,
  cycleWidth,
  parseDiagnosticsConfig,
  parseProfileConfig,
  parseSearchConfig,
  type ResolvedFeedColumn,
} from "./types";
import { useFeedColumnState } from "./useFeedColumnState";

type DeckColumnProps = {
  column: Column;
  feedColumn?: ResolvedFeedColumn;
  isDragOver: boolean;
  onClose: (id: string) => void;
  onDragEnd: () => void;
  onDragOver: (id: string) => void;
  onDragStart: (id: string) => void;
  onDrop: (targetId: string) => void;
  onMoveLeft: (id: string) => void;
  onMoveRight: (id: string) => void;
  onOpenThread: (uri: string) => void;
  onWidthChange: (id: string, width: ColumnWidth) => void;
};

function snapToColumnWidth(px: number): ColumnWidth {
  const narrow = Math.abs(px - COLUMN_WIDTH_PX.narrow);
  const standard = Math.abs(px - COLUMN_WIDTH_PX.standard);
  const wide = Math.abs(px - COLUMN_WIDTH_PX.wide);
  if (narrow <= standard && narrow <= wide) return "narrow";
  if (standard <= wide) return "standard";
  return "wide";
}

function widthLabel(width: ColumnWidth): string {
  switch (width) {
    case "narrow": {
      return "N";
    }
    case "standard": {
      return "S";
    }
    case "wide": {
      return "W";
    }
  }
}

type ColumnHeaderProps = {
  column: Column;
  onClose: () => void;
  onDragEnd: () => void;
  onDragStart: (e: DragEvent) => void;
  onMoveLeft: () => void;
  onMoveRight: () => void;
  onWidthCycle: () => void;
  title: string;
};

function HeaderControls(
  props: Pick<ColumnHeaderProps, "column" | "onClose" | "onMoveLeft" | "onMoveRight" | "onWidthCycle">,
) {
  return (
    <div class="flex shrink-0 items-center gap-1">
      <button
        type="button"
        class="flex h-6 w-6 shrink-0 items-center justify-center rounded border-0 bg-white/5 text-[0.65rem] font-bold text-on-surface-variant transition duration-150 hover:-translate-y-px hover:bg-white/10 hover:text-on-surface"
        aria-label={`Column width: ${props.column.width}. Click to cycle.`}
        title="Cycle column width"
        onClick={() => props.onWidthCycle()}>
        {widthLabel(props.column.width)}
      </button>
      <button
        type="button"
        class="flex h-6 w-6 shrink-0 items-center justify-center rounded border-0 bg-transparent text-sm text-on-surface-variant transition duration-150 hover:-translate-y-px hover:bg-white/6 hover:text-on-surface"
        aria-label="Move column left"
        title="Move column left"
        onClick={() => props.onMoveLeft()}>
        <span class="flex items-center">
          <i class="i-ri-arrow-left-s-line" />
        </span>
      </button>
      <button
        type="button"
        class="flex h-6 w-6 shrink-0 items-center justify-center rounded border-0 bg-transparent text-sm text-on-surface-variant transition duration-150 hover:-translate-y-px hover:bg-white/6 hover:text-on-surface"
        aria-label="Move column right"
        title="Move column right"
        onClick={() => props.onMoveRight()}>
        <span class="flex items-center">
          <i class="i-ri-arrow-right-s-line" />
        </span>
      </button>
      <button
        type="button"
        class="flex h-6 w-6 shrink-0 items-center justify-center rounded border-0 bg-transparent text-sm text-on-surface-variant transition duration-150 hover:-translate-y-px hover:bg-white/6 hover:text-error"
        aria-label="Close column"
        title="Close column"
        onClick={() => props.onClose()}>
        <span class="flex items-center">
          <i class="i-ri-close-line" />
        </span>
      </button>
    </div>
  );
}

function ColumnHeader(props: ColumnHeaderProps) {
  return (
    <header class="flex shrink-0 items-center gap-2 rounded-t-2xl bg-[rgba(14,14,14,0.94)] px-3 py-2.5 backdrop-blur-[18px] shadow-[inset_0_-1px_0_rgba(255,255,255,0.04)]">
      <span
        class="flex cursor-grab items-center text-on-surface-variant opacity-40 hover:opacity-80 active:cursor-grabbing"
        draggable="true"
        onDragStart={(e) => props.onDragStart(e)}
        onDragEnd={() => props.onDragEnd()}
        aria-hidden="true"
        title="Drag to reorder">
        <i class="i-ri-draggable" />
      </span>
      <span class="min-w-0 flex-1 truncate text-sm font-medium text-on-surface" title={props.title}>{props.title}</span>
      <HeaderControls
        column={props.column}
        onClose={props.onClose}
        onMoveLeft={props.onMoveLeft}
        onMoveRight={props.onMoveRight}
        onWidthCycle={props.onWidthCycle} />
    </header>
  );
}

type FeedBodyProps = { feedColumn?: ResolvedFeedColumn; onOpenThread: (uri: string) => void };

function FeedBody(props: FeedBodyProps) {
  return (
    <Show
      when={props.feedColumn}
      keyed
      fallback={
        <div class="flex items-center justify-center p-6 text-sm text-on-surface-variant">
          Invalid feed configuration.
        </div>
      }>
      {(feedColumn) => <FeedBodyContent feed={feedColumn.feed} onOpenThread={props.onOpenThread} />}
    </Show>
  );
}

type FeedBodyContentProps = { feed: SavedFeedItem; onOpenThread: (uri: string) => void };

function FeedBodyContent(props: FeedBodyContentProps) {
  const { registerSentinel, state, toggleLike, toggleRepost } = useFeedColumnState(() => props.feed);
  const postRefs = new Map<string, HTMLElement>();

  return (
    <div class="min-h-0 min-w-0 overflow-y-auto overscroll-contain px-3 pb-8 pt-3">
      <FeedContent
        activeFeedId={props.feed.id}
        activeFeedState={{
          cursor: state.cursor,
          error: state.error,
          items: state.items,
          loading: state.loading,
          loadingMore: state.loadingMore,
        }}
        focusedIndex={-1}
        likePendingByUri={state.likePendingByUri}
        likePulseUri={null}
        onFocusIndex={() => void 0}
        onLike={(post: PostView) => toggleLike(post)}
        onOpenThread={(uri: string) => Promise.resolve(props.onOpenThread(uri))}
        onQuote={() => void 0}
        onReply={() => void 0}
        onRepost={(post: PostView) => toggleRepost(post)}
        postRefs={postRefs}
        repostPendingByUri={state.repostPendingByUri}
        repostPulseUri={null}
        sentinelRef={registerSentinel}
        visibleItems={state.items} />
    </div>
  );
}

function ColumnBody(
  props: {
    column: Column;
    feedColumn?: ResolvedFeedColumn;
    onClose: (id: string) => void;
    onOpenThread: (uri: string) => void;
  },
) {
  const diagnosticsConfig = () => parseDiagnosticsConfig(props.column.config);
  const searchConfig = () => parseSearchConfig(props.column.config);
  const profileConfig = () => parseProfileConfig(props.column.config);

  return (
    <Switch>
      <Match when={props.column.kind === "feed"}>
        <FeedBody feedColumn={props.feedColumn} onOpenThread={props.onOpenThread} />
      </Match>
      <Match when={props.column.kind === "explorer"}>
        <div class="min-h-0 min-w-0 overflow-hidden">
          <ExplorerPanel />
        </div>
      </Match>
      <Match when={props.column.kind === "diagnostics"}>
        <DiagnosticsColumn did={diagnosticsConfig()?.did ?? ""} onClose={() => props.onClose(props.column.id)} />
      </Match>
      <Match when={props.column.kind === "messages"}>
        <BlurredMessagesBody />
      </Match>
      <Match when={props.column.kind === "search"}>
        <SearchBody config={searchConfig()?.query ? searchConfig() : null} />
      </Match>
      <Match when={props.column.kind === "profile"}>
        <ProfileBody actor={profileConfig()?.actor ?? profileConfig()?.handle ?? profileConfig()?.did ?? null} />
      </Match>
    </Switch>
  );
}

function BlurredMessagesBody() {
  return (
    <div class="group relative min-h-0 min-w-0 overflow-hidden">
      <div class="pointer-events-none absolute right-3 top-3 z-10 rounded-full bg-black/55 px-2.5 py-1 text-[0.65rem] font-medium uppercase tracking-[0.12em] text-on-surface-variant backdrop-blur-sm transition duration-150 group-hover:opacity-0 group-focus-within:opacity-0">
        Hover to reveal
      </div>
      <div class="h-full transition duration-200 ease-out blur-[14px] saturate-50 group-hover:blur-none group-hover:saturate-100 group-focus-within:blur-none group-focus-within:saturate-100">
        <MessagesPanel embedded />
      </div>
    </div>
  );
}

function SearchBody(props: { config: { mode: "network" | "keyword" | "semantic" | "hybrid"; query: string } | null }) {
  return (
    <div class="min-h-0 min-w-0 overflow-hidden px-3 pb-3 pt-3">
      <SearchPanel embedded initialMode={props.config?.mode} initialQuery={props.config?.query} />
    </div>
  );
}

function ProfileBody(props: { actor: string | null }) {
  return (
    <Show
      when={props.actor}
      fallback={
        <div class="flex items-center justify-center p-6 text-sm text-on-surface-variant">
          Invalid profile configuration.
        </div>
      }>
      {(actor) => <ProfilePanel actor={actor()} embedded />}
    </Show>
  );
}

export function DeckColumn(props: DeckColumnProps) {
  const [resizingWidth, setResizingWidth] = createSignal<number | null>(null);
  const title = () => props.feedColumn?.title ?? columnTitle(props.column.kind, props.column.config);
  const widthPx = () => resizingWidth() ?? COLUMN_WIDTH_PX[props.column.width];

  function handleDragStart(e: DragEvent) {
    if (e.dataTransfer) {
      e.dataTransfer.effectAllowed = "move";
    }
    props.onDragStart(props.column.id);
  }

  function handleResizeStart(e: MouseEvent) {
    e.preventDefault();
    const startX = e.clientX;
    const startWidth = COLUMN_WIDTH_PX[props.column.width];

    function onMove(mv: MouseEvent) {
      setResizingWidth(Math.max(240, startWidth + mv.clientX - startX));
    }

    function onUp() {
      const finalPx = resizingWidth() ?? startWidth;
      setResizingWidth(null);
      const snapped = snapToColumnWidth(finalPx);
      if (snapped !== props.column.width) {
        props.onWidthChange(props.column.id, snapped);
      }
      globalThis.removeEventListener("mousemove", onMove);
      globalThis.removeEventListener("mouseup", onUp);
    }

    globalThis.addEventListener("mousemove", onMove);
    globalThis.addEventListener("mouseup", onUp);
  }

  return (
    <div
      class="relative flex h-full shrink-0 flex-col"
      style={{ width: `${widthPx()}px` }}
      onDragOver={(e) => {
        e.preventDefault();
        props.onDragOver(props.column.id);
      }}
      onDrop={(e) => {
        e.preventDefault();
        props.onDrop(props.column.id);
      }}>
      <section
        class="flex h-full w-full flex-col overflow-hidden rounded-2xl bg-[rgba(8,8,8,0.32)] transition-shadow duration-150"
        classList={{
          "shadow-[inset_0_0_0_2px_rgba(125,175,255,0.45)]": props.isDragOver,
          "shadow-[inset_0_0_0_1px_rgba(255,255,255,0.03)]": !props.isDragOver,
        }}>
        <ColumnHeader
          column={props.column}
          title={title()}
          onClose={() => props.onClose(props.column.id)}
          onDragEnd={props.onDragEnd}
          onDragStart={handleDragStart}
          onMoveLeft={() => props.onMoveLeft(props.column.id)}
          onMoveRight={() => props.onMoveRight(props.column.id)}
          onWidthCycle={() => props.onWidthChange(props.column.id, cycleWidth(props.column.width))} />
        <div class="grid min-h-0 flex-1 grid-rows-[minmax(0,1fr)]">
          <ColumnBody
            column={props.column}
            feedColumn={props.feedColumn}
            onClose={props.onClose}
            onOpenThread={props.onOpenThread} />
        </div>
      </section>
      <div
        class="absolute -right-1 top-2 bottom-2 z-20 w-2 cursor-col-resize opacity-0 hover:opacity-100 transition-opacity duration-150 flex items-center justify-center"
        onMouseDown={handleResizeStart}>
        <div class="h-full w-0.5 rounded-full bg-primary/50" />
      </div>
    </div>
  );
}

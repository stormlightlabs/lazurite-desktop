import { ExplorerPanel } from "$/components/explorer/ExplorerPanel";
import { FeedContent } from "$/components/feeds/FeedContent";
import type { Column, ColumnWidth } from "$/lib/api/columns";
import type { PostView } from "$/lib/types";
import { createMemo, Match, Show, Switch } from "solid-js";
import { DiagnosticsColumn } from "./DiagnosticsColumn";
import {
  COLUMN_WIDTH_PX,
  columnTitle,
  cycleWidth,
  feedConfigToSavedFeedItem,
  parseDiagnosticsConfig,
  parseFeedConfig,
} from "./types";
import { useFeedColumnState } from "./useFeedColumnState";

type DeckColumnProps = {
  column: Column;
  onClose: (id: string) => void;
  onMoveLeft: (id: string) => void;
  onMoveRight: (id: string) => void;
  onOpenThread: (uri: string) => void;
  onWidthChange: (id: string, width: ColumnWidth) => void;
};

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

type FeedBodyProps = { columnId: string; config: string; onOpenThread: (uri: string) => void };

function FeedBody(props: FeedBodyProps) {
  const config = createMemo(() => parseFeedConfig(props.config));
  const feed = createMemo(() => {
    const c = config();
    return c ? feedConfigToSavedFeedItem(c) : null;
  });

  return (
    <Show
      when={feed()}
      keyed
      fallback={
        <div class="flex items-center justify-center p-6 text-sm text-on-surface-variant">
          Invalid feed configuration.
        </div>
      }>
      {(f) => <FeedBodyContent feed={f} onOpenThread={props.onOpenThread} />}
    </Show>
  );
}

type FeedBodyContentProps = {
  feed: { id: string; pinned: boolean; type: "feed" | "list" | "timeline"; value: string };
  onOpenThread: (uri: string) => void;
};

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

function ColumnBody(props: { column: Column; onOpenThread: (uri: string) => void }) {
  const diagnosticsConfig = () => parseDiagnosticsConfig(props.column.config);

  return (
    <Switch>
      <Match when={props.column.kind === "feed"}>
        <FeedBody columnId={props.column.id} config={props.column.config} onOpenThread={props.onOpenThread} />
      </Match>
      <Match when={props.column.kind === "explorer"}>
        <div class="min-h-0 min-w-0 overflow-hidden">
          <ExplorerPanel />
        </div>
      </Match>
      <Match when={props.column.kind === "diagnostics"}>
        <DiagnosticsColumn did={diagnosticsConfig()?.did ?? ""} />
      </Match>
    </Switch>
  );
}

export function DeckColumn(props: DeckColumnProps) {
  const title = () => columnTitle(props.column.kind, props.column.config);
  const widthPx = () => COLUMN_WIDTH_PX[props.column.width];

  return (
    <section
      class="flex shrink-0 flex-col overflow-hidden rounded-2xl bg-[rgba(8,8,8,0.32)] shadow-[inset_0_0_0_1px_rgba(255,255,255,0.03)]"
      style={{ width: `${widthPx()}px` }}>
      <ColumnHeader
        column={props.column}
        title={title()}
        onClose={() => props.onClose(props.column.id)}
        onMoveLeft={() => props.onMoveLeft(props.column.id)}
        onMoveRight={() => props.onMoveRight(props.column.id)}
        onWidthCycle={() => props.onWidthChange(props.column.id, cycleWidth(props.column.width))} />
      <div class="grid min-h-0 flex-1 grid-rows-[minmax(0,1fr)]">
        <ColumnBody column={props.column} onOpenThread={props.onOpenThread} />
      </div>
    </section>
  );
}

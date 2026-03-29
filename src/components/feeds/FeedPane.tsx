import { Icon } from "$/components/shared/Icon";
import { getFeedName } from "$/lib/feeds";
import type { FeedGeneratorView, FeedViewPost, PostView, SavedFeedItem } from "$/lib/types";
import { ComposerLauncher } from "./FeedComposer";
import { FeedContent } from "./FeedContent";
import { FeedTabBar } from "./FeedTabs";
import type { FeedState } from "./types";

function FeedHeaderActions(props: { onCompose: () => void; onToggleDrawer: () => void }) {
  return (
    <div class="flex shrink-0 flex-wrap items-center justify-end gap-2 max-[640px]:w-full max-[640px]:justify-between">
      <button
        class="inline-flex h-11 items-center gap-2 rounded-full border-0 bg-white/5 px-4 text-sm text-on-surface transition duration-150 ease-out hover:-translate-y-px hover:bg-white/8 max-[520px]:flex-1 max-[520px]:justify-center"
        type="button"
        onClick={() => props.onCompose()}>
        <Icon aria-hidden="true" kind="quill" />
        <span>New post</span>
      </button>
      <button
        class="inline-flex h-11 w-11 items-center justify-center rounded-full border-0 bg-white/5 text-on-surface transition duration-150 ease-out hover:-translate-y-px hover:bg-white/8"
        type="button"
        onClick={() => props.onToggleDrawer()}>
        <Icon aria-hidden="true" kind="menu" />
      </button>
    </div>
  );
}

function FeedScroller(
  props: {
    activeFeedId: string;
    activeFeedState: FeedState | undefined;
    activeHandle: string;
    focusedIndex: number;
    generators: Record<string, FeedGeneratorView>;
    likePendingByUri: Record<string, boolean>;
    likePulseUri: string | null;
    onCompose: () => void;
    onFocusIndex: (index: number) => void;
    onLike: (post: PostView) => Promise<void>;
    onOpenThread: (uri: string) => Promise<void>;
    onQuote: (post: PostView) => void;
    onReply: (post: PostView, root: PostView) => void;
    onRepost: (post: PostView) => Promise<void>;
    postRefs: Map<string, HTMLElement>;
    repostPendingByUri: Record<string, boolean>;
    repostPulseUri: string | null;
    scrollerRef: (element: HTMLDivElement) => void;
    sentinelRef: (element: HTMLDivElement) => void;
    setScrollTop: (top: number) => void;
    visibleItems: FeedViewPost[];
  },
) {
  return (
    <div
      ref={(element) => props.scrollerRef(element)}
      class="feed-scroll-region min-h-0 min-w-0 overflow-x-hidden overflow-y-auto overscroll-contain px-6 pb-8 pt-4 max-[760px]:px-4 max-[520px]:px-3"
      onScroll={(event) => props.setScrollTop(event.currentTarget.scrollTop)}>
      <ComposerLauncher activeHandle={props.activeHandle} onCompose={props.onCompose} />
      <FeedContent
        activeFeedId={props.activeFeedId}
        activeFeedState={props.activeFeedState}
        focusedIndex={props.focusedIndex}
        likePendingByUri={props.likePendingByUri}
        likePulseUri={props.likePulseUri}
        onFocusIndex={props.onFocusIndex}
        onLike={props.onLike}
        onOpenThread={props.onOpenThread}
        onQuote={props.onQuote}
        onReply={props.onReply}
        onRepost={props.onRepost}
        postRefs={props.postRefs}
        repostPendingByUri={props.repostPendingByUri}
        repostPulseUri={props.repostPulseUri}
        sentinelRef={props.sentinelRef}
        visibleItems={props.visibleItems} />
    </div>
  );
}

function FeedPaneTitle(
  props: {
    activeFeed: SavedFeedItem;
    generators: Record<string, FeedGeneratorView>;
    onCompose: () => void;
    onToggleDrawer: () => void;
  },
) {
  return (
    <div class="flex min-w-0 items-start justify-between gap-4 max-[900px]:gap-3 max-[640px]:flex-col max-[640px]:items-stretch">
      <div class="min-w-0">
        <p class="m-0 text-xl font-semibold tracking-tight text-on-surface">Timeline</p>
        <p class="mt-1 wrap-break-word text-xs uppercase tracking-[0.12em] text-on-surface-variant">
          {getFeedName(props.activeFeed, props.generators[props.activeFeed.value]?.displayName)}
        </p>
      </div>
      <FeedHeaderActions onCompose={props.onCompose} onToggleDrawer={props.onToggleDrawer} />
    </div>
  );
}

function FeedPaneHeader(
  props: {
    activeFeed: SavedFeedItem;
    generators: Record<string, FeedGeneratorView>;
    onCompose: () => void;
    onFeedSelect: (feedId: string) => void;
    onToggleDrawer: () => void;
    pinnedFeeds: SavedFeedItem[];
  },
) {
  return (
    <header class="sticky top-0 z-20 overflow-hidden rounded-t-4xl bg-[rgba(14,14,14,0.94)] px-6 pb-3 pt-5 backdrop-blur-[18px] shadow-[inset_0_-1px_0_rgba(255,255,255,0.04)] max-[760px]:px-4 max-[760px]:pt-4 max-[520px]:px-3">
      <FeedPaneTitle
        activeFeed={props.activeFeed}
        generators={props.generators}
        onCompose={props.onCompose}
        onToggleDrawer={props.onToggleDrawer} />
      <FeedTabBar
        activeFeedId={props.activeFeed.id}
        generators={props.generators}
        onFeedSelect={props.onFeedSelect}
        onToggleDrawer={props.onToggleDrawer}
        pinnedFeeds={props.pinnedFeeds} />
    </header>
  );
}

export function FeedPane(
  props: {
    activeFeed: SavedFeedItem;
    activeFeedId: string;
    activeFeedState: FeedState | undefined;
    activeHandle: string;
    focusedIndex: number;
    generators: Record<string, FeedGeneratorView>;
    likePendingByUri: Record<string, boolean>;
    likePulseUri: string | null;
    onCompose: () => void;
    onFeedSelect: (feedId: string) => void;
    onFocusIndex: (index: number) => void;
    onLike: (post: PostView) => Promise<void>;
    onOpenThread: (uri: string) => Promise<void>;
    onQuote: (post: PostView) => void;
    onReply: (post: PostView, root: PostView) => void;
    onRepost: (post: PostView) => Promise<void>;
    onToggleDrawer: () => void;
    pinnedFeeds: SavedFeedItem[];
    postRefs: Map<string, HTMLElement>;
    repostPendingByUri: Record<string, boolean>;
    repostPulseUri: string | null;
    scrollerRef: (element: HTMLDivElement) => void;
    sentinelRef: (element: HTMLDivElement) => void;
    setScrollTop: (top: number) => void;
    visibleItems: FeedViewPost[];
  },
) {
  return (
    <section class="grid min-h-0 min-w-0 overflow-hidden grid-rows-[auto_minmax(0,1fr)] rounded-4xl bg-[rgba(8,8,8,0.32)] shadow-[inset_0_0_0_1px_rgba(255,255,255,0.03)]">
      <FeedPaneHeader
        activeFeed={props.activeFeed}
        generators={props.generators}
        onCompose={props.onCompose}
        onFeedSelect={props.onFeedSelect}
        onToggleDrawer={props.onToggleDrawer}
        pinnedFeeds={props.pinnedFeeds} />
      <FeedScroller
        activeFeedId={props.activeFeedId}
        activeFeedState={props.activeFeedState}
        activeHandle={props.activeHandle}
        focusedIndex={props.focusedIndex}
        generators={props.generators}
        likePendingByUri={props.likePendingByUri}
        likePulseUri={props.likePulseUri}
        onCompose={props.onCompose}
        onFocusIndex={props.onFocusIndex}
        onLike={props.onLike}
        onOpenThread={props.onOpenThread}
        onQuote={props.onQuote}
        onReply={props.onReply}
        onRepost={props.onRepost}
        postRefs={props.postRefs}
        repostPendingByUri={props.repostPendingByUri}
        repostPulseUri={props.repostPulseUri}
        scrollerRef={props.scrollerRef}
        sentinelRef={props.sentinelRef}
        setScrollTop={props.setScrollTop}
        visibleItems={props.visibleItems} />
    </section>
  );
}

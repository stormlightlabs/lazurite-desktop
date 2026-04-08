import { Icon } from "$/components/shared/Icon";
import { useAppSession } from "$/contexts/app-session";
import { getFeedName } from "$/lib/feeds";
import type { FeedGeneratorView, SavedFeedItem } from "$/lib/types";
import { ComposerLauncher } from "./FeedComposer";
import { FeedContent } from "./FeedContent";
import { FeedTabBar } from "./FeedTabs";
import type { FeedWorkspaceController } from "./hooks/useFeedWorkspaceController";

function FeedHeaderActions(props: { onCompose: () => void; onRefresh: () => void }) {
  return (
    <div class="flex shrink-0 flex-wrap items-center justify-end gap-2 max-[960px]:w-full max-[960px]:justify-between">
      <button
        class="ui-control ui-control-hoverable inline-flex h-11 items-center gap-2 rounded-full px-4 text-sm text-on-surface max-[960px]:flex-1 max-[960px]:justify-center max-[520px]:px-3"
        type="button"
        onClick={() => props.onCompose()}>
        <Icon aria-hidden="true" kind="quill" />
        <span>New post</span>
      </button>
      <button
        class="ui-control ui-control-hoverable inline-flex h-11 w-11 items-center justify-center rounded-full text-on-surface"
        type="button"
        aria-label="Refresh active feed"
        title="Refresh active feed"
        onClick={() => props.onRefresh()}>
        <Icon aria-hidden="true" kind="refresh" />
      </button>
    </div>
  );
}

function FeedScroller(
  props: { controller: FeedWorkspaceController; activeAvatar?: string | null; activeHandle: string },
) {
  return (
    <div
      ref={(element) => props.controller.registerScroller(element)}
      class="feed-scroll-region min-h-0 min-w-0 overflow-x-hidden overflow-y-auto overscroll-contain px-6 pb-8 pt-4 max-[760px]:px-4 max-[520px]:px-3"
      onScroll={(event) => props.controller.rememberScrollTop(event.currentTarget.scrollTop)}>
      <ComposerLauncher
        activeAvatar={props.activeAvatar}
        activeHandle={props.activeHandle}
        onCompose={props.controller.openComposer} />
      <FeedContent
        activeFeedId={props.controller.activeFeed().id}
        activeFeedState={props.controller.activeFeedState()}
        bookmarkPendingByUri={props.controller.bookmarkPendingByUri()}
        focusedIndex={props.controller.workspace.focusedIndex}
        likePendingByUri={props.controller.likePendingByUri()}
        likePulseUri={props.controller.likePulseUri()}
        onBookmark={props.controller.toggleBookmark}
        onFocusIndex={props.controller.setFocusedIndex}
        onLike={props.controller.toggleLike}
        onOpenEngagement={props.controller.openPostEngagement}
        onOpenThread={props.controller.openThread}
        onQuote={props.controller.openQuoteComposer}
        onReply={props.controller.openReplyComposer}
        onRepost={props.controller.toggleRepost}
        postRefs={props.controller.postRefs}
        repostPendingByUri={props.controller.repostPendingByUri()}
        repostPulseUri={props.controller.repostPulseUri()}
        sentinelRef={props.controller.registerSentinel}
        visibleItems={props.controller.visibleItems()} />
    </div>
  );
}

function FeedPaneTitle(
  props: {
    activeFeed: SavedFeedItem;
    generators: Record<string, FeedGeneratorView>;
    onCompose: () => void;
    onRefresh: () => void;
  },
) {
  return (
    <div class="flex min-w-0 items-start justify-between gap-4 max-[960px]:flex-col max-[960px]:items-stretch max-md:gap-3">
      <div class="min-w-0">
        <p class="m-0 text-xl font-semibold tracking-tight text-on-surface">Timeline</p>
        <p class="mt-1 wrap-break-word text-xs uppercase tracking-[0.12em] text-on-surface-variant">
          {getFeedName(props.activeFeed, props.generators[props.activeFeed.value]?.displayName)}
        </p>
      </div>
      <FeedHeaderActions onCompose={props.onCompose} onRefresh={props.onRefresh} />
    </div>
  );
}

function FeedPaneHeader(props: { controller: FeedWorkspaceController }) {
  return (
    <header class="sticky top-0 z-20 overflow-hidden rounded-t-4xl bg-surface-container-high px-6 pb-3 pt-5 backdrop-blur-[18px] shadow-[inset_0_-1px_0_var(--outline-subtle)] max-[960px]:px-5 max-[960px]:pb-4 max-[960px]:pt-4 max-[760px]:px-4 max-[520px]:px-3">
      <FeedPaneTitle
        activeFeed={props.controller.activeFeed()}
        generators={props.controller.workspace.generators}
        onCompose={props.controller.openComposer}
        onRefresh={() => void props.controller.refreshActiveFeed()} />
      <FeedTabBar
        activeFeedId={props.controller.activeFeed().id}
        generators={props.controller.workspace.generators}
        onFeedSelect={props.controller.switchFeed}
        onToggleDrawer={props.controller.toggleFeedsDrawer}
        pinnedFeeds={props.controller.pinnedFeeds().slice(0, 9)} />
    </header>
  );
}

export function FeedPane(props: { controller: FeedWorkspaceController }) {
  const session = useAppSession();

  return (
    <section class="grid min-h-0 min-w-0 overflow-hidden grid-rows-[auto_minmax(0,1fr)] rounded-4xl bg-surface-container shadow-(--inset-shadow)">
      <FeedPaneHeader controller={props.controller} />
      <FeedScroller
        controller={props.controller}
        activeAvatar={session.activeAvatar}
        activeHandle={session.activeHandle ?? ""} />
    </section>
  );
}

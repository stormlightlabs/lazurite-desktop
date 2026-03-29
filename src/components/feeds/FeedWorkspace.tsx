import { FeedComposer } from "./FeedComposer";
import { SavedFeedsDrawer } from "./FeedDrawer";
import { FeedPane } from "./FeedPane";
import { FeedWorkspaceSidebar } from "./FeedWorkspaceSidebar";
import { ThreadPanel } from "./ThreadPanel";
import { type FeedWorkspaceProps, useFeedWorkspaceController } from "./useFeedWorkspaceController";

export function FeedWorkspace(props: FeedWorkspaceProps) {
  const controller = useFeedWorkspaceController(props);

  return (
    <>
      <div class="grid h-full min-h-0 min-w-0 gap-6 xl:grid-cols-[minmax(0,1fr)_20rem] max-[1180px]:gap-5 max-[900px]:gap-4">
        <FeedPane
          activeFeed={controller.activeFeed()}
          activeFeedId={controller.activeFeed().id}
          activeFeedState={controller.activeFeedState()}
          activeAvatar={props.activeAvatar}
          activeHandle={props.activeSession.handle}
          focusedIndex={controller.workspace.focusedIndex}
          generators={controller.workspace.generators}
          likePendingByUri={controller.workspace.likePendingByUri}
          likePulseUri={controller.workspace.likePulseUri}
          onCompose={controller.openComposer}
          onFeedSelect={controller.switchFeed}
          onFocusIndex={controller.setFocusedIndex}
          onLike={controller.toggleLike}
          onOpenThread={controller.openThread}
          onQuote={controller.openQuoteComposer}
          onRefresh={() => void controller.refreshActiveFeed()}
          onReply={controller.openReplyComposer}
          onRepost={controller.toggleRepost}
          onToggleDrawer={controller.toggleFeedsDrawer}
          pinnedFeeds={controller.pinnedFeeds().slice(0, 9)}
          postRefs={controller.postRefs}
          repostPendingByUri={controller.workspace.repostPendingByUri}
          repostPulseUri={controller.workspace.repostPulseUri}
          scrollerRef={controller.registerScroller}
          sentinelRef={controller.registerSentinel}
          setScrollTop={controller.rememberScrollTop}
          visibleItems={controller.visibleItems()} />

        <FeedWorkspaceSidebar
          activePref={controller.activePref()}
          drawerFeeds={controller.drawerFeeds()}
          generators={controller.workspace.generators}
          onFeedSelect={controller.switchFeed}
          onPrefChange={controller.setFeedPref} />
      </div>

      <SavedFeedsDrawer
        drawerFeeds={controller.drawerFeeds()}
        generators={controller.workspace.generators}
        open={controller.workspace.showFeedsDrawer}
        pinnedFeeds={controller.pinnedFeeds()}
        onClose={controller.closeFeedsDrawer}
        onPinFeed={controller.pinFeed}
        onReorderPinned={controller.reorderPinnedFeeds}
        onSelectFeed={controller.switchFeed}
        onUnpinFeed={controller.unpinFeed} />

      <ThreadPanel
        activeUri={props.threadUri}
        error={controller.workspace.thread.error}
        loading={controller.workspace.thread.loading}
        onClose={() => props.onThreadRouteChange(null)}
        onLike={(post) => void controller.toggleLike(post)}
        onOpenThread={(uri) => void controller.openThread(uri)}
        onQuote={(post) => controller.openQuoteComposer(post)}
        onReply={(post, root) => controller.openReplyComposer(post, root)}
        onRepost={(post) => void controller.toggleRepost(post)}
        thread={controller.workspace.thread.data} />

      <FeedComposer
        activeAvatar={props.activeAvatar}
        activeHandle={props.activeSession.handle}
        open={controller.workspace.composer.open}
        pending={controller.workspace.composer.pending}
        quoteTarget={controller.workspace.composer.quoteTarget}
        replyTarget={controller.workspace.composer.replyTarget}
        suggestions={controller.composerSuggestions()}
        text={controller.workspace.composer.text}
        onApplySuggestion={controller.applySuggestion}
        onClearQuote={controller.clearQuoteComposer}
        onClearReply={controller.clearReplyComposer}
        onClose={controller.resetComposer}
        onSubmit={() => void controller.submitPost()}
        onTextChange={controller.setComposerText} />
    </>
  );
}

import { usePostNavigation } from "$/components/posts/hooks/usePostNavigation";
import { useThreadOverlayNavigation } from "$/components/posts/hooks/useThreadOverlayNavigation";
import { Icon } from "$/components/shared/Icon";
import { useAppSession } from "$/contexts/app-session";
import { Show } from "solid-js";
import { Motion, Presence } from "solid-motionone";
import { DraftsList } from "./DraftsList";
import { FeedComposer } from "./FeedComposer";
import { SavedFeedsDrawer } from "./FeedDrawer";
import { FeedPane } from "./FeedPane";
import { FeedWorkspaceSidebar } from "./FeedWorkspaceSidebar";
import { useFeedWorkspaceController } from "./hooks/useFeedWorkspaceController";

export function FeedWorkspace() {
  const session = useAppSession();
  const postNavigation = usePostNavigation();
  const threadOverlay = useThreadOverlayNavigation();
  const activeSession = () => {
    if (!session.activeSession) {
      throw new Error("FeedWorkspace requires an active session");
    }

    return session.activeSession;
  };
  const controller = useFeedWorkspaceController({
    activeSession: activeSession(),
    onError: session.reportError,
    onOpenPostEngagement: (uri, tab) => void postNavigation.openPostEngagement(uri, tab),
    onOpenThread: (uri) => void threadOverlay.openThread(uri),
  });

  return (
    <>
      <div class="grid h-full min-h-0 min-w-0 gap-6 xl:grid-cols-[minmax(0,1fr)_20rem] max-lg:gap-5 max-md:gap-4">
        <FeedPane controller={controller} />

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

      <FeedComposer
        handlers={{
          onApplySuggestion: controller.applySuggestion,
          onClearQuote: controller.clearQuoteComposer,
          onClearReply: controller.clearReplyComposer,
          onClose: () => void controller.resetComposer(),
          onOpenDrafts: controller.openDraftsList,
          onSaveDraft: () => void controller.saveAndCloseComposer(),
          onSubmit: () => void controller.submitPost(),
          onTextChange: controller.setComposerText,
        }}
        identity={{ activeAvatar: session.activeAvatar, activeHandle: session.activeHandle }}
        state={{
          autosaveStatus: controller.workspace.composer.autosaveStatus,
          draftCount: controller.workspace.draftCount,
          open: controller.workspace.composer.open,
          pending: controller.workspace.composer.pending,
          quoteTarget: controller.workspace.composer.quoteTarget,
          replyTarget: controller.workspace.composer.replyTarget,
          suggestions: controller.composerSuggestions(),
          text: controller.workspace.composer.text,
        }} />

      <DraftsList
        accountDid={activeSession().did}
        composerHasContent={controller.composerHasContent()}
        open={controller.workspace.showDraftsList}
        refreshNonce={controller.workspace.draftsListRefreshNonce}
        onClose={controller.closeDraftsList}
        onLoadDraft={controller.loadDraft} />

      <Presence>
        <Show when={controller.workspace.restoreDraftId}>
          <RestoreDraftToast
            onDiscard={() => void controller.dismissRestore()}
            onRestore={() => void controller.restoreDraft()} />
        </Show>
      </Presence>
    </>
  );
}

function RestoreDraftToast(props: { onRestore: () => void; onDiscard: () => void }) {
  return (
    <Motion.div
      role="alert"
      aria-live="polite"
      class="fixed bottom-6 left-1/2 z-50 w-max max-w-[min(28rem,calc(100vw-2rem))] -translate-x-1/2 overflow-hidden rounded-2xl bg-surface-container-high shadow-[0_24px_40px_rgba(0,0,0,0.45),0_0_0_1px_rgba(125,175,255,0.12)] backdrop-blur-[20px]"
      initial={{ opacity: 0, y: 20, scale: 0.96 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, y: 16, scale: 0.94 }}
      transition={{ duration: 0.2 }}>
      <div class="flex items-center gap-3 px-4 py-3">
        <Icon aria-hidden="true" iconClass="i-ri-draft-line" class="shrink-0 text-primary" />
        <p class="m-0 min-w-0 text-[0.875rem] text-on-surface">You have an unsaved post. Restore?</p>
        <div class="flex shrink-0 items-center gap-2">
          <button
            class="rounded-full border-0 bg-primary/20 px-3 py-1.5 text-xs font-medium text-primary transition hover:bg-primary/30"
            type="button"
            onClick={() => props.onRestore()}>
            Restore
          </button>
          <button
            class="rounded-full border-0 bg-transparent px-3 py-1.5 text-xs text-on-surface-variant transition hover:bg-surface-bright"
            type="button"
            onClick={() => props.onDiscard()}>
            Discard
          </button>
        </div>
      </div>
    </Motion.div>
  );
}

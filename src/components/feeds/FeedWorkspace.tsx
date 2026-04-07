import { useThreadOverlayNavigation } from "$/components/posts/useThreadOverlayNavigation";
import { useAppSession } from "$/contexts/app-session";
import { DraftsList } from "./DraftsList";
import { FeedComposer } from "./FeedComposer";
import { SavedFeedsDrawer } from "./FeedDrawer";
import { FeedPane } from "./FeedPane";
import { FeedWorkspaceSidebar } from "./FeedWorkspaceSidebar";
import { useFeedWorkspaceController } from "./useFeedWorkspaceController";

export function FeedWorkspace() {
  const session = useAppSession();
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
    onOpenThread: (uri) => void threadOverlay.openThread(uri),
  });

  return (
    <>
      <div class="grid h-full min-h-0 min-w-0 gap-6 xl:grid-cols-[minmax(0,1fr)_20rem] max-[1180px]:gap-5 max-[900px]:gap-4">
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
        activeAvatar={session.activeAvatar}
        activeHandle={session.activeHandle}
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
        onOpenDrafts={controller.openDraftsList}
        onSubmit={() => void controller.submitPost()}
        onTextChange={controller.setComposerText} />

      <DraftsList
        accountDid={activeSession().did}
        composerHasContent={controller.composerHasContent()}
        open={controller.workspace.showDraftsList}
        onClose={controller.closeDraftsList}
        onLoadDraft={controller.loadDraft} />
    </>
  );
}

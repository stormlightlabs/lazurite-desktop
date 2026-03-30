import { useAppSession } from "$/contexts/app-session";
import { createPost } from "$/lib/api/feeds";
import { POST_CREATED_EVENT } from "$/lib/constants/events";
import { emitTo } from "@tauri-apps/api/event";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { createSignal } from "solid-js";
import { ComposerSurface } from "./FeedComposer";

async function closeWindow() {
  await getCurrentWindow().close();
}

export function ComposerWindow() {
  const session = useAppSession();
  const [pending, setPending] = createSignal(false);
  const [text, setText] = createSignal("");

  async function submitPost() {
    const nextText = text().trim();
    if (!nextText) {
      return;
    }

    setPending(true);
    try {
      await createPost(nextText, null, null);
      await emitTo("main", POST_CREATED_EVENT, null);
      await closeWindow();
    } catch (error) {
      session.reportError(`Failed to create post: ${String(error)}`);
    } finally {
      setPending(false);
    }
  }

  return (
    <div class="min-h-screen bg-[radial-gradient(circle_at_top,rgba(125,175,255,0.12),transparent_32%),#000]">
      <ComposerSurface
        activeAvatar={session.activeAvatar}
        activeHandle={session.activeHandle}
        layout="window"
        pending={pending()}
        quoteTarget={null}
        replyTarget={null}
        suggestions={[]}
        text={text()}
        onApplySuggestion={() => {}}
        onClearQuote={() => {}}
        onClearReply={() => {}}
        onClose={() => void closeWindow()}
        onSubmit={() => void submitPost()}
        onTextChange={setText} />
    </div>
  );
}

import { Show } from "solid-js";
import { Motion, Presence } from "solid-motionone";
import { Icon } from "../shared/Icon";

export type MediaNotice = { kind: "error"; message: string } | { kind: "success"; message: string; path: string };

type MediaNoticeToastProps = {
  notice: MediaNotice | null;
  onDismiss: () => void;
  onOpenPath?: (path: string) => Promise<void> | void;
};

export function MediaNoticeToast(props: MediaNoticeToastProps) {
  return (
    <Presence>
      <Show when={props.notice}>
        {(current) => (
          <Motion.div
            role={current().kind === "error" ? "alert" : "status"}
            aria-live={current().kind === "error" ? "assertive" : "polite"}
            class="fixed bottom-6 left-1/2 z-70 grid w-max max-w-[min(34rem,calc(100vw-2rem))] -translate-x-1/2 grid-cols-[auto_1fr_auto_auto] items-center gap-2 rounded-full bg-surface-container-high px-4 py-3 text-on-surface shadow-[0_24px_40px_rgba(0,0,0,0.4),inset_0_0_0_1px_rgba(255,255,255,0.06)] backdrop-blur-[20px] max-sm:w-[calc(100vw-1.5rem)]"
            initial={{ opacity: 0, y: 20, scale: 0.96 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 16, scale: 0.94 }}
            transition={{ duration: 0.2 }}>
            <Icon
              kind={current().kind === "error" ? "danger" : "complete"}
              aria-hidden="true"
              classList={{
                "text-emerald-300": current().kind === "success",
                "text-error": current().kind === "error",
              }} />
            <p class="m-0 min-w-0 text-[0.875rem] text-on-surface">{current().message}</p>
            <Show when={current().kind === "success"}>
              <button
                type="button"
                class="rounded-full border-0 bg-primary/20 px-3 py-1.5 text-xs font-medium text-primary transition hover:bg-primary/30"
                onClick={() => {
                  const notice = current();
                  if (notice.kind === "success") {
                    void props.onOpenPath?.(notice.path);
                  }
                }}>
                Open in Finder
              </button>
            </Show>
            <button
              type="button"
              class="cursor-pointer rounded-full border-0 bg-transparent p-[0.35rem] text-inherit hover:bg-surface-bright"
              onClick={() => props.onDismiss()}>
              <Icon kind="close" aria-hidden="true" />
              <span class="sr-only">Dismiss message</span>
            </button>
          </Motion.div>
        )}
      </Show>
    </Presence>
  );
}

import type { Accessor } from "solid-js";
import { Motion, Presence } from "solid-motionone";

type ErrorToastProps = { message: Accessor<string | null>; onDismiss: () => void };

export function ErrorToast(props: ErrorToastProps) {
  return (
    <Presence>
      {props.message() && (
        <Motion.div
          role="alert"
          aria-live="assertive"
          class="fixed bottom-6 left-1/2 grid w-max max-w-[min(30rem,calc(100vw-2rem))] -translate-x-1/2 grid-cols-[auto_1fr_auto] items-center gap-3 rounded-full bg-error-surface px-4 py-3 text-on-surface shadow-[0_24px_40px_rgba(125,175,255,0.05)] backdrop-blur-[20px] max-sm:w-[calc(100vw-1.5rem)]"
          initial={{ opacity: 0, y: 20, scale: 0.96 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: 16, scale: 0.94 }}
          transition={{ duration: 0.2 }}>
          <span class="flex items-center text-error" aria-hidden="true">
            <i class="i-ri-error-warning-line" />
          </span>
          <p class="m-0 text-[0.875rem] text-on-surface">{props.message()}</p>
          <button
            type="button"
            class="cursor-pointer rounded-full border-0 bg-transparent p-[0.35rem] text-inherit hover:bg-surface-bright"
            onClick={props.onDismiss}>
            <span class="flex items-center" aria-hidden="true">
              <i class="i-ri-close-line" />
            </span>
            <span class="sr-only">Dismiss error</span>
          </button>
        </Motion.div>
      )}
    </Presence>
  );
}

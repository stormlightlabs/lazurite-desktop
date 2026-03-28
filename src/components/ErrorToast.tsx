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
          class="error-toast"
          initial={{ opacity: 0, y: 20, scale: 0.96 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: 16, scale: 0.94 }}
          transition={{ duration: 0.2 }}>
          <span class="flex items-center error-toast__glyph" aria-hidden="true">
            <i class="i-ri-error-warning-line" />
          </span>
          <p class="error-toast__message">{props.message()}</p>
          <button type="button" class="error-toast__dismiss" onClick={props.onDismiss}>
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

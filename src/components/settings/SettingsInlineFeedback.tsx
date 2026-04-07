import { createSignal, onCleanup, Show } from "solid-js";
import { Icon } from "../shared/Icon";

type SettingsFeedback = { kind: "error" | "success"; message: string };

export function useTransientFeedback(timeoutMs = 5000) {
  const [feedback, setFeedback] = createSignal<SettingsFeedback | null>(null);
  let timer: ReturnType<typeof setTimeout> | null = null;

  onCleanup(() => {
    if (timer !== null) {
      clearTimeout(timer);
    }
  });

  function dismissFeedback() {
    setFeedback(null);
    if (timer !== null) {
      clearTimeout(timer);
      timer = null;
    }
  }

  function queueFeedback(nextFeedback: SettingsFeedback) {
    dismissFeedback();
    setFeedback(nextFeedback);
    timer = setTimeout(() => {
      setFeedback(null);
      timer = null;
    }, timeoutMs);
  }

  return { feedback, dismissFeedback, queueFeedback };
}

export function SettingsInlineFeedback(props: { feedback: SettingsFeedback | null }) {
  return (
    <Show when={props.feedback}>
      {(currentFeedback) => {
        const message = currentFeedback().message;
        const kind = currentFeedback().kind;
        return (
          <div
            role={kind === "error" ? "alert" : "status"}
            aria-live={kind === "error" ? "assertive" : "polite"}
            class="inline-flex w-fit items-center gap-2 rounded-full bg-surface-container-high px-3 py-1.5 text-sm"
            classList={{ "text-emerald-300": kind === "success", "text-red-300": kind === "error" }}>
            <Icon kind={kind === "success" ? "complete" : "danger"} aria-hidden="true" />
            <span>{message}</span>
          </div>
        );
      }}
    </Show>
  );
}

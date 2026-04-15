import { Motion } from "solid-motionone";
import { Icon } from "./shared/Icon";

export function ReauthBanner(props: { onReauth: () => void }) {
  return (
    <Motion.div
      class="flex items-center justify-between gap-4 rounded-lg bg-primary/12 p-4 max-[920px]:flex-col max-[920px]:items-stretch"
      role="status"
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0, scale: [1, 1.008, 1] }}
      exit={{ opacity: 0, y: 8 }}
      transition={{ duration: 0.9, easing: "ease-in-out" }}>
      <div class="grid gap-[0.2rem]">
        <p class="m-0 text-base font-semibold">Your session expired.</p>
        <p class="m-0 text-xs text-on-surface-variant">Sign in again to reconnect your account.</p>
      </div>
      <button class="pill-action border-0 bg-white/8 text-on-surface" type="button" onClick={() => props.onReauth()}>
        <Icon kind="refresh" name="refresh" aria-hidden class="mr-1" />
        Sign in again
      </button>
    </Motion.div>
  );
}

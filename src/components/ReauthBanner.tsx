import { Motion } from "solid-motionone";
import { Icon } from "./shared/Icon";

export function ReauthBanner(props: { onReauth: () => void }) {
  return (
    <Motion.div
      class="flex items-center justify-between gap-4 rounded-2xl bg-primary/12 px-[1.1rem] py-4 max-[920px]:flex-col max-[920px]:items-stretch"
      role="status"
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0, scale: [1, 1.015, 1] }}
      exit={{ opacity: 0, y: 8 }}
      transition={{ duration: 1.8, repeat: Number.POSITIVE_INFINITY, easing: "ease-in-out" }}>
      <div class="grid gap-[0.2rem]">
        <p class="m-0 text-[0.95rem] font-semibold">Sign in again to reconnect this account.</p>
        <p class="m-0 text-[0.78rem] text-on-surface-variant">
          We couldn&apos;t restore the last session automatically.
        </p>
      </div>
      <button class="pill-action border-0 bg-white/8 text-on-surface" type="button" onClick={() => props.onReauth()}>
        <Icon kind="refresh" name="refresh" aria-hidden="true" class="mr-1" />
        Sign in again
      </button>
    </Motion.div>
  );
}

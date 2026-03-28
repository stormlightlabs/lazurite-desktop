import { Show } from "solid-js";

export function Wordmark(props: { class?: string; compact?: boolean; iconClass?: string }) {
  return (
    <div
      class="flex items-center gap-3"
      classList={{ "flex-col gap-2 text-center": !!props.compact, [props.class ?? ""]: !!props.class }}>
      <span
        class="grid shrink-0 place-items-center rounded-3xl bg-[linear-gradient(165deg,rgba(255,255,255,0.06),rgba(255,255,255,0.01))] p-3 shadow-[inset_0_0_0_1px_rgba(255,255,255,0.04),0_0_26px_rgba(125,175,255,0.16)]"
        classList={{ [props.iconClass ?? ""]: !!props.iconClass }}
        aria-hidden="true">
        <img class="h-9 w-9 drop-shadow-[0_0_14px_rgba(125,175,255,0.28)]" src="/lazurite.svg" alt="" />
      </span>
      <Show when={!props.compact}>
        <div class="grid">
          <p class="m-0 text-[0.9rem] font-semibold tracking-tight">Lazurite</p>
          <p class="overline-copy text-[0.68rem] text-on-surface-variant">Desktop</p>
        </div>
      </Show>
    </div>
  );
}

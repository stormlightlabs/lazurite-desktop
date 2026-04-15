import { Show } from "solid-js";

export function LazuriteLogo(props: { class?: string }) {
  return (
    <svg class={props.class} viewBox="0 0 512 512" fill="currentColor" aria-hidden>
      <path d="M128 16v99.3l119 118.9V120.1zm256 0L265 120.1v114.1l119-119zM16 128l104 119h114.2L115.3 128zm380.8 0l-119 119h114.1l104-119zM120 265L16 384h99.2l119-119zm157.8 0l119 119h99.1l-104-119zM247 277.8l-119 119V496l119-104.1zm18 0v114.1L384 496v-99.2z" />
    </svg>
  );
}

export function Wordmark(props: { class?: string; compact?: boolean; iconClass?: string }) {
  return (
    <div
      class="flex items-center gap-3"
      classList={{ "flex-col gap-2 text-center": !!props.compact, [props.class ?? ""]: !!props.class }}>
      <span
        class="grid shrink-0 place-items-center rounded-xl p-3 text-primary"
        style={{ background: "var(--control-bg)", "box-shadow": "var(--inset-shadow)" }}
        classList={{ [props.iconClass ?? ""]: !!props.iconClass }}
        aria-hidden>
        <LazuriteLogo class="h-9 w-9" />
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

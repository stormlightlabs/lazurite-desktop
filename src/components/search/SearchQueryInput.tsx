import { Show } from "solid-js";
import { Icon } from "../shared/Icon";

type SearchQueryInputProps = {
  error: string | null;
  inputRef?: (el: HTMLInputElement) => void;
  loading: boolean;
  placeholder: string;
  query: string;
  onClear: () => void;
  onKeyDown?: (event: KeyboardEvent) => void;
  onQueryChange: (value: string) => void;
};

export function SearchQueryInput(props: SearchQueryInputProps) {
  return (
    <div class="grid gap-2">
      <div class="relative">
        <div class="absolute left-4 top-1/2 -translate-y-1/2 text-on-surface-variant">
          <Icon kind="search" class="text-lg" />
        </div>

        <input
          ref={props.inputRef}
          type="text"
          value={props.query}
          placeholder={props.placeholder}
          class="w-full rounded-3xl border-0 bg-black/40 py-3.5 pl-12 pr-20 text-base text-on-surface placeholder:text-on-surface-variant/50 outline-none ring-1 ring-white/5 transition-all focus:ring-primary/50"
          onInput={(event) => props.onQueryChange(event.currentTarget.value)}
          onKeyDown={(event) => props.onKeyDown?.(event)} />

        <div class="absolute right-3 top-1/2 flex -translate-y-1/2 items-center gap-2">
          <LoadingIndicator loading={props.loading} />
          <ClearButton query={props.query} loading={props.loading} onClear={props.onClear} />
        </div>
      </div>

      <Show when={props.error}>
        {(message) => (
          <div class="rounded-2xl bg-red-500/10 px-3 py-2 text-sm text-red-200 shadow-[inset_0_0_0_1px_rgba(239,68,68,0.15)]">
            {message()}
          </div>
        )}
      </Show>
    </div>
  );
}

function LoadingIndicator(props: { loading: boolean }) {
  return (
    <Show when={props.loading}>
      <span class="flex items-center text-on-surface-variant">
        <Icon iconClass="i-ri-loader-4-line animate-spin" class="text-base" />
      </span>
    </Show>
  );
}

function ClearButton(props: { query: string; loading: boolean; onClear: () => void }) {
  return (
    <Show when={props.query && !props.loading}>
      <button
        type="button"
        onClick={() => props.onClear()}
        class="inline-flex items-center gap-1.5 rounded-lg border-0 bg-white/10 px-2 py-1 text-xs text-on-surface-variant transition hover:bg-white/20 hover:text-on-surface">
        <kbd class="rounded bg-white/10 px-1">ESC</kbd>
        clear
      </button>
    </Show>
  );
}

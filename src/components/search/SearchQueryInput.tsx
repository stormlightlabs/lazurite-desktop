import type { JSX, ParentProps } from "solid-js";
import { Show } from "solid-js";
import { Icon, LoadingIcon } from "../shared/Icon";

type SearchQueryInputA11y = {
  ariaActivedescendant?: string;
  ariaAutocomplete?: "both" | "inline" | "list" | "none";
  ariaControls?: string;
  ariaExpanded?: boolean;
  autocomplete?: string;
  role?: JSX.InputHTMLAttributes<HTMLInputElement>["role"];
  spellcheck?: boolean;
};

type SearchQueryInputState = { error: string | null; loading: boolean; placeholder: string; query: string };

type SearchQueryInputHandlers = {
  onClear: () => void;
  onFocus?: () => void;
  onKeyDown?: (event: KeyboardEvent) => void;
  onQueryChange: (value: string) => void;
};

type SearchQueryInputRefs = { inputRef?: (el: HTMLInputElement) => void };

type SearchQueryInputProps = ParentProps & {
  a11y?: SearchQueryInputA11y;
  actions: SearchQueryInputHandlers;
  refs?: SearchQueryInputRefs;
  state: SearchQueryInputState;
};

export function SearchQueryInput(props: SearchQueryInputProps) {
  return (
    <div class="grid gap-2">
      <SearchInputField a11y={props.a11y} actions={props.actions} refs={props.refs} state={props.state}>
        {props.children}
      </SearchInputField>
      <Show when={props.state.error}>
        {(message) => (
          <div class="rounded-2xl bg-red-500/10 px-3 py-2 text-sm text-red-200 shadow-[inset_0_0_0_1px_rgba(239,68,68,0.15)]">
            {message()}
          </div>
        )}
      </Show>
    </div>
  );
}

function SearchInputField(
  props: ParentProps & {
    a11y?: SearchQueryInputA11y;
    actions: SearchQueryInputHandlers;
    refs?: SearchQueryInputRefs;
    state: SearchQueryInputState;
  },
) {
  return (
    <div class="relative">
      <div class="absolute left-4 top-1/2 -translate-y-1/2 text-on-surface-variant">
        <Icon kind="search" class="text-lg" />
      </div>

      <input
        ref={props.refs?.inputRef}
        type="text"
        role={props.a11y?.role}
        aria-activedescendant={props.a11y?.ariaActivedescendant}
        aria-autocomplete={props.a11y?.ariaAutocomplete}
        aria-controls={props.a11y?.ariaControls}
        aria-expanded={props.a11y?.ariaExpanded}
        autocomplete={props.a11y?.autocomplete}
        spellcheck={props.a11y?.spellcheck}
        value={props.state.query}
        placeholder={props.state.placeholder}
        class="w-full rounded-3xl border-0 bg-black/40 py-3.5 pl-12 pr-20 text-base text-on-surface placeholder:text-on-surface-variant/50 outline-none ring-1 ring-white/5 transition-all focus:ring-primary/50"
        onInput={(event) => props.actions.onQueryChange(event.currentTarget.value)}
        onFocus={() => props.actions.onFocus?.()}
        onKeyDown={(event) => props.actions.onKeyDown?.(event)} />

      <div class="absolute right-3 top-1/2 flex -translate-y-1/2 items-center gap-2">
        <LoadingIcon isLoading={props.state.loading} class="text-base text-on-surface-variant" />;
        <ClearButton query={props.state.query} loading={props.state.loading} onClear={props.actions.onClear} />
      </div>

      {props.children}
    </div>
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

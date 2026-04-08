import { ActorSuggestionList, useActorSuggestions } from "$/components/actors/ActorSearch";
import { ArrowIcon, Icon } from "$/components/shared/Icon";
import type { LoginSuggestion } from "$/lib/types";
import { createEffect, createSignal, Show } from "solid-js";

type ExplorerUrlBarProps = {
  value: string;
  canGoBack: boolean;
  canGoForward: boolean;
  canExport: boolean;
  clearingIconCache: boolean;
  onInput: (value: string) => void;
  onSubmit: (value: string) => void;
  onBack: () => void;
  onForward: () => void;
  onClearIconCache: () => void;
  onExport: () => void;
};

function NavButton(props: { direction: "left" | "right"; disabled: boolean; onClick: () => void }) {
  return (
    <button
      onClick={() => props.onClick()}
      disabled={props.disabled}
      class="p-2 rounded-lg text-on-surface-variant hover:text-on-surface hover:bg-white/5 transition-all disabled:opacity-30 disabled:cursor-not-allowed"
      aria-label={props.direction === "left" ? "Back" : "Forward"}
      title={props.direction === "left" ? "Back" : "Forward"}>
      <ArrowIcon direction={props.direction} />
    </button>
  );
}

function UrlInputForm(props: { value: string; onInput: (value: string) => void; onSubmit: (value: string) => void }) {
  let container: HTMLFormElement | undefined;
  let input: HTMLInputElement | undefined;
  const [focused, setFocused] = createSignal(false);
  const typeahead = useActorSuggestions({
    container: () => container,
    disabled: () => !props.value.trim().startsWith("@"),
    input: () => input,
    value: () => props.value,
  });

  createEffect(() => {
    if (focused() && typeahead.suggestions().length > 0 && props.value.trim().startsWith("@")) {
      typeahead.focus();
    }
  });

  function handleSubmit(event: Event) {
    event.preventDefault();
    props.onSubmit(props.value);
  }

  function applySuggestion(suggestion: LoginSuggestion) {
    const nextValue = suggestion.handle.startsWith("@") ? suggestion.handle : `@${suggestion.handle}`;
    props.onInput(nextValue);
    typeahead.close();
    props.onSubmit(nextValue);
    input?.focus();
  }

  function handleKeyDown(event: KeyboardEvent) {
    if (event.key === "ArrowDown") {
      event.preventDefault();
      typeahead.moveActiveIndex(1);
      return;
    }

    if (event.key === "ArrowUp") {
      event.preventDefault();
      typeahead.moveActiveIndex(-1);
      return;
    }

    if (event.key === "Escape") {
      typeahead.close();
      return;
    }

    if (event.key === "Enter" && typeahead.open() && typeahead.activeSuggestion()) {
      event.preventDefault();
      applySuggestion(typeahead.activeSuggestion() as LoginSuggestion);
    }
  }

  return (
    <form
      ref={(element) => {
        container = element;
      }}
      onSubmit={handleSubmit}
      class="flex-1 relative">
      <div class="flex items-center gap-3 px-4 py-2 rounded-xl bg-black/40 shadow-[inset_0_0_0_1px_rgba(125,175,255,0.12)]">
        <Icon kind="explore" class="text-primary/80" />
        <input
          ref={(element) => {
            input = element;
          }}
          data-explorer-input
          type="text"
          role="combobox"
          aria-autocomplete="list"
          aria-controls="explorer-suggestions"
          aria-activedescendant={typeahead.activeIndex() >= 0
            ? `explorer-suggestions-option-${typeahead.activeIndex()}`
            : undefined}
          aria-expanded={typeahead.open()}
          value={props.value}
          spellcheck={false}
          onInput={(event) => props.onInput(event.currentTarget.value)}
          onFocus={() => {
            setFocused(true);
            typeahead.focus();
          }}
          onBlur={() => {
            setFocused(false);
            typeahead.close();
          }}
          onKeyDown={(event) => handleKeyDown(event)}
          class="flex-1 bg-transparent text-sm font-mono outline-none text-on-surface placeholder:text-on-surface-variant/50"
          placeholder="at://did:... or @handle or https://pds..." />
        <Show when={typeahead.loading()}>
          <span class="flex items-center text-on-surface-variant">
            <Icon kind="loader" aria-hidden="true" />
          </span>
        </Show>
        <button
          type="submit"
          class="p-1.5 rounded-lg text-on-surface-variant hover:text-on-surface hover:bg-white/5 transition-all">
          <Icon kind="search" />
        </button>
      </div>
      <ActorSuggestionList
        activeIndex={typeahead.activeIndex()}
        id="explorer-suggestions"
        open={typeahead.open()}
        suggestions={typeahead.suggestions()}
        title="Suggested handles"
        onSelect={applySuggestion} />
    </form>
  );
}

export function ExplorerUrlBar(props: ExplorerUrlBarProps) {
  return (
    <header class="sticky top-0 z-40 border-b border-white/5 bg-surface-container/80 backdrop-blur-xl">
      <div class="px-6 py-4 flex items-center gap-3">
        <div class="flex gap-1">
          <NavButton direction="left" disabled={!props.canGoBack} onClick={props.onBack} />
          <NavButton direction="right" disabled={!props.canGoForward} onClick={props.onForward} />
        </div>

        <UrlInputForm value={props.value} onInput={props.onInput} onSubmit={props.onSubmit} />

        <button
          onClick={() => props.onSubmit(props.value)}
          class="p-2 rounded-lg text-on-surface-variant hover:text-on-surface hover:bg-white/5 transition-all"
          aria-label="Reload"
          title="Reload">
          <Icon kind="refresh" />
        </button>

        <button
          onClick={() => props.onClearIconCache()}
          disabled={props.clearingIconCache}
          class="p-2 rounded-lg text-on-surface-variant hover:text-on-surface hover:bg-white/5 transition-all disabled:cursor-not-allowed disabled:opacity-30"
          aria-label="Clear icon cache"
          title="Clear icon cache">
          <Icon iconClass={props.clearingIconCache ? "i-ri-loader-4-line" : "i-ri-delete-bin-6-line"} />
        </button>

        <button
          onClick={() => props.onExport()}
          disabled={!props.canExport}
          class="p-2 rounded-lg text-on-surface-variant hover:text-on-surface hover:bg-white/5 transition-all disabled:cursor-not-allowed disabled:opacity-30"
          aria-label="Download CAR"
          title="Download CAR">
          <Icon iconClass="i-ri-download-2-line" />
        </button>
      </div>
    </header>
  );
}

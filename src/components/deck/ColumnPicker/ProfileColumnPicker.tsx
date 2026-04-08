import { ActorSuggestionList, useActorSuggestions } from "$/components/actors/ActorSearch";
import { Icon } from "$/components/shared/Icon";
import type { LoginSuggestion } from "$/lib/types";
import * as logger from "@tauri-apps/plugin-log";
import { createSignal, Show } from "solid-js";
import type { ProfileSelection } from "../types";

function TypeaheadLoading(props: { visible: boolean }) {
  return (
    <Show when={props.visible}>
      <span class="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-on-surface-variant">
        <Icon kind="loader" class="animate-spin text-sm" />
      </span>
    </Show>
  );
}

export function ProfilePicker(props: { onSubmit: (selection: ProfileSelection) => void }) {
  let container: HTMLDivElement | undefined;
  let input: HTMLInputElement | undefined;
  const [value, setValue] = createSignal("");
  const typeahead = useActorSuggestions({
    container: () => container,
    input: () => input,
    onError: (error) => logger.warn(`Failed to load profile suggestions: ${String(error)}`),
    value,
  });

  function submitManualActor() {
    const actor = value().trim();
    if (!actor) {
      return;
    }

    typeahead.close();
    props.onSubmit({ actor });
  }

  function submitSuggestion(suggestion: LoginSuggestion) {
    typeahead.close();
    props.onSubmit({
      actor: suggestion.handle,
      did: suggestion.did,
      displayName: suggestion.displayName ?? null,
      handle: suggestion.handle,
    });
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
      submitSuggestion(typeahead.activeSuggestion() as LoginSuggestion);
    }
  }

  return (
    <form
      class="grid gap-3"
      onSubmit={(event) => {
        event.preventDefault();
        submitManualActor();
      }}>
      <label class="grid gap-1.5">
        <span class="text-xs font-medium uppercase tracking-wide text-on-surface-variant">Handle or DID</span>
        <div
          class="relative"
          ref={(element) => {
            container = element as HTMLDivElement;
          }}>
          <input
            ref={(element) => {
              input = element;
            }}
            type="text"
            role="combobox"
            aria-autocomplete="list"
            aria-controls="profile-suggestions"
            aria-activedescendant={typeahead.activeIndex() >= 0
              ? `profile-suggestions-option-${typeahead.activeIndex()}`
              : undefined}
            aria-expanded={typeahead.open()}
            class="w-full rounded-xl border-0 bg-white/6 px-4 py-2.5 pr-10 text-sm text-on-surface placeholder:text-on-surface-variant/50 shadow-[inset_0_0_0_1px_rgba(255,255,255,0.06)] outline-none focus:shadow-[inset_0_0_0_1px_rgba(125,175,255,0.4)]"
            placeholder="alice.bsky.social"
            spellcheck={false}
            value={value()}
            onFocus={() => typeahead.focus()}
            onInput={(event) => setValue(event.currentTarget.value)}
            onKeyDown={(event) => handleKeyDown(event)} />

          <TypeaheadLoading visible={typeahead.loading()} />
          <ActorSuggestionList
            activeIndex={typeahead.activeIndex()}
            id="profile-suggestions"
            open={typeahead.open()}
            suggestions={typeahead.suggestions()}
            title="Suggested profiles"
            onSelect={submitSuggestion} />
        </div>
      </label>

      <button
        type="submit"
        disabled={!value().trim()}
        class="flex items-center justify-center gap-2 rounded-xl border-0 bg-primary/15 px-4 py-2.5 text-sm font-medium text-primary transition duration-150 hover:-translate-y-px hover:bg-primary/25 disabled:cursor-not-allowed disabled:opacity-40">
        <span class="flex items-center">
          <i class="i-ri-user-3-line" />
        </span>
        Open profile
      </button>
    </form>
  );
}

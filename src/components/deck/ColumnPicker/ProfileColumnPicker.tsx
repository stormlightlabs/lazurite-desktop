import { ActorSuggestionList, useActorSuggestions } from "$/components/actors/ActorSearch";
import { ActorTypeaheadLoading } from "$/components/actors/ActorTypeaheadLoading";
import { useActorTypeaheadCombobox } from "$/components/actors/hooks/useActorTypeaheadCombobox";
import { Icon } from "$/components/shared/Icon";
import type { ActorSuggestion } from "$/lib/types";
import * as logger from "@tauri-apps/plugin-log";
import { createSignal } from "solid-js";
import type { ProfileSelection } from "../types";

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
  const combobox = useActorTypeaheadCombobox({
    ariaControls: "profile-suggestions",
    onSelect: submitSuggestion,
    typeahead,
  });

  function submitManualActor() {
    const actor = value().trim();
    if (!actor) {
      return;
    }

    typeahead.close();
    props.onSubmit({ actor });
  }

  function submitSuggestion(suggestion: ActorSuggestion) {
    typeahead.close();
    props.onSubmit({
      actor: suggestion.handle,
      did: suggestion.did,
      displayName: suggestion.displayName ?? null,
      handle: suggestion.handle,
    });
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
            aria-controls={combobox.a11y.controls}
            aria-activedescendant={combobox.a11y.activeDescendant()}
            aria-expanded={combobox.a11y.expanded()}
            class="ui-input ui-input-strong w-full rounded-xl px-4 py-2.5 pr-10"
            placeholder="alice.bsky.social"
            spellcheck={false}
            value={value()}
            onFocus={() => typeahead.focus()}
            onInput={(event) => setValue(event.currentTarget.value)}
            onKeyDown={(event) => combobox.handleKeyDown(event)} />

          <ActorTypeaheadLoading visible={typeahead.loading()} iconClass="animate-spin text-sm" />
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
        <Icon kind="profile" />
        Open profile
      </button>
    </form>
  );
}

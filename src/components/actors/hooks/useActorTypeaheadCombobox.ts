import type { ActorSuggestion } from "$/lib/types";
import { type Accessor, createMemo } from "solid-js";

type ActorTypeaheadController = {
  activeIndex: Accessor<number>;
  activeSuggestion: () => ActorSuggestion | null;
  close: () => void;
  moveActiveIndex: (direction: 1 | -1) => void;
  open: Accessor<boolean>;
};

type HandleActorTypeaheadKeyDownOptions = {
  onEscape?: () => void;
  onSelect: (suggestion: ActorSuggestion) => void;
  typeahead: ActorTypeaheadController;
};

type UseActorTypeaheadComboboxOptions = HandleActorTypeaheadKeyDownOptions & { ariaControls: string };

export function handleActorTypeaheadKeyDown(event: KeyboardEvent, options: HandleActorTypeaheadKeyDownOptions) {
  if (event.key === "ArrowDown") {
    event.preventDefault();
    options.typeahead.moveActiveIndex(1);
    return true;
  }

  if (event.key === "ArrowUp") {
    event.preventDefault();
    options.typeahead.moveActiveIndex(-1);
    return true;
  }

  if (event.key === "Escape") {
    if (options.onEscape) {
      options.onEscape();
    } else {
      options.typeahead.close();
    }
    return true;
  }

  if (event.key !== "Enter" || !options.typeahead.open()) {
    return false;
  }

  const suggestion = options.typeahead.activeSuggestion();
  if (!suggestion) {
    return false;
  }

  event.preventDefault();
  options.onSelect(suggestion);
  return true;
}

export function useActorTypeaheadCombobox(options: UseActorTypeaheadComboboxOptions) {
  const activeDescendant = createMemo(() =>
    options.typeahead.activeIndex() >= 0
      ? `${options.ariaControls}-option-${options.typeahead.activeIndex()}`
      : undefined
  );
  const expanded = createMemo(() => options.typeahead.open());

  function handleKeyDown(event: KeyboardEvent) {
    handleActorTypeaheadKeyDown(event, options);
  }

  return { a11y: { activeDescendant, controls: options.ariaControls, expanded }, handleKeyDown };
}

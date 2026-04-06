import { AvatarBadge } from "$/components/AvatarBadge";
import { searchActorSuggestions } from "$/lib/api/actors";
import type { ActorSuggestion } from "$/lib/types";
import { type Accessor, createEffect, createSignal, For, onCleanup, onMount, Show } from "solid-js";

export const ACTOR_TYPEAHEAD_DEBOUNCE_MS = 180;

type UseActorSuggestionsOptions = {
  container: Accessor<HTMLElement | undefined>;
  disabled?: Accessor<boolean>;
  input: Accessor<HTMLInputElement | undefined>;
  onError?: (error: unknown) => void;
  value: Accessor<string>;
};

export function normalizeActorSuggestionQuery(value: string) {
  const trimmed = value.trim();
  if (trimmed.length < 2 || trimmed.startsWith("did:") || /^https?:\/\//i.test(trimmed)) {
    return "";
  }

  return trimmed.replace(/^@/, "");
}

export function getActorSuggestionHeadline(suggestion: ActorSuggestion) {
  const displayName = suggestion.displayName?.trim();
  return displayName && displayName !== suggestion.handle ? displayName : suggestion.handle.replace(/^@/, "");
}

export function useActorSuggestions(options: UseActorSuggestionsOptions) {
  let requestId = 0;

  const [activeIndex, setActiveIndex] = createSignal(-1);
  const [loading, setLoading] = createSignal(false);
  const [open, setOpen] = createSignal(false);
  const [suggestions, setSuggestions] = createSignal<ActorSuggestion[]>([]);

  createEffect(() => {
    const query = normalizeActorSuggestionQuery(options.value());
    const disabled = options.disabled?.() ?? false;
    const nextRequestId = requestId + 1;
    requestId = nextRequestId;

    if (!query || disabled) {
      setLoading(false);
      setOpen(false);
      setActiveIndex(-1);
      setSuggestions([]);
      return;
    }

    setLoading(true);

    const timeout = globalThis.setTimeout(() => {
      void searchActorSuggestions(query).then((results) => {
        if (requestId !== nextRequestId) {
          return;
        }

        setSuggestions(results);
        setActiveIndex(results.length > 0 ? 0 : -1);
        setOpen(results.length > 0 && document.activeElement === options.input());
      }).catch((error) => {
        if (requestId !== nextRequestId) {
          return;
        }

        options.onError?.(error);
        setSuggestions([]);
        setActiveIndex(-1);
        setOpen(false);
      }).finally(() => {
        if (requestId === nextRequestId) {
          setLoading(false);
        }
      });
    }, ACTOR_TYPEAHEAD_DEBOUNCE_MS);

    onCleanup(() => globalThis.clearTimeout(timeout));
  });

  onMount(() => {
    const pointerListener = {
      handleEvent(event: Event) {
        if (!open()) {
          return;
        }

        if (options.container()?.contains(event.target as Node)) {
          return;
        }

        close();
      },
    };

    globalThis.addEventListener("pointerdown", pointerListener);
    onCleanup(() => globalThis.removeEventListener("pointerdown", pointerListener));
  });

  function close() {
    setOpen(false);
    setActiveIndex(-1);
  }

  function focus() {
    setOpen(suggestions().length > 0);
  }

  function moveActiveIndex(direction: 1 | -1) {
    const items = suggestions();
    if (items.length === 0) {
      return;
    }

    setOpen(true);
    setActiveIndex((current) => {
      if (current < 0) {
        return direction > 0 ? 0 : items.length - 1;
      }

      return (current + direction + items.length) % items.length;
    });
  }

  function activeSuggestion() {
    return activeIndex() >= 0 ? suggestions()[activeIndex()] : null;
  }

  return { activeIndex, activeSuggestion, close, focus, loading, moveActiveIndex, open, suggestions };
}

export function ActorSuggestionList(
  props: {
    activeIndex: number;
    id: string;
    open: boolean;
    suggestions: ActorSuggestion[];
    title: string;
    onSelect: (suggestion: ActorSuggestion) => void;
  },
) {
  return (
    <Show when={props.open && props.suggestions.length > 0}>
      <div
        id={props.id}
        role="listbox"
        class="absolute inset-x-0 top-[calc(100%+0.7rem)] z-10 rounded-3xl bg-surface-container-highest p-2.5 shadow-[0_24px_40px_rgba(0,0,0,0.28)] backdrop-blur-[20px]">
        <p class="px-2 pb-2 text-[0.68rem] uppercase tracking-[0.12em] text-on-surface-variant">{props.title}</p>
        <div class="grid gap-1.5">
          <For each={props.suggestions}>
            {(suggestion, index) => (
              <ActorSuggestionOption
                active={props.activeIndex === index()}
                id={`${props.id}-option-${index()}`}
                suggestion={suggestion}
                onSelect={props.onSelect} />
            )}
          </For>
        </div>
      </div>
    </Show>
  );
}

function ActorSuggestionOption(
  props: { active: boolean; id: string; suggestion: ActorSuggestion; onSelect: (suggestion: ActorSuggestion) => void },
) {
  return (
    <button
      id={props.id}
      type="button"
      role="option"
      aria-selected={props.active}
      class="grid w-full grid-cols-[auto_minmax(0,1fr)] items-center gap-3 rounded-xl border-0 bg-transparent px-3 py-2.5 text-left transition duration-150 ease-out hover:bg-white/6"
      classList={{ "bg-white/7 shadow-[inset_0_0_0_1px_rgba(125,175,255,0.12)]": props.active }}
      onPointerDown={(event) => event.preventDefault()}
      onClick={() => props.onSelect(props.suggestion)}>
      <ActorSuggestionAvatar suggestion={props.suggestion} />
      <div class="min-w-0">
        <p class="m-0 truncate text-sm font-medium text-on-surface">{getActorSuggestionHeadline(props.suggestion)}</p>
        <p class="mt-0.5 truncate text-xs text-on-surface-variant">@{props.suggestion.handle.replace(/^@/, "")}</p>
      </div>
    </button>
  );
}

function ActorSuggestionAvatar(props: { suggestion: ActorSuggestion }) {
  return (
    <Show when={props.suggestion.avatar} fallback={<AvatarBadge label={props.suggestion.handle} tone="muted" />}>
      {(avatar) => (
        <img
          class="h-10 w-10 rounded-full object-cover shadow-[inset_0_0_0_1px_rgba(255,255,255,0.06)]"
          src={avatar()}
          alt={`avatar for ${props.suggestion.handle}`}
          loading="lazy" />
      )}
    </Show>
  );
}

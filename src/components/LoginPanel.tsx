import { invoke } from "@tauri-apps/api/core";
import { createEffect, createSignal, For, onCleanup, onMount, Show } from "solid-js";
import { Motion } from "solid-motionone";
import type { LoginSuggestion } from "../lib/types";
import { AvatarBadge } from "./AvatarBadge";
import { Icon } from "./shared/Icon";
import { LazuriteLogo } from "./Wordmark";

const LOGIN_TYPEAHEAD_DEBOUNCE_MS = 180;

function LoginSubmitButton(props: { pending: boolean }) {
  return (
    <button class="pill-action border-0 bg-primary text-on-primary-fixed" type="submit" disabled={props.pending}>
      <Show
        when={props.pending}
        fallback={
          <>
            <Icon kind="ext-link" name="ext-link" aria-hidden="true" class="mr-1" />
            <span>Continue</span>
          </>
        }>
        <>
          <Icon kind="loader" name="loader" aria-hidden="true" class="mr-1" />
          <span>Opening sign-in...</span>
        </>
      </Show>
    </button>
  );
}

type LoginPanelProps = {
  value: string;
  pending: boolean;
  shakeCount: number;
  onInput: (value: string) => void;
  onSubmit: () => void;
};

export function LoginPanel(props: LoginPanelProps) {
  let container: HTMLDivElement | undefined;
  let input: HTMLInputElement | undefined;
  let requestId = 0;
  const [activeIndex, setActiveIndex] = createSignal(-1);
  const [loading, setLoading] = createSignal(false);
  const [open, setOpen] = createSignal(false);
  const [suggestions, setSuggestions] = createSignal<LoginSuggestion[]>([]);

  createEffect(() => {
    if (props.shakeCount > 0) {
      input?.focus();
      input?.select();
    }
  });

  createEffect(() => {
    const query = normalizeSuggestionQuery(props.value);
    const nextRequestId = requestId + 1;
    requestId = nextRequestId;

    if (!query || props.pending) {
      setLoading(false);
      setOpen(false);
      setActiveIndex(-1);
      setSuggestions([]);
      return;
    }

    setLoading(true);

    const timeout = globalThis.setTimeout(() => {
      void invoke<LoginSuggestion[]>("search_login_suggestions", { query }).then((results) => {
        if (requestId !== nextRequestId) {
          return;
        }

        setSuggestions(results);
        setActiveIndex(results.length > 0 ? 0 : -1);
        setOpen(results.length > 0 && document.activeElement === input);
      }).catch(() => {
        if (requestId !== nextRequestId) {
          return;
        }

        setSuggestions([]);
        setActiveIndex(-1);
        setOpen(false);
      }).finally(() => {
        if (requestId === nextRequestId) {
          setLoading(false);
        }
      });
    }, LOGIN_TYPEAHEAD_DEBOUNCE_MS);

    onCleanup(() => globalThis.clearTimeout(timeout));
  });

  onMount(() => {
    const pointerListener = {
      handleEvent(event: Event) {
        if (!open()) {
          return;
        }

        if (container?.contains(event.target as Node)) {
          return;
        }

        setOpen(false);
      },
    };

    globalThis.addEventListener("pointerdown", pointerListener);
    onCleanup(() => globalThis.removeEventListener("pointerdown", pointerListener));
  });

  function applySuggestion(suggestion: LoginSuggestion) {
    props.onInput(suggestion.handle);
    setOpen(false);
    setActiveIndex(-1);
    input?.focus();
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

  function handleKeyDown(event: KeyboardEvent) {
    if (event.key === "ArrowDown") {
      event.preventDefault();
      moveActiveIndex(1);
      return;
    }

    if (event.key === "ArrowUp") {
      event.preventDefault();
      moveActiveIndex(-1);
      return;
    }

    if (event.key === "Escape") {
      setOpen(false);
      setActiveIndex(-1);
      return;
    }

    if (event.key === "Enter" && open() && activeIndex() >= 0) {
      event.preventDefault();
      applySuggestion(suggestions()[activeIndex()]);
    }
  }

  return (
    <article
      class="panel-surface grid gap-5 p-5"
      ref={(element) => {
        container = element as HTMLDivElement;
      }}>
      <div class="grid place-items-center gap-3 py-2">
        <span class="grid place-items-center text-primary">
          <LazuriteLogo class="h-14 w-14" />
        </span>
        <div class="grid place-items-center gap-0.5">
          <p class="m-0 text-[1.25rem] font-semibold tracking-[-0.02em]">Lazurite</p>
          <p class="m-0 text-xs text-on-surface-variant">Powered by Bluesky</p>
        </div>
      </div>

      <Motion.form
        class="grid gap-4"
        initial={{ opacity: 0, y: 18 }}
        animate={{ opacity: 1, y: 0, x: props.shakeCount > 0 ? [0, -16, 10, -8, 0] : 0 }}
        transition={{ duration: props.shakeCount > 0 ? 0.42 : 0.24, easing: [0.22, 1, 0.36, 1] }}
        onSubmit={(event) => {
          event.preventDefault();
          props.onSubmit();
        }}>
        <label class="grid gap-3">
          <span class="overline-copy text-xs tracking-[0.08em] text-on-surface-variant">
            {/* TODO: use tauri opener */}
            Sign in with your <a href="https://internethandle.org" class="text-primary underline">Internet Handle</a>
            {" "}
            or DID
          </span>
          <div class="relative">
            <input
              ref={(element) => {
                input = element;
              }}
              class="min-h-[3.4rem] w-full rounded-xl border-0 bg-white/4 px-[1.15rem] pr-11 text-on-surface shadow-[inset_0_0_0_1px_rgba(125,175,255,0.16)] focus:outline focus:outline-primary/50 focus:shadow-[inset_0_0_0_1px_rgba(125,175,255,0.35),0_0_28px_rgba(125,175,255,0.12)]"
              type="text"
              role="combobox"
              aria-autocomplete="list"
              aria-controls="login-suggestions"
              aria-activedescendant={activeIndex() >= 0 ? `login-suggestion-${activeIndex()}` : undefined}
              aria-expanded={open()}
              autocomplete="username"
              spellcheck={false}
              value={props.value}
              placeholder="alice.bsky.social"
              onFocus={() => setOpen(suggestions().length > 0)}
              onInput={(event) => props.onInput(event.currentTarget.value)}
              onKeyDown={(event) => handleKeyDown(event)} />
            <LoginLoadingIndicator visible={loading()} />
            <LoginTypeaheadPanel
              activeIndex={activeIndex()}
              open={open()}
              suggestions={suggestions()}
              onSelect={applySuggestion} />
          </div>
        </label>
        <LoginSubmitButton pending={props.pending} />
      </Motion.form>
    </article>
  );
}

function LoginLoadingIndicator(props: { visible: boolean }) {
  return (
    <Show when={props.visible}>
      <span class="pointer-events-none absolute right-4 top-1/2 -translate-y-1/2 text-on-surface-variant">
        <Icon kind="loader" aria-hidden="true" />
      </span>
    </Show>
  );
}

function LoginTypeaheadPanel(
  props: {
    activeIndex: number;
    open: boolean;
    suggestions: LoginSuggestion[];
    onSelect: (suggestion: LoginSuggestion) => void;
  },
) {
  return (
    <Show when={props.open && props.suggestions.length > 0}>
      <div
        class="absolute inset-x-0 top-[calc(100%+0.7rem)] z-10 rounded-[1.35rem] bg-(--surface-container-highest) p-2.5 shadow-[0_24px_40px_rgba(0,0,0,0.28)] backdrop-blur-[20px]"
        id="login-suggestions"
        role="listbox">
        <p class="px-2 pb-2 text-[0.68rem] uppercase tracking-[0.12em] text-on-surface-variant">Suggested handles</p>
        <div class="grid gap-1.5">
          <For each={props.suggestions}>
            {(suggestion, index) => (
              <LoginTypeaheadOption
                active={props.activeIndex === index()}
                id={`login-suggestion-${index()}`}
                suggestion={suggestion}
                onSelect={props.onSelect} />
            )}
          </For>
        </div>
      </div>
    </Show>
  );
}

function LoginTypeaheadOption(
  props: { active: boolean; id: string; suggestion: LoginSuggestion; onSelect: (suggestion: LoginSuggestion) => void },
) {
  return (
    <button
      class="grid w-full grid-cols-[auto_minmax(0,1fr)] items-center gap-3 rounded-[1.05rem] border-0 bg-transparent px-3 py-2.5 text-left transition duration-150 ease-out hover:bg-white/6"
      classList={{ "bg-white/7 shadow-[inset_0_0_0_1px_rgba(125,175,255,0.12)]": props.active }}
      id={props.id}
      type="button"
      role="option"
      aria-selected={props.active}
      onPointerDown={(event) => event.preventDefault()}
      onClick={() => props.onSelect(props.suggestion)}>
      <LoginTypeaheadAvatar suggestion={props.suggestion} />
      <div class="min-w-0">
        <p class="m-0 truncate text-sm font-medium text-on-surface">{getSuggestionHeadline(props.suggestion)}</p>
        <p class="mt-0.5 truncate text-xs text-on-surface-variant">@{props.suggestion.handle.replace(/^@/, "")}</p>
      </div>
    </button>
  );
}

function LoginTypeaheadAvatar(props: { suggestion: LoginSuggestion }) {
  return (
    <Show when={props.suggestion.avatar} fallback={<AvatarBadge label={props.suggestion.handle} tone="muted" />}>
      {(avatar) => (
        <img
          class="h-10 w-10 rounded-full object-cover shadow-[inset_0_0_0_1px_rgba(255,255,255,0.06)]"
          src={avatar()}
          alt=""
          loading="lazy" />
      )}
    </Show>
  );
}

function getSuggestionHeadline(suggestion: LoginSuggestion) {
  const displayName = suggestion.displayName?.trim();
  return displayName && displayName !== suggestion.handle ? displayName : suggestion.handle.replace(/^@/, "");
}

function normalizeSuggestionQuery(value: string) {
  const trimmed = value.trim();
  if (trimmed.length < 2 || trimmed.startsWith("did:") || /^https?:\/\//i.test(trimmed)) {
    return "";
  }

  return trimmed.replace(/^@/, "");
}

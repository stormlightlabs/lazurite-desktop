import { ActorSuggestionList, useActorSuggestions } from "$/components/actors/ActorSearch";
import { ActorTypeaheadLoading } from "$/components/actors/ActorTypeaheadLoading";
import { useActorTypeaheadCombobox } from "$/components/actors/hooks/useActorTypeaheadCombobox";
import type { ActorSuggestion } from "$/lib/types";
import { createEffect, Show } from "solid-js";
import { Motion } from "solid-motionone";
import { Icon } from "./shared/Icon";
import { LazuriteLogo } from "./Wordmark";

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
        <Icon kind="loader" name="loader" aria-hidden="true" class="mr-1" />
        <span>Opening sign-in...</span>
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
  const typeahead = useActorSuggestions({
    container: () => container,
    disabled: () => props.pending,
    input: () => input,
    value: () => props.value,
  });
  const combobox = useActorTypeaheadCombobox({
    ariaControls: "login-suggestions",
    onSelect: applySuggestion,
    typeahead,
  });

  createEffect(() => {
    if (props.shakeCount > 0) {
      input?.focus();
      input?.select();
    }
  });

  function applySuggestion(suggestion: ActorSuggestion) {
    props.onInput(suggestion.handle);
    typeahead.close();
    input?.focus();
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
              aria-controls={combobox.a11y.controls}
              aria-activedescendant={combobox.a11y.activeDescendant()}
              aria-expanded={combobox.a11y.expanded()}
              autocomplete="username"
              spellcheck={false}
              value={props.value}
              placeholder="alice.bsky.social"
              onFocus={() => typeahead.focus()}
              onInput={(event) => props.onInput(event.currentTarget.value)}
              onKeyDown={(event) => combobox.handleKeyDown(event)} />
            <ActorTypeaheadLoading visible={typeahead.loading()} class="right-4" />
            <ActorSuggestionList
              activeIndex={typeahead.activeIndex()}
              id="login-suggestions"
              open={typeahead.open()}
              suggestions={typeahead.suggestions()}
              title="Suggested handles"
              onSelect={applySuggestion} />
          </div>
        </label>
        <LoginSubmitButton pending={props.pending} />
      </Motion.form>
    </article>
  );
}

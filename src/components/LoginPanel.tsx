import { createEffect, Show } from "solid-js";
import { Motion } from "solid-motionone";
import { Icon } from "./shared/Icon";

function LoginSubmitButton(props: { pending: boolean }) {
  return (
    <button
      class="pill-action border-0 bg-[linear-gradient(135deg,var(--primary)_0%,var(--primary-dim)_100%)] text-on-primary-fixed"
      type="submit"
      disabled={props.pending}>
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
  let input: HTMLInputElement | undefined;

  createEffect(() => {
    if (props.shakeCount > 0) {
      input?.focus();
      input?.select();
    }
  });

  return (
    <article class="panel-surface grid gap-6 p-6">
      <div class="flex items-baseline justify-between gap-3">
        <p class="overline-copy text-[0.75rem] text-on-surface-variant">Add account</p>
        <p class="m-0 text-xs leading-[1.55] text-on-surface-variant">Enter the account you want to use.</p>
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
        <label class="grid gap-[0.7rem]">
          <span class="overline-copy text-[0.76rem] tracking-[0.08em] text-on-surface-variant">
            Handle, DID, or URL
          </span>
          <input
            ref={(element) => {
              input = element;
            }}
            class="min-h-[3.4rem] w-full rounded-full border-0 bg-white/4 px-[1.15rem] text-on-surface shadow-[inset_0_0_0_1px_rgba(125,175,255,0.16)] focus:outline focus:outline-primary/50 focus:shadow-[inset_0_0_0_1px_rgba(125,175,255,0.35),0_0_28px_rgba(125,175,255,0.12)]"
            type="text"
            autocomplete="username"
            spellcheck={false}
            value={props.value}
            placeholder="alice.bsky.social"
            onInput={(event) => props.onInput(event.currentTarget.value)} />
        </label>
        <LoginSubmitButton pending={props.pending} />
      </Motion.form>
    </article>
  );
}

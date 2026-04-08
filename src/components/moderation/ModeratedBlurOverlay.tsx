import { summarizeModerationLabels } from "$/lib/moderation";
import type { ModerationLabel, ModerationUiDecision } from "$/lib/types";
import { createMemo, createSignal, type ParentProps, Show } from "solid-js";
import { Icon } from "../shared/Icon";

type ModeratedBlurOverlayProps = ParentProps<
  { decision: ModerationUiDecision; labels: ModerationLabel[]; class?: string; revealLabel?: string }
>;

export function ModeratedBlurOverlay(props: ModeratedBlurOverlayProps) {
  const [revealed, setRevealed] = createSignal(false);
  const hidden = createMemo(() => (props.decision.filter || props.decision.blur !== "none") && !revealed());
  const revealable = createMemo(() => !props.decision.filter && !props.decision.noOverride);
  const summaryText = createMemo(() =>
    summarizeModerationLabels(props.labels, 2).map((summary) => `${summary.value} (${summary.source})`).join(", ")
  );

  return (
    <div class="relative min-w-0" classList={{ [props.class ?? ""]: !!props.class }}>
      <BlurredChildren hidden={hidden()}>{props.children}</BlurredChildren>
      <Show when={hidden()}>
        <OverlayMask>
          <OverlayCard
            revealLabel={props.revealLabel ?? "Show content"}
            revealable={revealable()}
            summaryText={summaryText()}
            onReveal={() => setRevealed(true)} />
        </OverlayMask>
      </Show>
    </div>
  );
}

function BlurredChildren(props: ParentProps<{ hidden: boolean }>) {
  return <div classList={{ "blur-[14px] pointer-events-none select-none": props.hidden }}>{props.children}</div>;
}

function OverlayMask(props: ParentProps) {
  return (
    <div class="absolute inset-0 z-10 grid place-items-center rounded-2xl bg-[rgba(8,8,8,0.68)] p-4 text-center backdrop-blur-[2px]">
      {props.children}
    </div>
  );
}

function OverlayCard(props: { revealLabel: string; revealable: boolean; summaryText: string; onReveal: () => void }) {
  return (
    <div class="grid max-w-sm gap-2 rounded-2xl bg-surface-container-high/85 px-4 py-3 shadow-[inset_0_0_0_1px_rgba(255,255,255,0.08)]">
      <OverlayIcon />
      <p class="m-0 text-sm font-medium text-on-surface">Content blurred</p>
      <Show when={props.summaryText.length > 0}>
        <p class="m-0 text-xs leading-relaxed text-on-surface-variant">{props.summaryText}</p>
      </Show>
      <OverlayAction revealLabel={props.revealLabel} revealable={props.revealable} onReveal={props.onReveal} />
    </div>
  );
}

function OverlayIcon() {
  return (
    <div class="mx-auto flex h-9 w-9 items-center justify-center rounded-full bg-white/8 text-on-surface">
      <Icon aria-hidden="true" class="text-lg" iconClass="i-ri-eye-off-line" />
    </div>
  );
}

function OverlayAction(props: { revealLabel: string; revealable: boolean; onReveal: () => void }) {
  return (
    <Show
      when={props.revealable}
      fallback={<p class="m-0 text-xs text-on-surface-variant">Hidden by your moderation settings.</p>}>
      <button
        type="button"
        class="mt-1 justify-self-center rounded-full border-0 bg-primary px-3 py-1.5 text-xs font-medium text-on-primary-fixed transition hover:opacity-90"
        onClick={() => props.onReveal()}>
        {props.revealLabel}
      </button>
    </Show>
  );
}

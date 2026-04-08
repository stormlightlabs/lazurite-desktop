import { MODERATION_REASON_OPTIONS } from "$/lib/api/moderation";
import type { ModerationReasonType } from "$/lib/types";
import { createEffect, createSignal, For, type ParentProps, Show } from "solid-js";
import { Motion, Presence } from "solid-motionone";

type ReportDialogProps = {
  open: boolean;
  subjectLabel: string;
  onClose: () => void;
  onSubmit: (input: { reasonType: ModerationReasonType; reason: string }) => Promise<void> | void;
};

export function ReportDialog(props: ReportDialogProps) {
  const [reasonType, setReasonType] = createSignal<ModerationReasonType>(MODERATION_REASON_OPTIONS[0].value);
  const [reason, setReason] = createSignal("");
  const [submitting, setSubmitting] = createSignal(false);

  createEffect(() => {
    if (!props.open) {
      return;
    }

    setReasonType(MODERATION_REASON_OPTIONS[0].value);
    setReason("");
    setSubmitting(false);
  });

  async function submit() {
    if (submitting()) {
      return;
    }

    setSubmitting(true);
    try {
      await props.onSubmit({ reason: reason().trim(), reasonType: reasonType() });
      props.onClose();
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Presence>
      <Show when={props.open}>
        <DialogBackdrop onClose={props.onClose}>
          <DialogSurface>
            <DialogHeader subjectLabel={props.subjectLabel} />
            <ReasonTypeField value={reasonType()} onChange={setReasonType} />
            <ReasonDetailsField value={reason()} onChange={setReason} />
            <DialogActions submitting={submitting()} onCancel={props.onClose} onSubmit={() => void submit()} />
          </DialogSurface>
        </DialogBackdrop>
      </Show>
    </Presence>
  );
}

function DialogBackdrop(props: ParentProps<{ onClose: () => void }>) {
  return (
    <Motion.div
      class="fixed inset-0 z-60 flex items-center justify-center bg-surface-container-highest/70 p-4 backdrop-blur-xl"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.2 }}>
      <button
        type="button"
        aria-label="Close report dialog"
        class="absolute inset-0 border-0 bg-transparent"
        onClick={() => props.onClose()} />
      {props.children}
    </Motion.div>
  );
}

function DialogSurface(props: ParentProps) {
  return (
    <Motion.div
      class="relative z-1 grid w-full max-w-lg gap-4 rounded-2xl bg-surface-container p-5 shadow-2xl"
      initial={{ scale: 0.96, opacity: 0 }}
      animate={{ scale: 1, opacity: 1 }}
      exit={{ scale: 0.96, opacity: 0 }}
      transition={{ duration: 0.2 }}>
      {props.children}
    </Motion.div>
  );
}

function DialogHeader(props: { subjectLabel: string }) {
  return (
    <div class="grid gap-1">
      <h3 class="m-0 text-lg font-semibold text-on-surface">Report content</h3>
      <p class="m-0 text-sm text-on-surface-variant">{props.subjectLabel}</p>
    </div>
  );
}

function ReasonTypeField(props: { value: ModerationReasonType; onChange: (value: ModerationReasonType) => void }) {
  return (
    <label class="grid gap-1">
      <span class="text-sm font-medium text-on-surface">Reason type</span>
      <select
        value={props.value}
        class="rounded-xl border border-white/10 bg-black/40 px-3 py-2 text-sm text-on-surface outline-none transition focus:border-primary/50"
        onInput={(event) => props.onChange(event.currentTarget.value as ModerationReasonType)}>
        <For each={MODERATION_REASON_OPTIONS}>{(option) => <option value={option.value}>{option.label}</option>}</For>
      </select>
    </label>
  );
}

function ReasonDetailsField(props: { value: string; onChange: (value: string) => void }) {
  return (
    <label class="grid gap-1">
      <span class="text-sm font-medium text-on-surface">Details (optional)</span>
      <textarea
        rows={4}
        value={props.value}
        placeholder="Add context for moderators"
        class="rounded-xl border border-white/10 bg-black/40 px-3 py-2 text-sm text-on-surface outline-none transition focus:border-primary/50"
        onInput={(event) => props.onChange(event.currentTarget.value)} />
    </label>
  );
}

function DialogActions(props: { submitting: boolean; onCancel: () => void; onSubmit: () => void }) {
  return (
    <div class="flex justify-end gap-2">
      <button
        type="button"
        class="rounded-lg border border-white/20 px-4 py-2 text-sm font-medium text-on-surface transition hover:bg-white/5"
        onClick={() => props.onCancel()}>
        Cancel
      </button>
      <button
        type="button"
        disabled={props.submitting}
        class="rounded-lg bg-primary px-4 py-2 text-sm font-medium text-on-primary-fixed transition hover:bg-primary-dim disabled:cursor-wait disabled:opacity-70"
        onClick={() => props.onSubmit()}>
        {props.submitting ? "Submitting..." : "Submit report"}
      </button>
    </div>
  );
}

import { Show } from "solid-js";
import { Motion, Presence } from "solid-motionone";
import { LoadingIcon } from "../shared/Icon";

function ConfirmationDialogBody(props: { selectedCount: number }) {
  return (
    <div class="grid gap-2">
      <h3 class="m-0 text-lg font-semibold text-on-surface">Unfollow selected accounts?</h3>
      <p class="m-0 text-sm leading-relaxed text-on-surface-variant">
        This will unfollow {props.selectedCount} account(s). This action cannot be undone.
      </p>
    </div>
  );
}

function ConfirmationDialogActions(props: { pending: boolean; onCancel: () => void; onConfirm: () => void }) {
  return (
    <div class="mt-5 flex justify-end gap-2">
      <button type="button" class="ui-button-secondary" onClick={() => props.onCancel()}>Cancel</button>
      <button
        class="inline-flex min-h-10 items-center gap-2 rounded-lg border-0 bg-red-500 px-4 text-sm font-medium text-white transition hover:bg-red-600 disabled:opacity-60"
        disabled={props.pending}
        type="button"
        onClick={() => props.onConfirm()}>
        <LoadingIcon isLoading={props.pending} class="text-base" />
        Confirm unfollow
      </button>
    </div>
  );
}

function ConfirmationDialogCard(
  props: { pending: boolean; selectedCount: number; onCancel: () => void; onConfirm: () => void },
) {
  return (
    <Motion.div
      class="w-full max-w-md rounded-3xl bg-surface-container p-5"
      initial={{ opacity: 0, scale: 0.95, y: 6 }}
      animate={{ opacity: 1, scale: 1, y: 0 }}
      exit={{ opacity: 0, scale: 0.95, y: 6 }}
      transition={{ duration: 0.18 }}
      onClick={(event) => event.stopPropagation()}>
      <ConfirmationDialogBody selectedCount={props.selectedCount} />
      <ConfirmationDialogActions pending={props.pending} onCancel={props.onCancel} onConfirm={props.onConfirm} />
    </Motion.div>
  );
}

function ConfirmationDialogOverlay(
  props: { pending: boolean; selectedCount: number; onCancel: () => void; onConfirm: () => void },
) {
  return (
    <Motion.div
      class="fixed inset-0 z-60 flex items-center justify-center bg-surface-container-highest/70 p-4 backdrop-blur-xl"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.16 }}
      onClick={() => props.onCancel()}>
      <ConfirmationDialogCard
        pending={props.pending}
        selectedCount={props.selectedCount}
        onCancel={props.onCancel}
        onConfirm={props.onConfirm} />
    </Motion.div>
  );
}

export function ConfirmationDialog(
  props: { isOpen: boolean; pending: boolean; selectedCount: number; onCancel: () => void; onConfirm: () => void },
) {
  return (
    <Presence>
      <Show when={props.isOpen}>
        <ConfirmationDialogOverlay
          pending={props.pending}
          selectedCount={props.selectedCount}
          onCancel={props.onCancel}
          onConfirm={props.onConfirm} />
      </Show>
    </Presence>
  );
}

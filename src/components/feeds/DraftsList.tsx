import { Icon } from "$/components/shared/Icon";
import { deleteDraft, listDrafts } from "$/lib/api/drafts";
import { formatRelativeTime } from "$/lib/feeds";
import type { Draft } from "$/lib/types";
import { normalizeError } from "$/lib/utils/text";
import * as logger from "@tauri-apps/plugin-log";
import { createEffect, createSignal, For, Show } from "solid-js";
import { Motion, Presence } from "solid-motionone";

type DraftsListProps = {
  accountDid: string;
  composerHasContent: boolean;
  open: boolean;
  refreshNonce: number;
  onClose: () => void;
  onLoadDraft: (draft: Draft) => void;
};

export function DraftsList(props: DraftsListProps) {
  const [drafts, setDrafts] = createSignal<Draft[]>([]);
  const [loading, setLoading] = createSignal(false);
  const [error, setError] = createSignal<string | null>(null);
  const [confirmDeleteId, setConfirmDeleteId] = createSignal<string | null>(null);
  const [confirmLoadDraft, setConfirmLoadDraft] = createSignal<Draft | null>(null);

  createEffect(() => {
    const refreshNonce = props.refreshNonce;
    if (props.open) {
      void refreshNonce;
      void fetchDrafts();
    } else {
      setConfirmDeleteId(null);
      setConfirmLoadDraft(null);
    }
  });

  async function fetchDrafts() {
    setLoading(true);
    setError(null);
    try {
      const result = await listDrafts(props.accountDid);
      setDrafts(result);
    } catch (err) {
      logger.error(`Failed to load drafts: ${normalizeError(err)}`);
      setError("Couldn't load your drafts. Try again.");
    } finally {
      setLoading(false);
    }
  }

  function handleTapDraft(draft: Draft) {
    if (props.composerHasContent) {
      setConfirmLoadDraft(draft);
    } else {
      props.onLoadDraft(draft);
    }
  }

  function handleConfirmLoad() {
    const draft = confirmLoadDraft();
    if (draft) {
      props.onLoadDraft(draft);
    }
    setConfirmLoadDraft(null);
  }

  async function handleConfirmDelete() {
    const id = confirmDeleteId();
    if (!id) {
      return;
    }

    try {
      await deleteDraft(id);
      setDrafts((prev) => prev.filter((d) => d.id !== id));
    } catch (err) {
      logger.error(`Failed to delete draft ${id}: ${normalizeError(err)}`);
    } finally {
      setConfirmDeleteId(null);
    }
  }

  return (
    <Presence>
      <Show when={props.open}>
        <div class="fixed inset-0 z-60">
          <Motion.button
            class="absolute inset-0 h-full w-full border-0 bg-black/75 backdrop-blur-[20px]"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.18 }}
            type="button"
            onClick={() => props.onClose()} />
          <DraftsPanel
            confirmLoadDraft={confirmLoadDraft()}
            confirmDeleteId={confirmDeleteId()}
            drafts={drafts()}
            error={error()}
            loading={loading()}
            onCancelDelete={() => setConfirmDeleteId(null)}
            onCancelLoad={() => setConfirmLoadDraft(null)}
            onClose={props.onClose}
            onConfirmDelete={() => void handleConfirmDelete()}
            onConfirmLoad={handleConfirmLoad}
            onDeleteDraft={setConfirmDeleteId}
            onTapDraft={handleTapDraft} />
        </div>
      </Show>
    </Presence>
  );
}

type DraftsPanelProps = {
  confirmDeleteId: string | null;
  confirmLoadDraft: Draft | null;
  drafts: Draft[];
  error: string | null;
  loading: boolean;
  onCancelDelete: () => void;
  onCancelLoad: () => void;
  onClose: () => void;
  onConfirmDelete: () => void;
  onConfirmLoad: () => void;
  onDeleteDraft: (id: string) => void;
  onTapDraft: (draft: Draft) => void;
};

function DraftsPanel(props: DraftsPanelProps) {
  return (
    <div class="relative z-10 flex min-h-screen items-end justify-center p-4 pt-16">
      <Motion.section
        class="grid w-full max-w-xl grid-rows-[auto_minmax(0,1fr)] overflow-hidden rounded-[1.8rem] bg-surface-container-high shadow-[0_25px_70px_rgba(0,0,0,0.7),0_0_0_1px_rgba(125,175,255,0.14)] max-h-[calc(100vh-5rem)]"
        initial={{ opacity: 0, y: 24 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: 20 }}
        transition={{ duration: 0.22, easing: [0.22, 1, 0.36, 1] }}>
        <DraftsListHeader count={props.drafts.length} onClose={props.onClose} />
        <DraftsListBody {...props} />
      </Motion.section>
    </div>
  );
}

function DraftsListHeader(props: { count: number; onClose: () => void }) {
  return (
    <header class="flex items-center justify-between border-b border-white/5 px-6 py-4">
      <div class="flex items-baseline gap-2">
        <h2 class="m-0 text-base font-semibold text-on-surface">Drafts</h2>
        <Show when={props.count > 0}>
          <p class="m-0 text-xs text-on-surface-variant">{props.count}</p>
        </Show>
      </div>
      <button
        class="inline-flex h-10 w-10 items-center justify-center rounded-xl border-0 bg-transparent text-on-surface-variant transition duration-150 ease-out hover:bg-white/5 hover:text-on-surface"
        type="button"
        onClick={() => props.onClose()}>
        <Icon aria-hidden="true" iconClass="i-ri-close-line" />
      </button>
    </header>
  );
}

type DraftsListBodyProps = Omit<DraftsPanelProps, "onClose">;

function DraftsListBody(props: DraftsListBodyProps) {
  const isEmpty = () => !props.loading && !props.error && props.drafts.length === 0;

  return (
    <div class="min-h-0 overflow-y-auto overscroll-contain">
      <Show when={props.confirmLoadDraft}>
        {(draft) => <LoadConfirmBanner draft={draft()} onConfirm={props.onConfirmLoad} onCancel={props.onCancelLoad} />}
      </Show>
      <Show when={props.loading}>
        <DraftsLoading />
      </Show>
      <Show when={props.error}>{(msg) => <DraftsError message={msg()} />}</Show>
      <Show when={isEmpty()}>
        <DraftsEmptyState />
      </Show>
      <div class="grid gap-2 p-4">
        <For each={props.drafts}>
          {(draft) => (
            <DraftCard
              draft={draft}
              confirmDeleteId={props.confirmDeleteId}
              onTap={() => props.onTapDraft(draft)}
              onDelete={() => props.onDeleteDraft(draft.id)}
              onConfirmDelete={props.onConfirmDelete}
              onCancelDelete={props.onCancelDelete} />
          )}
        </For>
      </div>
    </div>
  );
}

function LoadConfirmBanner(props: { draft: Draft; onConfirm: () => void; onCancel: () => void }) {
  const preview = () => props.draft.title ?? props.draft.text.slice(0, 60);

  return (
    <div class="border-b border-white/5 bg-primary/8 px-4 py-3">
      <p class="m-0 mb-2 text-sm text-on-surface">
        Replace your current post with <span class="font-medium">"{preview()}"</span>?
      </p>
      <div class="flex gap-2">
        <button
          class="rounded-full border-0 bg-primary/20 px-3 py-1.5 text-xs font-medium text-primary transition hover:bg-primary/30"
          type="button"
          onClick={() => props.onConfirm()}>
          Replace
        </button>
        <button
          class="rounded-full border-0 bg-transparent px-3 py-1.5 text-xs text-on-surface-variant transition hover:bg-white/5"
          type="button"
          onClick={() => props.onCancel()}>
          Keep current
        </button>
      </div>
    </div>
  );
}

function DraftsLoading() {
  return (
    <div class="flex items-center justify-center px-6 py-12">
      <Icon aria-hidden="true" kind="loader" class="text-on-surface-variant" />
    </div>
  );
}

function DraftsError(props: { message: string }) {
  return (
    <div class="flex flex-col items-center gap-2 px-6 py-12 text-center">
      <Icon aria-hidden="true" kind="danger" class="text-error" />
      <p class="m-0 text-sm text-on-surface-variant">{props.message}</p>
    </div>
  );
}

function DraftsEmptyState() {
  return (
    <div class="px-6 py-12 text-center">
      <p class="m-0 text-sm text-on-surface-variant">No drafts yet. Saved posts will appear here.</p>
    </div>
  );
}

type DraftCardProps = {
  draft: Draft;
  confirmDeleteId: string | null;
  onTap: () => void;
  onDelete: () => void;
  onConfirmDelete: () => void;
  onCancelDelete: () => void;
};

function DraftCard(props: DraftCardProps) {
  const isConfirming = () => props.confirmDeleteId === props.draft.id;

  return (
    <div class="overflow-hidden rounded-2xl bg-white/4 shadow-[inset_0_0_0_1px_rgba(255,255,255,0.06)] transition duration-150 ease-out hover:bg-white/6">
      <Show when={isConfirming()} fallback={<DraftCardNormal {...props} />}>
        <DraftCardDeleteConfirm onConfirm={props.onConfirmDelete} onCancel={props.onCancelDelete} />
      </Show>
    </div>
  );
}

function DraftCardNormal(props: DraftCardProps) {
  return (
    <div class="flex items-start gap-1 p-1">
      <button
        class="min-w-0 flex-1 rounded-xl border-0 bg-transparent px-3 py-2.5 text-left transition duration-150 ease-out hover:bg-white/4"
        type="button"
        onClick={() => props.onTap()}>
        <DraftCardContent draft={props.draft} />
      </button>
      <DraftDeleteButton onDelete={props.onDelete} />
    </div>
  );
}

function DraftCardContent(props: { draft: Draft }) {
  const preview = () => (props.draft.title ?? props.draft.text.slice(0, 120)) || "Empty draft";
  const timestamp = () => formatRelativeTime(props.draft.updatedAt);

  return (
    <div class="flex flex-col gap-1.5">
      <p class="m-0 line-clamp-2 text-sm leading-snug text-on-surface">{preview()}</p>
      <DraftCardFooter draft={props.draft} timestamp={timestamp()} />
    </div>
  );
}

function DraftCardFooter(props: { draft: Draft; timestamp: string }) {
  return (
    <div class="flex flex-wrap items-center gap-2">
      <DraftContextBadges draft={props.draft} />
      <time class="text-xs text-on-surface-variant">{props.timestamp}</time>
    </div>
  );
}

function DraftContextBadges(props: { draft: Draft }) {
  return (
    <>
      <Show when={props.draft.replyParentUri}>
        <DraftContextBadge icon="i-ri-reply-line" label="Reply" />
      </Show>
      <Show when={props.draft.quoteUri}>
        <DraftContextBadge icon="i-ri-chat-quote-line" label="Quote" />
      </Show>
    </>
  );
}

function DraftContextBadge(props: { icon: string; label: string }) {
  return (
    <span class="inline-flex items-center gap-1 rounded-full bg-white/8 px-2 py-0.5 text-[0.7rem] text-on-surface-variant">
      <Icon aria-hidden="true" iconClass={props.icon} />
      <span>{props.label}</span>
    </span>
  );
}

function DraftDeleteButton(props: { onDelete: () => void }) {
  return (
    <button
      class="mt-0.5 inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border-0 bg-transparent text-on-surface-variant transition duration-150 ease-out hover:bg-error/15 hover:text-error"
      type="button"
      title="Delete draft"
      onClick={() => props.onDelete()}>
      <Icon aria-hidden="true" iconClass="i-ri-delete-bin-line" />
    </button>
  );
}

function DraftCardDeleteConfirm(props: { onConfirm: () => void; onCancel: () => void }) {
  return (
    <div class="flex items-center justify-between gap-3 px-4 py-3">
      <p class="m-0 text-sm text-on-surface">Delete this draft?</p>
      <div class="flex gap-2">
        <button
          class="rounded-full border-0 bg-error/15 px-3 py-1.5 text-xs font-medium text-error transition hover:bg-error/25"
          type="button"
          onClick={() => props.onConfirm()}>
          Delete
        </button>
        <button
          class="rounded-full border-0 bg-transparent px-3 py-1.5 text-xs text-on-surface-variant transition hover:bg-white/5"
          type="button"
          onClick={() => props.onCancel()}>
          Cancel
        </button>
      </div>
    </div>
  );
}

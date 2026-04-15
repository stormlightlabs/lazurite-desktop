import { Icon, LoadingIcon } from "$/components/shared/Icon";
import { useAppSession } from "$/contexts/app-session";
import { ProfileController } from "$/lib/api/profile";
import { FOLLOW_HYGIENE_PROGRESS_EVENT } from "$/lib/constants/events";
import { asRecord, optionalNumber } from "$/lib/type-guards";
import type { FlaggedFollow, FollowBatchResult, FollowHygieneProgress } from "$/lib/types";
import { shouldIgnoreKey } from "$/lib/utils/events";
import { normalizeError } from "$/lib/utils/text";
import { listen } from "@tauri-apps/api/event";
import * as logger from "@tauri-apps/plugin-log";
import { openUrl } from "@tauri-apps/plugin-opener";
import { createMemo, onCleanup, onMount, Show } from "solid-js";
import { createStore } from "solid-js/store";
import { Motion } from "solid-motionone";
import { ConfirmationDialog } from "./FollowHygeineConfirmationDialog";
import { CategorySidebar, type CategorySidebarProps } from "./FollowHygieneCategories";
import { FollowListViewport, type FollowListViewportProps } from "./FollowHygieneList";
import { ScanToolbar, type ScanToolbarProps } from "./FollowHygieneToolbar";
import { EXIT_ANIMATION_MS, hasStatus, STATUS_CATEGORIES } from "./types";
import type { FollowHygienePhase } from "./types";

type StatusCategoryKey = "deleted" | "deactivated" | "suspended" | "blockedBy" | "blocking" | "hidden" | "selfFollow";

type StatusCategoryState = { visible: boolean; selected: boolean };

type FollowHygieneState = {
  confirmOpen: boolean;
  exitingUris: Set<string>;
  flagged: FlaggedFollow[];
  focusedUri: string | null;
  phase: FollowHygienePhase;
  progress: FollowHygieneProgress;
  result: FollowBatchResult | null;
  scanError: string | null;
  selectedUris: Set<string>;
  unfollowError: string | null;
  filters: Record<StatusCategoryKey, StatusCategoryState>;
};

function createDefaultFilters(): Record<StatusCategoryKey, StatusCategoryState> {
  return {
    deleted: { visible: true, selected: false },
    deactivated: { visible: true, selected: false },
    suspended: { visible: true, selected: false },
    blockedBy: { visible: true, selected: false },
    blocking: { visible: true, selected: false },
    hidden: { visible: true, selected: false },
    selfFollow: { visible: true, selected: false },
  };
}

function createInitialState(): FollowHygieneState {
  return {
    confirmOpen: false,
    exitingUris: new Set<string>(),
    flagged: [],
    focusedUri: null,
    phase: "idle",
    progress: { batchSize: 0, current: 0, total: 1 },
    result: null,
    scanError: null,
    selectedUris: new Set<string>(),
    unfollowError: null,
    filters: createDefaultFilters(),
  };
}

function parseProgressPayload(payload: unknown): FollowHygieneProgress | null {
  const record = asRecord(payload);
  if (!record) {
    return null;
  }

  const batchSize = optionalNumber(record.batchSize);
  const current = optionalNumber(record.current);
  const total = optionalNumber(record.total);
  if (current === null || total === null) {
    return null;
  }

  return {
    batchSize: batchSize === null ? 0 : Math.max(1, Math.floor(batchSize)),
    current: Math.max(0, Math.floor(current)),
    total: Math.max(1, Math.floor(total)),
  };
}

function deriveFilters(
  selectedUris: Set<string>,
  flagged: FlaggedFollow[],
  filters: Record<StatusCategoryKey, StatusCategoryState>,
) {
  const nextFilters = { ...filters };
  for (const category of STATUS_CATEGORIES) {
    const categoryUris = flagged.filter((follow) => hasStatus(follow.status, category.bit)).map((follow) =>
      follow.followUri
    );
    const selected = categoryUris.length > 0 && categoryUris.every((uri) => selectedUris.has(uri));
    nextFilters[category.key] = { ...filters[category.key], selected };
  }

  return nextFilters;
}

function FollowHygieneHeader(props: { onClose: () => void }) {
  return (
    <header class="flex items-center justify-between gap-3 px-5 py-4">
      <div class="grid gap-1">
        <p class="m-0 text-[0.68rem] uppercase tracking-[0.12em] text-on-surface-variant">Account maintenance</p>
        <h2 class="m-0 text-xl font-semibold tracking-[-0.02em] text-on-surface">Follow Audit</h2>
      </div>
      <div class="flex items-center gap-2">
        <button
          class="ui-control ui-control-hoverable inline-flex min-h-9 items-center gap-1.5 rounded-full px-3 text-sm text-on-surface"
          type="button"
          onClick={() => void openUrl(FOLLOW_AUDIT_INSPIRATION_URL)}>
          <span>Inspiration</span>
          <Icon kind="ext-link" class="text-sm" />
        </button>
        <button
          class="ui-control ui-control-hoverable flex h-9 w-9 items-center justify-center rounded-full"
          type="button"
          onClick={() => props.onClose()}>
          <Icon kind="close" class="text-base" />
        </button>
      </div>
    </header>
  );
}

type FollowHygieneLayoutProps = {
  footer: FooterActionsProps;
  list: FollowListViewportProps;
  sidebar: CategorySidebarProps;
  toolbar: ScanToolbarProps;
};

function FollowHygieneLayout(props: FollowHygieneLayoutProps) {
  return (
    <div class="grid h-full min-h-0 gap-4 lg:grid-cols-[18rem_minmax(0,1fr)]">
      <CategorySidebar {...props.sidebar} />

      <div class="grid min-h-0 grid-rows-[auto_1fr_auto] gap-3">
        <ScanToolbar {...props.toolbar} />
        <FollowListViewport {...props.list} />
        <FooterActions {...props.footer} />
      </div>
    </div>
  );
}

type FooterActionsProps = {
  canUnfollow: boolean;
  failedCount: number;
  phase: FollowHygienePhase;
  result: FollowBatchResult | null;
  selectedCount: number;
  selectedVisibleCount: number;
  visibleCount: number;
  onRetryFailed: () => void;
  onUnfollow: () => void;
};

function FooterActions(props: FooterActionsProps) {
  const pending = () => props.phase === "unfollowing";

  return (
    <section class="panel-surface grid gap-2 p-4">
      <div class="flex flex-wrap items-center justify-between gap-3">
        <p class="m-0 text-sm text-on-surface-variant">
          {props.selectedVisibleCount} of {props.visibleCount} visible selected ({props.selectedCount} total).
        </p>

        <button
          class="inline-flex min-h-10 items-center gap-2 rounded-full border-0 bg-red-500/16 px-4 text-sm font-medium text-red-300 transition hover:bg-red-500/24 disabled:opacity-60"
          disabled={!props.canUnfollow || pending()}
          type="button"
          onClick={() => props.onUnfollow()}>
          <LoadingIcon isLoading={pending()} class="text-base" fallback={<Icon kind="unfollow" class="text-base" />} />
          <span>Unfollow selected</span>
        </button>
      </div>

      <Show when={props.result}>
        {(result) => (
          <div class="flex flex-wrap items-center justify-between gap-3 text-sm text-on-secondary-container">
            <span>{result().deleted} unfollowed, {result().failed.length} failed.</span>
            <Show when={props.failedCount > 0}>
              <button
                class="ui-control ui-control-hoverable inline-flex min-h-9 items-center gap-2 rounded-full px-4 text-sm text-on-surface"
                type="button"
                onClick={() => props.onRetryFailed()}>
                <Icon kind="refresh" class="text-base" />
                Retry failed
              </button>
            </Show>
          </div>
        )}
      </Show>
    </section>
  );
}

export function FollowHygienePanel(props: { onClose: () => void }) {
  const session = useAppSession();
  const [state, setState] = createStore<FollowHygieneState>(createInitialState());
  let panelRef: HTMLDivElement | undefined;
  let requestId = 0;
  let exitTimer: ReturnType<typeof setTimeout> | undefined;

  const categoryCounts = createMemo(() => {
    const counts: Record<StatusCategoryKey, number> = {
      deleted: 0,
      deactivated: 0,
      suspended: 0,
      blockedBy: 0,
      blocking: 0,
      hidden: 0,
      selfFollow: 0,
    };

    for (const follow of state.flagged) {
      for (const category of STATUS_CATEGORIES) {
        if (hasStatus(follow.status, category.bit)) {
          counts[category.key] += 1;
        }
      }
    }

    return counts;
  });

  const visibleFlagged = createMemo(() =>
    state.flagged.filter((follow) =>
      STATUS_CATEGORIES.some((category) =>
        state.filters[category.key].visible && hasStatus(follow.status, category.bit)
      )
    )
  );

  const progressPercent = createMemo(() => {
    const total = Math.max(1, state.progress.total);
    const ratio = Math.min(1, state.progress.current / total);
    return Math.round(ratio * 100);
  });

  const selectedCount = createMemo(() => state.selectedUris.size);
  const selectedVisibleCount = createMemo(() => {
    const selected = state.selectedUris;
    return visibleFlagged().reduce((count, follow) => count + (selected.has(follow.followUri) ? 1 : 0), 0);
  });

  const canUnfollow = createMemo(() =>
    selectedCount() > 0 && state.phase !== "scanning" && state.phase !== "unfollowing"
  );

  const failedCount = createMemo(() => state.result?.failed.length ?? 0);
  const showProgress = createMemo(() => state.phase === "scanning" || state.progress.current > 0);

  const sidebarProps = createMemo<CategorySidebarProps>(() => ({
    counts: categoryCounts(),
    filters: state.filters,
    selectedCount: selectedCount(),
    totalCount: state.flagged.length,
    onSelectAllVisible: selectAllVisible,
    onToggleCategorySelection: toggleCategorySelection,
    onToggleCategoryVisibility: toggleCategoryVisibility,
  }));

  const toolbarProps = createMemo<ScanToolbarProps>(() => ({
    phase: state.phase,
    progress: state.progress,
    progressPercent: progressPercent(),
    scanError: state.scanError,
    showProgress: showProgress(),
    unfollowError: state.unfollowError,
    onScan: startScan,
  }));

  const listProps = createMemo<FollowListViewportProps>(() => ({
    exitingUris: state.exitingUris,
    flagged: visibleFlagged(),
    focusedUri: state.focusedUri,
    phase: state.phase,
    selectedUris: state.selectedUris,
    onFocusUri: (uri) => setState("focusedUri", uri),
    onSpaceToggle: toggleSelection,
    onToggle: toggleSelection,
  }));

  const footerProps = createMemo<FooterActionsProps>(() => ({
    canUnfollow: canUnfollow(),
    failedCount: failedCount(),
    phase: state.phase,
    result: state.result,
    selectedCount: selectedCount(),
    selectedVisibleCount: selectedVisibleCount(),
    visibleCount: visibleFlagged().length,
    onRetryFailed: handleRetryFailed,
    onUnfollow: openConfirmation,
  }));

  function updateSelectedUris(nextSelected: Set<string>, flagged: FlaggedFollow[] = state.flagged) {
    setState((current) => ({
      filters: deriveFilters(nextSelected, flagged, current.filters),
      selectedUris: nextSelected,
    }));
  }

  async function startScan() {
    if (state.phase === "scanning" || state.phase === "unfollowing") {
      return;
    }

    requestId += 1;
    const activeRequest = requestId;

    if (exitTimer) {
      clearTimeout(exitTimer);
      exitTimer = undefined;
    }

    setState({
      confirmOpen: false,
      exitingUris: new Set<string>(),
      flagged: [],
      focusedUri: null,
      phase: "scanning",
      progress: { batchSize: 0, current: 0, total: 1 },
      result: null,
      scanError: null,
      selectedUris: new Set<string>(),
      unfollowError: null,
      filters: createDefaultFilters(),
    });

    try {
      const flagged = await ProfileController.auditFollows();
      if (activeRequest !== requestId) {
        return;
      }

      const initialSelection = new Set(flagged.map((follow) => follow.followUri));
      setState((current) => ({
        filters: deriveFilters(initialSelection, flagged, current.filters),
        flagged,
        phase: "ready",
        progress: {
          batchSize: current.progress.batchSize,
          current: Math.max(current.progress.current, current.progress.total),
          total: current.progress.total,
        },
        selectedUris: initialSelection,
      }));
    } catch (error) {
      if (activeRequest !== requestId) {
        return;
      }

      const message = "Couldn't scan your follows right now.";
      logger.error("follow hygiene scan failed", { keyValues: { error: normalizeError(error) } });
      setState("phase", "idle");
      setState("scanError", message);
      session.reportError(message);
    }
  }

  function toggleSelection(followUri: string) {
    const next = new Set(state.selectedUris);
    if (next.has(followUri)) {
      next.delete(followUri);
    } else {
      next.add(followUri);
    }
    updateSelectedUris(next);
  }

  function selectAllVisible() {
    const next = new Set(state.selectedUris);
    for (const follow of visibleFlagged()) {
      next.add(follow.followUri);
    }
    updateSelectedUris(next);
  }

  function toggleCategoryVisibility(key: StatusCategoryKey) {
    setState("filters", key, "visible", (visible) => !visible);
  }

  function toggleCategorySelection(key: StatusCategoryKey) {
    const category = STATUS_CATEGORIES.find((item) => item.key === key);
    if (!category) {
      return;
    }

    const categoryUris = state.flagged.filter((follow) => hasStatus(follow.status, category.bit)).map((follow) =>
      follow.followUri
    );
    if (categoryUris.length === 0) {
      return;
    }

    const next = new Set(state.selectedUris);
    const allSelected = categoryUris.every((uri) => next.has(uri));
    for (const uri of categoryUris) {
      if (allSelected) {
        next.delete(uri);
      } else {
        next.add(uri);
      }
    }

    updateSelectedUris(next);
  }

  function openConfirmation() {
    if (!canUnfollow()) {
      return;
    }

    setState("confirmOpen", true);
  }

  function closeConfirmation() {
    if (state.confirmOpen) {
      setState("confirmOpen", false);
    }
  }

  function applyUnfollowResult(followUris: string[], result: FollowBatchResult) {
    const failed = new Set(result.failed);
    const successfulUris = followUris.filter((uri) => !failed.has(uri));
    const nextSelected = new Set(state.selectedUris);
    for (const uri of successfulUris) {
      nextSelected.delete(uri);
    }

    setState("result", result);
    setState("phase", "done");
    updateSelectedUris(nextSelected);

    if (successfulUris.length === 0) {
      return;
    }

    setState("exitingUris", new Set(successfulUris));

    if (exitTimer) {
      clearTimeout(exitTimer);
    }

    exitTimer = setTimeout(() => {
      const filtered = state.flagged.filter((follow) => !successfulUris.includes(follow.followUri));
      setState((current) => ({
        exitingUris: new Set<string>(),
        filters: deriveFilters(current.selectedUris, filtered, current.filters),
        flagged: filtered,
      }));
      exitTimer = undefined;
    }, EXIT_ANIMATION_MS);
  }

  async function runUnfollow(followUris: string[]) {
    if (followUris.length === 0 || state.phase === "unfollowing") {
      return;
    }

    setState("confirmOpen", false);
    setState("phase", "unfollowing");
    setState("unfollowError", null);

    try {
      const result = await ProfileController.batchUnfollow(followUris);
      applyUnfollowResult(followUris, result);
    } catch (error) {
      const message = "Couldn't unfollow selected accounts right now.";
      logger.error("follow hygiene unfollow failed", { keyValues: { error: normalizeError(error) } });
      setState("phase", "ready");
      setState("unfollowError", message);
    }
  }

  function handleConfirmUnfollow() {
    const followUris = [...state.selectedUris];
    void runUnfollow(followUris);
  }

  function handleRetryFailed() {
    if (!state.result?.failed.length) {
      return;
    }

    void runUnfollow(state.result.failed);
  }

  function handleGlobalKeyDown(event: KeyboardEvent) {
    if (shouldIgnoreKey(event)) {
      return;
    }

    const key = event.key.toLowerCase();
    if (key === "escape") {
      event.preventDefault();
      if (state.confirmOpen) {
        setState("confirmOpen", false);
      } else {
        props.onClose();
      }
      return;
    }

    if ((event.ctrlKey || event.metaKey) && key === "a" && !event.altKey && !event.shiftKey) {
      event.preventDefault();
      selectAllVisible();
    }
  }

  onMount(() => {
    queueMicrotask(() => panelRef?.focus());
    globalThis.addEventListener("keydown", handleGlobalKeyDown);
    let unlisten: (() => void) | undefined;

    void listen(FOLLOW_HYGIENE_PROGRESS_EVENT, (event) => {
      const payload = parseProgressPayload(event.payload);
      if (!payload) {
        return;
      }

      setState("progress", payload);
    }).then((dispose) => {
      unlisten = dispose;
    }).catch((error) => {
      logger.warn("follow hygiene progress listener failed", { keyValues: { error: normalizeError(error) } });
    });

    onCleanup(() => {
      globalThis.removeEventListener("keydown", handleGlobalKeyDown);
      unlisten?.();
      if (exitTimer) {
        clearTimeout(exitTimer);
      }
    });
  });

  return (
    <>
      <Motion.div
        ref={(element) => {
          panelRef = element;
        }}
        aria-modal
        class="ui-scrim fixed inset-0 z-50 flex items-stretch justify-end p-3 backdrop-blur-xl max-sm:p-0"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        role="dialog"
        tabIndex={-1}
        transition={{ duration: 0.18 }}
        onClick={() => props.onClose()}>
        <Motion.section
          class="grid h-full w-full max-w-[min(72rem,calc(100vw-1.5rem))] grid-rows-[auto_1fr] overflow-hidden rounded-4xl bg-surface-container-highest shadow-[0_32px_90px_rgba(0,0,0,0.3),var(--inset-shadow)] max-sm:max-w-none max-sm:rounded-none"
          initial={{ x: 20, opacity: 0.96 }}
          animate={{ x: 0, opacity: 1 }}
          exit={{ x: 20, opacity: 0.96 }}
          transition={{ duration: 0.2 }}
          onClick={(event) => event.stopPropagation()}>
          <FollowHygieneHeader onClose={props.onClose} />
          <div class="min-h-0 overflow-hidden px-4 pb-4 max-sm:px-3 max-sm:pb-3">
            <FollowHygieneLayout
              footer={footerProps()}
              list={listProps()}
              sidebar={sidebarProps()}
              toolbar={toolbarProps()} />
          </div>
        </Motion.section>
      </Motion.div>

      <ConfirmationDialog
        isOpen={state.confirmOpen}
        pending={state.phase === "unfollowing"}
        selectedCount={selectedCount()}
        onCancel={closeConfirmation}
        onConfirm={handleConfirmUnfollow} />
    </>
  );
}
const FOLLOW_AUDIT_INSPIRATION_URL = "https://cleanfollow-bsky.pages.dev/";

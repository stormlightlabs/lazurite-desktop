import { RecordBacklinksPanel } from "$/components/diagnostics/RecordBacklinksPanel";
import { Icon } from "$/components/shared/Icon";
import { useAppSession } from "$/contexts/app-session";
import {
  type DiagnosticBlockItem,
  type DiagnosticDidProfile,
  type DiagnosticLabel,
  type DiagnosticList,
  type DiagnosticStarterPack,
  getAccountBlockedBy,
  getAccountBlocking,
  getAccountLabels,
  getAccountLists,
  getAccountStarterPacks,
} from "$/lib/api/diagnostics";
import { asRecord, getStringProperty } from "$/lib/type-guards";
import { shouldIgnoreKey } from "$/lib/utils/events";
import { formatHandle, initials, normalizeError } from "$/lib/utils/text";
import * as logger from "@tauri-apps/plugin-log";
import { createEffect, createMemo, createSignal, For, Match, onCleanup, onMount, Show, Switch } from "solid-js";
import { createStore } from "solid-js/store";
import { Motion, Presence } from "solid-motionone";
import {
  DiagnosticsBlockSkeleton,
  DiagnosticsLabelSkeleton,
  DiagnosticsListSkeleton,
  DiagnosticsStarterPackSkeleton,
} from "./DiagnosticsSkeleton";

type DiagnosticsTab = "lists" | "labels" | "blocks" | "starterPacks" | "backlinks";

type DiagnosticsPanelProps = {
  did?: string | null;
  embedded?: boolean;
  onClose?: () => void;
  onOpenExplorerTarget?: (target: string) => void;
  recordUri?: string | null;
};

type DiagnosticsState = {
  blockedBy: DiagnosticDidProfile[];
  blockedByError: string | null;
  blockedByLoading: boolean;
  blocking: DiagnosticBlockItem[];
  blockingError: string | null;
  blockingLoading: boolean;
  labels: DiagnosticLabel[];
  labelsError: string | null;
  labelsLoading: boolean;
  labelsSourceProfiles: Record<string, unknown>;
  lists: DiagnosticList[];
  listsError: string | null;
  listsLoading: boolean;
  starterPacks: DiagnosticStarterPack[];
  starterPacksError: string | null;
  starterPacksLoading: boolean;
};

const DIAGNOSTICS_TABS: Array<{ label: string; value: DiagnosticsTab }> = [
  { label: "Lists", value: "lists" },
  { label: "Labels", value: "labels" },
  { label: "Blocks", value: "blocks" },
  { label: "Starter Packs", value: "starterPacks" },
  { label: "Backlinks", value: "backlinks" },
];

function createInitialState(): DiagnosticsState {
  return {
    blockedBy: [],
    blockedByError: null,
    blockedByLoading: true,
    blocking: [],
    blockingError: null,
    blockingLoading: true,
    labels: [],
    labelsError: null,
    labelsLoading: true,
    labelsSourceProfiles: {},
    lists: [],
    listsError: null,
    listsLoading: true,
    starterPacks: [],
    starterPacksError: null,
    starterPacksLoading: true,
  };
}

function createIdleState(): DiagnosticsState {
  return {
    blockedBy: [],
    blockedByError: null,
    blockedByLoading: false,
    blocking: [],
    blockingError: null,
    blockingLoading: false,
    labels: [],
    labelsError: null,
    labelsLoading: false,
    labelsSourceProfiles: {},
    lists: [],
    listsError: null,
    listsLoading: false,
    starterPacks: [],
    starterPacksError: null,
    starterPacksLoading: false,
  };
}

function purposeLabel(purpose: string | null | undefined) {
  const normalized = (purpose || "").toLowerCase();

  switch (normalized) {
    case "app.bsky.graph.defs#curatelist":
    case "curate":
    case "curation": {
      return "Curation";
    }
    case "app.bsky.graph.defs#modlist":
    case "modlist":
    case "moderation": {
      return "Moderation";
    }
    case "app.bsky.graph.defs#referencelist":
    case "reference": {
      return "Reference";
    }
    default: {
      if (normalized.endsWith("#curatelist")) {
        return "Curation";
      }

      if (normalized.endsWith("#modlist")) {
        return "Moderation";
      }

      if (normalized.endsWith("#referencelist")) {
        return "Reference";
      }

      return "Other";
    }
  }
}

function groupListsByPurpose(lists: DiagnosticList[]) {
  const grouped = [
    { label: "Curation", items: lists.filter((list) => purposeLabel(list.purpose) === "Curation") },
    { label: "Moderation", items: lists.filter((list) => purposeLabel(list.purpose) === "Moderation") },
    { label: "Reference", items: lists.filter((list) => purposeLabel(list.purpose) === "Reference") },
    {
      label: "Other",
      items: lists.filter((list) => purposeLabel(list.purpose) === "Other"),
    },
  ].filter((group) => group.items.length > 0);

  return grouped.length > 0 ? grouped : [{ label: "Lists", items: lists }];
}

function getDiagnosticEntryHandle(item: DiagnosticBlockItem | DiagnosticDidProfile) {
  if (item.profile?.handle) {
    return item.profile.handle;
  }

  if ("did" in item) {
    return item.did;
  }

  return item.subjectDid ?? item.profile?.did ?? "Unknown";
}

function getLabelDefinition(value: string | null | undefined) {
  switch ((value || "").toLowerCase()) {
    case "!hide": {
      return "Hidden content label.";
    }
    case "!hide-media": {
      return "Media visibility label.";
    }
    case "!hide-replies": {
      return "Replies visibility label.";
    }
    case "!no-unauthenticated": {
      return "Requires a signed-in view.";
    }
    case "!warn": {
      return "Advisory moderation label.";
    }
    default: {
      return "Service-applied moderation metadata.";
    }
  }
}

function getLabelEffect(label: DiagnosticLabel) {
  if (label.neg) {
    return "This label negates a previous moderation decision.";
  }

  switch ((label.val || "").toLowerCase()) {
    case "!hide":
    case "!hide-media":
    case "!hide-replies": {
      return "It can change how the record or account is shown in supporting clients.";
    }
    case "!no-unauthenticated": {
      return "It can limit visibility for signed-out browsing.";
    }
    default: {
      return "Its exact effect depends on the labeling service and client policy.";
    }
  }
}

function getSourceProfileName(sourceProfiles: Record<string, unknown>, src: string | null | undefined) {
  if (!src) {
    return "Unknown service";
  }

  const profile = asRecord(sourceProfiles[src]);
  if (!profile) {
    return src;
  }

  return getStringProperty(profile, "displayName") ?? formatHandle(getStringProperty(profile, "handle"), null) ?? src;
}

export function DiagnosticsPanel(props: DiagnosticsPanelProps) {
  const session = useAppSession();
  const [state, setState] = createStore<DiagnosticsState>(createInitialState());
  const [activeTab, setActiveTab] = createSignal<DiagnosticsTab>("lists");
  const [blocksExpanded, setBlocksExpanded] = createSignal(false);
  const activeDid = createMemo(() => props.did?.trim() || session.activeDid || "");
  const activeRecordUri = createMemo(() => props.recordUri?.trim() || "");
  const isSelf = createMemo(() => activeDid() === session.activeDid);
  let requestId = 0;

  createEffect(() => {
    const did = activeDid();
    if (!did) {
      setState(createIdleState());
      return;
    }

    const currentRequest = ++requestId;
    setActiveTab("lists");
    setBlocksExpanded(false);
    setState(createInitialState());

    void loadLists(currentRequest, did);
    void loadLabels(currentRequest, did);
    void loadBlocks(currentRequest, did);
    void loadStarterPacks(currentRequest, did);
  });

  function handleKeyDown(event: KeyboardEvent) {
    if (shouldIgnoreKey(event) || event.altKey || event.shiftKey) {
      return;
    }

    if (event.key >= "1" && event.key <= "5") {
      event.preventDefault();
      const nextTab = DIAGNOSTICS_TABS[Number(event.key) - 1]?.value;
      if (nextTab) {
        setActiveTab(nextTab);
      }
      return;
    }

    if (event.key === "Escape") {
      props.onClose?.();
    }
  }

  onMount(() => {
    document.addEventListener("keydown", handleKeyDown);
    onCleanup(() => document.removeEventListener("keydown", handleKeyDown));
  });

  async function loadLists(currentRequest: number, did: string) {
    try {
      const response = await getAccountLists(did);
      if (currentRequest !== requestId) return;
      setState({ lists: response.lists, listsError: null, listsLoading: false });
    } catch (error) {
      const message = normalizeError(error);
      if (currentRequest !== requestId) return;
      setState({ listsError: message, listsLoading: false });
      logger.warn("failed to load diagnostics lists", { keyValues: { did, error: message } });
    }
  }

  async function loadLabels(currentRequest: number, did: string) {
    try {
      const response = await getAccountLabels(did);
      if (currentRequest !== requestId) return;
      setState({
        labels: response.labels,
        labelsError: null,
        labelsLoading: false,
        labelsSourceProfiles: response.sourceProfiles,
      });
    } catch (error) {
      const message = normalizeError(error);
      if (currentRequest !== requestId) return;
      setState({ labelsError: message, labelsLoading: false, labelsSourceProfiles: {} });
      logger.warn("failed to load diagnostics labels", { keyValues: { did, error: message } });
    }
  }

  async function loadBlocks(currentRequest: number, did: string) {
    const [blockedBy, blocking] = await Promise.allSettled([getAccountBlockedBy(did, 25), getAccountBlocking(did)]);

    if (currentRequest !== requestId) {
      return;
    }

    if (blockedBy.status === "fulfilled") {
      setState({ blockedBy: blockedBy.value.items, blockedByError: null, blockedByLoading: false });
    } else {
      const message = normalizeError(blockedBy.reason);
      setState({ blockedByError: message, blockedByLoading: false });
      logger.warn("failed to load diagnostics blocked-by data", { keyValues: { did, error: message } });
    }

    if (blocking.status === "fulfilled") {
      setState({ blocking: blocking.value.items, blockingError: null, blockingLoading: false });
    } else {
      const message = normalizeError(blocking.reason);
      setState({ blockingError: message, blockingLoading: false });
      logger.warn("failed to load diagnostics blocking data", { keyValues: { did, error: message } });
    }
  }

  async function loadStarterPacks(currentRequest: number, did: string) {
    try {
      const response = await getAccountStarterPacks(did);
      if (currentRequest !== requestId) return;
      setState({ starterPacks: response.starterPacks, starterPacksError: null, starterPacksLoading: false });
    } catch (error) {
      const message = normalizeError(error);
      if (currentRequest !== requestId) return;
      setState({ starterPacksError: message, starterPacksLoading: false });
      logger.warn("failed to load diagnostics starter packs", { keyValues: { did, error: message } });
    }
  }

  return (
    <article class="grid min-h-0 grid-rows-[auto_auto_1fr] overflow-hidden rounded-4xl bg-surface-container shadow-[inset_0_0_0_1px_rgba(255,255,255,0.035)]">
      <DiagnosticsHeader
        did={activeDid()}
        embedded={props.embedded ?? false}
        isSelf={isSelf()}
        onClose={props.onClose} />
      <DiagnosticsTabs activeTab={activeTab()} onSelectTab={setActiveTab} />
      <DiagnosticsViewport
        activeTab={activeTab()}
        blocksExpanded={blocksExpanded()}
        isSelf={isSelf()}
        onOpenExplorerTarget={props.onOpenExplorerTarget}
        onRetryBlockedBy={() => void loadBlocks(requestId, activeDid())}
        onRetryBlocking={() => void loadBlocks(requestId, activeDid())}
        onRetryLabels={() => void loadLabels(requestId, activeDid())}
        onRetryLists={() => void loadLists(requestId, activeDid())}
        onRetryStarterPacks={() => void loadStarterPacks(requestId, activeDid())}
        onToggleBlocks={() => setBlocksExpanded((value) => !value)}
        recordUri={activeRecordUri()}
        state={state} />
    </article>
  );
}

function DiagnosticsHeader(props: { did: string; embedded: boolean; isSelf: boolean; onClose?: () => void }) {
  return (
    <header class="grid gap-4 px-6 pb-4 pt-6">
      <div class="flex items-start justify-between gap-4">
        <div class="grid gap-1">
          <p class="overline-copy text-xs text-on-surface-variant">Context</p>
          <h1 class="m-0 text-xl font-semibold tracking-tight text-on-surface">Social Diagnostics</h1>
          <p class="m-0 text-sm text-on-surface-variant">
            {props.isSelf ? "Your boundaries and public footprint" : "Public social context for this account"}
          </p>
        </div>
        <Show when={!props.embedded && props.onClose}>
          <button
            type="button"
            class="inline-flex h-10 w-10 items-center justify-center rounded-full border-0 bg-surface-container-high text-on-surface-variant transition duration-150 hover:-translate-y-px hover:text-on-surface"
            onClick={() => props.onClose?.()}
            title="Close diagnostics panel">
            <Icon kind="close" aria-hidden="true" />
          </button>
        </Show>
      </div>

      <p class="m-0 break-all rounded-2xl bg-surface-container-high px-4 py-3 font-mono text-xs text-on-surface-variant">
        {props.did || "No account selected"}
      </p>
    </header>
  );
}

function DiagnosticsTabs(props: { activeTab: DiagnosticsTab; onSelectTab: (tab: DiagnosticsTab) => void }) {
  const activeIndex = createMemo(() => DIAGNOSTICS_TABS.findIndex((tab) => tab.value === props.activeTab));

  return (
    <nav class="px-3 pb-3" aria-label="Diagnostics tabs">
      <div class="relative flex gap-1 rounded-full bg-black/30 p-1">
        <Motion.div
          class="absolute inset-y-1 rounded-full bg-white/7 shadow-[inset_0_0_0_1px_rgba(125,175,255,0.16)]"
          animate={{ x: `${activeIndex() * 100}%` }}
          style={{ width: `${100 / DIAGNOSTICS_TABS.length}%` }}
          transition={{ duration: 0.18 }} />
        <For each={DIAGNOSTICS_TABS}>
          {(tab) => (
            <button
              type="button"
              aria-pressed={props.activeTab === tab.value}
              class="relative z-10 flex-1 rounded-full px-3 py-2 text-sm font-medium transition duration-150"
              classList={{
                "text-on-surface": props.activeTab === tab.value,
                "text-on-surface-variant": props.activeTab !== tab.value,
              }}
              onClick={() => props.onSelectTab(tab.value)}>
              {tab.label}
            </button>
          )}
        </For>
      </div>
    </nav>
  );
}

function DiagnosticsViewport(
  props: {
    activeTab: DiagnosticsTab;
    blocksExpanded: boolean;
    isSelf: boolean;
    onOpenExplorerTarget?: (target: string) => void;
    onRetryBlockedBy: () => void;
    onRetryBlocking: () => void;
    onRetryLabels: () => void;
    onRetryLists: () => void;
    onRetryStarterPacks: () => void;
    onToggleBlocks: () => void;
    recordUri: string;
    state: DiagnosticsState;
  },
) {
  return (
    <div class="min-h-0 overflow-y-auto px-3 pb-3">
      <Presence>
        <Show when={props.activeTab === "lists"} keyed>
          <DiagnosticsListsTab
            error={props.state.listsError}
            lists={props.state.lists}
            loading={props.state.listsLoading}
            onOpenExplorerTarget={props.onOpenExplorerTarget}
            onRetry={props.onRetryLists} />
        </Show>
        <Show when={props.activeTab === "labels"} keyed>
          <DiagnosticsLabelsTab
            error={props.state.labelsError}
            labels={props.state.labels}
            loading={props.state.labelsLoading}
            onRetry={props.onRetryLabels}
            sourceProfiles={props.state.labelsSourceProfiles} />
        </Show>
        <Show when={props.activeTab === "blocks"} keyed>
          <DiagnosticsBlocksTab
            blockedBy={props.state.blockedBy}
            blockedByError={props.state.blockedByError}
            blockedByLoading={props.state.blockedByLoading}
            blocking={props.state.blocking}
            blockingError={props.state.blockingError}
            blockingLoading={props.state.blockingLoading}
            expanded={props.blocksExpanded}
            isSelf={props.isSelf}
            onRetryBlockedBy={props.onRetryBlockedBy}
            onRetryBlocking={props.onRetryBlocking}
            onToggleExpanded={props.onToggleBlocks} />
        </Show>
        <Show when={props.activeTab === "starterPacks"} keyed>
          <DiagnosticsStarterPacksTab
            error={props.state.starterPacksError}
            loading={props.state.starterPacksLoading}
            onOpenExplorerTarget={props.onOpenExplorerTarget}
            onRetry={props.onRetryStarterPacks}
            starterPacks={props.state.starterPacks} />
        </Show>
        <Show when={props.activeTab === "backlinks"} keyed>
          <section class="grid gap-3">
            <DiagnosticsTabIntro
              description="Backlinks are record-specific engagement context. Open a record to inspect likes, reposts, replies, and quote posts."
              title="Backlinks" />
            <RecordBacklinksPanel uri={props.recordUri || null} />
          </section>
        </Show>
      </Presence>
    </div>
  );
}

function DiagnosticsListsTab(
  props: {
    error: string | null;
    lists: DiagnosticList[];
    loading: boolean;
    onOpenExplorerTarget?: (target: string) => void;
    onRetry: () => void;
  },
) {
  return (
    <section class="grid gap-3">
      <DiagnosticsTabIntro
        title="Lists"
        description="Lists are collections of users and can be used for moderation or curation." />
      <Switch
        fallback={
          <div class="grid gap-4">
            <For
              each={groupListsByPurpose(props.lists)}
              fallback={
                <DiagnosticsEmptyState copy="Lists explain where this account appears in the network. There may simply be none yet." />
              }>
              {(group) => (
                <div class="grid gap-3">
                  <p class="m-0 text-xs uppercase tracking-[0.14em] text-on-surface-variant">{group.label}</p>
                  <div class="grid gap-3">
                    <For each={group.items}>
                      {(list) => <ListCard list={list} onOpenExplorerTarget={props.onOpenExplorerTarget} />}
                    </For>
                  </div>
                </div>
              )}
            </For>
          </div>
        }>
        <Match when={props.loading}>
          <DiagnosticsListSkeleton />
        </Match>
        <Match when={props.error}>{(error) => <DiagnosticsError message={error()} onRetry={props.onRetry} />}</Match>
      </Switch>
    </section>
  );
}

function DiagnosticsLabelsTab(
  props: {
    error: string | null;
    labels: DiagnosticLabel[];
    loading: boolean;
    onRetry: () => void;
    sourceProfiles: Record<string, unknown>;
  },
) {
  return (
    <section class="grid gap-3">
      <DiagnosticsTabIntro
        title="Labels"
        description="Labels are moderation metadata from labeling services. They are shown as uniform chips with source attribution." />
      <Switch
        fallback={
          <Motion.div
            class="flex flex-wrap gap-2"
            initial={{ opacity: 0, scale: 0.98 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ duration: 0.16 }}>
            <For
              fallback={
                <DiagnosticsEmptyState copy="Labels are service-applied metadata that can affect visibility. No visible labels are being returned for this account right now." />
              }
              each={props.labels}>
              {(label, index) => (
                <LabelChip
                  index={index()}
                  label={label}
                  sourceName={getSourceProfileName(props.sourceProfiles, label.src)} />
              )}
            </For>
          </Motion.div>
        }>
        <Match when={props.loading}>
          <DiagnosticsLabelSkeleton />
        </Match>
        <Match when={props.error}>{(error) => <DiagnosticsError message={error()} onRetry={props.onRetry} />}</Match>
      </Switch>
    </section>
  );
}

function DiagnosticsBlocksTab(
  props: {
    blockedBy: DiagnosticDidProfile[];
    blockedByError: string | null;
    blockedByLoading: boolean;
    blocking: DiagnosticBlockItem[];
    blockingError: string | null;
    blockingLoading: boolean;
    expanded: boolean;
    isSelf: boolean;
    onRetryBlockedBy: () => void;
    onRetryBlocking: () => void;
    onToggleExpanded: () => void;
  },
) {
  const blockedByCount = createMemo(() => props.blockedBy.length);
  const blockingCount = createMemo(() => props.blocking.length);

  return (
    <section class="grid gap-3">
      <DiagnosticsTabIntro
        description="Blocking is a normal social boundary. Counts stay in the summary row; specific accounts appear only after a deliberate action."
        title={props.isSelf ? "Your Boundaries" : "Blocks"} />
      <div class="grid gap-3 sm:grid-cols-2">
        <StatCard label={props.isSelf ? "Boundaries around you" : "Blocked by"} value={blockedByCount()} />
        <StatCard label={props.isSelf ? "Your boundaries" : "Blocking"} value={blockingCount()} />
      </div>
      <div class="rounded-3xl bg-white/3 p-4 text-sm leading-relaxed text-on-surface-variant">
        Blocks are a normal part of social media. This data is public on the AT Protocol.
      </div>
      <button
        type="button"
        class="inline-flex w-fit items-center gap-2 rounded-full border-0 bg-surface-container-high px-4 py-2 text-sm font-medium text-on-surface transition duration-150 hover:-translate-y-px"
        onClick={() => props.onToggleExpanded()}>
        <Icon kind={props.expanded ? "close" : "list"} aria-hidden="true" />
        {props.expanded ? "Hide details" : "Show details"}
      </button>

      <Presence>
        <Show when={props.expanded}>
          <Motion.div
            class="grid gap-4"
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            transition={{ duration: 0.18 }}>
            <DiagnosticsBlock
              error={props.blockedByError}
              items={props.blockedBy}
              loading={props.blockedByLoading}
              onRetry={props.onRetryBlockedBy}
              title={props.isSelf ? "Boundaries around you" : "Blocked by"} />
            <DiagnosticsBlock
              error={props.blockingError}
              items={props.blocking}
              loading={props.blockingLoading}
              onRetry={props.onRetryBlocking}
              title={props.isSelf ? "Your boundaries" : "Blocking"} />
          </Motion.div>
        </Show>
      </Presence>
    </section>
  );
}

function DiagnosticsBlock(
  props: {
    error: string | null;
    items: DiagnosticBlockItem[] | DiagnosticDidProfile[];
    loading: boolean;
    onRetry: () => void;
    title: string;
  },
) {
  const items = createMemo(() =>
    props.items.map((item) => ({
      available: item.availability === "available",
      avatar: item.availability === "available" ? item.profile?.avatar ?? null : null,
      description: item.availability === "available" ? item.profile?.description ?? null : null,
      displayName: item.profile?.displayName ?? null,
      handle: getDiagnosticEntryHandle(item),
      unavailableMessage: item.unavailableMessage ?? "Profile unavailable",
    }))
  );

  return (
    <Switch fallback={<BlockProfileList items={items()} title={props.title} />}>
      <Match when={props.loading}>
        <DiagnosticsBlockSkeleton />
      </Match>
      <Match when={props.error}>{(error) => <DiagnosticsError message={error()} onRetry={props.onRetry} />}</Match>
    </Switch>
  );
}

function DiagnosticsStarterPacksTab(
  props: {
    error: string | null;
    loading: boolean;
    onOpenExplorerTarget?: (target: string) => void;
    onRetry: () => void;
    starterPacks: DiagnosticStarterPack[];
  },
) {
  return (
    <section class="grid gap-3">
      <DiagnosticsTabIntro
        title="Starter Packs"
        description="Starter packs show how people are discovering this account. The cards stay compact and factual." />
      <Switch
        fallback={
          <div class="grid gap-3">
            <For
              each={props.starterPacks}
              fallback={
                <DiagnosticsEmptyState copy="Starter packs are discovery context and may not exist for every account." />
              }>
              {(pack) => <StarterPackCard onOpenExplorerTarget={props.onOpenExplorerTarget} pack={pack} />}
            </For>
          </div>
        }>
        <Match when={props.loading}>
          <DiagnosticsStarterPackSkeleton />
        </Match>
        <Match when={props.error}>{(error) => <DiagnosticsError message={error()} onRetry={props.onRetry} />}</Match>
      </Switch>
    </section>
  );
}

function DiagnosticsTabIntro(props: { description: string; title: string }) {
  return (
    <div class="grid gap-1 rounded-3xl bg-white/3 p-4">
      <h2 class="m-0 text-base font-semibold text-on-surface">{props.title}</h2>
      <p class="m-0 text-sm leading-relaxed text-on-surface-variant">{props.description}</p>
    </div>
  );
}

function DiagnosticsError(props: { message: string | null; onRetry?: () => void }) {
  return (
    <div class="grid gap-3 rounded-3xl bg-white/3 p-4 text-sm text-on-surface-variant">
      <p class="m-0">{props.message}</p>
      <Show when={props.onRetry}>
        <button
          type="button"
          class="inline-flex w-fit items-center gap-2 rounded-full border-0 bg-surface-container-high px-4 py-2 text-sm font-medium text-on-surface transition duration-150 hover:-translate-y-px"
          onClick={() => props.onRetry?.()}>
          <Icon kind="refresh" aria-hidden="true" />
          Retry
        </button>
      </Show>
    </div>
  );
}

function DiagnosticsEmptyState(props: { copy: string }) {
  return <div class="rounded-3xl bg-white/3 p-4 text-sm text-on-surface-variant">{props.copy}</div>;
}

function StatCard(props: { label: string; value: number }) {
  return (
    <div class="rounded-3xl bg-white/3 p-4">
      <p class="m-0 text-xs uppercase tracking-[0.12em] text-on-surface-variant">{props.label}</p>
      <p class="m-0 mt-2 text-3xl font-semibold text-on-surface">{props.value}</p>
    </div>
  );
}

function LabelChip(props: { index: number; label: DiagnosticLabel; sourceName: string }) {
  const title = createMemo(() =>
    [
      `Label: ${props.label.val ?? "Unknown"}`,
      `Definition: ${getLabelDefinition(props.label.val)}`,
      `Source: ${props.sourceName}`,
      `Effect: ${getLabelEffect(props.label)}`,
    ].join("\n")
  );

  return (
    <Motion.span
      class="inline-flex items-center gap-2 rounded-full bg-white/5 px-3 py-2 text-sm text-on-secondary-container"
      initial={{ opacity: 0, scale: 0.9 }}
      animate={{ opacity: 1, scale: 1 }}
      title={title()}
      transition={{ delay: Math.min(props.index * 0.02, 0.12), duration: 0.14 }}>
      <span class="h-2 w-2 rounded-full bg-white/20" />
      <span>{props.label.val ?? "label"}</span>
      <span class="text-xs text-on-surface-variant/90">{props.sourceName}</span>
    </Motion.span>
  );
}

function ListCard(props: { list: DiagnosticList; onOpenExplorerTarget?: (target: string) => void }) {
  const count = () => props.list.memberCount ?? props.list.listItemCount ?? 0;
  const title = () => props.list.title ?? props.list.name ?? "Untitled list";

  return (
    <div class="rounded-3xl bg-white/3 p-4 transition duration-150 hover:bg-white/5">
      <div class="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div class="min-w-0">
          <div class="flex flex-wrap items-center gap-2">
            <p class="m-0 text-base font-semibold text-on-surface">{title()}</p>
            <span class="rounded-full bg-primary/12 px-3 py-1 text-xs text-primary">
              {purposeLabel(props.list.purpose)}
            </span>
          </div>
          <p class="m-0 mt-1 text-sm text-on-surface-variant">
            Owner: {formatHandle(props.list.creator?.handle, null)}
          </p>
          <p class="m-0 mt-3 text-sm leading-relaxed text-on-surface-variant">
            {props.list.description ?? "No description provided."}
          </p>
        </div>

        <div class="grid shrink-0 justify-items-start gap-2 text-left lg:justify-items-end lg:text-right">
          <span class="text-xs text-on-surface-variant">{count()} members</span>
          <Show when={props.list.uri}>
            {uri => (
              <button
                type="button"
                class="inline-flex items-center gap-2 rounded-full border-0 bg-surface-container-high px-4 py-2 text-sm text-on-surface transition duration-150 hover:-translate-y-px"
                disabled={!props.onOpenExplorerTarget}
                onClick={() => props.onOpenExplorerTarget?.(uri())}>
                <Icon kind="ext-link" aria-hidden="true" />
                Open list
              </button>
            )}
          </Show>
        </div>
      </div>
    </div>
  );
}

function StarterPackCard(props: { onOpenExplorerTarget?: (target: string) => void; pack: DiagnosticStarterPack }) {
  const count = () => props.pack.listItemCount ?? props.pack.record?.listItemsSample?.length ?? 0;
  const title = () => props.pack.title ?? props.pack.name ?? props.pack.record?.name ?? "Starter pack";

  return (
    <div class="rounded-3xl bg-white/3 p-4 transition duration-150 hover:bg-white/5">
      <div class="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div class="min-w-0">
          <p class="m-0 text-base font-semibold text-on-surface">{title()}</p>
          <p class="m-0 mt-1 text-sm text-on-surface-variant">
            Creator: {formatHandle(props.pack.creator?.handle ?? null, null)}
          </p>
          <p class="m-0 mt-3 text-sm leading-relaxed text-on-surface-variant">
            {props.pack.description ?? props.pack.record?.description ?? "No description provided."}
          </p>
        </div>

        <div class="grid shrink-0 justify-items-start gap-2 sm:justify-items-end">
          <span class="rounded-full bg-white/5 px-3 py-1 text-xs text-on-surface-variant">{count()} members</span>
          <Show when={props.pack.uri}>
            {uri => (
              <button
                type="button"
                class="inline-flex items-center gap-2 rounded-full border-0 bg-surface-container-high px-4 py-2 text-sm text-on-surface transition duration-150 hover:-translate-y-px"
                disabled={!props.onOpenExplorerTarget}
                onClick={() => props.onOpenExplorerTarget?.(uri())}>
                <Icon kind="ext-link" aria-hidden="true" />
                AT Explorer
              </button>
            )}
          </Show>
        </div>
      </div>
    </div>
  );
}

function BlockProfileList(
  props: {
    items: Array<
      {
        available: boolean;
        avatar?: string | null;
        description?: string | null;
        displayName?: string | null;
        handle: string;
        unavailableMessage: string;
      }
    >;
    title: string;
  },
) {
  return (
    <div class="grid gap-3 rounded-3xl bg-white/3 p-4">
      <p class="m-0 text-sm font-semibold text-on-surface">{props.title}</p>
      <div class="grid gap-3">
        <For each={props.items}>
          {(item, index) => {
            const name = () => item.displayName ?? item.handle;
            return (
              <Motion.div
                class="flex items-start gap-3 rounded-2xl p-3"
                classList={{ "bg-black/20": item.available, "bg-white/4 opacity-70": !item.available }}
                aria-disabled={!item.available}
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: Math.min(index() * 0.04, 0.16), duration: 0.16 }}>
                <div class="flex h-10 w-10 shrink-0 items-center justify-center overflow-hidden rounded-full bg-white/8 text-xs font-semibold text-on-surface-variant">
                  <Show
                    when={item.available && item.avatar}
                    fallback={item.available
                      ? <span>{initials(name())}</span>
                      : <Icon kind="danger" aria-hidden="true" />}>
                    {(src) => <img alt="" class="h-full w-full object-cover" src={src()} />}
                  </Show>
                </div>
                <div class="min-w-0">
                  <p class="m-0 text-sm font-medium text-on-surface">{name()}</p>
                  <p class="m-0 text-xs text-on-surface-variant">{formatHandle(item.handle, null)}</p>
                  <Show when={item.available && item.description}>
                    {(description) => (
                      <p class="m-0 mt-2 text-xs leading-relaxed text-on-surface-variant">{description()}</p>
                    )}
                  </Show>
                  <Show when={!item.available}>
                    <p class="m-0 mt-2 text-xs leading-relaxed text-on-surface-variant">{item.unavailableMessage}</p>
                  </Show>
                </div>
              </Motion.div>
            );
          }}
        </For>
      </div>
    </div>
  );
}

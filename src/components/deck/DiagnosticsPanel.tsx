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
import { normalizeError } from "$/lib/utils/text";
import * as logger from "@tauri-apps/plugin-log";
import { createEffect, createMemo, createSignal, For, Match, onCleanup, onMount, Show, Switch } from "solid-js";
import { createStore } from "solid-js/store";
import { Motion, Presence } from "solid-motionone";
import { Icon } from "../shared/Icon";

type DiagnosticsTab = "lists" | "labels" | "blocks" | "starterPacks" | "backlinks";

type DiagnosticsPanelProps = { did: string; onClose: () => void };

type DiagnosticsState = {
  lists: DiagnosticList[];
  listsError: string | null;
  listsLoading: boolean;
  labels: DiagnosticLabel[];
  labelsError: string | null;
  labelsLoading: boolean;
  blockedBy: DiagnosticDidProfile[];
  blockedByError: string | null;
  blockedByLoading: boolean;
  blocking: DiagnosticBlockItem[];
  blockingError: string | null;
  blockingLoading: boolean;
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
    lists: [],
    listsError: null,
    listsLoading: true,
    starterPacks: [],
    starterPacksError: null,
    starterPacksLoading: true,
  };
}

function purposeLabel(purpose: string | null | undefined) {
  switch ((purpose || "").toLowerCase()) {
    case "curate":
    case "curation": {
      return "Curation";
    }
    case "modlist":
    case "moderation": {
      return "Moderation";
    }
    case "reference": {
      return "Reference";
    }
    default: {
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

function initials(name: string) {
  return name.trim().slice(0, 1).toUpperCase() || "?";
}

export function DiagnosticsPanel(props: DiagnosticsPanelProps) {
  const session = useAppSession();
  const [state, setState] = createStore<DiagnosticsState>(createInitialState());
  const [activeTab, setActiveTab] = createSignal<DiagnosticsTab>("lists");
  const [blocksExpanded, setBlocksExpanded] = createSignal(false);
  const activeDid = createMemo(() => props.did.trim() || session.activeDid || "");
  const isSelf = createMemo(() => activeDid() === session.activeDid);
  let requestId = 0;

  createEffect(() => {
    const did = activeDid();
    if (!did) {
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
    if (event.key >= "1" && event.key <= "5" && !event.metaKey && !event.ctrlKey && !event.altKey) {
      event.preventDefault();
      const nextTab = DIAGNOSTICS_TABS[Number(event.key) - 1]?.value;
      if (nextTab) {
        setActiveTab(nextTab);
      }
    }

    if (event.key === "Escape") {
      props.onClose();
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
      setState({ labels: response.labels, labelsError: null, labelsLoading: false });
    } catch (error) {
      const message = normalizeError(error);
      if (currentRequest !== requestId) return;
      setState({ labelsError: message, labelsLoading: false });
      logger.warn("failed to load diagnostics labels", { keyValues: { did, error: message } });
    }
  }

  async function loadBlocks(currentRequest: number, did: string) {
    try {
      const [blockedBy, blocking] = await Promise.all([getAccountBlockedBy(did, 25), getAccountBlocking(did)]);
      if (currentRequest !== requestId) return;
      setState({
        blockedBy: blockedBy.items,
        blockedByError: null,
        blockedByLoading: false,
        blocking: blocking.items,
        blockingError: null,
        blockingLoading: false,
      });
    } catch (error) {
      const message = normalizeError(error);
      if (currentRequest !== requestId) return;
      setState({ blockedByError: message, blockedByLoading: false, blockingError: message, blockingLoading: false });
      logger.warn("failed to load diagnostics blocks", { keyValues: { did, error: message } });
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
      <DiagnosticsHeader did={activeDid()} isSelf={isSelf()} onClose={props.onClose} />
      <DiagnosticsTabs activeTab={activeTab()} onSelectTab={setActiveTab} />
      <DiagnosticsViewport
        activeTab={activeTab()}
        blocksExpanded={blocksExpanded()}
        onToggleBlocks={() => setBlocksExpanded((value) => !value)}
        state={state} />
    </article>
  );
}

function DiagnosticsHeader(props: { did: string; isSelf: boolean; onClose: () => void }) {
  return (
    <header class="grid gap-4 px-6 pb-4 pt-6">
      <div class="flex items-start justify-between gap-4">
        <div class="grid gap-1">
          <p class="overline-copy text-xs text-on-surface-variant">Context</p>
          <h1 class="m-0 text-xl font-semibold tracking-tight text-on-surface">Social Diagnostics</h1>
          <p class="m-0 text-sm text-on-surface-variant">
            {props.isSelf ? "Your boundaries and footprint" : "Public social context for this account"}
          </p>
        </div>
        <button
          type="button"
          class="inline-flex h-10 w-10 items-center justify-center rounded-full border-0 bg-surface-container-high text-on-surface-variant transition duration-150 hover:-translate-y-px hover:text-on-surface"
          onClick={() => props.onClose()}
          title="Close diagnostics panel">
          <Icon kind="close" aria-hidden="true" />
        </button>
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
  props: { activeTab: DiagnosticsTab; blocksExpanded: boolean; onToggleBlocks: () => void; state: DiagnosticsState },
) {
  return (
    <div class="min-h-0 overflow-y-auto px-3 pb-3">
      <Presence>
        <Show when={props.activeTab === "lists"} keyed>
          <DiagnosticsListsTab
            lists={props.state.lists}
            error={props.state.listsError}
            loading={props.state.listsLoading} />
        </Show>
        <Show when={props.activeTab === "labels"} keyed>
          <DiagnosticsLabelsTab
            labels={props.state.labels}
            error={props.state.labelsError}
            loading={props.state.labelsLoading} />
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
            onToggleExpanded={props.onToggleBlocks} />
        </Show>
        <Show when={props.activeTab === "starterPacks"} keyed>
          <DiagnosticsStarterPacksTab
            error={props.state.starterPacksError}
            loading={props.state.starterPacksLoading}
            starterPacks={props.state.starterPacks} />
        </Show>
        <Show when={props.activeTab === "backlinks"} keyed>
          <DiagnosticsBacklinksTab />
        </Show>
      </Presence>
    </div>
  );
}

function DiagnosticsListsTab(props: { lists: DiagnosticList[]; error: string | null; loading: boolean }) {
  return (
    <section class="grid gap-3">
      <DiagnosticsTabIntro
        title="Lists"
        description="Lists are ordinary social structure. The view keeps purpose and membership context visible without scoring or judgment." />
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
                    <For each={group.items}>{(list) => <ListCard list={list} />}</For>
                  </div>
                </div>
              )}
            </For>
          </div>
        }>
        <Match when={props.loading}>
          <DiagnosticsListSkeleton />
        </Match>
        <Match when={props.error}>{error => <DiagnosticsError message={error()} />}</Match>
      </Switch>
    </section>
  );
}

function DiagnosticsLabelsTab(props: { labels: DiagnosticLabel[]; error: string | null; loading: boolean }) {
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
                <DiagnosticsEmptyState copy="Labels are service-applied metadata that can affect visibility. This account currently has no visible labels." />
              }
              each={props.labels}>
              {(label, index) => <LabelChip label={label} index={index()} />}
            </For>
          </Motion.div>
        }>
        <Match when={props.loading}>
          <DiagnosticsLabelSkeleton />
        </Match>
        <Match when={props.error}>{error => <DiagnosticsError message={error()} />}</Match>
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
    onToggleExpanded: () => void;
  },
) {
  const blockedByCount = createMemo(() => props.blockedBy.length);
  const blockingCount = createMemo(() => props.blocking.length);

  return (
    <section class="grid gap-3">
      <DiagnosticsTabIntro
        title={"Blocks"}
        description={"Blocking is a normal boundary. Counts are shown first; details are revealed only on request."} />
      <div class="grid gap-3 sm:grid-cols-2">
        <StatCard label="Blocked by" value={blockedByCount()} />
        <StatCard label="Blocking" value={blockingCount()} />
      </div>
      <div class="rounded-3xl bg-white/3 p-4 text-sm leading-relaxed text-on-surface-variant">
        {"Blocks are a normal part of social media. This data is public on the AT Protocol."}
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
              kind="blockedBy"
              items={props.blockedBy}
              loading={props.blockedByLoading}
              error={props.blockedByError} />
            <DiagnosticsBlock
              kind="blocking"
              items={props.blocking}
              loading={props.blockingLoading}
              error={props.blockingError} />
          </Motion.div>
        </Show>
      </Presence>
    </section>
  );
}

function DiagnosticsBlock(
  props: {
    kind: "blockedBy" | "blocking";
    items: DiagnosticBlockItem[] | DiagnosticDidProfile[];
    loading: boolean;
    error: string | null;
  },
) {
  const items = createMemo(() =>
    props.items.map(item => ({
      avatar: item.profile?.avatar ?? null,
      description: item.profile?.description ?? null,
      displayName: item.profile?.displayName ?? null,
      handle: (item.profile?.handle ?? item.profile?.did) ?? "Unknown",
    }))
  );

  return (
    <Switch
      fallback={
        <BlockProfileList title={props.kind === "blockedBy" ? "Blocked by" : "Your boundaries"} items={items()} />
      }>
      <Match when={props.loading}>
        <DiagnosticsBlockSkeleton />
      </Match>
      <Match when={props.error}>{error => <DiagnosticsError message={error()} />}</Match>
    </Switch>
  );
}

function DiagnosticsStarterPacksTab(
  props: { starterPacks: DiagnosticStarterPack[]; error: string | null; loading: boolean },
) {
  return (
    <section class="grid gap-3">
      <DiagnosticsTabIntro
        title="Starter Packs"
        description="Starter packs show how people are discovering this account. They stay compact and factual." />
      <Switch
        fallback={
          <div class="grid gap-3">
            <For
              each={props.starterPacks}
              fallback={
                <DiagnosticsEmptyState copy="Starter packs are discovery context and may not exist for every account." />
              }>
              {(pack) => <StarterPackCard pack={pack} />}
            </For>
          </div>
        }>
        <Match when={props.loading}>
          <DiagnosticsStarterPackSkeleton />
        </Match>
        <Match when={props.error}>
          <DiagnosticsError message={props.error} />
        </Match>
      </Switch>
    </section>
  );
}

function DiagnosticsBacklinksTab() {
  return (
    <section class="grid gap-3">
      <DiagnosticsTabIntro
        title="Backlinks"
        description="Record backlinks are shown in AT Explorer record view, grouped by likes, reposts, replies, and quotes." />
      <div class="grid gap-3 sm:grid-cols-2">
        <BacklinkPreviewCard title="Likes" copy="Record references tied to likes." />
        <BacklinkPreviewCard title="Reposts" copy="Record references tied to reposts." />
        <BacklinkPreviewCard title="Replies" copy="Direct replies to a record." />
        <BacklinkPreviewCard title="Quotes" copy="Records that embed the URI." />
      </div>
    </section>
  );
}

function DiagnosticsTabIntro(props: { title: string; description: string }) {
  return (
    <div class="grid gap-1 rounded-3xl bg-white/3 p-4">
      <h2 class="m-0 text-base font-semibold text-on-surface">{props.title}</h2>
      <p class="m-0 text-sm leading-relaxed text-on-surface-variant">{props.description}</p>
    </div>
  );
}

function DiagnosticsError(props: { message: string | null }) {
  return <div class="rounded-3xl bg-white/3 p-4 text-sm text-on-surface-variant">{props.message}</div>;
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

function LabelChip(props: { label: DiagnosticLabel; index: number }) {
  const copy = () => [props.label.val ?? "label", props.label.src ?? "unknown service"].join(" · ");

  return (
    <Motion.span
      class="inline-flex items-center gap-2 rounded-full bg-white/5 px-3 py-2 text-sm text-on-surface-variant"
      initial={{ opacity: 0, scale: 0.9 }}
      animate={{ opacity: 1, scale: 1 }}
      title={copy()}
      transition={{ duration: 0.14, delay: Math.min(props.index * 0.02, 0.12) }}>
      <span class="h-2 w-2 rounded-full bg-white/25" />
      <span>{props.label.val ?? "label"}</span>
      <span class="text-xs text-on-surface-variant/80">{props.label.src ?? "unknown service"}</span>
    </Motion.span>
  );
}

function ListCard(props: { list: DiagnosticList }) {
  const title = () => props.list.title ?? props.list.name ?? "Untitled list";
  const count = () => props.list.memberCount ?? props.list.listItemCount ?? 0;

  return (
    <div class="rounded-3xl bg-white/3 p-4 transition duration-150 hover:bg-white/5">
      <div class="flex items-start justify-between gap-4">
        <div class="min-w-0">
          <p class="m-0 text-base font-semibold text-on-surface">{title()}</p>
          <p class="m-0 mt-1 text-sm text-on-surface-variant">
            {props.list.creator?.handle ? `@${props.list.creator.handle}` : "Unknown owner"}
          </p>
          <p class="m-0 mt-3 text-sm leading-relaxed text-on-surface-variant">
            {props.list.description ?? "No description provided."}
          </p>
        </div>
        <div class="grid justify-items-end gap-2 shrink-0 text-right">
          <span class="rounded-full bg-white/5 px-3 py-1 text-xs text-on-surface-variant">
            {purposeLabel(props.list.purpose)}
          </span>
          <span class="text-xs text-on-surface-variant">{count()} members</span>
        </div>
      </div>
    </div>
  );
}

function StarterPackCard(props: { pack: DiagnosticStarterPack }) {
  const title = () => props.pack.title ?? props.pack.name ?? props.pack.record?.name ?? "Starter pack";
  const count = () => props.pack.listItemCount ?? props.pack.record?.listItemsSample?.length ?? 0;

  return (
    <div class="rounded-3xl bg-white/3 p-4 transition duration-150 hover:bg-white/5">
      <div class="flex items-start justify-between gap-4">
        <div class="min-w-0">
          <p class="m-0 text-base font-semibold text-on-surface">{title()}</p>
          <p class="m-0 mt-1 text-sm text-on-surface-variant">
            {props.pack.creator?.handle ? `@${props.pack.creator.handle}` : "Unknown creator"}
          </p>
          <p class="m-0 mt-3 text-sm leading-relaxed text-on-surface-variant">
            {props.pack.description ?? props.pack.record?.description ?? "No description provided."}
          </p>
        </div>
        <span class="rounded-full bg-white/5 px-3 py-1 text-xs text-on-surface-variant">{count()} members</span>
      </div>
    </div>
  );
}

function BacklinkPreviewCard(props: { copy: string; title: string }) {
  return (
    <div class="rounded-3xl bg-white/3 p-4">
      <p class="m-0 text-base font-semibold text-on-surface">{props.title}</p>
      <p class="m-0 mt-2 text-sm text-on-surface-variant">{props.copy}</p>
    </div>
  );
}

function BlockProfileList(
  props: {
    items: Array<{ avatar?: string | null; description?: string | null; displayName?: string | null; handle: string }>;
    title: string;
  },
) {
  return (
    <div class="grid gap-3 rounded-3xl bg-white/3 p-4">
      <p class="m-0 text-sm font-semibold text-on-surface">{props.title}</p>
      <div class="grid gap-3">
        <For each={props.items}>
          {(item) => {
            const name = () => item.displayName ?? item.handle;
            return (
              <div class="flex items-start gap-3 rounded-2xl bg-black/20 p-3">
                <div class="flex h-10 w-10 shrink-0 items-center justify-center overflow-hidden rounded-full bg-white/8 text-xs font-semibold text-on-surface-variant">
                  <Show when={item.avatar} fallback={<span>{initials(name())}</span>}>
                    {(src) => <img alt="" class="h-full w-full object-cover" src={src()} />}
                  </Show>
                </div>
                <div class="min-w-0">
                  <p class="m-0 text-sm font-medium text-on-surface">{name()}</p>
                  <p class="m-0 text-xs text-on-surface-variant">{item.handle}</p>
                  <Show when={item.description}>
                    {(description) => (
                      <p class="m-0 mt-2 text-xs leading-relaxed text-on-surface-variant">{description()}</p>
                    )}
                  </Show>
                </div>
              </div>
            );
          }}
        </For>
      </div>
    </div>
  );
}

function DiagnosticsListSkeleton() {
  return (
    <div class="grid gap-4">
      <For each={Array.from({ length: 3 })}>{() => <div class="h-28 rounded-3xl bg-white/3" />}</For>
    </div>
  );
}

function DiagnosticsLabelSkeleton() {
  return (
    <div class="flex flex-wrap gap-2">
      <For each={Array.from({ length: 5 })}>{() => <div class="h-10 w-28 rounded-full bg-white/3" />}</For>
    </div>
  );
}

function DiagnosticsStarterPackSkeleton() {
  return (
    <div class="grid gap-3">
      <For each={Array.from({ length: 2 })}>{() => <div class="h-24 rounded-3xl bg-white/3" />}</For>
    </div>
  );
}

function DiagnosticsBlockSkeleton() {
  return (
    <div class="grid gap-3">
      <For each={Array.from({ length: 2 })}>{() => <div class="h-20 rounded-3xl bg-white/3" />}</For>
    </div>
  );
}

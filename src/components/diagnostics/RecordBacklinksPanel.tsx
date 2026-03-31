import { type DiagnosticBacklinkGroup, type DiagnosticBacklinkItem, getRecordBacklinks } from "$/lib/api/diagnostics";
import { normalizeError } from "$/lib/utils/text";
import * as logger from "@tauri-apps/plugin-log";
import { createEffect, createMemo, For, Match, Show, Switch } from "solid-js";
import { createStore } from "solid-js/store";
import { Motion, Presence } from "solid-motionone";
import { ArrowIcon, Icon } from "../shared/Icon";

type GroupKey = "likes" | "reposts" | "replies" | "quotes";

type RecordBacklinksPanelProps = { uri?: string | null };

type BacklinksState = { error: string | null; groups: Record<GroupKey, DiagnosticBacklinkGroup>; loading: boolean };

const EMPTY_GROUP: DiagnosticBacklinkGroup = { cursor: null, records: [], total: 0 };

const GROUP_ORDER: Array<{ copy: string; icon: "heart" | "repost" | "reply" | "quote"; key: GroupKey; label: string }> =
  [
    { copy: "Records that liked this subject.", icon: "heart", key: "likes", label: "Likes" },
    { copy: "Records that reposted this subject.", icon: "repost", key: "reposts", label: "Reposts" },
    { copy: "Direct replies to this subject.", icon: "reply", key: "replies", label: "Replies" },
    { copy: "Records that embedded this URI.", icon: "quote", key: "quotes", label: "Quote posts" },
  ];

function createInitialState(): BacklinksState {
  return {
    error: null,
    groups: { likes: EMPTY_GROUP, quotes: EMPTY_GROUP, replies: EMPTY_GROUP, reposts: EMPTY_GROUP },
    loading: true,
  };
}

function createIdleState(): BacklinksState {
  return {
    error: null,
    groups: { likes: EMPTY_GROUP, quotes: EMPTY_GROUP, replies: EMPTY_GROUP, reposts: EMPTY_GROUP },
    loading: false,
  };
}

function initials(name: string) {
  return name.trim().slice(0, 1).toUpperCase() || "?";
}

function formatHandle(handle: string | null | undefined, did: string | null | undefined) {
  if (handle) {
    return handle.startsWith("@") ? handle : `@${handle}`;
  }

  return did ?? "Unknown";
}

export function RecordBacklinksPanel(props: RecordBacklinksPanelProps) {
  const [state, setState] = createStore<BacklinksState>(createInitialState());
  const [expandedByKey, setExpandedByKey] = createStore<Record<GroupKey, boolean>>({
    likes: false,
    quotes: false,
    replies: false,
    reposts: false,
  });
  const activeUri = createMemo(() => props.uri?.trim() || "");
  let requestId = 0;

  createEffect(() => {
    const uri = activeUri();
    if (!uri) {
      setState(createIdleState());
      return;
    }

    const currentRequest = ++requestId;
    setState(createInitialState());
    setExpandedByKey({ likes: false, quotes: false, replies: false, reposts: false });

    void loadBacklinks(currentRequest, uri);
  });

  async function loadBacklinks(currentRequest: number, uri: string) {
    try {
      const response = await getRecordBacklinks(uri);
      if (currentRequest !== requestId) {
        return;
      }

      setState({
        error: null,
        groups: {
          likes: response.likes ?? EMPTY_GROUP,
          quotes: response.quotes ?? EMPTY_GROUP,
          replies: response.replies ?? EMPTY_GROUP,
          reposts: response.reposts ?? EMPTY_GROUP,
        },
        loading: false,
      });
    } catch (error) {
      const message = normalizeError(error);
      if (currentRequest !== requestId) {
        return;
      }

      setState({ error: message, loading: false });
      logger.warn("failed to load record backlinks", { keyValues: { error: message, uri } });
    }
  }

  function toggleGroup(key: GroupKey) {
    setExpandedByKey(key, (value) => !value);
  }

  return (
    <Switch
      fallback={
        <div class="grid gap-3">
          <For each={GROUP_ORDER}>
            {(group) => (
              <BacklinkGroupCard
                copy={group.copy}
                expanded={expandedByKey[group.key]}
                icon={group.icon}
                items={state.groups[group.key].records}
                label={group.label}
                onToggle={() => toggleGroup(group.key)}
                total={state.groups[group.key].total ?? state.groups[group.key].records.length} />
            )}
          </For>
        </div>
      }>
      <Match when={!activeUri()}>
        <div class="rounded-3xl bg-white/3 p-4 text-sm leading-relaxed text-on-surface-variant">
          Backlinks are record-specific context. Open a post or record to inspect the public references pointing at it.
        </div>
      </Match>
      <Match when={state.loading}>
        <BacklinksSkeleton />
      </Match>
      <Match when={state.error}>
        {(error) => (
          <div class="grid gap-3 rounded-3xl bg-white/3 p-4">
            <p class="m-0 text-sm text-on-surface-variant">{error()}</p>
            <button
              type="button"
              class="inline-flex w-fit items-center gap-2 rounded-full border-0 bg-surface-container-high px-4 py-2 text-sm font-medium text-on-surface transition duration-150 hover:-translate-y-px"
              onClick={() => void loadBacklinks(requestId, activeUri())}>
              <Icon kind="refresh" aria-hidden="true" />
              Retry
            </button>
          </div>
        )}
      </Match>
    </Switch>
  );
}

function BacklinkGroupCard(
  props: {
    copy: string;
    expanded: boolean;
    icon: "heart" | "repost" | "reply" | "quote";
    items: DiagnosticBacklinkItem[];
    label: string;
    onToggle: () => void;
    total: number | null | undefined;
  },
) {
  const total = () => props.total ?? props.items.length;

  return (
    <section class="overflow-hidden rounded-3xl bg-white/3 shadow-[inset_0_0_0_1px_rgba(255,255,255,0.03)]">
      <button
        type="button"
        aria-expanded={props.expanded}
        class="flex w-full items-center justify-between gap-4 px-4 py-4 text-left transition duration-150 hover:bg-white/4"
        onClick={() => props.onToggle()}>
        <div class="flex min-w-0 items-start gap-3">
          <div class="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-surface-container-high text-primary">
            <Icon kind={props.icon} aria-hidden="true" />
          </div>
          <div class="min-w-0">
            <p class="m-0 text-sm font-semibold text-on-surface">{props.label}</p>
            <p class="m-0 mt-1 text-xs leading-relaxed text-on-surface-variant">{props.copy}</p>
          </div>
        </div>

        <div class="flex shrink-0 items-center gap-3">
          <span class="rounded-full bg-white/5 px-3 py-1 text-xs text-on-surface-variant">
            {total()} {total() === 1 ? "record" : "records"}
          </span>
          <Motion.span animate={{ rotate: props.expanded ? 0 : -90 }} transition={{ duration: 0.16 }}>
            <ArrowIcon class="text-on-surface-variant" direction="down" />
          </Motion.span>
        </div>
      </button>

      <Presence>
        <Show when={props.expanded}>
          <Motion.div
            class="grid gap-3 px-4 pb-4"
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            transition={{ duration: 0.18 }}>
            <For
              each={props.items}
              fallback={
                <div class="rounded-2xl bg-black/20 p-4 text-sm text-on-surface-variant">
                  No visible records are available in this section right now.
                </div>
              }>
              {(item, index) => <BacklinkRecordCard item={item} index={index()} />}
            </For>
          </Motion.div>
        </Show>
      </Presence>
    </section>
  );
}

function BacklinkRecordCard(props: { index: number; item: DiagnosticBacklinkItem }) {
  const actorLabel = createMemo(() =>
    props.item.profile?.displayName ?? props.item.profile?.handle ?? props.item.did ?? "Unknown"
  );
  const handleLabel = createMemo(() => formatHandle(props.item.profile?.handle, props.item.did));

  return (
    <Motion.div
      class="flex items-start gap-3 rounded-2xl bg-black/20 p-3"
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: Math.min(props.index * 0.04, 0.16), duration: 0.16 }}>
      <div class="flex h-10 w-10 shrink-0 items-center justify-center overflow-hidden rounded-full bg-white/8 text-xs font-semibold text-on-surface-variant">
        <Show when={props.item.profile?.avatar} fallback={<span>{initials(actorLabel())}</span>}>
          {(src) => <img alt="" class="h-full w-full object-cover" src={src()} />}
        </Show>
      </div>

      <div class="min-w-0">
        <div class="flex flex-wrap items-center gap-2">
          <p class="m-0 text-sm font-medium text-on-surface">{actorLabel()}</p>
          <span class="rounded-full bg-white/5 px-2.5 py-1 text-xs text-on-surface-variant">
            {props.item.collection ?? "record"}
          </span>
        </div>
        <p class="m-0 mt-1 text-xs text-on-surface-variant">{handleLabel()}</p>
        <p class="m-0 mt-2 break-all font-mono text-xs leading-relaxed text-on-surface-variant">{props.item.uri}</p>
      </div>
    </Motion.div>
  );
}

function BacklinksSkeleton() {
  return (
    <div class="grid gap-3">
      <For each={Array.from({ length: 4 })}>
        {() => (
          <div class="grid gap-3 rounded-3xl bg-white/3 p-4">
            <div class="h-4 w-24 rounded-full bg-white/6" />
            <div class="h-4 w-full rounded-full bg-white/6" />
          </div>
        )}
      </For>
    </div>
  );
}

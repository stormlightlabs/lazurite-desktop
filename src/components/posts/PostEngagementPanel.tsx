import { usePostNavigation } from "$/components/posts/usePostNavigation";
import { Icon } from "$/components/shared/Icon";
import { QuotedPostPreview } from "$/components/shared/QuotedPostPreview";
import { type DiagnosticBacklinkGroup, type DiagnosticBacklinkItem, getRecordBacklinks } from "$/lib/api/diagnostics";
import {
  buildPostEngagementTabRoute,
  parsePostEngagementTab,
  type PostEngagementTab,
} from "$/lib/post-engagement-routes";
import { buildProfileRoute } from "$/lib/profile";
import { asRecord } from "$/lib/type-guards";
import type { ProfileViewBasic } from "$/lib/types";
import { formatHandle, initials, normalizeError } from "$/lib/utils/text";
import { useLocation, useNavigate } from "@solidjs/router";
import * as logger from "@tauri-apps/plugin-log";
import { createEffect, createMemo, For, Match, Show, Switch } from "solid-js";
import { createStore } from "solid-js/store";

type EngagementState = {
  error: string | null;
  groups: Record<PostEngagementTab, DiagnosticBacklinkGroup>;
  loading: boolean;
  uri: string | null;
};

const EMPTY_GROUP: DiagnosticBacklinkGroup = { cursor: null, records: [], total: 0 };
const TABS: Array<{ key: PostEngagementTab; label: string }> = [{ key: "likes", label: "Likes" }, {
  key: "reposts",
  label: "Reposts",
}, { key: "quotes", label: "Quotes" }];

function createInitialState(): EngagementState {
  return {
    error: null,
    groups: { likes: EMPTY_GROUP, reposts: EMPTY_GROUP, quotes: EMPTY_GROUP },
    loading: false,
    uri: null,
  };
}

export function PostEngagementPanel(props: { uri: string | null }) {
  const location = useLocation();
  const navigate = useNavigate();
  const postNavigation = usePostNavigation();
  const [state, setState] = createStore<EngagementState>(createInitialState());
  let requestId = 0;

  const activeUri = createMemo(() => props.uri?.trim() || null);
  const activeTab = createMemo(() => parsePostEngagementTab(location.search));
  const activeGroup = createMemo(() => state.groups[activeTab()]);
  const activeTabLabel = createMemo(() => TABS.find((tab) => tab.key === activeTab())?.label ?? "Likes");

  createEffect(() => {
    const uri = activeUri();
    if (!uri) {
      setState(createInitialState());
      return;
    }

    const nextRequestId = ++requestId;
    setState({
      error: null,
      groups: { likes: EMPTY_GROUP, reposts: EMPTY_GROUP, quotes: EMPTY_GROUP },
      loading: true,
      uri,
    });
    void loadEngagement(nextRequestId, uri);
  });

  async function loadEngagement(nextRequestId: number, uri: string) {
    try {
      const response = await getRecordBacklinks(uri);
      if (nextRequestId !== requestId || uri !== activeUri()) {
        return;
      }

      setState({
        error: null,
        groups: {
          likes: response.likes ?? EMPTY_GROUP,
          quotes: response.quotes ?? EMPTY_GROUP,
          reposts: response.reposts ?? EMPTY_GROUP,
        },
        loading: false,
        uri,
      });
    } catch (error) {
      const message = normalizeError(error);
      if (nextRequestId !== requestId || uri !== activeUri()) {
        return;
      }

      setState({ error: message, loading: false, uri });
      logger.error("failed to load post engagement", { keyValues: { error: message, uri } });
    }
  }

  function selectTab(tab: PostEngagementTab) {
    if (tab === activeTab()) {
      return;
    }

    void navigate(buildPostEngagementTabRoute(location.pathname, location.search, tab));
  }

  function openProfile(item: DiagnosticBacklinkItem) {
    const actor = item.profile?.handle?.trim() || item.did?.trim();
    if (!actor) {
      return;
    }

    void navigate(buildProfileRoute(actor));
  }

  function openQuote(item: DiagnosticBacklinkItem) {
    if (!item.uri) {
      return;
    }

    void postNavigation.openPostScreen(item.uri);
  }

  return (
    <section class="grid min-h-0 grid-rows-[auto_auto_minmax(0,1fr)] overflow-hidden rounded-4xl bg-surface-container shadow-(--inset-shadow)">
      <header class="sticky top-0 z-20 flex items-center justify-between gap-3 bg-surface-container-high px-6 pb-4 pt-5 backdrop-blur-[18px] shadow-[inset_0_-1px_0_var(--outline-subtle)] max-[760px]:px-4 max-[520px]:px-3">
        <div class="min-w-0">
          <p class="m-0 text-xl font-semibold tracking-tight text-on-surface">Post Engagement</p>
          <p class="m-0 mt-1 text-xs uppercase tracking-[0.12em] text-on-surface-variant">{activeTabLabel()}</p>
        </div>
        <button
          type="button"
          class="ui-control ui-control-hoverable inline-flex h-10 items-center gap-2 rounded-full px-4 text-sm text-on-surface"
          onClick={() => void postNavigation.backFromPost()}>
          <Icon aria-hidden="true" iconClass="i-ri-arrow-left-line" />
          Back
        </button>
      </header>

      <nav class="flex flex-wrap gap-2 px-3 pb-3 pt-3 max-[520px]:px-2" aria-label="Engagement tabs">
        <For each={TABS}>
          {(tab) => (
            <button
              type="button"
              class="rounded-full border-0 px-4 py-2.5 text-sm font-medium transition duration-150 ease-out"
              classList={{
                "tone-muted text-primary shadow-[inset_0_0_0_1px_rgba(125,175,255,0.2)]": activeTab() === tab.key,
                "text-on-surface-variant hover:bg-surface-bright hover:text-on-surface": activeTab() !== tab.key,
              }}
              onClick={() => selectTab(tab.key)}>
              {tab.label} ({activeCount(state.groups[tab.key])})
            </button>
          )}
        </For>
      </nav>

      <div class="min-h-0 overflow-y-auto px-3 pb-4 max-[520px]:px-2">
        <Switch>
          <Match when={!activeUri()}>
            <PanelMessage title="Post unavailable" body="This engagement route is missing a valid post URI." />
          </Match>
          <Match when={state.loading}>
            <EngagementSkeleton />
          </Match>
          <Match when={state.error}>
            <PanelMessage title="Couldn’t load engagement" body={state.error ?? "Try refreshing this view."} />
          </Match>
          <Match when={(activeGroup().records ?? []).length === 0}>
            <PanelMessage
              title={`No ${activeTabLabel().toLowerCase()} yet`}
              body={`This post does not have visible ${activeTabLabel().toLowerCase()} right now.`} />
          </Match>
          <Match when={true}>
            <EngagementList
              items={activeGroup().records}
              kind={activeTab()}
              onOpenProfile={openProfile}
              onOpenQuote={openQuote} />
          </Match>
        </Switch>
      </div>
    </section>
  );
}

function activeCount(group: DiagnosticBacklinkGroup) {
  return group.total ?? group.records.length;
}

function EngagementList(
  props: {
    items: DiagnosticBacklinkItem[];
    kind: PostEngagementTab;
    onOpenProfile: (item: DiagnosticBacklinkItem) => void;
    onOpenQuote: (item: DiagnosticBacklinkItem) => void;
  },
) {
  return (
    <div class="grid gap-3">
      <For each={props.items}>
        {(item) => (
          <EngagementRow
            item={item}
            kind={props.kind}
            onOpenProfile={props.onOpenProfile}
            onOpenQuote={props.onOpenQuote} />
        )}
      </For>
    </div>
  );
}

function EngagementRow(
  props: {
    item: DiagnosticBacklinkItem;
    kind: PostEngagementTab;
    onOpenProfile: (item: DiagnosticBacklinkItem) => void;
    onOpenQuote: (item: DiagnosticBacklinkItem) => void;
  },
) {
  const actorLabel = createMemo(() =>
    props.item.profile?.displayName ?? props.item.profile?.handle ?? props.item.did ?? "Unknown account"
  );
  const handleLabel = createMemo(() => formatHandle(props.item.profile?.handle, props.item.did));
  const quoteInteractive = createMemo(() => props.kind === "quotes" && !!props.item.uri);
  const profileInteractive = createMemo(() =>
    props.kind !== "quotes" && !!(props.item.profile?.handle || props.item.did)
  );
  const interactive = createMemo(() => quoteInteractive() || profileInteractive());
  const quoteText = createMemo(() => getQuoteText(props.item));
  const quoteAuthor = createMemo(() => getQuoteAuthor(props.item));

  return (
    <button
      type="button"
      class="tone-muted flex w-full items-start gap-3 rounded-3xl border-0 p-4 text-left shadow-(--inset-shadow) transition duration-150 hover:bg-surface-bright disabled:cursor-default disabled:hover:bg-panel-muted"
      disabled={!interactive()}
      onClick={() => {
        if (quoteInteractive()) {
          props.onOpenQuote(props.item);
          return;
        }

        props.onOpenProfile(props.item);
      }}>
      <div class="ui-input-strong flex h-11 w-11 shrink-0 items-center justify-center overflow-hidden rounded-full text-xs font-semibold text-on-surface-variant">
        <Show when={props.item.profile?.avatar} fallback={<span>{initials(actorLabel())}</span>}>
          {(src) => <img alt={actorLabel()} class="h-full w-full object-cover" src={src()} />}
        </Show>
      </div>
      <div class="min-w-0 flex-1">
        <div class="flex flex-wrap items-center gap-2">
          <p class="m-0 text-sm font-medium text-on-surface">{actorLabel()}</p>
          <Show when={props.item.collection}>
            {(collection) => (
              <span class="tone-muted rounded-full px-2.5 py-1 text-xs text-on-surface-variant shadow-(--inset-shadow)">
                {collection()}
              </span>
            )}
          </Show>
        </div>
        <p class="m-0 mt-1 text-xs text-on-surface-variant">{handleLabel()}</p>
        <Show
          when={props.kind === "quotes"}
          fallback={
            <p class="m-0 mt-2 break-all font-mono text-xs leading-relaxed text-on-surface-variant">{props.item.uri}</p>
          }>
          <div class="mt-2">
            <QuotedPostPreview
              author={quoteAuthor()}
              class="ui-input-strong rounded-2xl p-3 shadow-(--inset-shadow)"
              text={quoteText() ?? ""}
              title="Quoted post"
              truncate />
          </div>
        </Show>
      </div>
      <Show when={interactive()}>
        <div class="pt-1 text-on-surface-variant">
          <Icon iconClass="i-ri-arrow-right-up-line" />
        </div>
      </Show>
    </button>
  );
}

function getQuoteRecord(item: DiagnosticBacklinkItem) {
  return asRecord(item.value);
}

function getQuoteText(item: DiagnosticBacklinkItem) {
  const text = getQuoteRecord(item)?.text;
  return typeof text === "string" && text.trim().length > 0 ? text : null;
}

function getQuoteAuthor(item: DiagnosticBacklinkItem): ProfileViewBasic | null {
  const did = item.profile?.did?.trim() || item.did?.trim();
  const handle = item.profile?.handle?.trim() || did;
  if (!did || !handle) {
    return null;
  }

  return { did, handle, avatar: item.profile?.avatar ?? null, displayName: item.profile?.displayName ?? null };
}

function PanelMessage(props: { body: string; title: string }) {
  return (
    <div class="grid min-h-112 place-items-center px-6 py-10">
      <div class="grid max-w-lg gap-3 text-center">
        <p class="m-0 text-base font-medium text-on-surface">{props.title}</p>
        <p class="m-0 text-sm text-on-surface-variant">{props.body}</p>
      </div>
    </div>
  );
}

function EngagementSkeleton() {
  return (
    <div class="grid gap-3">
      <For each={Array.from({ length: 4 })}>
        {() => (
          <div class="tone-muted rounded-3xl p-5 shadow-(--inset-shadow)">
            <div class="flex gap-3">
              <div class="skeleton-block h-11 w-11 rounded-full" />
              <div class="grid min-w-0 flex-1 gap-2">
                <div class="skeleton-block h-4 w-32 rounded-full" />
                <div class="skeleton-block h-3 w-24 rounded-full" />
                <div class="skeleton-block h-3 w-full rounded-full" />
              </div>
            </div>
          </div>
        )}
      </For>
    </div>
  );
}

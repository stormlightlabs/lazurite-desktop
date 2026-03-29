import {
  applyFeedPreferences,
  extractHandles,
  extractHashtags,
  getFeedCommand,
  getFeedName,
  getReplyRootPost,
  parseFeedGeneratorsResponse,
  parseFeedResponse,
  parseThreadResponse,
  patchFeedItems,
  patchThreadNode,
  toStrongRef,
} from "$/lib/feeds";
import type {
  ActiveSession,
  CreateRecordResult,
  EmbedInput,
  FeedGeneratorView,
  FeedViewPrefItem,
  PostView,
  ReplyRefInput,
  SavedFeedItem,
  UserPreferences,
} from "$/lib/types";
import { shouldIgnoreKey } from "$/lib/utils/events";
import { escapeForRegex } from "$/lib/utils/text";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { createEffect, createMemo, For, onCleanup, onMount, type ParentProps, Show } from "solid-js";
import { createStore, reconcile } from "solid-js/store";
import { FeedChipAvatar } from "./FeedChipAvatar";
import { FeedComposer } from "./FeedComposer";
import { SavedFeedsDrawer } from "./FeedDrawer";
import { FeedPane } from "./FeedPane";
import { ThreadPanel } from "./ThreadPanel";
import type { FeedWorkspaceState } from "./types";
import {
  buildLocalPrefs,
  createDefaultFeedPref,
  createDefaultFeedState,
  createDefaultThreadState,
  createInitialWorkspaceState,
  DEFAULT_TIMELINE,
  getNextFocusedIndex,
  getNextFocusedScrollTop,
  updateFeedScrollState,
  upsertFeedViewPrefs,
} from "./workspace-state";

type FeedWorkspaceProps = {
  activeSession: ActiveSession;
  onError: (message: string) => void;
  onThreadRouteChange: (uri: string | null) => void;
  threadUri: string | null;
};

const DEFAULT_LIMIT = 30;

export function FeedWorkspace(props: FeedWorkspaceProps) {
  const [workspace, setWorkspace] = createStore<FeedWorkspaceState>(createInitialWorkspaceState());

  let scroller: HTMLDivElement | undefined;
  let sentinel: HTMLDivElement | undefined;
  const postRefs = new Map<string, HTMLElement>();
  let lastFocusedUri: string | null = null;

  const savedFeeds = createMemo(() => {
    const stored = workspace.preferences?.savedFeeds ?? [];
    return stored.length > 0 ? stored : [DEFAULT_TIMELINE];
  });
  const pinnedFeeds = createMemo(() => {
    const pinned = savedFeeds().filter((feed) => feed.pinned);
    return pinned.length > 0 ? pinned : [DEFAULT_TIMELINE];
  });
  const drawerFeeds = createMemo(() => savedFeeds().filter((feed) => !feed.pinned));
  const activeFeed = createMemo(() => {
    const feedId = workspace.activeFeedId;
    return savedFeeds().find((feed) => feed.id === feedId) ?? pinnedFeeds()[0] ?? DEFAULT_TIMELINE;
  });
  const activePref = createMemo(() => {
    const feed = activeFeed();
    return workspace.localPrefs[feed.value] ?? createDefaultFeedPref(feed);
  });
  const activeFeedState = createMemo(() => workspace.feedStates[activeFeed().id]);
  const visibleItems = createMemo(() => applyFeedPreferences(activeFeedState()?.items ?? [], activePref()));
  const composerToken = createMemo(() => {
    const match = /(^|\s)([@#][^\s@#]*)$/u.exec(workspace.composer.text);
    return match?.[2] ?? null;
  });
  const composerSuggestions = createMemo(() => {
    const token = composerToken();
    if (!token) {
      return [];
    }

    const posts = visibleItems().map((item) => item.post);
    if (token.startsWith("@")) {
      return extractHandles(posts, props.activeSession.handle).filter((handle) =>
        handle.toLowerCase().startsWith(token.toLowerCase())
      ).map((label) => ({ label, type: "handle" as const }));
    }

    return extractHashtags(posts).filter((tag) => tag.toLowerCase().startsWith(token.toLowerCase())).map((label) => ({
      label,
      type: "hashtag" as const,
    }));
  });

  createEffect(() => {
    void bootstrapFeeds();
  });

  createEffect(() => {
    const feed = activeFeed();
    if (!feed) {
      return;
    }

    if (workspace.activeFeedId !== feed.id) {
      setWorkspace("activeFeedId", feed.id);
    }

    void ensureFeedLoaded(feed);
    const nextScrollTop = workspace.feedStates[feed.id]?.scrollTop ?? 0;
    queueMicrotask(() => {
      if (scroller && scroller.scrollTop !== nextScrollTop) {
        scroller.scrollTop = nextScrollTop;
      }
    });
  });

  createEffect(() => {
    const uri = props.threadUri;
    if (!uri) {
      if (workspace.thread.uri || workspace.thread.data || workspace.thread.error || workspace.thread.loading) {
        setWorkspace("thread", reconcile(createDefaultThreadState()));
      }
      return;
    }

    if (workspace.thread.uri === uri && (workspace.thread.data || workspace.thread.error || workspace.thread.loading)) {
      return;
    }

    void loadThread(uri);
  });

  createEffect(() => {
    const items = visibleItems();
    if (items.length === 0) {
      setWorkspace("focusedIndex", 0);
      return;
    }

    setWorkspace("focusedIndex", (current) => Math.min(current, items.length - 1));
  });

  createEffect(() => {
    const item = visibleItems()[workspace.focusedIndex];
    if (!item) {
      lastFocusedUri = null;
      return;
    }

    if (lastFocusedUri === item.post.uri) {
      return;
    }

    lastFocusedUri = item.post.uri;
    queueMicrotask(() => {
      if (!scroller) {
        return;
      }

      const element = postRefs.get(item.post.uri);
      if (!element?.isConnected) {
        return;
      }

      const scrollerRect = scroller.getBoundingClientRect();
      const elementRect = element.getBoundingClientRect();
      const itemTop = elementRect.top - scrollerRect.top + scroller.scrollTop;
      const nextScrollTop = getNextFocusedScrollTop(
        scroller.scrollTop,
        scroller.clientHeight,
        itemTop,
        element.offsetHeight,
      );

      if (nextScrollTop !== null && scroller.scrollTop !== nextScrollTop) {
        scroller.scrollTop = nextScrollTop;
      }
    });
  });

  createEffect(() => {
    const root = scroller;
    const currentSentinel = sentinel;
    const feed = activeFeed();
    if (!root || !currentSentinel || !feed) {
      return;
    }

    const observer = new IntersectionObserver((entries) => {
      const entry = entries[0];
      if (!entry?.isIntersecting) {
        return;
      }

      const state = workspace.feedStates[feed.id];
      if (state?.cursor && !state.loading && !state.loadingMore) {
        void loadFeed(feed, true);
      }
    }, { root, threshold: 0.15 });

    observer.observe(currentSentinel);
    onCleanup(() => observer.disconnect());
  });

  function handleGlobalKeydown(event: KeyboardEvent) {
    if (workspace.composer.open || shouldIgnoreKey(event)) {
      return;
    }

    const tabs = pinnedFeeds();
    if (/^[1-9]$/.test(event.key)) {
      const index = Number(event.key) - 1;
      const target = tabs[index];
      if (target) {
        event.preventDefault();
        switchFeed(target.id);
      }
      return;
    }

    if (event.key === "n") {
      event.preventDefault();
      openComposer();
      return;
    }

    const items = visibleItems();
    if (items.length === 0) {
      return;
    }

    if (event.key === "j" || event.key === "k") {
      event.preventDefault();
      setWorkspace("focusedIndex", (current) => {
        if (event.key === "j") {
          return getNextFocusedIndex(current, "next", items.length);
        }

        return getNextFocusedIndex(current, "previous", items.length);
      });
      return;
    }

    const item = items[workspace.focusedIndex];
    if (!item) {
      return;
    }

    switch (event.key) {
      case "l": {
        event.preventDefault();
        void toggleLike(item.post);
        break;
      }
      case "r": {
        event.preventDefault();
        openReplyComposer(item.post, getReplyRootPost(item));
        break;
      }
      case "t": {
        event.preventDefault();
        void toggleRepost(item.post);
        break;
      }
      case "o":
      case "Enter": {
        event.preventDefault();
        void openThread(item.post.uri);
        break;
      }
      default: {
        break;
      }
    }
  }

  onMount(() => {
    globalThis.addEventListener("keydown", handleGlobalKeydown);

    let unlistenComposer: (() => void) | undefined;
    void listen("composer:open", () => {
      openComposer();
    }).then((dispose) => {
      unlistenComposer = dispose;
    });

    onCleanup(() => {
      globalThis.removeEventListener("keydown", handleGlobalKeydown);
      unlistenComposer?.();
    });
  });

  async function bootstrapFeeds() {
    const currentDid = props.activeSession.did;
    setWorkspace(reconcile(createInitialWorkspaceState()));

    try {
      const nextPreferences = await invoke<UserPreferences>("get_preferences");
      if (currentDid !== props.activeSession.did) {
        return;
      }

      setWorkspace("preferences", nextPreferences);
      setWorkspace("localPrefs", reconcile(buildLocalPrefs(nextPreferences)));

      const uris = [
        ...new Set(nextPreferences.savedFeeds.filter((feed) => feed.type === "feed").map((feed) => feed.value)),
      ];
      if (uris.length > 0) {
        const hydrated = parseFeedGeneratorsResponse(await invoke("get_feed_generators", { uris }));
        setWorkspace(
          "generators",
          reconcile(Object.fromEntries(hydrated.feeds.map((generator) => [generator.uri, generator]))),
        );
      }

      const nextActive = nextPreferences.savedFeeds.find((feed) => feed.pinned) ?? nextPreferences.savedFeeds[0]
        ?? DEFAULT_TIMELINE;
      setWorkspace("activeFeedId", nextActive.id);
    } catch (error) {
      props.onError(`Failed to load feeds: ${String(error)}`);
    }
  }

  async function ensureFeedLoaded(feed: SavedFeedItem) {
    const state = workspace.feedStates[feed.id];
    if (state?.loading || state?.loadingMore || state?.items.length) {
      return;
    }

    await loadFeed(feed, false);
  }

  async function loadFeed(feed: SavedFeedItem, append: boolean) {
    const state = workspace.feedStates[feed.id] ?? createDefaultFeedState();

    if (append) {
      setWorkspace("feedStates", feed.id, { ...state, error: null, loadingMore: true });
    } else {
      setWorkspace("feedStates", feed.id, { ...state, error: null, loading: true });
    }

    try {
      const command = getFeedCommand(feed);
      const payload = parseFeedResponse(await invoke(command.name, command.args(state.cursor, DEFAULT_LIMIT)));
      const items = append ? [...state.items, ...payload.feed] : payload.feed;
      setWorkspace("feedStates", feed.id, {
        cursor: payload.cursor ?? null,
        error: null,
        items,
        loading: false,
        loadingMore: false,
        scrollTop: append ? state.scrollTop : 0,
      });
    } catch (error) {
      setWorkspace("feedStates", feed.id, { ...state, error: String(error), loading: false, loadingMore: false });
      props.onError(
        `Failed to load ${getFeedName(feed, workspace.generators[feed.value]?.displayName)}: ${String(error)}`,
      );
    }
  }

  async function loadThread(uri: string) {
    setWorkspace("thread", { data: null, error: null, loading: true, uri });

    try {
      const payload = parseThreadResponse(await invoke("get_post_thread", { uri }));
      if (props.threadUri === uri) {
        setWorkspace("thread", { data: payload.thread, error: null, loading: false, uri });
      }
    } catch (error) {
      if (props.threadUri === uri) {
        setWorkspace("thread", { data: null, error: String(error), loading: false, uri });
      }
      props.onError(`Failed to open thread: ${String(error)}`);
    }
  }

  function switchFeed(feedId: string) {
    const current = activeFeed();
    if (current && scroller) {
      setWorkspace("feedStates", current.id, {
        ...(workspace.feedStates[current.id] ?? createDefaultFeedState()),
        scrollTop: scroller.scrollTop,
      });
    }

    setWorkspace("activeFeedId", feedId);
    setWorkspace("focusedIndex", 0);
    setWorkspace("showFeedsDrawer", false);
  }

  async function openThread(uri: string) {
    if (props.threadUri === uri) {
      await loadThread(uri);
      return;
    }

    props.onThreadRouteChange(uri);
  }

  function openComposer() {
    setWorkspace("composer", "open", true);
  }

  function resetComposer() {
    setWorkspace(
      "composer",
      (current) => ({ ...current, open: false, quoteTarget: null, replyRoot: null, replyTarget: null, text: "" }),
    );
  }

  function openReplyComposer(post: PostView, root: PostView) {
    setWorkspace(
      "composer",
      (current) => ({ ...current, open: true, quoteTarget: null, replyRoot: root, replyTarget: post }),
    );
  }

  function openQuoteComposer(post: PostView) {
    setWorkspace(
      "composer",
      (current) => ({ ...current, open: true, quoteTarget: post, replyRoot: null, replyTarget: null }),
    );
  }

  function applySuggestion(value: string) {
    const token = composerToken();
    if (!token) {
      return;
    }

    setWorkspace(
      "composer",
      "text",
      (current) => current.replace(new RegExp(`${escapeForRegex(token)}$`, "u"), `${value} `),
    );
  }

  async function submitPost() {
    const text = workspace.composer.text;
    const reply = workspace.composer.replyTarget;
    const root = workspace.composer.replyRoot;
    const quote = workspace.composer.quoteTarget;

    const replyTo: ReplyRefInput | null = reply && root
      ? { parent: toStrongRef(reply), root: toStrongRef(root) }
      : null;
    const embed: EmbedInput | null = quote ? { type: "record", record: toStrongRef(quote) } : null;

    setWorkspace("composer", "pending", true);
    try {
      await invoke<CreateRecordResult>("create_post", { embed, replyTo, text });
      resetComposer();
      props.onThreadRouteChange(null);
      await loadFeed(activeFeed(), false);
      if (scroller) {
        scroller.scrollTop = 0;
      }
    } catch (error) {
      props.onError(`Failed to create post: ${String(error)}`);
    } finally {
      setWorkspace("composer", "pending", false);
    }
  }

  async function toggleLike(post: PostView) {
    setWorkspace("likePendingByUri", post.uri, true);
    try {
      if (post.viewer?.like) {
        await invoke("unlike_post", { likeUri: post.viewer.like });
        patchPost(
          post.uri,
          (current) => ({
            ...current,
            likeCount: Math.max(0, (current.likeCount ?? 0) - 1),
            viewer: { ...current.viewer, like: null },
          }),
        );
      } else {
        const result = await invoke<CreateRecordResult>("like_post", { cid: post.cid, uri: post.uri });
        patchPost(
          post.uri,
          (current) => ({
            ...current,
            likeCount: (current.likeCount ?? 0) + 1,
            viewer: { ...current.viewer, like: result.uri },
          }),
        );
        triggerLikePulse(post.uri);
      }
    } catch (error) {
      props.onError(`Failed to update like: ${String(error)}`);
    } finally {
      setWorkspace("likePendingByUri", post.uri, false);
    }
  }

  async function toggleRepost(post: PostView) {
    setWorkspace("repostPendingByUri", post.uri, true);
    try {
      if (post.viewer?.repost) {
        await invoke("unrepost", { repostUri: post.viewer.repost });
        patchPost(
          post.uri,
          (current) => ({
            ...current,
            repostCount: Math.max(0, (current.repostCount ?? 0) - 1),
            viewer: { ...current.viewer, repost: null },
          }),
        );
      } else {
        const result = await invoke<CreateRecordResult>("repost", { cid: post.cid, uri: post.uri });
        patchPost(
          post.uri,
          (current) => ({
            ...current,
            repostCount: (current.repostCount ?? 0) + 1,
            viewer: { ...current.viewer, repost: result.uri },
          }),
        );
        triggerRepostPulse(post.uri);
      }
    } catch (error) {
      props.onError(`Failed to update repost: ${String(error)}`);
    } finally {
      setWorkspace("repostPendingByUri", post.uri, false);
    }
  }

  function patchPost(uri: string, updater: (post: PostView) => PostView) {
    for (const [feedId, state] of Object.entries(workspace.feedStates)) {
      if (!state) {
        continue;
      }

      setWorkspace("feedStates", feedId, "items", patchFeedItems(state.items, uri, updater));
    }

    const currentThread = workspace.thread.data;
    if (currentThread) {
      setWorkspace("thread", "data", patchThreadNode(currentThread, uri, updater));
    }
  }

  function triggerLikePulse(uri: string) {
    setWorkspace("likePulseUri", uri);
    globalThis.setTimeout(() => setWorkspace("likePulseUri", (current) => (current === uri ? null : current)), 320);
  }

  function triggerRepostPulse(uri: string) {
    setWorkspace("repostPulseUri", uri);
    globalThis.setTimeout(() => setWorkspace("repostPulseUri", (current) => (current === uri ? null : current)), 320);
  }

  async function saveFeedPreferences(updatedFeeds: SavedFeedItem[]) {
    try {
      await invoke("update_saved_feeds", { feeds: updatedFeeds });
      setWorkspace("preferences", (current) => current ? { ...current, savedFeeds: updatedFeeds } : current);
    } catch (error) {
      props.onError(`Failed to update feeds: ${String(error)}`);
    }
  }

  function pinFeed(feedId: string) {
    const currentFeeds = workspace.preferences?.savedFeeds ?? [];
    const updatedFeeds = currentFeeds.map((feed) => feed.id === feedId ? { ...feed, pinned: true } : feed);
    void saveFeedPreferences(updatedFeeds);
  }

  function unpinFeed(feedId: string) {
    const currentFeeds = workspace.preferences?.savedFeeds ?? [];
    const updatedFeeds = currentFeeds.map((feed) => feed.id === feedId ? { ...feed, pinned: false } : feed);
    void saveFeedPreferences(updatedFeeds);
  }

  function reorderPinnedFeeds(feedId: string, direction: "up" | "down") {
    const pinned = pinnedFeeds();
    const index = pinned.findIndex((f) => f.id === feedId);
    if (index === -1) return;

    const newIndex = direction === "up" ? index - 1 : index + 1;
    if (newIndex < 0 || newIndex >= pinned.length) return;

    const currentFeeds = [...(workspace.preferences?.savedFeeds ?? [])];
    const feedIds = currentFeeds.map((f) => f.id);
    const pinnedIds = pinned.map((f) => f.id);

    const itemId = pinnedIds[index];
    const swapId = pinnedIds[newIndex];
    const itemIdx = feedIds.indexOf(itemId);
    const swapIdx = feedIds.indexOf(swapId);

    if (itemIdx === -1 || swapIdx === -1) return;

    const reordered = [...currentFeeds];
    [reordered[itemIdx], reordered[swapIdx]] = [reordered[swapIdx], reordered[itemIdx]];

    void saveFeedPreferences(reordered);
  }

  return (
    <>
      <div class="grid h-full min-h-0 min-w-0 gap-6 xl:grid-cols-[minmax(0,1fr)_20rem] max-[1180px]:gap-5 max-[900px]:gap-4">
        <FeedPane
          activeFeed={activeFeed()}
          activeFeedId={activeFeed().id}
          activeFeedState={activeFeedState()}
          activeHandle={props.activeSession.handle}
          focusedIndex={workspace.focusedIndex}
          generators={workspace.generators}
          likePendingByUri={workspace.likePendingByUri}
          likePulseUri={workspace.likePulseUri}
          onCompose={openComposer}
          onFeedSelect={switchFeed}
          onFocusIndex={(index) => setWorkspace("focusedIndex", index)}
          onLike={toggleLike}
          onOpenThread={openThread}
          onQuote={openQuoteComposer}
          onReply={openReplyComposer}
          onRepost={toggleRepost}
          onToggleDrawer={() => setWorkspace("showFeedsDrawer", (value) => !value)}
          pinnedFeeds={pinnedFeeds().slice(0, 9)}
          postRefs={postRefs}
          repostPendingByUri={workspace.repostPendingByUri}
          repostPulseUri={workspace.repostPulseUri}
          scrollerRef={(element) => {
            scroller = element;
          }}
          sentinelRef={(element) => {
            sentinel = element;
          }}
          setScrollTop={(top) => {
            const feedId = activeFeed().id;
            const nextState = updateFeedScrollState(workspace.feedStates[feedId], top);
            if (!nextState) {
              return;
            }

            setWorkspace("feedStates", feedId, nextState);
          }}
          visibleItems={visibleItems()} />

        <WorkspaceSidebar
          activePref={activePref()}
          drawerFeeds={drawerFeeds()}
          generators={workspace.generators}
          onFeedSelect={switchFeed}
          onPrefChange={setFeedPref} />
      </div>

      <SavedFeedsDrawer
        drawerFeeds={drawerFeeds()}
        generators={workspace.generators}
        open={workspace.showFeedsDrawer}
        pinnedFeeds={pinnedFeeds()}
        onClose={() => setWorkspace("showFeedsDrawer", false)}
        onPinFeed={pinFeed}
        onReorderPinned={reorderPinnedFeeds}
        onSelectFeed={switchFeed}
        onUnpinFeed={unpinFeed} />

      <ThreadPanel
        activeUri={props.threadUri}
        error={workspace.thread.error}
        loading={workspace.thread.loading}
        onClose={() => props.onThreadRouteChange(null)}
        onLike={(post) => void toggleLike(post)}
        onOpenThread={(uri) => void openThread(uri)}
        onQuote={(post) => openQuoteComposer(post)}
        onReply={(post, root) => openReplyComposer(post, root)}
        onRepost={(post) => void toggleRepost(post)}
        thread={workspace.thread.data} />

      <FeedComposer
        activeHandle={props.activeSession.handle}
        open={workspace.composer.open}
        pending={workspace.composer.pending}
        quoteTarget={workspace.composer.quoteTarget}
        replyTarget={workspace.composer.replyTarget}
        suggestions={composerSuggestions()}
        text={workspace.composer.text}
        onApplySuggestion={applySuggestion}
        onClearQuote={() => setWorkspace("composer", "quoteTarget", null)}
        onClearReply={() => {
          setWorkspace("composer", "replyTarget", null);
          setWorkspace("composer", "replyRoot", null);
        }}
        onClose={() => resetComposer()}
        onSubmit={() => void submitPost()}
        onTextChange={(text) => setWorkspace("composer", "text", text)} />
    </>
  );

  async function setFeedPref<K extends keyof FeedViewPrefItem>(key: K, value: FeedViewPrefItem[K]) {
    const feed = activeFeed();
    const previousPref = activePref();
    const nextPref = { ...previousPref, [key]: value };

    setWorkspace("localPrefs", feed.value, nextPref);

    try {
      await invoke("update_feed_view_pref", { pref: nextPref });
      setWorkspace(
        "preferences",
        (current) =>
          current ? { ...current, feedViewPrefs: upsertFeedViewPrefs(current.feedViewPrefs, nextPref) } : current,
      );
    } catch (error) {
      setWorkspace("localPrefs", feed.value, previousPref);
      props.onError(`Failed to update display filters: ${String(error)}`);
    }
  }
}

function WorkspaceSidebar(
  props: {
    activePref: FeedViewPrefItem;
    drawerFeeds: SavedFeedItem[];
    generators: Record<string, FeedGeneratorView>;
    onFeedSelect: (feedId: string) => void;
    onPrefChange: <K extends keyof FeedViewPrefItem>(key: K, value: FeedViewPrefItem[K]) => void;
  },
) {
  return (
    <aside class="grid min-h-0 min-w-0 gap-4 overflow-hidden md:grid-cols-2 xl:grid-cols-1 xl:overflow-y-auto xl:overscroll-contain">
      <SavedFeedsCard drawerFeeds={props.drawerFeeds} generators={props.generators} onFeedSelect={props.onFeedSelect} />
      <DisplayFiltersCard activePref={props.activePref} onPrefChange={props.onPrefChange} />
      <ShortcutsCard />
    </aside>
  );
}

function SavedFeedsCard(
  props: {
    drawerFeeds: SavedFeedItem[];
    generators: Record<string, FeedGeneratorView>;
    onFeedSelect: (feedId: string) => void;
  },
) {
  return (
    <SidebarCard title="Saved Feeds" subtitle="Drawer access">
      <div class="grid gap-2">
        <For each={props.drawerFeeds.slice(0, 4)}>
          {(feed) => (
            <SidebarFeedButton feed={feed} generator={props.generators[feed.value]} onSelect={props.onFeedSelect} />
          )}
        </For>
        <Show when={props.drawerFeeds.length === 0}>
          <p class="m-0 text-[0.8rem] leading-[1.6] text-on-surface-variant">
            All saved feeds are already pinned as tabs.
          </p>
        </Show>
      </div>
    </SidebarCard>
  );
}

function SidebarFeedButton(
  props: { feed: SavedFeedItem; generator?: FeedGeneratorView; onSelect: (feedId: string) => void },
) {
  return (
    <button
      class="flex w-full items-center gap-3 rounded-[1.1rem] border-0 bg-white/4 px-3 py-3 text-left text-on-surface transition duration-150 ease-out hover:-translate-y-px hover:bg-white/[0.07]"
      type="button"
      onClick={() => props.onSelect(props.feed.id)}>
      <FeedChipAvatar feed={props.feed} generator={props.generator} />
      <div class="min-w-0 flex-1">
        <p class="m-0 truncate text-sm font-medium">{getFeedName(props.feed, props.generator?.displayName)}</p>
        <p class="m-0 text-xs uppercase tracking-[0.08em] text-on-surface-variant">{props.feed.type}</p>
      </div>
    </button>
  );
}

function DisplayFiltersCard(
  props: {
    activePref: FeedViewPrefItem;
    onPrefChange: <K extends keyof FeedViewPrefItem>(key: K, value: FeedViewPrefItem[K]) => void;
  },
) {
  return (
    <SidebarCard title="Display Filters" subtitle="Per-feed">
      <div class="grid gap-3">
        <ToggleRow
          checked={props.activePref.hideReposts}
          label="Hide reposts"
          onChange={(checked) => void props.onPrefChange("hideReposts", checked)} />
        <ToggleRow
          checked={props.activePref.hideReplies}
          label="Hide replies"
          onChange={(checked) => void props.onPrefChange("hideReplies", checked)} />
        <ToggleRow
          checked={props.activePref.hideQuotePosts}
          label="Hide quotes"
          onChange={(checked) => void props.onPrefChange("hideQuotePosts", checked)} />
        <ReplyLikeThreshold
          value={props.activePref.hideRepliesByLikeCount}
          onChange={(value) => void props.onPrefChange("hideRepliesByLikeCount", value)} />
      </div>
    </SidebarCard>
  );
}

function ReplyLikeThreshold(props: { value: number | null; onChange: (value: number | null) => void }) {
  return (
    <label class="grid gap-2 text-[0.8rem] text-on-surface-variant">
      <span>Minimum likes for replies</span>
      <input
        class="rounded-full border-0 bg-white/6 px-4 py-2 text-on-surface shadow-[inset_0_0_0_1px_rgba(255,255,255,0.05)] focus:outline focus:outline-primary/50"
        min="0"
        type="number"
        value={props.value ?? ""}
        onInput={(event) => {
          const value = event.currentTarget.value.trim();
          props.onChange(value ? Number(value) : null);
        }} />
    </label>
  );
}

function ShortcutsCard() {
  return (
    <SidebarCard title="Shortcuts" subtitle="Feed controls">
      <div class="grid gap-2 text-[0.8rem] text-on-surface-variant">
        <ShortcutLine keys="1-9" label="Switch pinned feeds" />
        <ShortcutLine keys="j / k" label="Move focus" />
        <ShortcutLine keys="l" label="Like focused post" />
        <ShortcutLine keys="r" label="Reply to focused post" />
        <ShortcutLine keys="t" label="Repost focused post" />
        <ShortcutLine keys="o" label="Open thread" />
        <ShortcutLine keys="n" label="Open composer" />
      </div>
    </SidebarCard>
  );
}

function SidebarCard(props: ParentProps & { subtitle: string; title: string }) {
  return (
    <section class="rounded-[1.6rem] bg-white/3 p-4 shadow-[inset_0_0_0_1px_rgba(255,255,255,0.04)]">
      <p class="m-0 text-base font-semibold text-on-surface">{props.title}</p>
      <p class="mt-1 text-xs uppercase tracking-[0.12em] text-on-surface-variant">{props.subtitle}</p>
      <div class="mt-4">{props.children}</div>
    </section>
  );
}

function ToggleRow(props: { checked: boolean; label: string; onChange: (checked: boolean) => void }) {
  return (
    <label class="flex items-center justify-between gap-3 rounded-2xl bg-white/4 px-3 py-3 text-sm text-on-surface">
      <span>{props.label}</span>
      <input checked={props.checked} type="checkbox" onInput={(event) => props.onChange(event.currentTarget.checked)} />
    </label>
  );
}

function ShortcutLine(props: { keys: string; label: string }) {
  return (
    <div class="flex items-center justify-between gap-3 rounded-2xl bg-white/4 px-3 py-2.5">
      <span>{props.label}</span>
      <span class="rounded-full bg-black/30 px-2 py-1 text-[0.68rem] uppercase tracking-[0.08em] text-primary">
        {props.keys}
      </span>
    </div>
  );
}

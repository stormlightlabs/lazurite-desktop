import {
  createPost,
  getFeedGenerators,
  getFeedPage,
  getPostThread,
  getPreferences,
  likePost,
  repost,
  unlikePost,
  unrepost,
  updateFeedViewPref,
  updateSavedFeeds,
} from "$/lib/api/feeds";
import {
  applyFeedPreferences,
  extractHandles,
  extractHashtags,
  getFeedName,
  getReplyRootPost,
  patchFeedItems,
  patchThreadNode,
  toStrongRef,
} from "$/lib/feeds";
import type { ActiveSession, EmbedInput, FeedViewPrefItem, PostView, ReplyRefInput, SavedFeedItem } from "$/lib/types";
import { shouldIgnoreKey } from "$/lib/utils/events";
import { escapeForRegex } from "$/lib/utils/text";
import { listen } from "@tauri-apps/api/event";
import { createEffect, createMemo, onCleanup, onMount, untrack } from "solid-js";
import { createStore, reconcile } from "solid-js/store";
import type { FeedWorkspaceState } from "./types";
import {
  buildLocalPrefs,
  createDefaultFeedPref,
  createDefaultFeedState,
  createDefaultThreadState,
  createInitialWorkspaceState,
  DEFAULT_TIMELINE,
  getFeedScrollTop,
  getNextFocusedIndex,
  getNextFocusedScrollTop,
  updateFeedScrollTop,
  upsertFeedViewPrefs,
} from "./workspace-state";

export type FeedWorkspaceProps = {
  activeSession: ActiveSession;
  onError: (message: string) => void;
  onThreadRouteChange: (uri: string | null) => void;
  threadUri: string | null;
};

const DEFAULT_LIMIT = 30;

export function useFeedWorkspaceController(props: FeedWorkspaceProps) {
  const [workspace, setWorkspace] = createStore<FeedWorkspaceState>(createInitialWorkspaceState());

  let scroller: HTMLDivElement | undefined;
  let sentinel: HTMLDivElement | undefined;
  let lastFocusedUri: string | null = null;
  const postRefs = new Map<string, HTMLElement>();

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

    untrack(() => {
      void ensureFeedLoaded(feed);
      const nextScrollTop = getFeedScrollTop(workspace.feedScrollTops, feed.id);
      queueMicrotask(() => {
        if (scroller && scroller.scrollTop !== nextScrollTop) {
          scroller.scrollTop = nextScrollTop;
        }
      });
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

  function registerScroller(element: HTMLDivElement) {
    scroller = element;
  }

  function registerSentinel(element: HTMLDivElement) {
    sentinel = element;
  }

  function setFocusedIndex(index: number) {
    setWorkspace("focusedIndex", index);
  }

  function rememberScrollTop(top: number) {
    const feedId = activeFeed().id;
    const nextScrollTops = updateFeedScrollTop(workspace.feedScrollTops, feedId, top);
    if (!nextScrollTops) {
      return;
    }

    setWorkspace("feedScrollTops", reconcile(nextScrollTops));
  }

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

  async function bootstrapFeeds() {
    const currentDid = props.activeSession.did;
    setWorkspace(reconcile(createInitialWorkspaceState()));

    try {
      const nextPreferences = await getPreferences();
      if (currentDid !== props.activeSession.did) {
        return;
      }

      setWorkspace("preferences", nextPreferences);
      setWorkspace("localPrefs", reconcile(buildLocalPrefs(nextPreferences)));

      const uris = [
        ...new Set(nextPreferences.savedFeeds.filter((feed) => feed.type === "feed").map((feed) => feed.value)),
      ];
      if (uris.length > 0) {
        const hydrated = await getFeedGenerators(uris);
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
      const payload = await getFeedPage(feed, state.cursor, DEFAULT_LIMIT);
      const items = append ? [...state.items, ...payload.feed] : payload.feed;
      setWorkspace("feedStates", feed.id, {
        cursor: payload.cursor ?? null,
        error: null,
        items,
        loading: false,
        loadingMore: false,
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
      const payload = await getPostThread(uri);
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
      const nextScrollTops = updateFeedScrollTop(workspace.feedScrollTops, current.id, scroller.scrollTop);
      if (nextScrollTops) {
        setWorkspace("feedScrollTops", reconcile(nextScrollTops));
      }
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

  function setComposerText(text: string) {
    setWorkspace("composer", "text", text);
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

  function clearQuoteComposer() {
    setWorkspace("composer", "quoteTarget", null);
  }

  function clearReplyComposer() {
    setWorkspace("composer", "replyTarget", null);
    setWorkspace("composer", "replyRoot", null);
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
      await createPost(text, replyTo, embed);
      resetComposer();
      props.onThreadRouteChange(null);
      const feed = activeFeed();
      await loadFeed(feed, false);
      const nextScrollTops = updateFeedScrollTop(workspace.feedScrollTops, feed.id, 0);
      if (nextScrollTops) {
        setWorkspace("feedScrollTops", reconcile(nextScrollTops));
      }
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
        await unlikePost(post.viewer.like);
        patchPost(
          post.uri,
          (current) => ({
            ...current,
            likeCount: Math.max(0, (current.likeCount ?? 0) - 1),
            viewer: { ...current.viewer, like: null },
          }),
        );
      } else {
        const result = await likePost(post.uri, post.cid);
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
        await unrepost(post.viewer.repost);
        patchPost(
          post.uri,
          (current) => ({
            ...current,
            repostCount: Math.max(0, (current.repostCount ?? 0) - 1),
            viewer: { ...current.viewer, repost: null },
          }),
        );
      } else {
        const result = await repost(post.uri, post.cid);
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
      await updateSavedFeeds(updatedFeeds);
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
    const index = pinned.findIndex((feed) => feed.id === feedId);
    if (index === -1) {
      return;
    }

    const newIndex = direction === "up" ? index - 1 : index + 1;
    if (newIndex < 0 || newIndex >= pinned.length) {
      return;
    }

    const currentFeeds = [...(workspace.preferences?.savedFeeds ?? [])];
    const feedIds = currentFeeds.map((feed) => feed.id);
    const pinnedIds = pinned.map((feed) => feed.id);

    const itemId = pinnedIds[index];
    const swapId = pinnedIds[newIndex];
    const itemIndex = feedIds.indexOf(itemId);
    const swapIndex = feedIds.indexOf(swapId);

    if (itemIndex === -1 || swapIndex === -1) {
      return;
    }

    const reordered = [...currentFeeds];
    [reordered[itemIndex], reordered[swapIndex]] = [reordered[swapIndex], reordered[itemIndex]];

    void saveFeedPreferences(reordered);
  }

  async function setFeedPref<K extends keyof FeedViewPrefItem>(key: K, value: FeedViewPrefItem[K]) {
    const feed = activeFeed();
    const previousPref = activePref();
    const nextPref = { ...previousPref, [key]: value };

    setWorkspace("localPrefs", feed.value, nextPref);

    try {
      await updateFeedViewPref(nextPref);
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

  function toggleFeedsDrawer() {
    setWorkspace("showFeedsDrawer", (open) => !open);
  }

  function closeFeedsDrawer() {
    setWorkspace("showFeedsDrawer", false);
  }

  return {
    activeFeed,
    activeFeedState,
    activePref,
    applySuggestion,
    clearQuoteComposer,
    clearReplyComposer,
    closeFeedsDrawer,
    composerSuggestions,
    drawerFeeds,
    openComposer,
    openThread,
    openQuoteComposer,
    openReplyComposer,
    pinFeed,
    pinnedFeeds,
    postRefs,
    registerScroller,
    registerSentinel,
    rememberScrollTop,
    reorderPinnedFeeds,
    resetComposer,
    setFeedPref,
    setFocusedIndex,
    setComposerText,
    submitPost,
    switchFeed,
    toggleFeedsDrawer,
    toggleLike,
    toggleRepost,
    unpinFeed,
    visibleItems,
    workspace,
  };
}

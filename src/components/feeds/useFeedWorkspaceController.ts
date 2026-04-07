import { usePostInteractions } from "$/components/posts/usePostInteractions";
import { DraftController } from "$/lib/api/drafts";
import { FeedController } from "$/lib/api/feeds";
import { POST_CREATED_EVENT } from "$/lib/constants/events";
import {
  applyFeedPreferences,
  extractHandles,
  extractHashtags,
  getFeedName,
  getReplyRootPost,
  isThreadViewPost,
  patchFeedItems,
  toStrongRef,
} from "$/lib/feeds";
import type {
  ActiveSession,
  Draft,
  DraftInput,
  EmbedInput,
  FeedViewPrefItem,
  PostView,
  ReplyRefInput,
  SavedFeedItem,
  StrongRefInput,
  ThreadNode,
} from "$/lib/types";
import { shouldIgnoreKey } from "$/lib/utils/events";
import { escapeForRegex } from "$/lib/utils/text";
import { normalizeError } from "$/lib/utils/text";
import { listen } from "@tauri-apps/api/event";
import * as logger from "@tauri-apps/plugin-log";
import { createEffect, createMemo, onCleanup, onMount, untrack } from "solid-js";
import { createStore, reconcile } from "solid-js/store";
import type { FeedWorkspaceState } from "./types";
import {
  buildLocalPrefs,
  createDefaultFeedPref,
  createDefaultFeedState,
  createInitialWorkspaceState,
  DEFAULT_TIMELINE,
  getFeedScrollTop,
  getNextFocusedIndex,
  getNextFocusedScrollTop,
  updateFeedScrollTop,
  upsertFeedViewPrefs,
} from "./workspace-state";

type FeedWorkspaceProps = {
  activeSession: ActiveSession;
  onError: (message: string) => void;
  onOpenThread: (uri: string) => void;
};

const DEFAULT_LIMIT = 30;

type HydrationMaps = { inFlightByUri: Map<string, Promise<PostView | null>>; postByUri: Map<string, PostView | null> };

function toDraftStrongRef(uri: string | null, cid: string | null): StrongRefInput | null {
  if (!uri && !cid) {
    return null;
  }

  if (!uri || !cid) {
    return null;
  }

  return { cid, uri };
}

function findPostInThread(node: ThreadNode | null | undefined, uri: string): PostView | null {
  if (!node || !isThreadViewPost(node)) {
    return null;
  }

  if (node.post.uri === uri) {
    return node.post;
  }

  const parentMatch = findPostInThread(node.parent, uri);
  if (parentMatch) {
    return parentMatch;
  }

  for (const reply of node.replies ?? []) {
    const replyMatch = findPostInThread(reply, uri);
    if (replyMatch) {
      return replyMatch;
    }
  }

  return null;
}

async function resolvePostByUri(uri: string): Promise<PostView | null> {
  try {
    const payload = await FeedController.getPostThread(uri);
    const post = findPostInThread(payload.thread, uri);
    if (post) {
      return post;
    }

    logger.warn(`Hydration thread for ${uri} did not include the requested post`);
    return null;
  } catch (error) {
    logger.warn(`Failed to hydrate draft context for ${uri}: ${normalizeError(error)}`);
    return null;
  }
}

function createHydrationMaps(): HydrationMaps {
  return { inFlightByUri: new Map<string, Promise<PostView | null>>(), postByUri: new Map<string, PostView | null>() };
}

function resolvePostByUriCached(uri: string, hydration: HydrationMaps): Promise<PostView | null> {
  const cached = hydration.postByUri.get(uri);
  if (cached !== undefined) {
    return Promise.resolve(cached);
  }

  const inFlight = hydration.inFlightByUri.get(uri);
  if (inFlight) {
    return inFlight;
  }

  const request = resolvePostByUri(uri).then((post) => {
    hydration.postByUri.set(uri, post);
    return post;
  }).finally(() => {
    hydration.inFlightByUri.delete(uri);
  });
  hydration.inFlightByUri.set(uri, request);
  return request;
}

async function hydratePostsByUri(uris: string[], hydration: HydrationMaps): Promise<Map<string, PostView>> {
  const uniqueUris = [...new Set(uris)];
  await Promise.all(uniqueUris.map((uri) => resolvePostByUriCached(uri, hydration)));

  const hydratedByUri = new Map<string, PostView>();
  for (const uri of uniqueUris) {
    const post = hydration.postByUri.get(uri);
    if (post) {
      hydratedByUri.set(uri, post);
    }
  }

  return hydratedByUri;
}

export function useFeedWorkspaceController(props: FeedWorkspaceProps) {
  const [workspace, setWorkspace] = createStore<FeedWorkspaceState>(createInitialWorkspaceState());
  const interactions = usePostInteractions({ onError: props.onError, patchPost });
  const toggleBookmark = interactions.toggleBookmark;
  const toggleLike = interactions.toggleLike;
  const toggleRepost = interactions.toggleRepost;

  let scroller: HTMLDivElement | undefined;
  let sentinel: HTMLDivElement | undefined;
  let lastFocusedUri: string | null = null;
  const postRefs = new Map<string, HTMLElement>();
  let autosaveTimerId: ReturnType<typeof setTimeout> | null = null;
  const hydration = createHydrationMaps();

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
  const composerHasContent = createMemo(() => {
    const { quoteRef, quoteTarget, replyParentRef, replyRootRef, replyTarget, text } = workspace.composer;
    return text.trim().length > 0 || quoteTarget !== null || replyTarget !== null || quoteRef !== null
      || (replyParentRef !== null && replyRootRef !== null);
  });

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

    let unlistenPostCreated: (() => void) | undefined;
    void listen(POST_CREATED_EVENT, () => {
      void refreshActiveFeed();
    }).then((dispose) => {
      unlistenPostCreated = dispose;
    });

    onCleanup(() => {
      globalThis.removeEventListener("keydown", handleGlobalKeydown);
      unlistenPostCreated?.();
      if (autosaveTimerId !== null) {
        clearTimeout(autosaveTimerId);
        autosaveTimerId = null;
      }
      hydration.inFlightByUri.clear();
      hydration.postByUri.clear();
    });
  });

  function autosaveKey(): string {
    return `lazurite:autosave:${props.activeSession.did}`;
  }

  function getAutosaveId(): string | null {
    try {
      return localStorage.getItem(autosaveKey());
    } catch {
      return null;
    }
  }

  function setAutosaveId(id: string): void {
    try {
      localStorage.setItem(autosaveKey(), id);
    } catch {
      logger.debug("failed to set autosave id (localStorage unavailable)", { keyValues: { id } });
    }
  }

  function clearAutosaveId(): void {
    const k = autosaveKey();
    try {
      localStorage.removeItem(k);
    } catch {
      logger.debug("failed to clear autosave id (localStorage unavailable)", { keyValues: { key: k } });
    }
  }

  function composerHasDraftableContent(): boolean {
    const { quoteRef, quoteTarget, replyParentRef, replyRootRef, replyTarget, text } = workspace.composer;
    return text.trim().length > 0 || quoteTarget !== null || replyTarget !== null || quoteRef !== null
      || replyParentRef !== null || replyRootRef !== null;
  }

  function getCurrentComposerRefs(): {
    quoteRef: StrongRefInput | null;
    replyParentRef: StrongRefInput | null;
    replyRootRef: StrongRefInput | null;
  } {
    const quoteRef = workspace.composer.quoteTarget
      ? toStrongRef(workspace.composer.quoteTarget)
      : workspace.composer.quoteRef;
    const replyParentRef = workspace.composer.replyTarget
      ? toStrongRef(workspace.composer.replyTarget)
      : workspace.composer.replyParentRef;
    const replyRootRef = workspace.composer.replyRoot
      ? toStrongRef(workspace.composer.replyRoot)
      : workspace.composer.replyRootRef;
    return { quoteRef, replyParentRef, replyRootRef };
  }

  async function saveCurrentDraft(options?: { manual?: boolean }): Promise<Draft | null> {
    if (!composerHasDraftableContent()) {
      setWorkspace("composer", "autosaveStatus", "idle");
      return null;
    }

    setWorkspace("composer", "autosaveStatus", "saving");

    const { draftId, text } = workspace.composer;
    const { quoteRef, replyParentRef, replyRootRef } = getCurrentComposerRefs();
    if ((replyParentRef && !replyRootRef) || (!replyParentRef && replyRootRef)) {
      logger.warn("Skipping draft save because reply references are incomplete");
      setWorkspace("composer", "autosaveStatus", "idle");
      if (options?.manual) {
        props.onError("Couldn't save this draft because its reply context is incomplete.");
      }
      return null;
    }

    const input: DraftInput = {
      id: draftId ?? undefined,
      text,
      quoteCid: quoteRef?.cid ?? null,
      quoteUri: quoteRef?.uri ?? null,
      replyParentCid: replyParentRef?.cid ?? null,
      replyParentUri: replyParentRef?.uri ?? null,
      replyRootCid: replyRootRef?.cid ?? null,
      replyRootUri: replyRootRef?.uri ?? null,
    };

    try {
      const result = await DraftController.saveDraft(input);
      setWorkspace("composer", "draftId", result.id);
      setWorkspace("composer", "quoteRef", quoteRef);
      setWorkspace("composer", "replyParentRef", replyParentRef);
      setWorkspace("composer", "replyRootRef", replyRootRef);
      setWorkspace("composer", "autosaveStatus", "saved");
      setAutosaveId(result.id);
      await refreshDraftCount();
      bumpDraftsListRefresh();
      return result;
    } catch (error) {
      logger.error(`Autosave failed: ${normalizeError(error)}`);
      setWorkspace("composer", "autosaveStatus", "idle");
      if (options?.manual) {
        props.onError("Couldn't save your draft. Please try again.");
      }
      return null;
    }
  }

  function scheduleAutosave() {
    if (autosaveTimerId !== null) {
      clearTimeout(autosaveTimerId);
      autosaveTimerId = null;
    }

    setWorkspace("composer", "autosaveStatus", "idle");
    if (!composerHasDraftableContent()) {
      return;
    }

    autosaveTimerId = setTimeout(() => {
      autosaveTimerId = null;
      void saveCurrentDraft();
    }, 3000);
  }

  async function refreshDraftCount() {
    try {
      const drafts = await DraftController.listDrafts(props.activeSession.did);
      setWorkspace("draftCount", drafts.length);
    } catch (error) {
      logger.error(`Failed to refresh draft count: ${normalizeError(error)}`);
    }
  }

  function bumpDraftsListRefresh() {
    setWorkspace("draftsListRefreshNonce", (current) => current + 1);
  }

  async function hydrateDraftTargets(draft: Draft) {
    const requestedUris = [draft.quoteUri, draft.replyParentUri, draft.replyRootUri].filter((value): value is string =>
      typeof value === "string" && value.length > 0
    );
    if (requestedUris.length === 0) {
      return;
    }

    const hydratedByUri = await hydratePostsByUri(requestedUris, hydration);

    if (workspace.composer.draftId !== draft.id || !workspace.composer.open) {
      return;
    }

    if (draft.quoteUri) {
      setWorkspace("composer", "quoteTarget", hydratedByUri.get(draft.quoteUri) ?? null);
    }

    if (draft.replyParentUri) {
      setWorkspace("composer", "replyTarget", hydratedByUri.get(draft.replyParentUri) ?? null);
    }

    if (draft.replyRootUri) {
      setWorkspace("composer", "replyRoot", hydratedByUri.get(draft.replyRootUri) ?? null);
    }
  }

  async function bootstrapDraftRestore() {
    const savedId = getAutosaveId();
    if (!savedId) {
      return;
    }

    try {
      await DraftController.getDraft(savedId);
      setWorkspace("restoreDraftId", savedId);
    } catch (error) {
      logger.error(`Autosave draft ${savedId} not found, clearing: ${normalizeError(error)}`);
      clearAutosaveId();
    }
  }

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
    if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "s") {
      if (workspace.composer.open) {
        event.preventDefault();
        if (autosaveTimerId !== null) {
          clearTimeout(autosaveTimerId);
          autosaveTimerId = null;
        }
        void saveCurrentDraft({ manual: true });
      }
      return;
    }

    if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "d") {
      event.preventDefault();
      openDraftsList();
      return;
    }

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
      const nextPreferences = await FeedController.getPreferences();
      if (currentDid !== props.activeSession.did) {
        return;
      }

      setWorkspace("preferences", nextPreferences);
      setWorkspace("localPrefs", reconcile(buildLocalPrefs(nextPreferences)));

      const uris = [
        ...new Set(nextPreferences.savedFeeds.filter((feed) => feed.type === "feed").map((feed) => feed.value)),
      ];
      if (uris.length > 0) {
        const hydrated = await FeedController.getFeedGenerators(uris);
        setWorkspace(
          "generators",
          reconcile(Object.fromEntries(hydrated.feeds.map((generator) => [generator.uri, generator]))),
        );
      }

      const nextActive = nextPreferences.savedFeeds.find((feed) => feed.pinned) ?? nextPreferences.savedFeeds[0]
        ?? DEFAULT_TIMELINE;
      setWorkspace("activeFeedId", nextActive.id);

      await Promise.all([bootstrapDraftRestore(), refreshDraftCount()]);
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
      const payload = await FeedController.getFeedPage(feed, state.cursor, DEFAULT_LIMIT);
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

  function openThread(uri: string) {
    props.onOpenThread(uri);
  }

  function openComposer() {
    setWorkspace("composer", "open", true);
  }

  function setComposerText(text: string) {
    setWorkspace("composer", "text", text);
    if (workspace.composer.open) {
      scheduleAutosave();
    }
  }

  function resetComposerState() {
    setWorkspace(
      "composer",
      (_current) => ({
        autosaveStatus: "idle",
        draftId: null,
        open: false,
        pending: false,
        quoteRef: null,
        quoteTarget: null,
        replyParentRef: null,
        replyRoot: null,
        replyRootRef: null,
        replyTarget: null,
        text: "",
      }),
    );
  }

  async function resetComposer() {
    const { draftId } = workspace.composer;
    if (autosaveTimerId !== null) {
      clearTimeout(autosaveTimerId);
      autosaveTimerId = null;
    }

    if (draftId) {
      try {
        await DraftController.deleteDraft(draftId);
        await refreshDraftCount();
        bumpDraftsListRefresh();
      } catch (error) {
        logger.error(`Failed to delete autosave draft on discard: ${normalizeError(error)}`);
      }
    }

    clearAutosaveId();
    resetComposerState();
  }

  async function saveAndCloseComposer() {
    if (autosaveTimerId !== null) {
      clearTimeout(autosaveTimerId);
      autosaveTimerId = null;
    }

    const hadContent = composerHasDraftableContent();
    const saved = await saveCurrentDraft({ manual: true });
    if (!hadContent || saved) {
      clearAutosaveId();
      resetComposerState();
    }
  }

  function openReplyComposer(post: PostView, root: PostView) {
    setWorkspace(
      "composer",
      (current) => ({
        ...current,
        open: true,
        replyParentRef: toStrongRef(post),
        replyRoot: root,
        replyRootRef: toStrongRef(root),
        replyTarget: post,
      }),
    );
    scheduleAutosave();
  }

  function openQuoteComposer(post: PostView) {
    setWorkspace("composer", (current) => ({ ...current, open: true, quoteRef: toStrongRef(post), quoteTarget: post }));
    scheduleAutosave();
  }

  function clearQuoteComposer() {
    setWorkspace("composer", "quoteTarget", null);
    setWorkspace("composer", "quoteRef", null);
    if (workspace.composer.open) {
      scheduleAutosave();
    }
  }

  function clearReplyComposer() {
    setWorkspace("composer", "replyTarget", null);
    setWorkspace("composer", "replyRoot", null);
    setWorkspace("composer", "replyParentRef", null);
    setWorkspace("composer", "replyRootRef", null);
    if (workspace.composer.open) {
      scheduleAutosave();
    }
  }

  function applySuggestion(value: string) {
    const token = composerToken();
    if (!token) {
      return;
    }

    const nextText = workspace.composer.text.replace(new RegExp(`${escapeForRegex(token)}$`, "u"), `${value} `);
    setComposerText(nextText);
  }

  async function submitPost() {
    const text = workspace.composer.text;
    const reply = workspace.composer.replyTarget;
    const root = workspace.composer.replyRoot;
    const quote = workspace.composer.quoteTarget;
    const draftId = workspace.composer.draftId;
    const replyParentRef = reply ? toStrongRef(reply) : workspace.composer.replyParentRef;
    const replyRootRef = root ? toStrongRef(root) : workspace.composer.replyRootRef;
    const quoteRef = quote ? toStrongRef(quote) : workspace.composer.quoteRef;

    if ((replyParentRef && !replyRootRef) || (!replyParentRef && replyRootRef)) {
      props.onError("Couldn't submit this draft because its reply context is incomplete.");
      return;
    }

    const replyTo: ReplyRefInput | null = replyParentRef && replyRootRef
      ? { parent: replyParentRef, root: replyRootRef }
      : null;
    const embed: EmbedInput | null = quoteRef ? { record: quoteRef, type: "record" } : null;

    setWorkspace("composer", "pending", true);
    try {
      await FeedController.createPost(text, replyTo, embed);

      if (autosaveTimerId !== null) {
        clearTimeout(autosaveTimerId);
        autosaveTimerId = null;
      }

      if (draftId) {
        try {
          await DraftController.deleteDraft(draftId);
          await refreshDraftCount();
          bumpDraftsListRefresh();
        } catch (error) {
          logger.error(`Failed to delete draft after submit: ${normalizeError(error)}`);
        }
      }

      clearAutosaveId();
      resetComposerState();
      await refreshActiveFeed();
    } catch (error) {
      props.onError(`Failed to create post: ${String(error)}`);
    } finally {
      setWorkspace("composer", "pending", false);
    }
  }

  async function refreshActiveFeed() {
    const feed = activeFeed();
    await loadFeed(feed, false);
    const nextScrollTops = updateFeedScrollTop(workspace.feedScrollTops, feed.id, 0);
    if (nextScrollTops) {
      setWorkspace("feedScrollTops", reconcile(nextScrollTops));
    }
    if (scroller) {
      scroller.scrollTop = 0;
    }
  }

  function patchPost(uri: string, updater: (post: PostView) => PostView) {
    for (const [feedId, state] of Object.entries(workspace.feedStates)) {
      if (!state) {
        continue;
      }

      setWorkspace("feedStates", feedId, "items", patchFeedItems(state.items, uri, updater));
    }
  }

  async function saveFeedPreferences(updatedFeeds: SavedFeedItem[]) {
    try {
      await FeedController.updateSavedFeeds(updatedFeeds);
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
      await FeedController.updateFeedViewPref(nextPref);
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

  function openDraftsList() {
    setWorkspace("showDraftsList", true);
  }

  function closeDraftsList() {
    setWorkspace("showDraftsList", false);
  }

  function loadDraft(draft: Draft) {
    if (autosaveTimerId !== null) {
      clearTimeout(autosaveTimerId);
      autosaveTimerId = null;
    }

    const replyParentRef = toDraftStrongRef(draft.replyParentUri, draft.replyParentCid);
    const replyRootRef = toDraftStrongRef(draft.replyRootUri, draft.replyRootCid);
    const quoteRef = toDraftStrongRef(draft.quoteUri, draft.quoteCid);
    if (
      (draft.replyParentUri && !replyParentRef) || (draft.replyRootUri && !replyRootRef)
      || (draft.quoteUri && !quoteRef)
    ) {
      logger.warn(`Draft ${draft.id} has partial strong references; invalid references were dropped`);
    }

    setWorkspace(
      "composer",
      (current) => ({
        ...current,
        autosaveStatus: "idle",
        draftId: draft.id,
        open: true,
        quoteRef,
        quoteTarget: null,
        replyParentRef,
        replyRoot: null,
        replyRootRef,
        replyTarget: null,
        text: draft.text,
      }),
    );
    setWorkspace("showDraftsList", false);
    void hydrateDraftTargets(draft);
  }

  async function restoreDraft() {
    const id = workspace.restoreDraftId;
    if (!id) {
      return;
    }

    try {
      const draft = await DraftController.getDraft(id);
      loadDraft(draft);
    } catch (error) {
      logger.error(`Failed to restore draft ${id}: ${normalizeError(error)}`);
    } finally {
      bumpDraftsListRefresh();
      setWorkspace("restoreDraftId", null);
    }
  }

  async function dismissRestore() {
    const id = workspace.restoreDraftId;
    setWorkspace("restoreDraftId", null);
    clearAutosaveId();

    if (id) {
      try {
        await DraftController.deleteDraft(id);
        await refreshDraftCount();
        bumpDraftsListRefresh();
      } catch (error) {
        logger.error(`Failed to delete dismissed restore draft ${id}: ${normalizeError(error)}`);
      }
    }
  }

  return {
    activeFeed,
    activeFeedState,
    activePref,
    applySuggestion,
    clearQuoteComposer,
    clearReplyComposer,
    closeDraftsList,
    closeFeedsDrawer,
    composerHasContent,
    composerSuggestions,
    dismissRestore,
    drawerFeeds,
    loadDraft,
    openComposer,
    openDraftsList,
    openThread,
    openQuoteComposer,
    openReplyComposer,
    pinFeed,
    pinnedFeeds,
    postRefs,
    registerScroller,
    registerSentinel,
    refreshActiveFeed,
    rememberScrollTop,
    reorderPinnedFeeds,
    resetComposer,
    restoreDraft,
    saveAndCloseComposer,
    setFeedPref,
    setFocusedIndex,
    setComposerText,
    submitPost,
    switchFeed,
    toggleFeedsDrawer,
    toggleBookmark,
    toggleLike,
    toggleRepost,
    unpinFeed,
    visibleItems,
    workspace,
    bookmarkPendingByUri: interactions.bookmarkPendingByUri,
    likePendingByUri: interactions.likePendingByUri,
    likePulseUri: interactions.likePulseUri,
    repostPendingByUri: interactions.repostPendingByUri,
    repostPulseUri: interactions.repostPulseUri,
  };
}

export type FeedWorkspaceController = ReturnType<typeof useFeedWorkspaceController>;

import { usePostInteractions } from "$/components/posts/usePostInteractions";
import { getFeedPage } from "$/lib/api/feeds";
import { patchFeedItems } from "$/lib/feeds";
import type { FeedViewPost, SavedFeedItem } from "$/lib/types";
import * as logger from "@tauri-apps/plugin-log";
import { onCleanup, onMount } from "solid-js";
import { createStore } from "solid-js/store";

const PAGE_LIMIT = 20;

type FeedColumnState = {
  bookmarkPendingByUri: Record<string, boolean>;
  cursor: string | null;
  error: string | null;
  items: FeedViewPost[];
  loading: boolean;
  loadingMore: boolean;
};

export function useFeedColumnState(getFeed: () => SavedFeedItem) {
  const [state, setState] = createStore<FeedColumnState>({
    bookmarkPendingByUri: {},
    cursor: null,
    error: null,
    items: [],
    loading: true,
    loadingMore: false,
  });
  const interactions = usePostInteractions({
    onError(message) {
      logger.error(message);
    },
    patchPost(uri, updater) {
      setState("items", (items) => patchFeedItems(items, uri, updater));
    },
  });

  let observer: IntersectionObserver | undefined;

  async function load(cursor: string | null = null) {
    try {
      const page = await getFeedPage(getFeed(), cursor, PAGE_LIMIT);

      if (cursor) {
        setState("items", (prev) => [...prev, ...page.feed]);
      } else {
        setState("items", page.feed);
      }
      setState("cursor", page.cursor ?? null);
      setState("error", null);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      logger.error(`Feed column load failed: ${message}`);
      setState("error", message);
    } finally {
      setState("loading", false);
      setState("loadingMore", false);
    }
  }

  async function loadMore() {
    if (state.loadingMore || state.loading || !state.cursor) return;
    setState("loadingMore", true);
    await load(state.cursor);
  }

  async function refresh() {
    setState("loading", true);
    setState("cursor", null);
    setState("items", []);
    await load(null);
  }

  function registerSentinel(element: HTMLDivElement) {
    observer?.disconnect();

    if (!element) return;

    observer = new IntersectionObserver((entries) => {
      const entry = entries[0];
      if (entry?.isIntersecting) {
        void loadMore();
      }
    }, { threshold: 0.1 });

    observer.observe(element);
  }

  onMount(() => {
    void load(null);
  });

  onCleanup(() => {
    observer?.disconnect();
  });

  return {
    bookmarkPendingByUri: interactions.bookmarkPendingByUri,
    likePendingByUri: interactions.likePendingByUri,
    refresh,
    registerSentinel,
    repostPendingByUri: interactions.repostPendingByUri,
    state,
    toggleBookmark: interactions.toggleBookmark,
    toggleLike: interactions.toggleLike,
    toggleRepost: interactions.toggleRepost,
  };
}

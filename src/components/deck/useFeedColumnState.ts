import { getFeedPage, likePost, repost, unlikePost, unrepost } from "$/lib/api/feeds";
import type { FeedViewPost, PostView, SavedFeedItem } from "$/lib/types";
import * as logger from "@tauri-apps/plugin-log";
import { onCleanup, onMount } from "solid-js";
import { createStore } from "solid-js/store";

const PAGE_LIMIT = 20;

export type FeedColumnState = {
  cursor: string | null;
  error: string | null;
  items: FeedViewPost[];
  likePendingByUri: Record<string, boolean>;
  loading: boolean;
  loadingMore: boolean;
  repostPendingByUri: Record<string, boolean>;
};

export function useFeedColumnState(getFeed: () => SavedFeedItem) {
  const [state, setState] = createStore<FeedColumnState>({
    cursor: null,
    error: null,
    items: [],
    likePendingByUri: {},
    loading: true,
    loadingMore: false,
    repostPendingByUri: {},
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

  async function toggleLike(post: PostView) {
    if (state.likePendingByUri[post.uri]) return;
    setState("likePendingByUri", post.uri, true);

    try {
      const likeUri = post.viewer?.like;
      if (likeUri) {
        await unlikePost(likeUri);
        setState("items", (items) =>
          items.map((item) => {
            if (item.post.uri !== post.uri) return item;
            return {
              ...item,
              post: {
                ...item.post,
                likeCount: (item.post.likeCount ?? 1) - 1,
                viewer: { ...item.post.viewer, like: undefined },
              },
            };
          }));
      } else {
        const result = await likePost(post.uri, post.cid);
        setState("items", (items) =>
          items.map((item) => {
            if (item.post.uri !== post.uri) return item;
            return {
              ...item,
              post: {
                ...item.post,
                likeCount: (item.post.likeCount ?? 0) + 1,
                viewer: { ...item.post.viewer, like: result.uri },
              },
            };
          }));
      }
    } catch (err) {
      logger.error(`Like toggle failed: ${String(err)}`);
    } finally {
      setState("likePendingByUri", post.uri, false);
    }
  }

  async function toggleRepost(post: PostView) {
    if (state.repostPendingByUri[post.uri]) return;
    setState("repostPendingByUri", post.uri, true);

    try {
      const repostUri = post.viewer?.repost;
      if (repostUri) {
        await unrepost(repostUri);
        setState("items", (items) =>
          items.map((item) => {
            if (item.post.uri !== post.uri) return item;
            return {
              ...item,
              post: {
                ...item.post,
                repostCount: (item.post.repostCount ?? 1) - 1,
                viewer: { ...item.post.viewer, repost: undefined },
              },
            };
          }));
      } else {
        const result = await repost(post.uri, post.cid);
        setState("items", (items) =>
          items.map((item) => {
            if (item.post.uri !== post.uri) return item;
            return {
              ...item,
              post: {
                ...item.post,
                repostCount: (item.post.repostCount ?? 0) + 1,
                viewer: { ...item.post.viewer, repost: result.uri },
              },
            };
          }));
      }
    } catch (err) {
      logger.error(`Repost toggle failed: ${String(err)}`);
    } finally {
      setState("repostPendingByUri", post.uri, false);
    }
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

  return { refresh, registerSentinel, state, toggleLike, toggleRepost };
}

import { bookmarkPost, likePost, removeBookmark, repost, unlikePost, unrepost } from "$/lib/api/feeds";
import {
  emitBookmarkChanged,
  emitPostViewUpdated,
  type PostViewUpdateDetail,
  subscribePostViewUpdated,
} from "$/lib/post-events";
import type { PostView } from "$/lib/types";
import { onCleanup, onMount } from "solid-js";
import { createStore } from "solid-js/store";

type InteractionState = {
  bookmarkPendingByUri: Record<string, boolean>;
  likePendingByUri: Record<string, boolean>;
  likePulseUri: string | null;
  repostPendingByUri: Record<string, boolean>;
  repostPulseUri: string | null;
};

type UsePostInteractionsProps = {
  onError: (message: string) => void;
  patchPost: (uri: string, updater: (post: PostView) => PostView) => void;
};

export function usePostInteractions(props: UsePostInteractionsProps) {
  const [state, setState] = createStore<InteractionState>({
    bookmarkPendingByUri: {},
    likePendingByUri: {},
    likePulseUri: null,
    repostPendingByUri: {},
    repostPulseUri: null,
  });

  onMount(() => {
    const dispose = subscribePostViewUpdated((detail) => {
      props.patchPost(detail.uri, (current) => applyEventPatch(current, detail));
    });
    onCleanup(dispose);
  });

  async function toggleLike(post: PostView) {
    if (state.likePendingByUri[post.uri]) {
      return;
    }

    setState("likePendingByUri", post.uri, true);
    const previousLike = post.viewer?.like ?? null;
    const previousLikeCount = post.likeCount ?? 0;

    if (previousLike) {
      props.patchPost(
        post.uri,
        (current) => ({
          ...current,
          likeCount: Math.max(0, (current.likeCount ?? 0) - 1),
          viewer: { ...current.viewer, like: null },
        }),
      );
    } else {
      props.patchPost(
        post.uri,
        (current) => ({
          ...current,
          likeCount: (current.likeCount ?? 0) + 1,
          viewer: { ...current.viewer, like: "optimistic-like" },
        }),
      );
      triggerPulse("likePulseUri", post.uri);
    }

    try {
      if (previousLike) {
        await unlikePost(previousLike);
        emitPostViewUpdated({ likeCount: Math.max(0, previousLikeCount - 1), uri: post.uri, viewer: { like: null } });
      } else {
        const result = await likePost(post.uri, post.cid);
        props.patchPost(post.uri, (current) => ({ ...current, viewer: { ...current.viewer, like: result.uri } }));
        emitPostViewUpdated({ likeCount: previousLikeCount + 1, uri: post.uri, viewer: { like: result.uri } });
      }
    } catch (error) {
      props.patchPost(
        post.uri,
        (current) => ({ ...current, likeCount: previousLikeCount, viewer: { ...current.viewer, like: previousLike } }),
      );
      props.onError(`Failed to update like: ${String(error)}`);
    } finally {
      setState("likePendingByUri", post.uri, false);
    }
  }

  async function toggleRepost(post: PostView) {
    if (state.repostPendingByUri[post.uri]) {
      return;
    }

    setState("repostPendingByUri", post.uri, true);
    const previousRepost = post.viewer?.repost ?? null;
    const previousRepostCount = post.repostCount ?? 0;

    if (previousRepost) {
      props.patchPost(
        post.uri,
        (current) => ({
          ...current,
          repostCount: Math.max(0, (current.repostCount ?? 0) - 1),
          viewer: { ...current.viewer, repost: null },
        }),
      );
    } else {
      props.patchPost(
        post.uri,
        (current) => ({
          ...current,
          repostCount: (current.repostCount ?? 0) + 1,
          viewer: { ...current.viewer, repost: "optimistic-repost" },
        }),
      );
      triggerPulse("repostPulseUri", post.uri);
    }

    try {
      if (previousRepost) {
        await unrepost(previousRepost);
        emitPostViewUpdated({
          repostCount: Math.max(0, previousRepostCount - 1),
          uri: post.uri,
          viewer: { repost: null },
        });
      } else {
        const result = await repost(post.uri, post.cid);
        props.patchPost(post.uri, (current) => ({ ...current, viewer: { ...current.viewer, repost: result.uri } }));
        emitPostViewUpdated({ repostCount: previousRepostCount + 1, uri: post.uri, viewer: { repost: result.uri } });
      }
    } catch (error) {
      props.patchPost(
        post.uri,
        (current) => ({
          ...current,
          repostCount: previousRepostCount,
          viewer: { ...current.viewer, repost: previousRepost },
        }),
      );
      props.onError(`Failed to update repost: ${String(error)}`);
    } finally {
      setState("repostPendingByUri", post.uri, false);
    }
  }

  async function toggleBookmark(post: PostView) {
    if (state.bookmarkPendingByUri[post.uri]) {
      return;
    }

    setState("bookmarkPendingByUri", post.uri, true);
    const previousBookmarked = !!post.viewer?.bookmarked;

    props.patchPost(
      post.uri,
      (current) => ({ ...current, viewer: { ...current.viewer, bookmarked: !previousBookmarked } }),
    );

    try {
      if (previousBookmarked) {
        await removeBookmark(post.uri);
      } else {
        await bookmarkPost(post.uri, post.cid);
      }

      emitPostViewUpdated({ uri: post.uri, viewer: { bookmarked: !previousBookmarked } });
      emitBookmarkChanged({ bookmarked: !previousBookmarked, cid: post.cid, uri: post.uri });
    } catch (error) {
      props.patchPost(
        post.uri,
        (current) => ({ ...current, viewer: { ...current.viewer, bookmarked: previousBookmarked } }),
      );
      props.onError(`Failed to update save: ${String(error)}`);
    } finally {
      setState("bookmarkPendingByUri", post.uri, false);
    }
  }

  function triggerPulse(key: "likePulseUri" | "repostPulseUri", uri: string) {
    setState(key, uri);
    globalThis.setTimeout(() => setState(key, (current) => (current === uri ? null : current)), 320);
  }

  return {
    bookmarkPendingByUri: () => state.bookmarkPendingByUri,
    likePendingByUri: () => state.likePendingByUri,
    likePulseUri: () => state.likePulseUri,
    repostPendingByUri: () => state.repostPendingByUri,
    repostPulseUri: () => state.repostPulseUri,
    toggleBookmark,
    toggleLike,
    toggleRepost,
  };
}

function applyEventPatch(post: PostView, detail: PostViewUpdateDetail): PostView {
  return {
    ...post,
    likeCount: detail.likeCount ?? post.likeCount,
    repostCount: detail.repostCount ?? post.repostCount,
    viewer: detail.viewer ? { ...post.viewer, ...detail.viewer } : post.viewer,
  };
}

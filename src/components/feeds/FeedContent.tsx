import { getReplyRootPost } from "$/lib/feeds";
import type { FeedViewPost, PostView } from "$/lib/types";
import { For, Show } from "solid-js";
import { EmptyFeedState, FeedSkeleton, LoadingMoreIndicator } from "./FeedEmpty";
import { PostCard } from "./PostCard";
import type { FeedState } from "./types";

function FeedStatus(props: { activeFeedState: FeedState | undefined; visibleItems: FeedViewPost[] }) {
  const loading = () => !props.activeFeedState || props.activeFeedState.loading;

  return (
    <>
      <Show when={loading()}>
        <FeedSkeleton />
      </Show>
      <Show when={props.activeFeedState?.error}>
        {(message) => (
          <div class="rounded-3xl bg-[rgba(138,31,31,0.2)] p-4 text-sm text-error shadow-[inset_0_0_0_1px_rgba(255,128,128,0.2)]">
            {message()}
          </div>
        )}
      </Show>
      <Show when={!loading() && !props.activeFeedState?.error && props.visibleItems.length === 0}>
        <EmptyFeedState />
      </Show>
    </>
  );
}

export function FeedContent(
  props: {
    activeFeedId: string;
    activeFeedState: FeedState | undefined;
    bookmarkPendingByUri: Record<string, boolean>;
    focusedIndex: number;
    likePendingByUri: Record<string, boolean>;
    likePulseUri: string | null;
    onFocusIndex: (index: number) => void;
    onBookmark: (post: PostView) => Promise<void> | void;
    onLike: (post: PostView) => Promise<void> | void;
    onOpenThread: (uri: string) => Promise<void> | void;
    onQuote: (post: PostView) => void;
    onReply: (post: PostView, root: PostView) => void;
    onRepost: (post: PostView) => Promise<void> | void;
    postRefs: Map<string, HTMLElement>;
    repostPendingByUri: Record<string, boolean>;
    repostPulseUri: string | null;
    sentinelRef: (element: HTMLDivElement) => void;
    visibleItems: FeedViewPost[];
  },
) {
  return (
    <div class="grid min-w-0 gap-3" data-feed-id={props.activeFeedId}>
      <FeedStatus activeFeedState={props.activeFeedState} visibleItems={props.visibleItems} />
      <For each={props.visibleItems}>
        {(item, index) => (
          <PostCard
            bookmarkPending={!!props.bookmarkPendingByUri[item.post.uri]}
            focused={props.focusedIndex === index()}
            item={item}
            likePending={!!props.likePendingByUri[item.post.uri]}
            onBookmark={() => void props.onBookmark(item.post)}
            onFocus={() => props.onFocusIndex(index())}
            onLike={() => void props.onLike(item.post)}
            onOpenThread={() => void props.onOpenThread(item.post.uri)}
            onQuote={() => props.onQuote(item.post)}
            onReply={() => props.onReply(item.post, getReplyRootPost(item))}
            onRepost={() => void props.onRepost(item.post)}
            post={item.post}
            pulseLike={props.likePulseUri === item.post.uri}
            pulseRepost={props.repostPulseUri === item.post.uri}
            registerRef={(element) => props.postRefs.set(item.post.uri, element)}
            repostPending={!!props.repostPendingByUri[item.post.uri]} />
        )}
      </For>
      <div ref={(element) => props.sentinelRef(element)} />
      <LoadingMoreIndicator loading={!!props.activeFeedState?.loadingMore} />
    </div>
  );
}

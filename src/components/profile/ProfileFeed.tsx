import type { PostEngagementTab } from "$/lib/post-engagement-routes";
import type { ProfileTab } from "$/lib/profile";
import type { FeedViewPost, PostView } from "$/lib/types";
import { For, Match, Show, Switch } from "solid-js";
import { PostCard } from "../feeds/PostCard";
import { Icon } from "../shared/Icon";
import { tabLabel } from "./profile-state";

function ProfilePostList(
  props: {
    bookmarkPendingByUri: Record<string, boolean>;
    items: FeedViewPost[];
    likePendingByUri: Record<string, boolean>;
    onBookmark: (post: PostView) => void;
    onOpenEngagement: (uri: string, tab: PostEngagementTab) => void;
    onLike: (post: PostView) => void;
    onOpenThread: (uri: string) => void;
    onRepost: (post: PostView) => void;
    repostPendingByUri: Record<string, boolean>;
  },
) {
  return (
    <div class="grid gap-3">
      <For each={props.items}>
        {(item) => (
          <PostCard
            bookmarkPending={!!props.bookmarkPendingByUri[item.post.uri]}
            likePending={!!props.likePendingByUri[item.post.uri]}
            onBookmark={() => props.onBookmark(item.post)}
            onLike={() => props.onLike(item.post)}
            onOpenEngagement={(tab) => props.onOpenEngagement(item.post.uri, tab)}
            post={item.post}
            item={item}
            onOpenThread={(uri) => props.onOpenThread(uri)}
            onRepost={() => props.onRepost(item.post)}
            repostPending={!!props.repostPendingByUri[item.post.uri]} />
        )}
      </For>
    </div>
  );
}

function ProfileLoadMoreButton(props: { activeTab: ProfileTab; loadingMore: boolean; onLoadMore: () => void }) {
  return (
    <div class="flex justify-center py-2">
      <button
        class="ui-control ui-control-hoverable inline-flex min-h-12 items-center gap-2 rounded-full px-5 text-sm font-medium text-on-surface disabled:translate-y-0 disabled:opacity-70"
        type="button"
        disabled={props.loadingMore}
        onClick={() => props.onLoadMore()}>
        <Show when={props.loadingMore} fallback={<Icon iconClass="i-ri-arrow-down-circle-line" class="text-base" />}>
          <Icon iconClass="i-ri-loader-4-line animate-spin" class="text-base" />
        </Show>
        <span>{props.loadingMore ? "Loading more..." : `Load more ${tabLabel(props.activeTab).toLowerCase()}`}</span>
      </button>
    </div>
  );
}

export function ProfileFeedSkeleton() {
  return (
    <div class="grid gap-3">
      <For each={Array.from({ length: 3 })}>
        {() => (
          <div class="tone-muted rounded-3xl p-5 shadow-(--inset-shadow)">
            <div class="flex items-start gap-3">
              <span class="skeleton-block h-11 w-11 rounded-full" />
              <div class="grid min-w-0 flex-1 gap-2">
                <span class="skeleton-block h-4 w-32 rounded-full" />
                <span class="skeleton-block h-3 w-full rounded-full" />
                <span class="skeleton-block h-3 w-2/3 rounded-full" />
              </div>
            </div>
          </div>
        )}
      </For>
    </div>
  );
}

export function ProfileFeedMessage(props: { body: string; title: string }) {
  return (
    <div class="tone-muted grid place-items-center rounded-3xl px-6 py-12 text-center shadow-(--inset-shadow)">
      <div class="grid max-w-lg gap-2">
        <p class="m-0 text-lg font-semibold tracking-[-0.02em] text-on-surface">{props.title}</p>
        <p class="m-0 text-sm leading-relaxed text-on-surface-variant">{props.body}</p>
      </div>
    </div>
  );
}

export function ProfileFeedSection(
  props: {
    activeTab: ProfileTab;
    bookmarkPendingByUri: Record<string, boolean>;
    cursor: string | null;
    error: string | null;
    items: FeedViewPost[];
    likePendingByUri: Record<string, boolean>;
    loading: boolean;
    loadingMore: boolean;
    onBookmark: (post: PostView) => void;
    onOpenEngagement: (uri: string, tab: PostEngagementTab) => void;
    onLike: (post: PostView) => void;
    onLoadMore: () => void;
    onOpenThread: (uri: string) => void;
    onRepost: (post: PostView) => void;
    repostPendingByUri: Record<string, boolean>;
  },
) {
  return (
    <section class="grid gap-3 px-3 pb-4 max-[520px]:px-2">
      <Show when={!props.loading} fallback={<ProfileFeedSkeleton />}>
        <Switch>
          <Match when={props.error}>
            <ProfileFeedMessage
              body={props.error ?? "The feed could not be loaded."}
              title={`Could not load ${tabLabel(props.activeTab).toLowerCase()}.`} />
          </Match>

          <Match when={props.items.length > 0}>
            <ProfilePostList
              bookmarkPendingByUri={props.bookmarkPendingByUri}
              items={props.items}
              likePendingByUri={props.likePendingByUri}
              onBookmark={props.onBookmark}
              onOpenEngagement={props.onOpenEngagement}
              onLike={props.onLike}
              onOpenThread={props.onOpenThread}
              onRepost={props.onRepost}
              repostPendingByUri={props.repostPendingByUri} />
          </Match>

          <Match when={props.cursor}>
            <ProfileFeedMessage
              body={`No ${
                tabLabel(props.activeTab).toLowerCase()
              } in the loaded window yet. Load more to keep scanning.`}
              title={`Still looking for ${tabLabel(props.activeTab).toLowerCase()}.`} />
          </Match>

          <Match when={true}>
            <ProfileFeedMessage
              body={`This profile does not have any visible ${tabLabel(props.activeTab).toLowerCase()} yet.`}
              title={`No ${tabLabel(props.activeTab)} available`} />
          </Match>
        </Switch>
      </Show>

      <Show when={props.cursor}>
        <ProfileLoadMoreButton
          activeTab={props.activeTab}
          loadingMore={props.loadingMore}
          onLoadMore={props.onLoadMore} />
      </Show>
    </section>
  );
}

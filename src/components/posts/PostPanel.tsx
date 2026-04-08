import { PostCard } from "$/components/feeds/PostCard";
import { Icon } from "$/components/shared/Icon";
import { useAppSession } from "$/contexts/app-session";
import { FeedController } from "$/lib/api/feeds";
import { isBlockedNode, isNotFoundNode, isThreadViewPost, patchThreadNode } from "$/lib/feeds";
import type { PostView, ThreadNode, ThreadViewPost } from "$/lib/types";
import { createEffect, createMemo, For, Match, Show, Switch } from "solid-js";
import { createStore } from "solid-js/store";
import { usePostInteractions } from "./usePostInteractions";
import { usePostNavigation } from "./usePostNavigation";

type PostPanelState = { error: string | null; loading: boolean; thread: ThreadNode | null; uri: string | null };

function createPostPanelState(): PostPanelState {
  return { error: null, loading: false, thread: null, uri: null };
}

function findThreadPost(node: ThreadNode | null | undefined, uri: string): ThreadViewPost | null {
  if (!node || !isThreadViewPost(node)) {
    return null;
  }

  if (node.post.uri === uri) {
    return node;
  }

  const parentMatch = findThreadPost(node.parent, uri);
  if (parentMatch) {
    return parentMatch;
  }

  for (const reply of node.replies ?? []) {
    const replyMatch = findThreadPost(reply, uri);
    if (replyMatch) {
      return replyMatch;
    }
  }

  return null;
}

function collectParentChain(node: ThreadViewPost | null): ThreadViewPost[] {
  if (!node) {
    return [];
  }

  const chain: ThreadViewPost[] = [];
  let current: ThreadNode | null | undefined = node.parent;
  while (current && isThreadViewPost(current)) {
    chain.unshift(current);
    current = current.parent;
  }

  return chain;
}

export function PostPanel(props: { uri: string | null }) {
  const session = useAppSession();
  const postNavigation = usePostNavigation();
  const [state, setState] = createStore<PostPanelState>(createPostPanelState());
  let requestId = 0;
  const interactions = usePostInteractions({
    onError: session.reportError,
    patchPost(uri, updater) {
      const current = state.thread;
      if (!current) {
        return;
      }

      setState("thread", patchThreadNode(current, uri, updater));
    },
  });

  const focusedNode = createMemo(() => {
    const uri = props.uri;
    const thread = state.thread;
    if (!uri || !thread) {
      return null;
    }

    return findThreadPost(thread, uri);
  });
  const parentChain = createMemo(() => collectParentChain(focusedNode()));
  const parentPostUri = createMemo(() => {
    const focused = focusedNode();
    if (!focused || !focused.parent || !isThreadViewPost(focused.parent)) {
      return null;
    }

    return focused.parent.post.uri;
  });

  createEffect(() => {
    const uri = props.uri;
    if (!uri) {
      setState(createPostPanelState());
      return;
    }

    if (state.uri === uri && (state.loading || state.thread || state.error)) {
      return;
    }

    const nextRequestId = ++requestId;
    void loadThread(uri, nextRequestId);
  });

  async function loadThread(uri: string, nextRequestId: number) {
    setState({ error: null, loading: true, thread: null, uri });

    try {
      const payload = await FeedController.getPostThread(uri);
      if (nextRequestId !== requestId || props.uri !== uri) {
        return;
      }

      setState({ error: null, loading: false, thread: payload.thread, uri });
    } catch (error) {
      if (nextRequestId !== requestId || props.uri !== uri) {
        return;
      }

      setState({ error: String(error), loading: false, thread: null, uri });
      session.reportError(`Failed to open post: ${String(error)}`);
    }
  }

  return (
    <section class="grid min-h-0 grid-rows-[auto_minmax(0,1fr)] overflow-hidden rounded-4xl bg-[rgba(8,8,8,0.32)] shadow-[inset_0_0_0_1px_rgba(255,255,255,0.03)]">
      <header class="sticky top-0 z-20 flex items-center justify-between gap-3 bg-[rgba(14,14,14,0.94)] px-6 pb-4 pt-5 backdrop-blur-[18px] shadow-[inset_0_-1px_0_rgba(255,255,255,0.04)] max-[760px]:px-4 max-[520px]:px-3">
        <div class="min-w-0">
          <p class="m-0 text-xl font-semibold tracking-tight text-on-surface">Post</p>
          <Show when={parentPostUri()}>
            {(parentUri) => (
              <a
                class="m-0 text-xs uppercase tracking-[0.12em] text-on-surface-variant no-underline transition hover:text-primary hover:underline"
                href={`#${postNavigation.buildPostHref(parentUri())}`}>
                Parent post
              </a>
            )}
          </Show>
        </div>
        <button
          type="button"
          class="inline-flex h-10 items-center gap-2 rounded-full border-0 bg-white/5 px-4 text-sm text-on-surface transition duration-150 ease-out hover:-translate-y-px hover:bg-white/8"
          onClick={() => void postNavigation.backFromPost()}>
          <Icon aria-hidden="true" iconClass="i-ri-arrow-left-line" />
          Back
        </button>
      </header>

      <div class="min-h-0 overflow-y-auto overscroll-contain px-3 pb-4 pt-3">
        <Show
          when={props.uri}
          fallback={<PostPanelMessage body="This post link is invalid." title="Post unavailable" />}>
          <ThreadState
            bookmarkPendingByUri={interactions.bookmarkPendingByUri()}
            error={state.error}
            focusedNode={focusedNode()}
            likePendingByUri={interactions.likePendingByUri()}
            loading={state.loading}
            onBookmark={(post) => void interactions.toggleBookmark(post)}
            onLike={(post) => void interactions.toggleLike(post)}
            onOpenPost={(uri) => void postNavigation.openPost(uri)}
            onRepost={(post) => void interactions.toggleRepost(post)}
            parentChain={parentChain()}
            repostPendingByUri={interactions.repostPendingByUri()} />
        </Show>
      </div>
    </section>
  );
}

function ThreadState(
  props: {
    bookmarkPendingByUri: Record<string, boolean>;
    error: string | null;
    focusedNode: ThreadViewPost | null;
    likePendingByUri: Record<string, boolean>;
    loading: boolean;
    onBookmark: (post: PostView) => void;
    onLike: (post: PostView) => void;
    onOpenPost: (uri: string) => void;
    onRepost: (post: PostView) => void;
    parentChain: ThreadViewPost[];
    repostPendingByUri: Record<string, boolean>;
  },
) {
  return (
    <>
      <Show when={props.loading}>
        <div class="grid gap-3">
          <SkeletonPostCard />
          <SkeletonPostCard />
        </div>
      </Show>

      <Show when={!props.loading && props.error}>
        {(message) => <PostPanelMessage body={message()} title="Couldn't load this post" />}
      </Show>

      <Show when={!props.loading && !props.error && props.focusedNode}>
        {(focused) => (
          <div class="grid gap-3">
            <For each={props.parentChain}>
              {(parent) => (
                <div class="rounded-3xl bg-white/3 p-3">
                  <PostCard
                    bookmarkPending={!!props.bookmarkPendingByUri[parent.post.uri]}
                    likePending={!!props.likePendingByUri[parent.post.uri]}
                    onBookmark={() => props.onBookmark(parent.post)}
                    onLike={() => props.onLike(parent.post)}
                    onOpenThread={() => props.onOpenPost(parent.post.uri)}
                    onRepost={() => props.onRepost(parent.post)}
                    post={parent.post}
                    repostPending={!!props.repostPendingByUri[parent.post.uri]}
                    showActions={false} />
                </div>
              )}
            </For>

            <PostCard
              bookmarkPending={!!props.bookmarkPendingByUri[focused().post.uri]}
              focused
              likePending={!!props.likePendingByUri[focused().post.uri]}
              onBookmark={() => props.onBookmark(focused().post)}
              onLike={() => props.onLike(focused().post)}
              onOpenThread={() => props.onOpenPost(focused().post.uri)}
              onRepost={() => props.onRepost(focused().post)}
              post={focused().post}
              repostPending={!!props.repostPendingByUri[focused().post.uri]} />

            <Show when={focused().replies?.length}>
              <div class="grid gap-3 rounded-3xl bg-white/3 p-3">
                <For each={focused().replies}>
                  {(reply) => (
                    <ThreadReplies
                      bookmarkPendingByUri={props.bookmarkPendingByUri}
                      likePendingByUri={props.likePendingByUri}
                      node={reply}
                      onBookmark={props.onBookmark}
                      onLike={props.onLike}
                      onOpenPost={props.onOpenPost}
                      onRepost={props.onRepost}
                      repostPendingByUri={props.repostPendingByUri} />
                  )}
                </For>
              </div>
            </Show>
          </div>
        )}
      </Show>
    </>
  );
}

function ThreadReplies(
  props: {
    bookmarkPendingByUri: Record<string, boolean>;
    likePendingByUri: Record<string, boolean>;
    node: ThreadNode;
    onBookmark: (post: PostView) => void;
    onLike: (post: PostView) => void;
    onOpenPost: (uri: string) => void;
    onRepost: (post: PostView) => void;
    repostPendingByUri: Record<string, boolean>;
  },
) {
  const threadNode = createMemo(() => (isThreadViewPost(props.node) ? props.node : null));

  return (
    <Switch>
      <Match when={isBlockedNode(props.node)}>
        <StateCard label="Blocked post" meta={isBlockedNode(props.node) ? props.node.uri : ""} />
      </Match>
      <Match when={isNotFoundNode(props.node)}>
        <StateCard label="Post not found" meta={isNotFoundNode(props.node) ? props.node.uri : ""} />
      </Match>
      <Match when={threadNode()}>
        {(current) => (
          <div class="grid gap-3">
            <PostCard
              bookmarkPending={!!props.bookmarkPendingByUri[current().post.uri]}
              likePending={!!props.likePendingByUri[current().post.uri]}
              onBookmark={() => props.onBookmark(current().post)}
              onLike={() => props.onLike(current().post)}
              onOpenThread={() => props.onOpenPost(current().post.uri)}
              onRepost={() => props.onRepost(current().post)}
              post={current().post}
              repostPending={!!props.repostPendingByUri[current().post.uri]} />

            <Show when={current().replies?.length}>
              <div class="ml-3 grid gap-3 border-l border-white/8 pl-3">
                <For each={current().replies}>
                  {(reply) => (
                    <ThreadReplies
                      bookmarkPendingByUri={props.bookmarkPendingByUri}
                      likePendingByUri={props.likePendingByUri}
                      node={reply}
                      onBookmark={props.onBookmark}
                      onLike={props.onLike}
                      onOpenPost={props.onOpenPost}
                      onRepost={props.onRepost}
                      repostPendingByUri={props.repostPendingByUri} />
                  )}
                </For>
              </div>
            </Show>
          </div>
        )}
      </Match>
    </Switch>
  );
}

function PostPanelMessage(props: { body: string; title: string }) {
  return (
    <div class="grid min-h-112 place-items-center px-6 py-10">
      <div class="grid max-w-lg gap-3 text-center">
        <p class="m-0 text-base font-medium text-on-surface">{props.title}</p>
        <p class="m-0 text-sm text-on-surface-variant">{props.body}</p>
      </div>
    </div>
  );
}

function SkeletonPostCard() {
  return (
    <div class="rounded-3xl bg-white/3 p-5 shadow-[inset_0_0_0_1px_rgba(255,255,255,0.04)]">
      <div class="flex gap-3">
        <div class="skeleton-block h-11 w-11 rounded-full" />
        <div class="min-w-0 flex-1">
          <div class="skeleton-block h-4 w-40 rounded-full" />
          <div class="mt-3 grid gap-2">
            <div class="skeleton-block h-3.5 w-full rounded-full" />
            <div class="skeleton-block h-3.5 w-[82%] rounded-full" />
            <div class="skeleton-block h-3.5 w-[68%] rounded-full" />
          </div>
        </div>
      </div>
    </div>
  );
}

function StateCard(props: { label: string; meta: string }) {
  return (
    <div class="rounded-3xl bg-white/3 p-4 shadow-[inset_0_0_0_1px_rgba(255,255,255,0.04)]">
      <p class="m-0 text-sm font-semibold text-on-surface">{props.label}</p>
      <p class="mt-1 text-xs text-on-surface-variant">{props.meta}</p>
    </div>
  );
}

import { Icon } from "$/components/shared/Icon";
import { useAppSession } from "$/contexts/app-session";
import { getPostThread } from "$/lib/api/feeds";
import { findRootPost, isBlockedNode, isNotFoundNode, isThreadViewPost, patchThreadNode } from "$/lib/feeds";
import type { PostView, ThreadNode } from "$/lib/types";
import { createEffect, createMemo, For, Match, onCleanup, Show, Switch } from "solid-js";
import { createStore } from "solid-js/store";
import { Motion, Presence } from "solid-motionone";
import { PostCard } from "../feeds/PostCard";
import { usePostInteractions } from "./usePostInteractions";
import { useThreadOverlayNavigation } from "./useThreadOverlayNavigation";

type ThreadModalState = { error: string | null; loading: boolean; thread: ThreadNode | null; uri: string | null };

function createThreadModalState(): ThreadModalState {
  return { error: null, loading: false, thread: null, uri: null };
}

export function ThreadModal() {
  const session = useAppSession();
  const threadOverlay = useThreadOverlayNavigation();
  const [state, setState] = createStore<ThreadModalState>(createThreadModalState());
  const rootPost = createMemo(() => findRootPost(state.thread));
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

  createEffect(() => {
    const uri = threadOverlay.threadUri();
    if (!uri) {
      if (state.uri || state.thread || state.error || state.loading) {
        setState(createThreadModalState());
      }
      return;
    }

    if (state.uri === uri && (state.loading || state.thread || state.error)) {
      return;
    }

    void loadThread(uri);
  });

  createEffect(() => {
    if (!threadOverlay.threadUri()) {
      return;
    }

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        void threadOverlay.closeThread();
      }
    };

    globalThis.addEventListener("keydown", handleKeyDown);
    onCleanup(() => globalThis.removeEventListener("keydown", handleKeyDown));
  });

  async function loadThread(uri: string) {
    setState({ error: null, loading: true, thread: null, uri });

    try {
      const payload = await getPostThread(uri);
      if (threadOverlay.threadUri() === uri) {
        setState({ error: null, loading: false, thread: payload.thread, uri });
      }
    } catch (error) {
      if (threadOverlay.threadUri() === uri) {
        setState({ error: String(error), loading: false, thread: null, uri });
      }
      session.reportError(`Failed to open thread: ${String(error)}`);
    }
  }

  return (
    <Presence>
      <Show when={threadOverlay.threadUri()}>
        <div class="fixed inset-0 z-50">
          <Motion.button
            class="absolute inset-0 border-0 bg-surface-container-highest/70 backdrop-blur-xl"
            type="button"
            aria-label="Close thread"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            onClick={() => void threadOverlay.closeThread()} />
          <Motion.aside
            class="absolute inset-y-0 right-0 grid w-full max-w-136 grid-rows-[auto_minmax(0,1fr)] overflow-hidden bg-[rgba(12,12,12,0.92)] px-5 pb-6 pt-5 shadow-[-28px_0_50px_rgba(0,0,0,0.35)] backdrop-blur-[22px]"
            initial={{ opacity: 0, x: 30 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: 36 }}
            transition={{ duration: 0.22 }}>
            <ThreadModalHeader onClose={() => void threadOverlay.closeThread()} />
            <ThreadModalBody
              activeUri={threadOverlay.threadUri()}
              bookmarkPendingByUri={interactions.bookmarkPendingByUri()}
              error={state.error}
              likePendingByUri={interactions.likePendingByUri()}
              loading={state.loading}
              onBookmark={(post) => void interactions.toggleBookmark(post)}
              onLike={(post) => void interactions.toggleLike(post)}
              onOpenThread={(uri) => void threadOverlay.openThread(uri)}
              onRepost={(post) => void interactions.toggleRepost(post)}
              repostPendingByUri={interactions.repostPendingByUri()}
              rootPost={rootPost()}
              thread={state.thread} />
          </Motion.aside>
        </div>
      </Show>
    </Presence>
  );
}

function ThreadModalBody(
  props: {
    activeUri: string | null;
    bookmarkPendingByUri: Record<string, boolean>;
    error: string | null;
    likePendingByUri: Record<string, boolean>;
    loading: boolean;
    onBookmark: (post: PostView) => void;
    onLike: (post: PostView) => void;
    onOpenThread: (uri: string) => void;
    onRepost: (post: PostView) => void;
    repostPendingByUri: Record<string, boolean>;
    rootPost: PostView | null;
    thread: ThreadNode | null;
  },
) {
  return (
    <div class="min-h-0 overflow-y-auto overscroll-contain pb-1">
      <ThreadModalLoading loading={props.loading} />

      <Show when={!props.loading && props.error}>
        {(message) => (
          <div class="rounded-3xl bg-[rgba(138,31,31,0.2)] p-4 text-sm text-error shadow-[inset_0_0_0_1px_rgba(255,128,128,0.2)]">
            {message()}
          </div>
        )}
      </Show>

      <Show when={!props.loading && props.thread && !props.error && props.rootPost}>
        {(root) => (
          <div class="grid gap-4">
            <ThreadNodeView
              activeUri={props.activeUri}
              bookmarkPendingByUri={props.bookmarkPendingByUri}
              likePendingByUri={props.likePendingByUri}
              node={props.thread!}
              onBookmark={props.onBookmark}
              onLike={props.onLike}
              onOpenThread={props.onOpenThread}
              onRepost={props.onRepost}
              repostPendingByUri={props.repostPendingByUri}
              rootPost={root()} />
          </div>
        )}
      </Show>
    </div>
  );
}

function ThreadModalHeader(props: { onClose: () => void }) {
  return (
    <header class="sticky top-0 z-10 mb-4 flex items-center justify-between rounded-3xl bg-[rgba(14,14,14,0.9)] px-4 py-3 shadow-[inset_0_0_0_1px_rgba(255,255,255,0.04)]">
      <div>
        <p class="m-0 text-base font-semibold text-on-surface">Thread</p>
        <p class="m-0 text-xs uppercase tracking-[0.12em] text-on-surface-variant">Nested replies</p>
      </div>
      <button
        class="inline-flex h-10 w-10 items-center justify-center rounded-xl border-0 bg-transparent text-on-surface-variant transition duration-150 ease-out hover:bg-white/5 hover:text-on-surface"
        type="button"
        onClick={() => props.onClose()}>
        <Icon aria-hidden="true" iconClass="i-ri-close-line" />
      </button>
    </header>
  );
}

function ThreadModalLoading(props: { loading: boolean }) {
  return (
    <Show when={props.loading}>
      <div class="grid gap-3">
        <SkeletonThreadCard />
        <SkeletonThreadCard />
      </div>
    </Show>
  );
}

function ThreadNodeView(
  props: {
    activeUri: string | null;
    bookmarkPendingByUri: Record<string, boolean>;
    likePendingByUri: Record<string, boolean>;
    node: ThreadNode;
    onBookmark: (post: PostView) => void;
    onLike: (post: PostView) => void;
    onOpenThread: (uri: string) => void;
    onRepost: (post: PostView) => void;
    repostPendingByUri: Record<string, boolean>;
    rootPost: PostView;
  },
) {
  const node = createMemo(() => (isThreadViewPost(props.node) ? props.node : null));

  return (
    <Switch>
      <Match when={isBlockedNode(props.node)}>
        <StateCard label="Blocked post" meta={isBlockedNode(props.node) ? props.node.uri : ""} />
      </Match>
      <Match when={isNotFoundNode(props.node)}>
        <StateCard label="Post not found" meta={isNotFoundNode(props.node) ? props.node.uri : ""} />
      </Match>
      <Match when={node()}>
        {(threadNode) => (
          <div class="grid gap-4">
            <Show when={threadNode().parent}>
              {(parent) => (
                <div class="rounded-3xl bg-white/3 p-3">
                  <ThreadNodeView
                    activeUri={props.activeUri}
                    bookmarkPendingByUri={props.bookmarkPendingByUri}
                    likePendingByUri={props.likePendingByUri}
                    node={parent()}
                    onBookmark={props.onBookmark}
                    onLike={props.onLike}
                    onOpenThread={props.onOpenThread}
                    onRepost={props.onRepost}
                    repostPendingByUri={props.repostPendingByUri}
                    rootPost={props.rootPost} />
                </div>
              )}
            </Show>

            <PostCard
              bookmarkPending={!!props.bookmarkPendingByUri[threadNode().post.uri]}
              focused={threadNode().post.uri === props.activeUri}
              likePending={!!props.likePendingByUri[threadNode().post.uri]}
              onBookmark={() => props.onBookmark(threadNode().post)}
              onLike={() => props.onLike(threadNode().post)}
              onOpenThread={() => props.onOpenThread(threadNode().post.uri)}
              onRepost={() => props.onRepost(threadNode().post)}
              post={threadNode().post}
              repostPending={!!props.repostPendingByUri[threadNode().post.uri]} />

            <Show when={threadNode().replies?.length}>
              <div class="grid gap-4 rounded-3xl bg-white/3 p-3">
                <For each={threadNode().replies}>
                  {(reply) => (
                    <ThreadNodeView
                      activeUri={props.activeUri}
                      bookmarkPendingByUri={props.bookmarkPendingByUri}
                      likePendingByUri={props.likePendingByUri}
                      node={reply}
                      onBookmark={props.onBookmark}
                      onLike={props.onLike}
                      onOpenThread={props.onOpenThread}
                      onRepost={props.onRepost}
                      repostPendingByUri={props.repostPendingByUri}
                      rootPost={props.rootPost} />
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

function StateCard(props: { label: string; meta: string }) {
  return (
    <div class="rounded-3xl bg-white/3 p-4 shadow-[inset_0_0_0_1px_rgba(255,255,255,0.04)]">
      <p class="m-0 text-sm font-semibold text-on-surface">{props.label}</p>
      <p class="mt-1 text-xs text-on-surface-variant">{props.meta}</p>
    </div>
  );
}

function SkeletonThreadCard() {
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

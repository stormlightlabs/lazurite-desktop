import { Icon } from "$/components/shared/Icon";
import { useAppSession } from "$/contexts/app-session";
import { FeedController } from "$/lib/api/feeds";
import { findRootPost, patchThreadNode } from "$/lib/feeds";
import { isBlockedNode, isNotFoundNode, isThreadViewPost } from "$/lib/feeds/type-guards";
import { useNavigationHistory } from "$/lib/navigation-history";
import type { PostView, ThreadNode } from "$/lib/types";
import { createEffect, createMemo, For, Match, onCleanup, Show, splitProps, Switch } from "solid-js";
import { createStore } from "solid-js/store";
import { Motion, Presence } from "solid-motionone";
import { PostCard } from "../feeds/PostCard";
import { HistoryControls } from "../shared/HistoryControls";
import { usePostInteractions } from "./hooks/usePostInteractions";
import { usePostNavigation } from "./hooks/usePostNavigation";
import { useThreadOverlayNavigation } from "./hooks/useThreadOverlayNavigation";

type ThreadDrawerState = { error: string | null; loading: boolean; thread: ThreadNode | null; uri: string | null };

function createThreadDrawerState(): ThreadDrawerState {
  return { error: null, loading: false, thread: null, uri: null };
}

function findParentUri(node: ThreadNode | null, targetUri: string | null): string | null {
  if (!node || !targetUri) {
    return null;
  }

  const visited = new Set<ThreadNode>();

  function walk(current: ThreadNode): string | null {
    if (visited.has(current)) {
      return null;
    }

    visited.add(current);

    if (isThreadViewPost(current)) {
      if (current.post.uri === targetUri && current.parent && isThreadViewPost(current.parent)) {
        return current.parent.post.uri;
      }

      if (current.parent) {
        const parentMatch = walk(current.parent);
        if (parentMatch) {
          return parentMatch;
        }
      }

      for (const reply of current.replies ?? []) {
        const replyMatch = walk(reply);
        if (replyMatch) {
          return replyMatch;
        }
      }
    }

    return null;
  }

  return walk(node);
}

function createEscapeKeyHandler(onClose: () => void) {
  return (event: KeyboardEvent) => {
    if (event.key !== "Escape") {
      return;
    }

    event.preventDefault();
    onClose();
  };
}

type ThreadDrawerBodyProps = {
  activeUri: string | null;
  bookmarkPendingByUri: Record<string, boolean>;
  error: string | null;
  likePendingByUri: Record<string, boolean>;
  loading: boolean;
  onBookmark: (post: PostView) => void;
  onLike: (post: PostView) => void;
  onOpenEngagement: (uri: string, tab: "likes" | "reposts" | "quotes") => void;
  onOpenThread: (uri: string) => void;
  onRepost: (post: PostView) => void;
  repostPendingByUri: Record<string, boolean>;
  rootPost: PostView | null;
  thread: ThreadNode | null;
};

function ThreadDrawerBody(props: ThreadDrawerBodyProps) {
  return (
    <div class="min-h-0 overflow-y-auto overscroll-contain pb-1">
      <ThreadDrawerLoading loading={props.loading} />

      <Show when={!props.loading && props.error}>
        {(message) => (
          <div class="rounded-3xl bg-error-surface p-4 text-sm text-error shadow-[inset_0_0_0_1px_rgba(180,35,24,0.2)]">
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
              onOpenEngagement={props.onOpenEngagement}
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

type ThreadDrawerHeaderProps = {
  activeUri: string | null;
  canGoBack: boolean;
  canGoForward: boolean;
  onClose: () => void;
  onGoBack: () => void;
  onGoForward: () => void;
  onMaximize: (uri: string) => void;
  parentThreadHref: string | null;
};

function ThreadDrawerHeader(props: ThreadDrawerHeaderProps) {
  const [local, historyControls] = splitProps(props, ["parentThreadHref", "activeUri", "onClose", "onMaximize"]);
  return (
    <header class="sticky top-0 z-10 mb-4 flex items-center gap-3 rounded-3xl bg-surface-container-high px-4 py-3 shadow-(--inset-shadow)">
      <div class="min-w-0 flex-1">
        <p class="m-0 text-base font-semibold text-on-surface">Thread!</p>
        <Show when={local.parentThreadHref}>
          {(href) => (
            <a
              class="m-0 text-xs uppercase tracking-[0.12em] text-on-surface-variant no-underline transition hover:text-primary hover:underline"
              href={`#${href()}`}>
              Parent post
            </a>
          )}
        </Show>
      </div>
      <div class="flex items-center gap-2 flex-1 justify-end">
        <HistoryControls {...historyControls} />
        <Show when={local.activeUri}>
          {(uri) => (
            <button
              aria-label="Open full post"
              class="inline-flex h-10 w-10 items-center justify-center rounded-xl border-0 bg-transparent text-on-surface-variant transition duration-150 ease-out hover:bg-surface-bright hover:text-on-surface"
              type="button"
              onClick={() => local.onMaximize(uri())}>
              <Icon aria-hidden kind="ext-link" />
            </button>
          )}
        </Show>
        <button
          class="inline-flex h-10 w-10 items-center justify-center rounded-xl border-0 bg-transparent text-on-surface-variant transition duration-150 ease-out hover:bg-surface-bright hover:text-on-surface"
          type="button"
          onClick={() => local.onClose()}>
          <Icon kind="close" aria-hidden />
        </button>
      </div>
    </header>
  );
}

function ThreadDrawerLoading(props: { loading: boolean }) {
  return (
    <Show when={props.loading}>
      <div class="grid gap-3">
        <ThreadSkeletonCard />
        <ThreadSkeletonCard />
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
    onOpenEngagement: (uri: string, tab: "likes" | "reposts" | "quotes") => void;
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
        <ThreadStateCard label="Blocked post" meta={isBlockedNode(props.node) ? props.node.uri : ""} />
      </Match>
      <Match when={isNotFoundNode(props.node)}>
        <ThreadStateCard label="Post not found" meta={isNotFoundNode(props.node) ? props.node.uri : ""} />
      </Match>
      <Match when={node()}>
        {(threadNode) => (
          <div class="grid gap-4">
            <Show when={threadNode().parent}>
              {(parent) => (
                <div class="tone-muted rounded-3xl p-3 shadow-(--inset-shadow)">
                  <ThreadNodeView
                    activeUri={props.activeUri}
                    bookmarkPendingByUri={props.bookmarkPendingByUri}
                    likePendingByUri={props.likePendingByUri}
                    node={parent()}
                    onBookmark={props.onBookmark}
                    onLike={props.onLike}
                    onOpenEngagement={props.onOpenEngagement}
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
              onOpenEngagement={(tab) => props.onOpenEngagement(threadNode().post.uri, tab)}
              onOpenThread={(uri) => props.onOpenThread(uri)}
              onRepost={() => props.onRepost(threadNode().post)}
              post={threadNode().post}
              repostPending={!!props.repostPendingByUri[threadNode().post.uri]} />

            <Show when={threadNode().replies?.length}>
              <div class="tone-muted grid gap-4 rounded-3xl p-3 shadow-(--inset-shadow)">
                <For each={threadNode().replies}>
                  {(reply) => (
                    <ThreadNodeView
                      activeUri={props.activeUri}
                      bookmarkPendingByUri={props.bookmarkPendingByUri}
                      likePendingByUri={props.likePendingByUri}
                      node={reply}
                      onBookmark={props.onBookmark}
                      onLike={props.onLike}
                      onOpenEngagement={props.onOpenEngagement}
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

function ThreadStateCard(props: { label: string; meta: string }) {
  return (
    <div class="tone-muted rounded-3xl p-4 shadow-(--inset-shadow)">
      <p class="m-0 text-sm font-semibold text-on-surface">{props.label}</p>
      <p class="mt-1 text-xs text-on-surface-variant">{props.meta}</p>
    </div>
  );
}

function ThreadSkeletonCard() {
  return (
    <div class="tone-muted rounded-3xl p-5 shadow-(--inset-shadow)">
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

export function ThreadDrawer() {
  const session = useAppSession();
  const postNavigation = usePostNavigation();
  const threadOverlay = useThreadOverlayNavigation();
  const history = useNavigationHistory();
  const [state, setState] = createStore<ThreadDrawerState>(createThreadDrawerState());
  const activeUri = createMemo(() => (threadOverlay.drawerEnabled() ? threadOverlay.threadUri() : null));
  const rootPost = createMemo(() => findRootPost(state.thread));
  const parentThreadUri = createMemo(() => findParentUri(state.thread, activeUri()));
  const parentThreadHref = createMemo(() =>
    parentThreadUri() ? threadOverlay.buildThreadHref(parentThreadUri()) : null
  );
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
    const uri = activeUri();
    if (!uri) {
      if (state.uri || state.thread || state.error || state.loading) {
        setState(createThreadDrawerState());
      }
      return;
    }

    if (state.uri === uri && (state.loading || state.thread || state.error)) {
      return;
    }

    void loadThread(uri);
  });

  createEffect(() => {
    if (!activeUri()) {
      return;
    }

    const handleKeyDown = createEscapeKeyHandler(() => {
      void threadOverlay.closeThread();
    });

    globalThis.addEventListener("keydown", handleKeyDown);
    onCleanup(() => globalThis.removeEventListener("keydown", handleKeyDown));
  });

  async function loadThread(uri: string) {
    setState({ error: null, loading: true, thread: null, uri });

    try {
      const payload = await FeedController.getPostThread(uri);
      if (activeUri() === uri) {
        setState({ error: null, loading: false, thread: payload.thread, uri });
      }
    } catch (error) {
      if (activeUri() === uri) {
        setState({ error: String(error), loading: false, thread: null, uri });
      }
      session.reportError(`Failed to open thread: ${String(error)}`);
    }
  }

  return (
    <Presence>
      <Show when={activeUri()}>
        <div class="fixed inset-0 z-50">
          <Motion.button
            class="ui-scrim absolute inset-0 border-0 backdrop-blur-xl"
            type="button"
            aria-label="Close thread"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            onClick={() => void threadOverlay.closeThread()} />
          <Motion.aside
            class="absolute inset-y-0 right-0 grid w-full max-w-136 grid-rows-[auto_minmax(0,1fr)] overflow-hidden bg-surface-container-highest px-5 pb-6 pt-5 shadow-[-28px_0_50px_rgba(0,0,0,0.24)] backdrop-blur-[22px]"
            initial={{ opacity: 0, x: 30 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: 36 }}
            transition={{ duration: 0.22 }}>
            <ThreadDrawerHeader
              activeUri={activeUri()}
              canGoBack={history.canGoBack()}
              canGoForward={history.canGoForward()}
              onGoBack={history.goBack}
              onGoForward={history.goForward}
              onMaximize={(uri) => void postNavigation.openPostScreen(uri)}
              parentThreadHref={parentThreadHref()}
              onClose={() => void threadOverlay.closeThread()} />
            <ThreadDrawerBody
              activeUri={activeUri()}
              bookmarkPendingByUri={interactions.bookmarkPendingByUri()}
              error={state.error}
              likePendingByUri={interactions.likePendingByUri()}
              loading={state.loading}
              onBookmark={(post) => void interactions.toggleBookmark(post)}
              onLike={(post) => void interactions.toggleLike(post)}
              onOpenEngagement={(uri, tab) => void postNavigation.openPostEngagement(uri, tab)}
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

import { Icon } from "$/components/shared/Icon";
import { findRootPost, isBlockedNode, isNotFoundNode, isThreadViewPost } from "$/lib/feeds";
import type { PostView, ThreadNode } from "$/lib/types";
import { createMemo, For, Match, Show, Switch } from "solid-js";
import { Motion, Presence } from "solid-motionone";
import { PostCard } from "./PostCard";

type ThreadPanelProps = {
  activeUri: string | null;
  error: string | null;
  loading: boolean;
  onClose: () => void;
  onLike: (post: PostView) => void;
  onQuote: (post: PostView) => void;
  onReply: (post: PostView, root: PostView) => void;
  onRepost: (post: PostView) => void;
  onOpenThread: (uri: string) => void;
  thread: ThreadNode | null;
};

export function ThreadPanel(props: ThreadPanelProps) {
  const rootPost = createMemo(() => findRootPost(props.thread));

  return (
    <Presence>
      <Show when={props.activeUri}>
        <Motion.aside
          class="fixed inset-y-0 right-0 z-40 w-full max-w-136 overflow-y-auto border-l border-white/5 bg-[rgba(12,12,12,0.92)] px-5 pb-6 pt-5 backdrop-blur-[22px] shadow-[-28px_0_50px_rgba(0,0,0,0.35)]"
          initial={{ opacity: 0, x: 30 }}
          animate={{ opacity: 1, x: 0 }}
          exit={{ opacity: 0, x: 36 }}
          transition={{ duration: 0.22 }}>
          <ThreadPanelHeader onClose={props.onClose} />
          <ThreadPanelLoading loading={props.loading} />

          <Show when={!props.loading && props.error}>
            {(message) => (
              <div class="rounded-3xl bg-[rgba(138,31,31,0.2)] p-4 text-sm text-error shadow-[inset_0_0_0_1px_rgba(255,128,128,0.2)]">
                {message()}
              </div>
            )}
          </Show>

          <Show when={!props.loading && props.thread && !props.error && rootPost()}>
            {(root) => (
              <div class="grid gap-4">
                <ThreadNodeView
                  activeUri={props.activeUri}
                  node={props.thread!}
                  rootPost={root()}
                  onLike={props.onLike}
                  onOpenThread={props.onOpenThread}
                  onQuote={props.onQuote}
                  onReply={props.onReply}
                  onRepost={props.onRepost} />
              </div>
            )}
          </Show>
        </Motion.aside>
      </Show>
    </Presence>
  );
}

function ThreadPanelHeader(props: { onClose: () => void }) {
  return (
    <header class="sticky top-0 z-10 mb-4 flex items-center justify-between rounded-3xl bg-[rgba(14,14,14,0.9)] px-4 py-3 shadow-[inset_0_0_0_1px_rgba(255,255,255,0.04)]">
      <div>
        <p class="m-0 text-[0.95rem] font-semibold text-on-surface">Thread</p>
        <p class="m-0 text-[0.74rem] uppercase tracking-[0.12em] text-on-surface-variant">Nested replies</p>
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

function ThreadPanelLoading(props: { loading: boolean }) {
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
    node: ThreadNode;
    onLike: (post: PostView) => void;
    onOpenThread: (uri: string) => void;
    onQuote: (post: PostView) => void;
    onReply: (post: PostView, root: PostView) => void;
    onRepost: (post: PostView) => void;
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
                <div class="border-l border-white/6 pl-4">
                  <ThreadNodeView
                    activeUri={props.activeUri}
                    node={parent()}
                    rootPost={props.rootPost}
                    onLike={props.onLike}
                    onOpenThread={props.onOpenThread}
                    onQuote={props.onQuote}
                    onReply={props.onReply}
                    onRepost={props.onRepost} />
                </div>
              )}
            </Show>

            <PostCard
              focused={threadNode().post.uri === props.activeUri}
              post={threadNode().post}
              onLike={() => props.onLike(threadNode().post)}
              onOpenThread={() => props.onOpenThread(threadNode().post.uri)}
              onQuote={() => props.onQuote(threadNode().post)}
              onReply={() => props.onReply(threadNode().post, props.rootPost)}
              onRepost={() => props.onRepost(threadNode().post)} />

            <Show when={threadNode().replies?.length}>
              <div class="grid gap-4 border-l border-white/6 pl-4">
                <For each={threadNode().replies}>
                  {(reply) => (
                    <ThreadNodeView
                      activeUri={props.activeUri}
                      node={reply}
                      rootPost={props.rootPost}
                      onLike={props.onLike}
                      onOpenThread={props.onOpenThread}
                      onQuote={props.onQuote}
                      onReply={props.onReply}
                      onRepost={props.onRepost} />
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
    <div class="rounded-[1.3rem] bg-white/3 p-4 shadow-[inset_0_0_0_1px_rgba(255,255,255,0.04)]">
      <p class="m-0 text-sm font-semibold text-on-surface">{props.label}</p>
      <p class="mt-1 text-[0.74rem] text-on-surface-variant">{props.meta}</p>
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

import { useModerationDecision } from "$/components/moderation/hooks/useModerationDecision";
import { ModeratedAvatar } from "$/components/moderation/ModeratedAvatar";
import { ModerationBadgeRow } from "$/components/moderation/ModerationBadgeRow";
import { Icon } from "$/components/shared/Icon";
import { getAvatarLabel, getDisplayName } from "$/lib/feeds";
import { collectModerationLabels } from "$/lib/moderation";
import type { ModerationLabel, ModerationUiDecision, ProfileViewBasic } from "$/lib/types";
import { createMemo, For, onMount, Show } from "solid-js";
import { Motion } from "solid-motionone";
import type { ActorListState } from "./profile-state";

function ActorListHeader(props: { onClose: () => void; title: string }) {
  return (
    <div class="flex shrink-0 items-center justify-between px-5 py-4">
      <div class="grid gap-1">
        <p class="m-0 text-[0.68rem] uppercase tracking-[0.12em] text-on-surface-variant">Profile graph</p>
        <p class="m-0 text-base font-semibold text-on-surface">{props.title}</p>
      </div>
      <button
        class="ui-control ui-control-hoverable flex h-8 w-8 items-center justify-center rounded-full"
        type="button"
        onClick={() => props.onClose()}>
        <Icon iconClass="i-ri-close-line" class="text-base" />
      </button>
    </div>
  );
}

function ActorListLoadMoreButton(props: { loadingMore: boolean; onLoadMore: () => void }) {
  return (
    <div class="flex justify-center py-4">
      <button
        class="ui-control ui-control-hoverable inline-flex min-h-10 items-center gap-2 rounded-full px-5 text-sm font-medium text-on-surface disabled:translate-y-0 disabled:opacity-70"
        disabled={props.loadingMore}
        type="button"
        onClick={() => props.onLoadMore()}>
        <Show when={props.loadingMore} fallback={<span>Load more</span>}>
          <>
            <Icon iconClass="i-ri-loader-4-line animate-spin" class="text-base" />
            <span>Loading...</span>
          </>
        </Show>
      </button>
    </div>
  );
}

type ActorListContentProps = {
  actorList: ActorListState;
  onFollowActor: (actor: ProfileViewBasic) => void;
  onSelectActor: (actor: ProfileViewBasic) => void;
  onUnfollowActor: (actor: ProfileViewBasic) => void;
  sessionDid: string | null;
  title: string;
};

function ActorListContent(props: ActorListContentProps) {
  return (
    <Show when={!props.actorList.loading} fallback={<ActorListSkeleton />}>
      <Show
        when={!props.actorList.error}
        fallback={
          <div class="grid place-items-center py-12 text-sm text-on-surface-variant">{props.actorList.error}</div>
        }>
        <Show
          when={props.actorList.actors.length > 0}
          fallback={
            <div class="grid place-items-center py-12 text-sm text-on-surface-variant">
              No {props.title.toLowerCase()} yet.
            </div>
          }>
          <div class="grid gap-2 pt-1">
            <For each={props.actorList.actors}>
              {(actor) => (
                <ActorCard
                  actor={actor}
                  followLoading={!!props.actorList.followPendingByDid[actor.did]}
                  isSelf={actor.did === props.sessionDid}
                  onFollow={() => props.onFollowActor(actor)}
                  onSelect={() => props.onSelectActor(actor)}
                  onUnfollow={() => props.onUnfollowActor(actor)} />
              )}
            </For>
          </div>
        </Show>
      </Show>
    </Show>
  );
}

type ActorCardProps = {
  actor: ProfileViewBasic;
  followLoading: boolean;
  isSelf: boolean;
  onFollow: () => void;
  onSelect: () => void;
  onUnfollow: () => void;
};

function ActorCard(props: ActorCardProps) {
  const label = createMemo(() => getAvatarLabel(props.actor));
  const name = createMemo(() => getDisplayName(props.actor));
  const isFollowing = createMemo(() => !!props.actor.viewer?.following);
  const labels = () => collectModerationLabels(props.actor);
  const avatarDecision = useModerationDecision(labels, "avatar");
  const profileDecision = useModerationDecision(labels, "profileList");

  return (
    <article class="tone-muted rounded-3xl p-4 shadow-(--inset-shadow)">
      <div class="flex items-start gap-3">
        <button
          class="flex min-w-0 flex-1 items-start gap-3 border-0 bg-transparent p-0 text-left transition hover:opacity-90"
          type="button"
          onClick={() => props.onSelect()}>
          <ModeratedAvatar
            avatar={props.actor.avatar}
            class="h-11 w-11 shrink-0 overflow-hidden rounded-full bg-surface-container-high"
            hidden={avatarDecision().filter || avatarDecision().blur !== "none"}
            label={label()}
            fallbackClass="text-sm font-semibold text-on-surface" />
          <ActorCardDetails actor={props.actor} decision={profileDecision()} labels={labels()} name={name()} />
        </button>

        <Show when={!props.isSelf}>
          <ActorCardFollowButton
            isFollowing={isFollowing()}
            loading={props.followLoading}
            onFollow={props.onFollow}
            onUnfollow={props.onUnfollow} />
        </Show>
      </div>
    </article>
  );
}

function ActorCardDetails(
  props: { actor: ProfileViewBasic; decision: ModerationUiDecision; labels: ModerationLabel[]; name: string },
) {
  return (
    <div class="grid min-w-0 flex-1 gap-1">
      <div class="flex flex-wrap items-center gap-2">
        <p class="m-0 truncate text-sm font-medium text-on-surface">{props.name}</p>
        <p class="m-0 truncate text-xs text-on-surface-variant">@{props.actor.handle.replace(/^@/, "")}</p>
      </div>
      <Show when={props.actor.description}>
        {(description) => (
          <p
            class="m-0 overflow-hidden text-sm leading-relaxed text-on-secondary-container"
            style={{ "-webkit-box-orient": "vertical", "-webkit-line-clamp": "2", display: "-webkit-box" }}>
            {description()}
          </p>
        )}
      </Show>
      <ModerationBadgeRow class="mt-1" decision={props.decision} labels={props.labels} />
    </div>
  );
}

function ActorCardFollowButton(
  props: { isFollowing: boolean; loading: boolean; onFollow: () => void; onUnfollow: () => void },
) {
  return (
    <Show
      when={props.isFollowing}
      fallback={
        <button
          class="inline-flex min-h-9 shrink-0 items-center gap-2 rounded-full border ui-outline-subtle bg-transparent px-4 text-sm font-medium text-on-surface transition hover:bg-surface-bright disabled:opacity-50"
          disabled={props.loading}
          type="button"
          onClick={() => props.onFollow()}>
          <Show when={props.loading} fallback={<Icon kind="follow" class="text-sm" />}>
            <Icon iconClass="i-ri-loader-4-line animate-spin" class="text-sm" />
          </Show>
          Follow
        </button>
      }>
      <button
        class="group inline-flex min-h-9 shrink-0 items-center gap-2 rounded-full bg-primary/15 px-4 text-sm font-medium text-primary shadow-[inset_0_0_0_1px_rgba(125,175,255,0.25)] transition hover:bg-red-500/15 hover:text-red-400 hover:shadow-[inset_0_0_0_1px_rgba(239,68,68,0.25)] disabled:opacity-50"
        disabled={props.loading}
        type="button"
        onClick={() => props.onUnfollow()}>
        <Show when={props.loading} fallback={<Icon iconClass="i-ri-check-line" class="text-sm" />}>
          <Icon iconClass="i-ri-loader-4-line animate-spin" class="text-sm" />
        </Show>
        <span class="group-hover:hidden">Following</span>
        <span class="hidden group-hover:inline">Unfollow</span>
      </button>
    </Show>
  );
}

function ActorListSkeleton() {
  return (
    <div class="grid gap-2 pt-1">
      <For each={Array.from({ length: 6 })}>
        {() => (
          <div class="tone-muted rounded-3xl p-4 shadow-(--inset-shadow)">
            <div class="flex items-start gap-3">
              <span class="skeleton-block h-11 w-11 shrink-0 rounded-full" />
              <div class="grid flex-1 gap-1.5">
                <For each={["w-32", "w-24", "w-full"]}>
                  {(w) => <span class={`skeleton-block h-3.5 ${w} rounded-full`} />}
                </For>
              </div>
            </div>
          </div>
        )}
      </For>
    </div>
  );
}

type ActorListOverlayProps = {
  actorList: ActorListState;
  onClose: () => void;
  onFollowActor: (actor: ProfileViewBasic) => void;
  onLoadMore: () => void;
  onSelectActor: (actor: ProfileViewBasic) => void;
  onUnfollowActor: (actor: ProfileViewBasic) => void;
  sessionDid: string | null;
};

export function ActorListOverlay(props: ActorListOverlayProps) {
  const title = createMemo(() => props.actorList.kind === "followers" ? "Followers" : "Following");
  let overlayRef: HTMLDivElement | undefined;

  onMount(() => {
    queueMicrotask(() => overlayRef?.focus());
  });

  return (
    <Motion.div
      ref={(element) => {
        overlayRef = element;
      }}
      aria-modal="true"
      class="ui-scrim absolute inset-0 z-50 flex items-end p-3 backdrop-blur-xl"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      role="dialog"
      tabIndex={-1}
      transition={{ duration: 0.16 }}
      onClick={() => props.onClose()}
      onKeyDown={(event) => {
        if (event.key === "Escape") {
          event.preventDefault();
          props.onClose();
        }
      }}>
      <Motion.div
        class="flex max-h-[min(42rem,calc(100%-0.75rem))] w-full flex-col overflow-hidden rounded-4xl bg-surface-container-highest shadow-[0_30px_80px_rgba(0,0,0,0.24),var(--inset-shadow)]"
        initial={{ opacity: 0.96, y: 40 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0.96, y: 40 }}
        transition={{ duration: 0.18 }}
        onClick={(event) => event.stopPropagation()}>
        <ActorListHeader onClose={props.onClose} title={title()} />

        <div class="min-h-0 flex-1 overflow-y-auto overscroll-contain px-3 pb-3">
          <ActorListContent
            actorList={props.actorList}
            onFollowActor={props.onFollowActor}
            onSelectActor={props.onSelectActor}
            onUnfollowActor={props.onUnfollowActor}
            sessionDid={props.sessionDid}
            title={title()} />

          <Show when={props.actorList.cursor}>
            <ActorListLoadMoreButton loadingMore={props.actorList.loadingMore} onLoadMore={props.onLoadMore} />
          </Show>
        </div>
      </Motion.div>
    </Motion.div>
  );
}

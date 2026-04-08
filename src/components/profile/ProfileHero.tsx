import { ModeratedAvatar } from "$/components/moderation/ModeratedAvatar";
import { ModerationBadgeRow } from "$/components/moderation/ModerationBadgeRow";
import { useModerationDecision } from "$/components/moderation/useModerationDecision";
import { Icon } from "$/components/shared/Icon";
import { getAvatarLabel, getDisplayName } from "$/lib/feeds";
import { collectModerationLabels } from "$/lib/moderation";
import type { ProfileViewDetailed } from "$/lib/types";
import { formatCount } from "$/lib/utils/text";
import { createMemo, For, Show } from "solid-js";

function ProfileHeroActions(
  props: {
    badges: string[];
    followLoading: boolean;
    isFollowing: boolean;
    isSelf: boolean;
    onFollow: () => void;
    onMessage: () => void;
    onUnfollow: () => void;
  },
) {
  return (
    <div class="flex flex-col items-end gap-2">
      <Show when={!props.isSelf}>
        <div class="flex flex-wrap justify-end gap-2">
          <MessageButton onClick={props.onMessage} />
          <FollowButton
            isFollowing={props.isFollowing}
            loading={props.followLoading}
            onFollow={props.onFollow}
            onUnfollow={props.onUnfollow} />
        </div>
      </Show>
      <ProfileBadgeRow badges={props.badges} isSelf={props.isSelf} />
    </div>
  );
}

function ProfileStat(props: { label: string; onClick?: () => void; value?: number | null }) {
  return (
    <Show
      when={props.onClick}
      fallback={
        <div class="grid gap-1">
          <span class="text-lg font-semibold tracking-[-0.02em] text-on-surface">{formatCount(props.value ?? 0)}</span>
          <span class="text-xs uppercase tracking-[0.12em] text-on-surface-variant">{props.label}</span>
        </div>
      }>
      {(onClick) => (
        <button
          class="grid gap-1 text-left transition duration-150 ease-out hover:opacity-80"
          type="button"
          onClick={onClick()}>
          <span class="text-lg font-semibold tracking-[-0.02em] text-on-surface">{formatCount(props.value ?? 0)}</span>
          <span class="text-xs uppercase tracking-[0.12em] text-on-surface-variant">{props.label}</span>
        </button>
      )}
    </Show>
  );
}

function ProfileIdentity(
  props: { description: string | null; displayName: string; handle: string; viewLabel: string },
) {
  return (
    <div class="grid min-w-0 flex-1 gap-3">
      <div class="grid gap-1">
        <p class="overline-copy text-[0.68rem] text-on-surface-variant">{props.viewLabel}</p>
        <h1 class="m-0 text-[clamp(2rem,4vw,3rem)] font-semibold leading-[0.96] tracking-[-0.04em] text-on-surface">
          {props.displayName}
        </h1>
        <p class="m-0 text-sm text-on-surface-variant">@{props.handle.replace(/^@/, "")}</p>
      </div>
      <Show when={props.description}>
        {(description) => (
          <p class="m-0 max-w-3xl whitespace-pre-wrap text-[0.98rem] leading-[1.7] text-on-secondary-container">
            {description()}
          </p>
        )}
      </Show>
    </div>
  );
}

function ProfileBadgeRow(props: { badges: string[]; isSelf: boolean }) {
  return (
    <div class="flex flex-wrap items-center justify-end gap-2">
      <For each={props.badges}>
        {(badge) => (
          <span class="inline-flex items-center rounded-full bg-white/6 px-3 py-2 text-xs font-medium text-on-surface">
            {badge}
          </span>
        )}
      </For>
      <Show when={props.badges.length === 0}>
        <span class="inline-flex items-center rounded-full bg-white/5 px-3 py-2 text-xs font-medium text-on-surface-variant">
          {props.isSelf ? "Signed in" : "Public profile"}
        </span>
      </Show>
    </div>
  );
}

function ProfileMetaRow(
  props: { did: string; joinedLabel: string | null; pinnedPostHref: string | null; website: string | null },
) {
  return (
    <div class="flex flex-wrap items-center gap-4 text-sm text-on-surface-variant">
      <Show when={props.website}>
        {(website) => (
          <a
            class="inline-flex items-center gap-2 text-primary no-underline transition hover:text-on-surface"
            href={website()}
            rel="noreferrer"
            target="_blank">
            <Icon iconClass="i-ri-link" class="text-base" />
            <span>{website().replace(/^https?:\/\//, "")}</span>
          </a>
        )}
      </Show>

      <Show when={props.joinedLabel}>
        {(joined) => (
          <span class="inline-flex items-center gap-2">
            <Icon iconClass="i-ri-calendar-line" class="text-base" />
            <span>Joined {joined()}</span>
          </span>
        )}
      </Show>

      <span class="inline-flex items-center gap-2">
        <Icon iconClass="i-ri-at-line" class="text-base" />
        <span class="max-w-full break-all">{props.did}</span>
      </span>

      <Show when={props.pinnedPostHref}>
        {(href) => (
          <a
            class="inline-flex items-center gap-2 rounded-full bg-white/6 px-3 py-2 text-xs font-medium text-on-surface no-underline transition hover:-translate-y-px hover:bg-white/10"
            href={`#${href()}`}>
            <Icon iconClass="i-ri-pushpin-2-line" class="text-base" />
            <span>Pinned post</span>
          </a>
        )}
      </Show>
    </div>
  );
}

function FollowButton(props: { isFollowing: boolean; loading: boolean; onFollow: () => void; onUnfollow: () => void }) {
  return (
    <Show
      when={props.isFollowing}
      fallback={
        <button
          class="inline-flex min-h-9 items-center gap-2 rounded-full border border-white/20 bg-transparent px-5 text-sm font-medium text-on-surface transition duration-150 ease-out hover:bg-white/5 disabled:opacity-50"
          disabled={props.loading}
          type="button"
          onClick={props.onFollow}>
          <Show when={props.loading}>
            <Icon iconClass="i-ri-loader-4-line animate-spin" class="text-base" />
          </Show>
          Follow
        </button>
      }>
      <button
        class="group inline-flex min-h-9 items-center gap-2 rounded-full bg-primary/15 px-5 text-sm font-medium text-primary shadow-[inset_0_0_0_1px_rgba(125,175,255,0.25)] transition duration-150 ease-out hover:bg-red-500/15 hover:text-red-400 hover:shadow-[inset_0_0_0_1px_rgba(239,68,68,0.25)] disabled:opacity-50"
        disabled={props.loading}
        type="button"
        onClick={() => props.onUnfollow()}>
        <Show when={props.loading}>
          <Icon iconClass="i-ri-loader-4-line animate-spin" class="text-base" />
        </Show>
        <span class="group-hover:hidden">Following</span>
        <span class="hidden group-hover:inline">Unfollow</span>
      </button>
    </Show>
  );
}

function MessageButton(props: { onClick: () => void }) {
  return (
    <button
      class="inline-flex min-h-9 items-center gap-2 rounded-full border border-white/12 bg-white/6 px-4 text-sm font-medium text-on-surface transition duration-150 ease-out hover:bg-white/10"
      type="button"
      onClick={() => props.onClick()}>
      <Icon kind="messages" class="text-base" />
      Message
    </button>
  );
}

export function ProfileHero(
  props: {
    coverOffset: number;
    followLoading: boolean;
    isSelf: boolean;
    joinedLabel: string | null;
    onFollow: () => void;
    onMessage: () => void;
    onOpenFollowers: () => void;
    onOpenFollows: () => void;
    onUnfollow: () => void;
    pinnedPostHref: string | null;
    profile: ProfileViewDetailed;
    profileBadges: string[];
    rootRef?: (element: HTMLElement) => void;
    viewLabel: string;
  },
) {
  const displayName = createMemo(() => getDisplayName(props.profile));
  const isFollowing = createMemo(() => !!props.profile.viewer?.following);
  const bannerStyle = createMemo(() => ({ transform: `translate3d(0, ${props.coverOffset}px, 0)` }));
  const profileLabels = () => collectModerationLabels(props.profile);
  const profileDecision = useModerationDecision(profileLabels);

  return (
    <header class="relative" ref={(element) => props.rootRef?.(element)}>
      <div class="relative h-64 overflow-hidden bg-surface-container-high shadow-[inset_0_-64px_80px_rgba(0,0,0,0.55)] max-[760px]:h-56">
        <Show
          when={props.profile.banner}
          fallback={
            <div
              class="absolute inset-0 bg-[radial-gradient(circle_at_18%_18%,rgba(125,175,255,0.22),transparent_30%),radial-gradient(circle_at_86%_24%,rgba(125,175,255,0.15),transparent_24%),linear-gradient(180deg,rgba(255,255,255,0.05),rgba(0,0,0,0.16))]"
              style={bannerStyle()} />
          }>
          {(banner) => (
            <img alt="" class="absolute inset-0 h-full w-full object-cover" src={banner()} style={bannerStyle()} />
          )}
        </Show>
      </div>

      <div class="relative z-10 -mt-16 px-6 pb-6 max-[760px]:px-4 max-[520px]:px-3">
        <div class="grid gap-5 rounded-4xl bg-[rgba(8,8,8,0.82)] px-5 pb-6 pt-5 shadow-[inset_0_0_0_1px_rgba(255,255,255,0.035)] backdrop-blur-[18px] max-[760px]:px-4 max-[520px]:px-3.5">
          <div class="flex flex-wrap items-start justify-between gap-5">
            <ProfileAvatar profile={props.profile} />

            <ProfileIdentity
              description={props.profile.description ?? null}
              displayName={displayName()}
              handle={props.profile.handle}
              viewLabel={props.viewLabel} />
            <ProfileHeroActions
              badges={props.profileBadges}
              followLoading={props.followLoading}
              isFollowing={isFollowing()}
              isSelf={props.isSelf}
              onFollow={props.onFollow}
              onMessage={props.onMessage}
              onUnfollow={props.onUnfollow} />
          </div>

          <ModerationBadgeRow decision={profileDecision()} labels={profileLabels()} />

          <ProfileMetaRow
            did={props.profile.did}
            joinedLabel={props.joinedLabel}
            pinnedPostHref={props.pinnedPostHref}
            website={props.profile.website ?? null} />

          <div class="flex flex-wrap gap-6">
            <ProfileStat label="Following" value={props.profile.followsCount} onClick={props.onOpenFollows} />
            <ProfileStat label="Followers" value={props.profile.followersCount} onClick={props.onOpenFollowers} />
            <ProfileStat label="Posts" value={props.profile.postsCount} />
          </div>
        </div>
      </div>
    </header>
  );
}

function ProfileAvatar(props: { profile: ProfileViewDetailed }) {
  const profile = () => props.profile;
  const label = createMemo(() => getAvatarLabel(props.profile));
  const labels = () => collectModerationLabels(props.profile);
  const decision = useModerationDecision(labels);

  return (
    <ModeratedAvatar
      avatar={profile().avatar}
      class="relative h-32 w-32 shrink-0 overflow-hidden rounded-full bg-black/60 shadow-[0_0_0_4px_rgba(8,8,8,0.96),0_0_0_6px_rgba(125,175,255,0.22),0_24px_40px_rgba(0,0,0,0.36)] backdrop-blur-sm"
      hidden={decision().filter || decision().blur !== "none"}
      label={label()}
      fallbackClass="text-[2rem] font-semibold text-on-surface" />
  );
}

export function ProfileStickyHeader(props: { profile: ProfileViewDetailed; profileBadges: string[] }) {
  const avatarLabel = createMemo(() => getAvatarLabel(props.profile));
  const displayName = createMemo(() => getDisplayName(props.profile));
  const visibleBadges = createMemo(() => props.profileBadges.slice(0, 2));
  const labels = () => collectModerationLabels(props.profile);
  const decision = useModerationDecision(labels);

  return (
    <div
      class="sticky top-0 z-30 px-3 pb-3 pt-3 backdrop-blur-[18px] max-[520px]:px-2"
      data-testid="profile-sticky-header">
      <div class="flex items-center gap-3 rounded-3xl bg-[rgba(14,14,14,0.92)] px-4 py-3 shadow-[inset_0_0_0_1px_rgba(255,255,255,0.04)]">
        <ModeratedAvatar
          avatar={props.profile.avatar}
          class="relative h-12 w-12 shrink-0 overflow-hidden rounded-full bg-black/60 shadow-[0_0_0_2px_rgba(8,8,8,0.96),0_0_0_3px_rgba(125,175,255,0.2)]"
          hidden={decision().filter || decision().blur !== "none"}
          label={avatarLabel()}
          fallbackClass="text-sm font-semibold text-on-surface" />

        <div class="min-w-0">
          <p class="m-0 truncate text-base font-semibold leading-tight tracking-[-0.02em] text-on-surface">
            {displayName()}
          </p>
          <p class="m-0 truncate text-sm leading-tight text-on-surface-variant">
            @{props.profile.handle.replace(/^@/, "")}
          </p>
        </div>

        <Show when={visibleBadges().length > 0}>
          <div class="ml-auto hidden flex-wrap justify-end gap-2 min-[720px]:flex">
            <For each={visibleBadges()}>
              {(badge) => (
                <span class="inline-flex items-center rounded-full bg-white/6 px-3 py-1.5 text-xs font-medium text-on-surface">
                  {badge}
                </span>
              )}
            </For>
          </div>
        </Show>
      </div>
    </div>
  );
}

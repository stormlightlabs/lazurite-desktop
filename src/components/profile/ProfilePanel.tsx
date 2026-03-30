import { PostCard } from "$/components/feeds/PostCard";
import { ProfileSkeleton } from "$/components/ProfileSkeleton";
import { Icon } from "$/components/shared/Icon";
import { useAppSession } from "$/contexts/app-session";
import { getActorLikes, getAuthorFeed, getProfile } from "$/lib/api/profile";
import { buildThreadRoute, getAvatarLabel, getDisplayName } from "$/lib/feeds";
import { filterProfileFeed, type ProfileTab } from "$/lib/profile";
import type { FeedResponse, FeedViewPost, ProfileViewDetailed } from "$/lib/types";
import { formatCount, normalizeError } from "$/lib/utils/text";
import { useNavigate } from "@solidjs/router";
import { createEffect, createMemo, createSignal, For, Match, onCleanup, Show, Switch } from "solid-js";
import { createStore } from "solid-js/store";

const FEED_PAGE_SIZE = 30;
const PROFILE_TABS: ProfileTab[] = ["posts", "replies", "media", "likes"];

type FeedState = {
  cursor: string | null;
  error: string | null;
  items: FeedViewPost[];
  loaded: boolean;
  loading: boolean;
  loadingMore: boolean;
};

type ProfilePanelState = {
  activeTab: ProfileTab;
  authorFeed: FeedState;
  likesFeed: FeedState;
  profile: ProfileViewDetailed | null;
  profileError: string | null;
  profileLoading: boolean;
  scrollTop: number;
};

function createFeedState(): FeedState {
  return { cursor: null, error: null, items: [], loaded: false, loading: false, loadingMore: false };
}

function createProfilePanelState(): ProfilePanelState {
  return {
    activeTab: "posts",
    authorFeed: createFeedState(),
    likesFeed: createFeedState(),
    profile: null,
    profileError: null,
    profileLoading: true,
    scrollTop: 0,
  };
}

export function ProfilePanel(props: { actor: string | null }) {
  const navigate = useNavigate();
  const session = useAppSession();
  const [state, setState] = createStore<ProfilePanelState>(createProfilePanelState());
  const [avatarTrackWidth, setAvatarTrackWidth] = createSignal(0);
  let avatarTrackRef: HTMLDivElement | undefined;
  let requestSequence = 0;

  const activeActor = createMemo(() => props.actor?.trim() || session.activeHandle || session.activeDid || "");
  const activeProfile = createMemo(() => state.profile);
  const isSelf = createMemo(() => activeProfile()?.did === session.activeDid);
  const activeFeedState = createMemo(() => state.activeTab === "likes" ? state.likesFeed : state.authorFeed);
  const visibleItems = createMemo(() =>
    state.activeTab === "likes" ? state.likesFeed.items : filterProfileFeed(state.authorFeed.items, state.activeTab)
  );
  const avatarProgress = createMemo(() => clamp((state.scrollTop - 18) / 180, 0, 1));
  const avatarScale = createMemo(() => 1 - avatarProgress() * 0.34);
  const avatarShift = createMemo(() => {
    const scaledSize = 128 * avatarScale();
    return Math.max((avatarTrackWidth() - scaledSize) / 2, 0) * avatarProgress();
  });
  const coverOffset = createMemo(() => Math.min(state.scrollTop * 0.28, 88));
  const coverScale = createMemo(() => 1 + Math.min(state.scrollTop / 1600, 0.08));
  const viewLabel = createMemo(() => isSelf() ? "Your profile" : "Viewing profile");
  const joinedLabel = createMemo(() => formatJoinedDate(activeProfile()?.createdAt));
  const pinnedPostHref = createMemo(() => {
    const uri = activeProfile()?.pinnedPost?.uri;
    return uri ? buildThreadRoute(uri) : null;
  });
  const profileBadges = createMemo(() => {
    const profile = activeProfile();
    if (!profile) {
      return [];
    }

    return [
      isSelf() ? "Current account" : null,
      profile.viewer?.following ? "Following" : null,
      profile.viewer?.followedBy ? "Follows you" : null,
      profile.viewer?.muted ? "Muted" : null,
      profile.viewer?.blockedBy ? "Blocks you" : null,
    ].filter(Boolean) as string[];
  });

  createEffect(() => {
    const actor = activeActor();
    if (!actor) {
      return;
    }

    requestSequence += 1;
    const sequence = requestSequence;
    setState({
      authorFeed: createFeedState(),
      likesFeed: createFeedState(),
      profile: null,
      profileError: null,
      profileLoading: true,
      scrollTop: 0,
    });

    void loadProfile(sequence, actor);
  });

  createEffect(() => {
    const actor = activeActor();
    if (!actor || state.profileLoading || !!state.profileError) {
      return;
    }

    if (state.activeTab === "likes") {
      if (!state.likesFeed.loaded && !state.likesFeed.loading) {
        void loadLikesPage(requestSequence, actor, false);
      }
      return;
    }

    if (!state.authorFeed.loaded && !state.authorFeed.loading) {
      void loadAuthorPage(requestSequence, actor, false);
    }
  });

  createEffect(() => {
    const element = avatarTrackRef;
    if (!element) {
      return;
    }

    const observer = new ResizeObserver((entries) => {
      const entry = entries[0];
      if (entry) {
        setAvatarTrackWidth(entry.contentRect.width);
      }
    });

    observer.observe(element);
    setAvatarTrackWidth(element.getBoundingClientRect().width);
    onCleanup(() => observer.disconnect());
  });

  async function loadProfile(sequence: number, actor: string) {
    try {
      const profile = await getProfile(actor);
      if (sequence !== requestSequence || actor !== activeActor()) {
        return;
      }

      setState({ profile, profileError: null, profileLoading: false });
    } catch (error) {
      if (sequence !== requestSequence || actor !== activeActor()) {
        return;
      }

      setState({ profile: null, profileError: normalizeError(error), profileLoading: false });
    }
  }

  async function loadAuthorPage(sequence: number, actor: string, loadMore: boolean) {
    const feed = state.authorFeed;
    if (feed.loading || feed.loadingMore) {
      return;
    }

    setState("authorFeed", loadMore ? "loadingMore" : "loading", true);

    try {
      const response = await getAuthorFeed(actor, loadMore ? feed.cursor : null, FEED_PAGE_SIZE);
      if (sequence !== requestSequence || actor !== activeActor()) {
        return;
      }

      applyFeedPage("authorFeed", response, loadMore);
    } catch (error) {
      if (sequence !== requestSequence || actor !== activeActor()) {
        return;
      }

      setState("authorFeed", {
        ...state.authorFeed,
        error: normalizeError(error),
        loaded: true,
        loading: false,
        loadingMore: false,
      });
    }
  }

  async function loadLikesPage(sequence: number, actor: string, loadMore: boolean) {
    const feed = state.likesFeed;
    if (feed.loading || feed.loadingMore) {
      return;
    }

    setState("likesFeed", loadMore ? "loadingMore" : "loading", true);

    try {
      const response = await getActorLikes(actor, loadMore ? feed.cursor : null, FEED_PAGE_SIZE);
      if (sequence !== requestSequence || actor !== activeActor()) {
        return;
      }

      applyFeedPage("likesFeed", response, loadMore);
    } catch (error) {
      if (sequence !== requestSequence || actor !== activeActor()) {
        return;
      }

      setState("likesFeed", {
        ...state.likesFeed,
        error: normalizeError(error),
        loaded: true,
        loading: false,
        loadingMore: false,
      });
    }
  }

  function applyFeedPage(feedKey: "authorFeed" | "likesFeed", response: FeedResponse, loadMore: boolean) {
    const current = state[feedKey];
    const nextItems = mergeFeedItems(loadMore ? current.items : [], response.feed);

    setState(feedKey, {
      cursor: response.cursor ?? null,
      error: null,
      items: nextItems,
      loaded: true,
      loading: false,
      loadingMore: false,
    });
  }

  function handleLoadMore() {
    const actor = activeActor();
    if (!actor) {
      return;
    }

    if (state.activeTab === "likes") {
      void loadLikesPage(requestSequence, actor, true);
      return;
    }

    void loadAuthorPage(requestSequence, actor, true);
  }

  function selectTab(tab: ProfileTab) {
    if (tab !== state.activeTab) {
      setState("activeTab", tab);
    }
  }

  function openThread(uri: string) {
    navigate(buildThreadRoute(uri));
  }

  return (
    <section class="grid min-h-0 overflow-hidden rounded-4xl bg-[rgba(8,8,8,0.32)] shadow-[inset_0_0_0_1px_rgba(255,255,255,0.03)]">
      <div
        class="min-h-0 overflow-y-auto overscroll-contain"
        onScroll={(event) => setState("scrollTop", event.currentTarget.scrollTop)}>
        <Show when={!state.profileLoading} fallback={<ProfileLoadingView />}>
          <Show
            when={!state.profileError && activeProfile()}
            fallback={<ProfileErrorView error={state.profileError} />}>
            {(profile) => (
              <>
                <ProfileHero
                  avatarProgress={avatarProgress()}
                  avatarScale={avatarScale()}
                  avatarShift={avatarShift()}
                  avatarTrackRef={(element) => {
                    avatarTrackRef = element;
                  }}
                  coverOffset={coverOffset()}
                  coverScale={coverScale()}
                  isSelf={isSelf()}
                  joinedLabel={joinedLabel()}
                  pinnedPostHref={pinnedPostHref()}
                  profile={profile()}
                  profileBadges={profileBadges()}
                  viewLabel={viewLabel()} />

                <ProfileTabs activeTab={state.activeTab} onSelect={selectTab} />

                <ProfileFeedSection
                  activeTab={state.activeTab}
                  cursor={activeFeedState().cursor}
                  error={activeFeedState().error}
                  items={visibleItems()}
                  loading={activeFeedState().loading}
                  loadingMore={activeFeedState().loadingMore}
                  onLoadMore={handleLoadMore}
                  onOpenThread={openThread} />
              </>
            )}
          </Show>
        </Show>
      </div>
    </section>
  );
}

function ProfileHero(
  props: {
    avatarProgress: number;
    avatarScale: number;
    avatarShift: number;
    avatarTrackRef: (element: HTMLDivElement) => void;
    coverOffset: number;
    coverScale: number;
    isSelf: boolean;
    joinedLabel: string | null;
    pinnedPostHref: string | null;
    profile: ProfileViewDetailed;
    profileBadges: string[];
    viewLabel: string;
  },
) {
  const avatarLabel = createMemo(() => getAvatarLabel(props.profile));
  const displayName = createMemo(() => getDisplayName(props.profile));
  const bannerStyle = createMemo(() => ({
    transform: `translate3d(0, ${props.coverOffset}px, 0) scale(${props.coverScale})`,
  }));
  const avatarStyle = createMemo(() => ({
    transform: `translate3d(${props.avatarShift}px, ${-10 * props.avatarProgress}px, 0) scale(${props.avatarScale})`,
  }));

  return (
    <header class="relative">
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
        <div class="sticky top-4 z-20 mb-4" ref={props.avatarTrackRef}>
          <div
            class="relative h-32 w-32 overflow-hidden rounded-full bg-black/60 shadow-[0_0_0_4px_rgba(8,8,8,0.96),0_0_0_6px_rgba(125,175,255,0.22),0_24px_40px_rgba(0,0,0,0.36)] backdrop-blur-sm transition-transform duration-100 ease-out"
            style={avatarStyle()}>
            <Show
              when={props.profile.avatar}
              fallback={
                <div class="flex h-full w-full items-center justify-center text-[2rem] font-semibold text-on-surface">
                  {avatarLabel()}
                </div>
              }>
              {(avatar) => <img alt="" class="h-full w-full object-cover" src={avatar()} />}
            </Show>
          </div>
        </div>

        <div class="grid gap-5 pt-20">
          <div class="flex flex-wrap items-start justify-between gap-4">
            <ProfileIdentity
              description={props.profile.description ?? null}
              displayName={displayName()}
              handle={props.profile.handle}
              viewLabel={props.viewLabel} />
            <ProfileBadgeRow badges={props.profileBadges} isSelf={props.isSelf} />
          </div>

          <ProfileMetaRow
            did={props.profile.did}
            joinedLabel={props.joinedLabel}
            pinnedPostHref={props.pinnedPostHref}
            website={props.profile.website ?? null} />

          <div class="flex flex-wrap gap-6">
            <ProfileStat label="Following" value={props.profile.followsCount} />
            <ProfileStat label="Followers" value={props.profile.followersCount} />
            <ProfileStat label="Posts" value={props.profile.postsCount} />
          </div>
        </div>
      </div>
    </header>
  );
}

function ProfileStat(props: { label: string; value?: number | null }) {
  return (
    <div class="grid gap-1">
      <span class="text-lg font-semibold tracking-[-0.02em] text-on-surface">{formatCount(props.value ?? 0)}</span>
      <span class="text-xs uppercase tracking-[0.12em] text-on-surface-variant">{props.label}</span>
    </div>
  );
}

function ProfileIdentity(
  props: { description: string | null; displayName: string; handle: string; viewLabel: string },
) {
  return (
    <div class="grid gap-3">
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

function ProfileTabs(props: { activeTab: ProfileTab; onSelect: (tab: ProfileTab) => void }) {
  return (
    <div class="sticky top-0 z-30 px-3 pb-3 pt-1 backdrop-blur-[18px] max-[520px]:px-2">
      <div class="rounded-3xl bg-[rgba(14,14,14,0.92)] p-2 shadow-[inset_0_0_0_1px_rgba(255,255,255,0.04)]">
        <div class="flex flex-wrap gap-2">
          <For each={PROFILE_TABS}>
            {(tab) => (
              <button
                class="rounded-full border-0 px-4 py-2.5 text-sm font-medium transition duration-150 ease-out"
                classList={{
                  "bg-white/8 text-primary shadow-[inset_0_0_0_1px_rgba(125,175,255,0.2)]": props.activeTab === tab,
                  "text-on-surface-variant hover:bg-white/5 hover:text-on-surface": props.activeTab !== tab,
                }}
                type="button"
                onClick={() => props.onSelect(tab)}>
                {tabLabel(tab)}
              </button>
            )}
          </For>
        </div>
      </div>
    </div>
  );
}

function ProfileFeedSection(
  props: {
    activeTab: ProfileTab;
    cursor: string | null;
    error: string | null;
    items: FeedViewPost[];
    loading: boolean;
    loadingMore: boolean;
    onLoadMore: () => void;
    onOpenThread: (uri: string) => void;
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
            <ProfilePostList items={props.items} onOpenThread={props.onOpenThread} />
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

function ProfilePostList(props: { items: FeedViewPost[]; onOpenThread: (uri: string) => void }) {
  return (
    <div class="grid gap-3">
      <For each={props.items}>
        {(item) => (
          <PostCard
            post={item.post}
            item={item}
            showActions={false}
            onOpenThread={() => props.onOpenThread(item.post.uri)} />
        )}
      </For>
    </div>
  );
}

function ProfileLoadMoreButton(props: { activeTab: ProfileTab; loadingMore: boolean; onLoadMore: () => void }) {
  return (
    <div class="flex justify-center py-2">
      <button
        class="inline-flex min-h-12 items-center gap-2 rounded-full border-0 bg-white/6 px-5 text-sm font-medium text-on-surface transition duration-150 ease-out hover:-translate-y-px hover:bg-white/10 disabled:translate-y-0 disabled:opacity-70"
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

function ProfileLoadingView() {
  return (
    <div class="grid gap-4 p-6 max-[760px]:p-4 max-[520px]:p-3">
      <div class="overflow-hidden rounded-4xl bg-white/3 p-6 shadow-[inset_0_0_0_1px_rgba(255,255,255,0.03)]">
        <ProfileSkeleton />
      </div>
      <ProfileFeedSkeleton />
    </div>
  );
}

function ProfileErrorView(props: { error: string | null }) {
  return (
    <div class="grid min-h-120 place-items-center p-6">
      <ProfileFeedMessage body={props.error ?? "The profile could not be loaded."} title="Profile unavailable" />
    </div>
  );
}

function ProfileFeedSkeleton() {
  return (
    <div class="grid gap-3">
      <For each={Array.from({ length: 3 })}>
        {() => (
          <div class="rounded-3xl bg-white/3 p-5 shadow-[inset_0_0_0_1px_rgba(255,255,255,0.03)]">
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

function ProfileFeedMessage(props: { body: string; title: string }) {
  return (
    <div class="grid place-items-center rounded-3xl bg-white/3 px-6 py-12 text-center shadow-[inset_0_0_0_1px_rgba(255,255,255,0.03)]">
      <div class="grid max-w-lg gap-2">
        <p class="m-0 text-lg font-semibold tracking-[-0.02em] text-on-surface">{props.title}</p>
        <p class="m-0 text-sm leading-relaxed text-on-surface-variant">{props.body}</p>
      </div>
    </div>
  );
}

function tabLabel(tab: ProfileTab) {
  switch (tab) {
    case "posts": {
      return "Posts";
    }
    case "replies": {
      return "Replies";
    }
    case "media": {
      return "Media";
    }
    default: {
      return "Likes";
    }
  }
}

function formatJoinedDate(value?: string | null) {
  if (!value) {
    return null;
  }

  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return null;
  }

  return parsed.toLocaleDateString(undefined, { month: "long", year: "numeric" });
}

function mergeFeedItems(current: FeedViewPost[], incoming: FeedViewPost[]) {
  const seen = new Set(current.map((item) => item.post.uri));
  const merged = [...current];

  for (const item of incoming) {
    if (!seen.has(item.post.uri)) {
      seen.add(item.post.uri);
      merged.push(item);
    }
  }

  return merged;
}

function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max);
}

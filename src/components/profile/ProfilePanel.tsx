import { DiagnosticsPanel } from "$/components/deck/DiagnosticsPanel";
import { usePostInteractions } from "$/components/posts/hooks/usePostInteractions";
import { usePostNavigation } from "$/components/posts/hooks/usePostNavigation";
import { ProfileSkeleton } from "$/components/ProfileSkeleton";
import { useAppSession } from "$/contexts/app-session";
import {
  followActor,
  getActorLikes,
  getAuthorFeed,
  getFollowers,
  getFollows,
  getProfile,
  unfollowActor,
} from "$/lib/api/profile";
import { buildMessagesRoute } from "$/lib/conversations";
import { queueExplorerTarget } from "$/lib/explorer-navigation";
import { patchFeedItems } from "$/lib/feeds";
import { buildProfileRoute, filterProfileFeed, getProfileRouteActor, type ProfileTab } from "$/lib/profile";
import type {
  ActorListResponse,
  FeedResponse,
  FeedViewPost,
  ProfileLookupUnavailable,
  ProfileViewBasic,
} from "$/lib/types";
import { formatJoinedDate, normalizeError } from "$/lib/utils/text";
import { useNavigate } from "@solidjs/router";
import { createEffect, createMemo, createSignal, For, Show } from "solid-js";
import { createStore } from "solid-js/store";
import { Presence } from "solid-motionone";
import { Icon } from "../shared/Icon";
import { createActorListState, createFeedState, createProfilePanelState, tabLabel } from "./profile-state";
import type { ProfilePanelState } from "./profile-state";
import { ActorListOverlay } from "./ProfileActorList";
import { ProfileFeedMessage, ProfileFeedSection, ProfileFeedSkeleton } from "./ProfileFeed";
import { ProfileHero, ProfileStickyHeader } from "./ProfileHero";

const FEED_PAGE_SIZE = 30;
const PROFILE_COMPACT_HEADER_FALLBACK_THRESHOLD = 360;

const PROFILE_TABS: ProfileTab[] = ["posts", "replies", "media", "likes", "context"];

export function ProfilePanel(props: { actor: string | null; embedded?: boolean }) {
  const navigate = useNavigate();
  const session = useAppSession();
  const postNavigation = usePostNavigation();
  const [state, setState] = createStore<ProfilePanelState>(createProfilePanelState());
  const [heroHeight, setHeroHeight] = createSignal<number | null>(null);
  let requestSequence = 0;
  const interactions = usePostInteractions({
    onError: session.reportError,
    patchPost(uri, updater) {
      setState("authorFeed", "items", (current) => patchFeedItems(current, uri, updater));
      setState("likesFeed", "items", (current) => patchFeedItems(current, uri, updater));
    },
  });

  const activeActor = createMemo(() => props.actor?.trim() || session.activeHandle || session.activeDid || "");
  const activeProfile = createMemo(() => state.profile);
  const isSelf = createMemo(() => activeProfile()?.did === session.activeDid);
  const activeFeedState = createMemo(() => state.activeTab === "likes" ? state.likesFeed : state.authorFeed);
  const visibleItems = createMemo(() =>
    state.activeTab === "likes" ? state.likesFeed.items : filterProfileFeed(state.authorFeed.items, state.activeTab)
  );
  const coverOffset = createMemo(() => Math.min(state.scrollTop * 0.28, 88));
  const viewLabel = createMemo(() => isSelf() ? "Your profile" : "Viewing profile");
  const joinedLabel = createMemo(() => formatJoinedDate(activeProfile()?.createdAt));
  const compactHeaderThreshold = createMemo(() => {
    const measured = heroHeight() ?? 0;
    return Math.max(0, (measured > 0 ? measured : PROFILE_COMPACT_HEADER_FALLBACK_THRESHOLD) - 24);
  });
  const showCompactHeader = createMemo(() => state.scrollTop >= compactHeaderThreshold());
  const pinnedPostHref = createMemo(() => {
    const uri = activeProfile()?.pinnedPost?.uri;
    return uri ? postNavigation.buildPostHref(uri) : null;
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
      actorList: createActorListState(),
      authorFeed: createFeedState(),
      likesFeed: createFeedState(),
      profile: null,
      profileError: null,
      profileLoading: true,
      profileUnavailable: null,
      scrollTop: 0,
    });

    void loadProfile(sequence, actor);
  });

  createEffect(() => {
    const actor = activeActor();
    if (!actor || state.profileLoading || !!state.profileError || !!state.profileUnavailable) {
      return;
    }

    if (state.activeTab === "context") {
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

  async function loadProfile(sequence: number, actor: string) {
    try {
      const result = await getProfile(actor);
      if (sequence !== requestSequence || actor !== activeActor()) {
        return;
      }

      if (result.status === "available") {
        setState({ profile: result.profile, profileError: null, profileLoading: false, profileUnavailable: null });
        return;
      }

      setState({ profile: null, profileError: null, profileLoading: false, profileUnavailable: result });
    } catch (error) {
      if (sequence !== requestSequence || actor !== activeActor()) {
        return;
      }

      setState({ profile: null, profileError: normalizeError(error), profileLoading: false, profileUnavailable: null });
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

  function retryProfile() {
    const actor = activeActor();
    if (!actor) {
      return;
    }

    requestSequence += 1;
    const sequence = requestSequence;
    setState({
      actorList: createActorListState(),
      authorFeed: createFeedState(),
      likesFeed: createFeedState(),
      profile: null,
      profileError: null,
      profileLoading: true,
      profileUnavailable: null,
      scrollTop: 0,
    });
    void loadProfile(sequence, actor);
  }

  function openThread(uri: string) {
    void postNavigation.openPost(uri);
  }

  function openEngagement(uri: string, tab: "likes" | "reposts" | "quotes") {
    void postNavigation.openPostEngagement(uri, tab);
  }

  function openExplorerTarget(target: string) {
    queueExplorerTarget(target);
    void navigate("/explorer");
  }

  async function handleFollow() {
    const profile = state.profile;
    if (!profile || state.followLoading) {
      return;
    }

    const prevViewer = profile.viewer;
    const prevFollowersCount = profile.followersCount ?? 0;
    setState("followLoading", true);
    setState("profile", "viewer", { ...prevViewer, following: "optimistic" });
    setState("profile", "followersCount", prevFollowersCount + 1);

    try {
      const result = await followActor(profile.did);
      setState("profile", "viewer", { ...state.profile?.viewer, following: result.uri });
    } catch {
      setState("profile", "viewer", prevViewer ?? null);
      setState("profile", "followersCount", prevFollowersCount);
    } finally {
      setState("followLoading", false);
    }
  }

  async function handleUnfollow() {
    const profile = state.profile;
    const followUri = profile?.viewer?.following;
    if (!profile || !followUri || state.followLoading || followUri === "optimistic") {
      return;
    }

    const prevViewer = profile.viewer;
    const prevFollowersCount = profile.followersCount ?? 0;
    setState("followLoading", true);
    setState("profile", "viewer", { ...prevViewer, following: null });
    setState("profile", "followersCount", Math.max(0, prevFollowersCount - 1));

    try {
      await unfollowActor(followUri);
    } catch {
      setState("profile", "viewer", prevViewer ?? null);
      setState("profile", "followersCount", prevFollowersCount);
    } finally {
      setState("followLoading", false);
    }
  }

  function handleMessage() {
    const profile = state.profile;
    if (!profile || profile.did === session.activeDid) {
      return;
    }

    navigate(buildMessagesRoute(profile.did));
  }

  function openActorList(kind: "followers" | "follows") {
    const actor = activeActor();
    if (!actor) {
      return;
    }

    setState("actorList", { ...createActorListState(), kind, loading: true });
    void loadActorListPage(actor, kind, false);
  }

  function closeActorList() {
    setState("actorList", createActorListState());
  }

  async function loadActorListPage(actor: string, kind: "followers" | "follows", loadMore: boolean) {
    const current = state.actorList;
    const cursor = loadMore ? current.cursor : null;

    setState("actorList", loadMore ? "loadingMore" : "loading", true);

    try {
      const response: ActorListResponse = kind === "followers"
        ? await getFollowers(actor, cursor)
        : await getFollows(actor, cursor);

      const nextActors = loadMore ? [...current.actors, ...response.actors] : response.actors;
      setState("actorList", {
        actors: nextActors,
        cursor: response.cursor ?? null,
        error: null,
        followPendingByDid: current.followPendingByDid,
        kind,
        loading: false,
        loadingMore: false,
      });
    } catch (error) {
      setState("actorList", "error", normalizeError(error));
      setState("actorList", "loading", false);
      setState("actorList", "loadingMore", false);
    }
  }

  function handleActorListLoadMore() {
    const { kind } = state.actorList;
    const actor = activeActor();
    if (!actor || !kind) {
      return;
    }

    void loadActorListPage(actor, kind, true);
  }

  function setActorListFollowPending(did: string, pending: boolean) {
    setState("actorList", "followPendingByDid", (current) => ({ ...current, [did]: pending }));
  }

  function updateActorListActor(did: string, updater: (actor: ProfileViewBasic) => ProfileViewBasic) {
    setState("actorList", "actors", (actors) => actors.map((actor) => actor.did === did ? updater(actor) : actor));
  }

  async function handleActorListFollow(actor: ProfileViewBasic) {
    if (actor.did === session.activeDid || state.actorList.followPendingByDid[actor.did]) {
      return;
    }

    const previousViewer = actor.viewer ?? null;
    setActorListFollowPending(actor.did, true);
    updateActorListActor(actor.did, (current) => withActorFollowing(current, "optimistic"));

    try {
      const result = await followActor(actor.did);
      updateActorListActor(actor.did, (current) => withActorFollowing(current, result.uri));
    } catch {
      updateActorListActor(actor.did, (current) => ({ ...current, viewer: previousViewer }));
    } finally {
      setActorListFollowPending(actor.did, false);
    }
  }

  async function handleActorListUnfollow(actor: ProfileViewBasic) {
    const followUri = actor.viewer?.following;
    if (
      actor.did === session.activeDid
      || !followUri
      || followUri === "optimistic"
      || state.actorList.followPendingByDid[actor.did]
    ) {
      return;
    }

    const previousViewer = actor.viewer ?? null;
    setActorListFollowPending(actor.did, true);
    updateActorListActor(actor.did, (current) => withActorFollowing(current, null));

    try {
      await unfollowActor(followUri);
    } catch {
      updateActorListActor(actor.did, (current) => ({ ...current, viewer: previousViewer }));
    } finally {
      setActorListFollowPending(actor.did, false);
    }
  }

  return (
    <section
      class="relative grid min-h-0 overflow-hidden bg-surface-container"
      classList={{ "rounded-4xl shadow-(--inset-shadow)": !props.embedded }}>
      <div
        data-testid="profile-scroll-region"
        class="min-h-0 overflow-y-auto overscroll-contain"
        onScroll={(event) => setState("scrollTop", event.currentTarget.scrollTop)}>
        <Show when={!state.profileLoading} fallback={<ProfileLoadingView />}>
          <Show
            when={state.profileUnavailable}
            fallback={
              <Show
                when={!state.profileError && activeProfile()}
                fallback={<ProfileErrorView error={state.profileError} onRetry={retryProfile} />}>
                {(profile) => (
                  <>
                    <ProfileHero
                      coverOffset={coverOffset()}
                      followLoading={state.followLoading}
                      isSelf={isSelf()}
                      joinedLabel={joinedLabel()}
                      onFollow={handleFollow}
                      onMessage={handleMessage}
                      onOpenFollowers={() => openActorList("followers")}
                      onOpenFollows={() => openActorList("follows")}
                      onUnfollow={handleUnfollow}
                      pinnedPostHref={pinnedPostHref()}
                      profile={profile()}
                      profileBadges={profileBadges()}
                      rootRef={(element) => {
                        setHeroHeight(element.offsetHeight || null);
                      }}
                      viewLabel={viewLabel()} />

                    <Show when={showCompactHeader()}>
                      <ProfileStickyHeader profile={profile()} profileBadges={profileBadges()} />
                    </Show>

                    <ProfileTabs
                      activeTab={state.activeTab}
                      compactHeaderVisible={showCompactHeader()}
                      onSelect={selectTab} />

                    <Show
                      when={state.activeTab === "context"}
                      fallback={
                        <ProfileFeedSection
                          activeTab={state.activeTab}
                          bookmarkPendingByUri={interactions.bookmarkPendingByUri()}
                          cursor={activeFeedState().cursor}
                          error={activeFeedState().error}
                          items={visibleItems()}
                          likePendingByUri={interactions.likePendingByUri()}
                          loading={activeFeedState().loading}
                          loadingMore={activeFeedState().loadingMore}
                          onBookmark={(post) => void interactions.toggleBookmark(post)}
                          onLike={(post) => void interactions.toggleLike(post)}
                          onLoadMore={handleLoadMore}
                          onOpenEngagement={openEngagement}
                          onOpenThread={openThread}
                          onRepost={(post) => void interactions.toggleRepost(post)}
                          repostPendingByUri={interactions.repostPendingByUri()} />
                      }>
                      <div class="px-3 pb-4 max-[520px]:px-2">
                        <DiagnosticsPanel did={profile().did} embedded onOpenExplorerTarget={openExplorerTarget} />
                      </div>
                    </Show>
                  </>
                )}
              </Show>
            }>
            {(unavailable) => <ProfileUnavailableView unavailable={unavailable()} />}
          </Show>
        </Show>
      </div>

      <Presence>
        <Show when={state.actorList.kind}>
          <ActorListOverlay
            actorList={state.actorList}
            onClose={closeActorList}
            onFollowActor={handleActorListFollow}
            onLoadMore={handleActorListLoadMore}
            onSelectActor={(actor) => {
              closeActorList();
              navigate(buildProfileRoute(getProfileRouteActor(actor)));
            }}
            onUnfollowActor={handleActorListUnfollow}
            sessionDid={session.activeDid} />
        </Show>
      </Presence>
    </section>
  );
}

function ProfileLoadingView() {
  return (
    <div class="grid gap-4 p-6 max-[760px]:p-4 max-[520px]:p-3">
      <div class="tone-muted overflow-hidden rounded-4xl p-6 shadow-(--inset-shadow)">
        <ProfileSkeleton />
      </div>
      <ProfileFeedSkeleton />
    </div>
  );
}

function ProfileUnavailableView(props: { unavailable: ProfileLookupUnavailable }) {
  const title = () => props.unavailable.handle ?? props.unavailable.did ?? props.unavailable.requestedActor;

  return (
    <div class="grid min-h-120 place-items-center p-6">
      <div class="tone-muted grid max-w-lg gap-4 rounded-4xl p-6 text-left shadow-(--inset-shadow)">
        <div class="flex items-center gap-3">
          <span class="ui-input-strong flex h-12 w-12 items-center justify-center rounded-full text-on-surface-variant">
            <Icon kind="danger" aria-hidden="true" />
          </span>
          <div class="min-w-0">
            <p class="m-0 text-sm text-on-surface-variant">Profile unavailable</p>
            <h2 class="m-0 truncate text-lg font-semibold text-on-surface">{title()}</h2>
          </div>
        </div>
        <p class="m-0 text-sm leading-relaxed text-on-surface-variant">{props.unavailable.message}</p>
      </div>
    </div>
  );
}

function ProfileErrorView(props: { error: string | null; onRetry: () => void }) {
  const error = () => props.error ?? "The profile could not be loaded.";
  return (
    <div class="grid min-h-120 place-items-center p-6">
      <div class="grid gap-4">
        <ProfileFeedMessage body={error()} title="Profile couldn't be loaded" />
        <button
          type="button"
          class="ui-control ui-control-hoverable inline-flex items-center justify-center gap-2 rounded-full px-4 py-2 text-sm font-medium text-on-surface"
          onClick={() => props.onRetry()}>
          <Icon kind="refresh" aria-hidden="true" />
          Retry
        </button>
      </div>
    </div>
  );
}

function ProfileTabs(
  props: { activeTab: ProfileTab; compactHeaderVisible: boolean; onSelect: (tab: ProfileTab) => void },
) {
  return (
    <div
      class="sticky z-20 px-3 pb-3 pt-1 backdrop-blur-[18px] max-[520px]:px-2"
      classList={{ "top-22": props.compactHeaderVisible, "top-0": !props.compactHeaderVisible }}>
      <div class="rounded-3xl bg-surface-container-high p-2 shadow-(--inset-shadow)">
        <div class="flex flex-wrap gap-2">
          <For each={PROFILE_TABS}>
            {(tab) => (
              <button
                class="rounded-full border-0 px-4 py-2.5 text-sm font-medium transition duration-150 ease-out"
                classList={{
                  "tone-muted text-primary shadow-[inset_0_0_0_1px_rgba(125,175,255,0.2)]": props.activeTab === tab,
                  "text-on-surface-variant hover:bg-surface-bright hover:text-on-surface": props.activeTab !== tab,
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

function withActorFollowing(actor: ProfileViewBasic, following: string | null) {
  if (actor.viewer) {
    return { ...actor, viewer: { ...actor.viewer, following } };
  }

  return { ...actor, viewer: { following } };
}

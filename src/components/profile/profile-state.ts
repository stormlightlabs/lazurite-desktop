import type { ProfileTab } from "$/lib/profile";
import type { FeedViewPost, ProfileViewBasic, ProfileViewDetailed } from "$/lib/types";

export type FeedState = {
  cursor: string | null;
  error: string | null;
  items: FeedViewPost[];
  loaded: boolean;
  loading: boolean;
  loadingMore: boolean;
};

export type ActorListState = {
  actors: ProfileViewBasic[];
  cursor: string | null;
  error: string | null;
  followPendingByDid: Record<string, boolean>;
  kind: "followers" | "follows" | null;
  loading: boolean;
  loadingMore: boolean;
};

export type ProfilePanelState = {
  activeTab: ProfileTab;
  actorList: ActorListState;
  authorFeed: FeedState;
  followLoading: boolean;
  likesFeed: FeedState;
  profile: ProfileViewDetailed | null;
  profileError: string | null;
  profileLoading: boolean;
  scrollTop: number;
};

export function createFeedState(): FeedState {
  return { cursor: null, error: null, items: [], loaded: false, loading: false, loadingMore: false };
}

export function createActorListState(): ActorListState {
  return {
    actors: [],
    cursor: null,
    error: null,
    followPendingByDid: {},
    kind: null,
    loading: false,
    loadingMore: false,
  };
}

export function createProfilePanelState(): ProfilePanelState {
  return {
    activeTab: "posts",
    actorList: createActorListState(),
    authorFeed: createFeedState(),
    followLoading: false,
    likesFeed: createFeedState(),
    profile: null,
    profileError: null,
    profileLoading: true,
    scrollTop: 0,
  };
}

export function tabLabel(tab: ProfileTab) {
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

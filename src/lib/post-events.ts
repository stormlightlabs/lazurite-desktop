import { BOOKMARK_CHANGED_EVENT, POST_VIEW_UPDATED_EVENT } from "$/lib/constants/events";
import type { ViewerState } from "$/lib/types";

export type PostViewUpdateDetail = {
  likeCount?: number | null;
  repostCount?: number | null;
  uri: string;
  viewer?: Partial<ViewerState> | null;
};

type BookmarkChangedDetail = { bookmarked: boolean; cid: string; uri: string };

export function emitPostViewUpdated(detail: PostViewUpdateDetail) {
  globalThis.dispatchEvent(new CustomEvent<PostViewUpdateDetail>(POST_VIEW_UPDATED_EVENT, { detail }));
}

export function emitBookmarkChanged(detail: BookmarkChangedDetail) {
  globalThis.dispatchEvent(new CustomEvent<BookmarkChangedDetail>(BOOKMARK_CHANGED_EVENT, { detail }));
}

export function subscribePostViewUpdated(listener: (detail: PostViewUpdateDetail) => void) {
  const handler = (event: Event) => listener((event as CustomEvent<PostViewUpdateDetail>).detail);
  globalThis.addEventListener(POST_VIEW_UPDATED_EVENT, handler);
  return () => globalThis.removeEventListener(POST_VIEW_UPDATED_EVENT, handler);
}

export function subscribeBookmarkChanged(listener: (detail: BookmarkChangedDetail) => void) {
  const handler = (event: Event) => listener((event as CustomEvent<BookmarkChangedDetail>).detail);
  globalThis.addEventListener(BOOKMARK_CHANGED_EVENT, handler);
  return () => globalThis.removeEventListener(BOOKMARK_CHANGED_EVENT, handler);
}

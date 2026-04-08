import { buildThreadOverlayRoute, getThreadOverlayUri, TIMELINE_ROUTE } from "$/lib/feeds";
import { buildPostRoute, decodePostRouteUri, isThreadDrawerPath, POST_ROUTE } from "$/lib/post-routes";
import { useLocation, useNavigate } from "@solidjs/router";
import { createMemo } from "solid-js";

export function useThreadOverlayNavigation() {
  const location = useLocation();
  const navigate = useNavigate();
  const drawerEnabled = createMemo(() => isThreadDrawerPath(location.pathname));
  const postRouteThreadUri = createMemo(() => {
    const prefix = `${POST_ROUTE}/`;
    if (!location.pathname.startsWith(prefix)) {
      return null;
    }

    return decodePostRouteUri(location.pathname.slice(prefix.length));
  });

  const threadUri = createMemo(() => {
    if (drawerEnabled()) {
      return getThreadOverlayUri(location.search);
    }

    return postRouteThreadUri();
  });

  function openThread(uri: string) {
    if (drawerEnabled()) {
      return navigate(buildThreadOverlayRoute(location.pathname, location.search, uri));
    }

    return navigate(buildPostRoute(uri));
  }

  function buildThreadHref(uri: string | null) {
    if (!uri) {
      return TIMELINE_ROUTE;
    }

    if (drawerEnabled()) {
      return buildThreadOverlayRoute(location.pathname, location.search, uri);
    }

    return buildPostRoute(uri);
  }

  function closeThread() {
    if (drawerEnabled() || getThreadOverlayUri(location.search)) {
      return navigate(buildThreadOverlayRoute(location.pathname, location.search, null));
    }

    if (globalThis.history.length > 1) {
      return navigate(-1);
    }

    return navigate(TIMELINE_ROUTE);
  }

  return { buildThreadHref, closeThread, drawerEnabled, openThread, threadUri };
}

import { buildThreadOverlayRoute, getThreadOverlayUri } from "$/lib/feeds";
import { useLocation, useNavigate } from "@solidjs/router";
import { createMemo } from "solid-js";

export function useThreadOverlayNavigation() {
  const location = useLocation();
  const navigate = useNavigate();

  const threadUri = createMemo(() => getThreadOverlayUri(location.search));

  function openThread(uri: string) {
    return navigate(buildThreadOverlayRoute(location.pathname, location.search, uri));
  }

  function closeThread() {
    return navigate(buildThreadOverlayRoute(location.pathname, location.search, null));
  }

  function buildThreadHref(uri: string | null) {
    return buildThreadOverlayRoute(location.pathname, location.search, uri);
  }

  return { buildThreadHref, closeThread, openThread, threadUri };
}

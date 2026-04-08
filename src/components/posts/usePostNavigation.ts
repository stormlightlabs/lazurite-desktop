import { TIMELINE_ROUTE } from "$/lib/feeds";
import { buildPostEngagementRoute, type PostEngagementTab } from "$/lib/post-engagement-routes";
import { buildPostRoute } from "$/lib/post-routes";
import { useNavigate } from "@solidjs/router";
import { useThreadOverlayNavigation } from "./useThreadOverlayNavigation";

export function usePostNavigation() {
  const navigate = useNavigate();
  const threadOverlay = useThreadOverlayNavigation();

  function openPost(uri: string) {
    return threadOverlay.openThread(uri);
  }

  function openPostScreen(uri: string) {
    return navigate(buildPostRoute(uri));
  }

  function openPostEngagement(uri: string, tab: PostEngagementTab) {
    return navigate(buildPostEngagementRoute(uri, tab));
  }

  function backFromPost() {
    if (globalThis.history.length > 1) {
      return navigate(-1);
    }

    return navigate(TIMELINE_ROUTE);
  }

  return { backFromPost, buildPostHref: threadOverlay.buildThreadHref, openPost, openPostEngagement, openPostScreen };
}

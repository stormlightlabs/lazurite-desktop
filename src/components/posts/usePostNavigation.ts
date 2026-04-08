import { TIMELINE_ROUTE } from "$/lib/feeds";
import { buildPostRoute } from "$/lib/post-routes";
import { useNavigate } from "@solidjs/router";

export function usePostNavigation() {
  const navigate = useNavigate();

  function openPost(uri: string) {
    return navigate(buildPostRoute(uri));
  }

  function backFromPost() {
    if (globalThis.history.length > 1) {
      return navigate(-1);
    }

    return navigate(TIMELINE_ROUTE);
  }

  return { backFromPost, buildPostHref: buildPostRoute, openPost };
}

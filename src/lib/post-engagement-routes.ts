import { buildPostRoute } from "$/lib/post-routes";

export type PostEngagementTab = "likes" | "reposts" | "quotes";

const POST_ENGAGEMENT_SEGMENT = "engagement";
const POST_ENGAGEMENT_TABS = new Set<PostEngagementTab>(["likes", "reposts", "quotes"]);
const POST_ENGAGEMENT_TAB_QUERY_PARAM = "tab";

export function buildPostEngagementRoute(uri: string, tab: PostEngagementTab = "likes") {
  const base = `${buildPostRoute(uri)}/${POST_ENGAGEMENT_SEGMENT}`;
  const params = new URLSearchParams();
  params.set(POST_ENGAGEMENT_TAB_QUERY_PARAM, tab);
  return `${base}?${params.toString()}`;
}

export function parsePostEngagementTab(search: string | null | undefined): PostEngagementTab {
  if (!search) {
    return "likes";
  }

  const raw = new URLSearchParams(search).get(POST_ENGAGEMENT_TAB_QUERY_PARAM);
  return isPostEngagementTab(raw) ? raw : "likes";
}

export function buildPostEngagementTabRoute(pathname: string, search: string, tab: PostEngagementTab) {
  const params = new URLSearchParams(search);
  params.set(POST_ENGAGEMENT_TAB_QUERY_PARAM, tab);
  const query = params.toString();
  return query ? `${pathname}?${query}` : pathname;
}

function isPostEngagementTab(value: string | null): value is PostEngagementTab {
  return !!value && POST_ENGAGEMENT_TABS.has(value as PostEngagementTab);
}

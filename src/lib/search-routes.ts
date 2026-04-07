import type { NetworkSearchSort, SearchMode } from "$/lib/api/types/search";

export type SearchTab = "posts" | "profiles";
const SEARCH_ROUTE = "/search";
const SEARCH_PREFLIGHT_ROUTE = "/search/preflight";

export type PostSearchFilters = {
  author: string;
  mentions: string;
  since: string;
  sort: NetworkSearchSort;
  tags: string[];
  until: string;
};

type SearchRouteState = PostSearchFilters & { mode: SearchMode; q: string; tab: SearchTab };

const CONTROLLED_POST_SEARCH_PARAMS = ["author", "mentions", "since", "sort", "tags", "until"] as const;
const SEARCH_ROUTE_DEFAULTS: SearchRouteState = {
  author: "",
  mentions: "",
  mode: "network",
  q: "",
  since: "",
  sort: "top",
  tab: "posts",
  tags: [],
  until: "",
};
const SEARCH_TABS = new Set<SearchTab>(["posts", "profiles"]);
const SEARCH_MODES = new Set<SearchMode>(["network", "keyword", "semantic", "hybrid"]);
const SEARCH_DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/u;

export function buildHashtagQuery(tag: string) {
  const normalized = normalizeTagToken(tag);
  return normalized ? `#${normalized}` : "#";
}

export function buildHashtagRoute(tag: string) {
  const normalized = normalizeTagToken(tag);
  return normalized ? `/hashtag/${encodeURIComponent(normalized)}` : "/search";
}

export function buildPostSearchRoute(pathname: string, search: string, filters: PostSearchFilters) {
  const params = new URLSearchParams(search);

  clearControlledParams(params, CONTROLLED_POST_SEARCH_PARAMS);
  setOptionalParam(params, "author", filters.author);
  setOptionalParam(params, "mentions", filters.mentions);
  setOptionalParam(params, "since", normalizeDateInput(filters.since));
  setOptionalParam(params, "until", normalizeDateInput(filters.until));

  if (filters.sort !== SEARCH_ROUTE_DEFAULTS.sort) {
    params.set("sort", filters.sort);
  }

  for (const tag of filters.tags.map((value) => normalizeTagToken(value)).filter(Boolean)) {
    params.append("tags", tag);
  }

  return buildRouteFromParams(pathname, params);
}

export function buildSearchRoute(pathname: string, search: string, state: SearchRouteState) {
  const params = new URLSearchParams(search);

  clearControlledParams(params, [...CONTROLLED_POST_SEARCH_PARAMS, "mode", "q", "tab"]);
  setOptionalParam(params, "q", state.q);

  if (state.tab !== SEARCH_ROUTE_DEFAULTS.tab) {
    params.set("tab", state.tab);
  }

  if (state.mode !== SEARCH_ROUTE_DEFAULTS.mode) {
    params.set("mode", state.mode);
  }

  return buildPostSearchRoute(pathname, params.toString(), state);
}

export function buildSearchPreflightRoute(next?: string | null) {
  const params = new URLSearchParams();
  const normalized = normalizeSearchReturnRoute(next);
  if (normalized) {
    params.set("next", normalized);
  }

  const search = params.toString();
  return search ? `${SEARCH_PREFLIGHT_ROUTE}?${search}` : SEARCH_PREFLIGHT_ROUTE;
}

export function decodeHashtagRouteTag(value?: string | null) {
  if (!value) {
    return null;
  }

  try {
    return normalizeTagToken(decodeURIComponent(value)) || null;
  } catch {
    return normalizeTagToken(value) || null;
  }
}

export function formatHashtagLabel(tag: string) {
  const normalized = normalizeTagToken(tag);
  return normalized ? `#${normalized}` : "#";
}

function normalizeDateInput(value?: string | null) {
  const trimmed = value?.trim() ?? "";
  if (!SEARCH_DATE_PATTERN.test(trimmed)) {
    return "";
  }

  const parsed = new Date(`${trimmed}T00:00:00`);
  if (Number.isNaN(parsed.getTime())) {
    return "";
  }

  const [year, month, day] = trimmed.split("-").map(Number);
  if (parsed.getFullYear() !== year || parsed.getMonth() + 1 !== month || parsed.getDate() !== day) {
    return "";
  }

  return trimmed;
}

export function normalizeTagToken(value?: string | null) {
  return value?.trim().replace(/^#+/u, "").trim() ?? "";
}

export function parsePostSearchFilters(search: string): PostSearchFilters {
  const params = new URLSearchParams(search);

  return {
    author: params.get("author")?.trim() ?? "",
    mentions: params.get("mentions")?.trim() ?? "",
    since: normalizeDateInput(params.get("since")),
    sort: params.get("sort") === "latest" ? "latest" : "top",
    tags: params.getAll("tags").map((value) => normalizeTagToken(value)).filter(Boolean),
    until: normalizeDateInput(params.get("until")),
  };
}

export function parseSearchRouteState(search: string): SearchRouteState {
  const params = new URLSearchParams(search);
  const tab = params.get("tab");
  const mode = params.get("mode");

  return {
    ...parsePostSearchFilters(search),
    mode: SEARCH_MODES.has(mode as SearchMode) ? (mode as SearchMode) : SEARCH_ROUTE_DEFAULTS.mode,
    q: params.get("q")?.trim() ?? "",
    tab: SEARCH_TABS.has(tab as SearchTab) ? (tab as SearchTab) : SEARCH_ROUTE_DEFAULTS.tab,
  };
}

export function normalizeSearchReturnRoute(value?: string | null) {
  const trimmed = value?.trim() ?? "";
  if (!trimmed.startsWith(SEARCH_ROUTE) || trimmed.startsWith(SEARCH_PREFLIGHT_ROUTE)) {
    return SEARCH_ROUTE;
  }

  return trimmed;
}

export function toLocalDayStartIso(value: string) {
  const normalized = normalizeDateInput(value);
  if (!normalized) {
    return null;
  }

  const [year, month, day] = normalized.split("-").map(Number);
  return new Date(year, month - 1, day).toISOString();
}

export function toLocalDayUntilIso(value: string) {
  const normalized = normalizeDateInput(value);
  if (!normalized) {
    return null;
  }

  const [year, month, day] = normalized.split("-").map(Number);
  return new Date(year, month - 1, day + 1).toISOString();
}

function buildRouteFromParams(pathname: string, params: URLSearchParams) {
  const nextSearch = params.toString();
  return nextSearch ? `${pathname}?${nextSearch}` : pathname;
}

function clearControlledParams(params: URLSearchParams, keys: readonly string[]) {
  for (const key of keys) {
    params.delete(key);
  }
}

function setOptionalParam(params: URLSearchParams, key: string, value: string) {
  const trimmed = value.trim();
  if (trimmed) {
    params.set(key, trimmed);
    return;
  }

  params.delete(key);
}

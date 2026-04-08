export const POST_ROUTE = "/post";
export const THREAD_DRAWER_PATHS = ["/timeline", "/notifications", "/deck"] as const;

export function buildPostRoute(uri: string) {
  return `${POST_ROUTE}/${encodeURIComponent(uri)}`;
}

export function isThreadDrawerPath(pathname: string): pathname is (typeof THREAD_DRAWER_PATHS)[number] {
  return (THREAD_DRAWER_PATHS as readonly string[]).includes(pathname);
}

export function decodePostRouteUri(value?: string | null) {
  if (!value) {
    return null;
  }

  try {
    const decoded = decodeURIComponent(value);
    return decoded.startsWith("at://") ? decoded : null;
  } catch {
    return null;
  }
}

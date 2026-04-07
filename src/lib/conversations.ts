const MESSAGES_ROUTE = "/messages";

export function buildMessagesRoute(memberDid?: string | null) {
  const trimmed = memberDid?.trim();
  if (!trimmed) {
    return MESSAGES_ROUTE;
  }

  return `${MESSAGES_ROUTE}/${encodeURIComponent(trimmed)}`;
}

export function decodeMessagesRouteMemberDid(value?: string | null) {
  if (!value) {
    return null;
  }

  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

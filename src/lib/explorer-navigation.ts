const PENDING_EXPLORER_TARGET_KEY = "lazurite:explorer:pending-target";

export function queueExplorerTarget(target: string) {
  const trimmed = target.trim();
  if (!trimmed || globalThis.window === undefined) {
    return;
  }

  globalThis.sessionStorage.setItem(PENDING_EXPLORER_TARGET_KEY, trimmed);
}

export function consumeQueuedExplorerTarget() {
  if (globalThis.window === undefined) {
    return null;
  }

  const target = globalThis.sessionStorage.getItem(PENDING_EXPLORER_TARGET_KEY);
  if (!target) {
    return null;
  }

  globalThis.sessionStorage.removeItem(PENDING_EXPLORER_TARGET_KEY);
  return target;
}

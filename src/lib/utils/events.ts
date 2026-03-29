export function shouldIgnoreKey(event: KeyboardEvent) {
  const element = event.target;
  if (!(element instanceof HTMLElement)) {
    return false;
  }

  return element.isContentEditable || ["INPUT", "TEXTAREA", "SELECT"].includes(element.tagName);
}

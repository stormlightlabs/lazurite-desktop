import { useLocation, useNavigate } from "@solidjs/router";
import { createEffect, createMemo, createSignal } from "solid-js";

export function useNavigationHistory() {
  const location = useLocation();
  const navigate = useNavigate();
  const [entries, setEntries] = createSignal<string[]>([]);
  const [index, setIndex] = createSignal(-1);
  const routeKey = createMemo(() => `${location.pathname}${location.search}`);

  createEffect(() => {
    const key = routeKey();
    const stack = entries();
    const currentIndex = index();

    if (stack.length === 0) {
      setEntries([key]);
      setIndex(0);
      return;
    }

    if (stack[currentIndex] === key) {
      return;
    }

    if (currentIndex > 0 && stack[currentIndex - 1] === key) {
      setIndex(currentIndex - 1);
      return;
    }

    if (currentIndex < stack.length - 1 && stack[currentIndex + 1] === key) {
      setIndex(currentIndex + 1);
      return;
    }

    const nextStack = [...stack.slice(0, currentIndex + 1), key];
    setEntries(nextStack);
    setIndex(nextStack.length - 1);
  });

  const canGoBack = createMemo(() => index() > 0);
  const canGoForward = createMemo(() => index() >= 0 && index() < entries().length - 1);

  function goBack() {
    if (!canGoBack()) {
      return;
    }

    void navigate(-1);
  }

  function goForward() {
    if (!canGoForward()) {
      return;
    }

    void navigate(1);
  }

  return { canGoBack, canGoForward, goBack, goForward };
}

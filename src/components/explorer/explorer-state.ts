import type { ExplorerState, ExplorerTargetKind, ExplorerViewState } from "$/lib/api/types/explorer";
import { createStore, produce } from "solid-js/store";

export type Crumb = { label: string; level: ExplorerTargetKind; active: boolean };

export function createExplorerState() {
  const [state, setState] = createStore<ExplorerState>({
    inputValue: "",
    current: null,
    history: [],
    historyIndex: -1,
    lexiconIcons: {},
  });

  function setInputValue(value: string) {
    setState("inputValue", value);
  }

  function pushView(viewState: ExplorerViewState) {
    setState(produce((draft) => {
      draft.history = draft.history.slice(0, draft.historyIndex + 1);
      draft.history.push(viewState);
      draft.historyIndex = draft.history.length - 1;
      draft.current = viewState;
    }));
  }

  function goBack(): boolean {
    if (state.historyIndex > 0) {
      setState(produce((draft) => {
        draft.historyIndex -= 1;
        draft.current = draft.history[draft.historyIndex];
      }));
      return true;
    }
    return false;
  }

  function goForward(): boolean {
    if (state.historyIndex < state.history.length - 1) {
      setState(produce((draft) => {
        draft.historyIndex += 1;
        draft.current = draft.history[draft.historyIndex];
      }));
      return true;
    }
    return false;
  }

  function goUp(): boolean {
    const current = state.current;
    if (!current || !current.resolved) return false;

    const resolved = current.resolved;
    if (resolved.targetKind === "record" && resolved.collection) {
      return true;
    } else if (resolved.targetKind === "collection") {
      return true;
    } else if (resolved.targetKind === "repo") {
      return true;
    }
    return false;
  }

  function canGoBack() {
    return state.historyIndex > 0;
  }

  function canGoForward() {
    return state.historyIndex < state.history.length - 1;
  }

  function mergeLexiconIcons(icons: Record<string, string | null>) {
    setState("lexiconIcons", (current) => ({ ...current, ...icons }));
  }

  function resetLexiconIcons() {
    setState("lexiconIcons", {});
  }

  function getBreadcrumb(): Crumb[] {
    const current = state.current;
    if (!current || !current.resolved) return [];

    const resolved = current.resolved;
    const crumbs: Crumb[] = [];

    if (resolved.pdsUrl) {
      crumbs.push({ label: "PDS", level: "pds", active: resolved.targetKind === "pds" });
    }

    if (resolved.did) {
      const handle = resolved.handle || resolved.did.slice(0, 20) + "...";
      crumbs.push({ label: handle, level: "repo", active: resolved.targetKind === "repo" });
    }

    if (resolved.collection) {
      const nsidParts = resolved.collection.split(".");
      const shortName = nsidParts.at(-1) || resolved.collection;
      crumbs.push({ label: shortName, level: "collection", active: resolved.targetKind === "collection" });
    }

    if (resolved.rkey) {
      crumbs.push({
        label: resolved.rkey.slice(0, 12) + "...",
        level: "record",
        active: resolved.targetKind === "record",
      });
    }

    if (crumbs.length > 0) {
      crumbs.at(-1)!.active = true;
    }

    return crumbs;
  }

  return {
    state,
    setState,
    setInputValue,
    pushView,
    goBack,
    goForward,
    goUp,
    canGoBack,
    canGoForward,
    mergeLexiconIcons,
    resetLexiconIcons,
    getBreadcrumb,
  };
}

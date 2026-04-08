import {
  createContext,
  createEffect,
  createMemo,
  onCleanup,
  onMount,
  type ParentProps,
  splitProps,
  untrack,
  useContext,
} from "solid-js";
import { createStore } from "solid-js/store";

const RAIL_COLLAPSED_STORAGE_KEY = "lazurite:rail-collapsed";
const RAIL_THEME_CONTROL_STORAGE_KEY = "lazurite:rail-theme-control";

type AppShellUiState = {
  narrowViewport: boolean;
  railCollapsed: boolean;
  showSwitcher: boolean;
  showThemeRailControl: boolean;
};

export type AppShellUiContextValue = {
  readonly narrowViewport: boolean;
  readonly railCollapsed: boolean;
  readonly railColumns: string;
  readonly railCondensed: boolean;
  readonly showThemeRailControl: boolean;
  readonly showSwitcher: boolean;
  closeSwitcher: () => void;
  setShowThemeRailControl: (enabled: boolean) => void;
  toggleRailCollapsed: () => void;
  toggleSwitcher: () => void;
};

const AppShellUiContext = createContext<AppShellUiContextValue>();

function createInitialAppShellUiState(): AppShellUiState {
  return { narrowViewport: false, railCollapsed: false, showSwitcher: false, showThemeRailControl: true };
}

function createAppShellUiValue(): AppShellUiContextValue {
  const [shell, setShell] = createStore<AppShellUiState>(createInitialAppShellUiState());

  const railCompact = createMemo(() => shell.railCollapsed && !shell.narrowViewport);
  const railCondensed = createMemo(() => railCompact() || shell.narrowViewport);
  const railColumns = createMemo(() => (railCompact() ? "5.75rem minmax(0,1fr)" : "16rem minmax(0,1fr)"));

  function closeSwitcher() {
    if (shell.showSwitcher) {
      setShell("showSwitcher", false);
    }
  }

  function toggleRailCollapsed() {
    setShell("railCollapsed", (collapsed) => !collapsed);
  }

  function toggleSwitcher() {
    setShell("showSwitcher", (open) => !open);
  }

  function setShowThemeRailControl(enabled: boolean) {
    setShell("showThemeRailControl", enabled);
  }

  onMount(() => {
    const media = globalThis.matchMedia("(max-width: 64rem)");
    const syncViewport = () => setShell("narrowViewport", media.matches);

    const stored = globalThis.localStorage.getItem(RAIL_COLLAPSED_STORAGE_KEY);
    if (stored === "true") {
      setShell("railCollapsed", true);
    }
    const storedThemeControl = globalThis.localStorage.getItem(RAIL_THEME_CONTROL_STORAGE_KEY);
    if (storedThemeControl === "false") {
      setShell("showThemeRailControl", false);
    }

    syncViewport();
    media.addEventListener("change", syncViewport);

    onCleanup(() => {
      media.removeEventListener("change", syncViewport);
    });
  });

  createEffect(() => {
    globalThis.localStorage.setItem(RAIL_COLLAPSED_STORAGE_KEY, shell.railCollapsed ? "true" : "false");
  });

  createEffect(() => {
    globalThis.localStorage.setItem(RAIL_THEME_CONTROL_STORAGE_KEY, shell.showThemeRailControl ? "true" : "false");
  });

  return {
    get narrowViewport() {
      return shell.narrowViewport;
    },
    get railCollapsed() {
      return shell.railCollapsed;
    },
    get railColumns() {
      return railColumns();
    },
    get railCondensed() {
      return railCondensed();
    },
    get showThemeRailControl() {
      return shell.showThemeRailControl;
    },
    get showSwitcher() {
      return shell.showSwitcher;
    },
    closeSwitcher,
    setShowThemeRailControl,
    toggleRailCollapsed,
    toggleSwitcher,
  };
}

export function AppShellUiProvider(props: ParentProps) {
  const value = createAppShellUiValue();

  return <AppShellUiContext.Provider value={value}>{props.children}</AppShellUiContext.Provider>;
}

export function AppShellUiContextProvider(props: ParentProps<{ value: AppShellUiContextValue }>) {
  const [local] = splitProps(props, ["children", "value"]);
  const value = untrack(() => local.value);

  return <AppShellUiContext.Provider value={value}>{local.children}</AppShellUiContext.Provider>;
}

export function useAppShellUi() {
  const context = useContext(AppShellUiContext);
  if (!context) {
    throw new Error("useAppShellUi must be used within an AppShellUiProvider");
  }

  return context;
}

import { AppPreferencesContextProvider, type AppPreferencesContextValue } from "$/contexts/app-preferences";
import { AppSessionContextProvider, type AppSessionContextValue } from "$/contexts/app-session";
import { AppShellUiContextProvider, type AppShellUiContextValue } from "$/contexts/app-shell-ui";
import type { AccountSummary, ActiveSession } from "$/lib/types";
import { type ParentProps, splitProps, untrack } from "solid-js";

const DEFAULT_SESSION: ActiveSession = { did: "did:plc:test", handle: "test.bsky.social" };

const DEFAULT_ACCOUNT: AccountSummary = {
  active: true,
  avatar: "https://example.com/avatar.png",
  did: DEFAULT_SESSION.did,
  handle: DEFAULT_SESSION.handle,
  pdsUrl: "https://pds.example.com",
};

function noop() {}

const DEFAULT_SETTINGS = {
  theme: "auto",
  timelineRefreshSecs: 60,
  notificationsDesktop: true,
  notificationsBadge: true,
  notificationsSound: false,
  embeddingsEnabled: true,
  constellationUrl: "https://constellation.microcosm.blue",
  spacedustUrl: "https://spacedust.microcosm.blue",
  spacedustInstant: false,
  spacedustEnabled: false,
  globalShortcut: "Ctrl+Shift+N",
};

const DEFAULT_EMBEDDINGS_CONFIG = {
  enabled: true,
  modelName: "nomic-embed-text-v1.5",
  dimensions: 768,
  downloaded: true,
  downloadActive: false,
};

export function createAppSessionTestValue(overrides: Partial<AppSessionContextValue> = {}): AppSessionContextValue {
  const accounts = overrides.accounts ?? [DEFAULT_ACCOUNT];
  const activeSession = overrides.activeSession === undefined ? DEFAULT_SESSION : overrides.activeSession;
  const activeAccount = overrides.activeAccount === undefined
    ? accounts.find((account) => account.did === activeSession?.did) ?? accounts[0] ?? null
    : overrides.activeAccount;
  const primaryAccount = overrides.primaryAccount === undefined
    ? activeAccount ?? accounts[0] ?? null
    : overrides.primaryAccount;

  return {
    accounts,
    activeAccount,
    activeAvatar: overrides.activeAvatar ?? activeAccount?.avatar ?? null,
    activeDid: overrides.activeDid ?? activeSession?.did ?? null,
    activeHandle: overrides.activeHandle ?? activeSession?.handle ?? null,
    activeSession,
    bootstrapping: overrides.bootstrapping ?? false,
    errorMessage: overrides.errorMessage ?? null,
    hasSession: overrides.hasSession ?? !!activeSession,
    loggingIn: overrides.loggingIn ?? false,
    loginValue: overrides.loginValue ?? "",
    logoutDid: overrides.logoutDid ?? null,
    metaLabel: overrides.metaLabel ?? (activeSession ? "connected" : "ready"),
    primaryAccount,
    reauthNeeded: overrides.reauthNeeded ?? false,
    shakeCount: overrides.shakeCount ?? 0,
    switchingDid: overrides.switchingDid ?? null,
    unreadNotifications: overrides.unreadNotifications ?? 0,
    clearError: overrides.clearError ?? noop,
    logout: overrides.logout ?? (async () => {}),
    markNotificationsSeen: overrides.markNotificationsSeen ?? noop,
    reauthorizePrimaryAccount: overrides.reauthorizePrimaryAccount ?? (async () => {}),
    reportError: overrides.reportError ?? noop,
    setLoginValue: overrides.setLoginValue ?? noop,
    submitLogin: overrides.submitLogin ?? (async () => {}),
    switchAccount: overrides.switchAccount ?? (async () => {}),
  };
}

export function createAppShellUiTestValue(overrides: Partial<AppShellUiContextValue> = {}): AppShellUiContextValue {
  return {
    narrowViewport: overrides.narrowViewport ?? false,
    railCollapsed: overrides.railCollapsed ?? false,
    railColumns: overrides.railColumns ?? "16rem minmax(0,1fr)",
    railCondensed: overrides.railCondensed ?? false,
    showSwitcher: overrides.showSwitcher ?? false,
    closeSwitcher: overrides.closeSwitcher ?? noop,
    toggleRailCollapsed: overrides.toggleRailCollapsed ?? noop,
    toggleSwitcher: overrides.toggleSwitcher ?? noop,
  };
}

export function createAppPreferencesTestValue(
  overrides: Partial<AppPreferencesContextValue> = {},
): AppPreferencesContextValue {
  return {
    embeddingsConfig: overrides.embeddingsConfig ?? DEFAULT_EMBEDDINGS_CONFIG,
    embeddingsEnabled: overrides.embeddingsEnabled ?? overrides.embeddingsConfig?.enabled
      ?? DEFAULT_EMBEDDINGS_CONFIG.enabled,
    embeddingsLoading: overrides.embeddingsLoading ?? false,
    settings: overrides.settings ?? DEFAULT_SETTINGS,
    settingsLoading: overrides.settingsLoading ?? false,
    loadEmbeddingsConfig: overrides.loadEmbeddingsConfig ?? (async () => {}),
    loadSettings: overrides.loadSettings ?? (async () => {}),
    prepareEmbeddingsModel: overrides.prepareEmbeddingsModel ?? (async () => {}),
    refresh: overrides.refresh ?? (async () => {}),
    setEmbeddingsEnabled: overrides.setEmbeddingsEnabled ?? (async () => {}),
    updateSetting: overrides.updateSetting ?? (async () => {}),
  };
}

export function AppTestProviders(
  props: ParentProps<
    {
      preferences?: Partial<AppPreferencesContextValue>;
      session?: Partial<AppSessionContextValue>;
      shell?: Partial<AppShellUiContextValue>;
    }
  >,
) {
  const [local] = splitProps(props, ["children", "preferences", "session", "shell"]);
  const preferencesValue = createAppPreferencesTestValue(untrack(() => local.preferences));
  const sessionValue = createAppSessionTestValue(untrack(() => local.session));
  const shellValue = createAppShellUiTestValue(untrack(() => local.shell));

  return (
    <AppPreferencesContextProvider value={preferencesValue}>
      <AppSessionContextProvider value={sessionValue}>
        <AppShellUiContextProvider value={shellValue}>{local.children}</AppShellUiContextProvider>
      </AppSessionContextProvider>
    </AppPreferencesContextProvider>
  );
}

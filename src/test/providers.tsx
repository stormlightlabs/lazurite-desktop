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

export function AppTestProviders(
  props: ParentProps<{ session?: Partial<AppSessionContextValue>; shell?: Partial<AppShellUiContextValue> }>,
) {
  const [local] = splitProps(props, ["children", "session", "shell"]);
  const sessionValue = createAppSessionTestValue(untrack(() => local.session));
  const shellValue = createAppShellUiTestValue(untrack(() => local.shell));

  return (
    <AppSessionContextProvider value={sessionValue}>
      <AppShellUiContextProvider value={shellValue}>{local.children}</AppShellUiContextProvider>
    </AppSessionContextProvider>
  );
}

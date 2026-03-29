import {
  getAppBootstrap,
  login as loginRequest,
  logout as logoutRequest,
  switchAccount as switchAccountRequest,
} from "$/lib/api/app";
import { listen } from "@tauri-apps/api/event";
import { createEffect, createMemo, onCleanup, onMount, Show, startTransition } from "solid-js";
import { createStore } from "solid-js/store";
import "@fontsource-variable/google-sans";
import "./App.css";
import type { ParentProps } from "solid-js";
import { AccountLedger } from "./components/account/AccountLedger";
import { AppRail } from "./components/AppRail";
import { FeedWorkspace } from "./components/feeds/FeedWorkspace";
import { LoginPanel } from "./components/LoginPanel";
import { HeaderPanel } from "./components/panels/Header";
import { SessionSpotlight } from "./components/Session";
import { ErrorToast } from "./components/shared/ErrorToast";
import type { AccountSummary, ActiveSession } from "./lib/types";
import { AppRouter } from "./router";

const ACCOUNT_SWITCH_EVENT = "auth:account-switched";

const RAIL_COLLAPSED_STORAGE_KEY = "lazurite:rail-collapsed";

type AppState = {
  accounts: AccountSummary[];
  activeSession: ActiveSession | null;
  bootstrapping: boolean;
  errorMessage: string | null;
  loggingIn: boolean;
  loginValue: string;
  logoutDid: string | null;
  narrowViewport: boolean;
  railCollapsed: boolean;
  reauthNeeded: boolean;
  shakeCount: number;
  showSwitcher: boolean;
  switchingDid: string | null;
};

function createInitialAppState(): AppState {
  return {
    accounts: [],
    activeSession: null,
    bootstrapping: true,
    errorMessage: null,
    loggingIn: false,
    loginValue: "",
    logoutDid: null,
    narrowViewport: false,
    railCollapsed: false,
    reauthNeeded: false,
    shakeCount: 0,
    showSwitcher: false,
    switchingDid: null,
  };
}

function App() {
  const [app, setApp] = createStore<AppState>(createInitialAppState());

  const activeAccount = createMemo(() =>
    app.accounts.find((account) => account.did === app.activeSession?.did) ?? null
  );
  const primaryAccount = createMemo(() => activeAccount() ?? app.accounts[0] ?? null);
  const hasSession = createMemo(() => !!app.activeSession);
  const railCompact = createMemo(() => app.railCollapsed && !app.narrowViewport);
  const railCondensed = createMemo(() => railCompact() || app.narrowViewport);
  const railColumns = createMemo(() => (railCompact() ? "5.75rem minmax(0,1fr)" : "16rem minmax(0,1fr)"));
  const metaLabel = createMemo(() => {
    if (app.bootstrapping) {
      return "reconnecting";
    }

    if (app.activeSession) {
      return "connected";
    }

    return "ready";
  });

  async function loadBootstrap() {
    setApp("bootstrapping", true);

    try {
      const payload = await getAppBootstrap();
      startTransition(() => {
        setApp("activeSession", payload.activeSession);
        setApp("accounts", payload.accountList);
        setApp("reauthNeeded", payload.accountList.length > 0 && !payload.activeSession);
      });
    } catch (error) {
      setApp("errorMessage", `Failed to load app bootstrap: ${String(error)}`);
    } finally {
      setApp("bootstrapping", false);
    }
  }

  function closeSwitcher() {
    if (app.showSwitcher) {
      setApp("showSwitcher", false);
    }
  }

  function triggerShake() {
    setApp("shakeCount", (count) => count + 1);
  }

  function markPotentialExpiry(error: unknown) {
    const message = String(error).toLowerCase();
    if (message.includes("refresh failed") || message.includes("session does not exist")) {
      setApp("reauthNeeded", true);
    }
  }

  async function submitLogin(identifier = app.loginValue) {
    const trimmed = identifier.trim();
    if (!validateIdentifier(trimmed)) {
      triggerShake();
      setApp("errorMessage", "Please enter a valid handle or DID.");
      return;
    }

    setApp("loggingIn", true);
    try {
      await loginRequest(trimmed);
      setApp("loginValue", "");
      closeSwitcher();
      await loadBootstrap();
    } catch (error) {
      markPotentialExpiry(error);
      setApp("errorMessage", `Authentication failed: ${String(error)}`);
    } finally {
      setApp("loggingIn", false);
    }
  }

  async function switchAccount(did: string) {
    setApp("switchingDid", did);
    try {
      await switchAccountRequest(did);
      closeSwitcher();
      await loadBootstrap();
    } catch (error) {
      markPotentialExpiry(error);
      setApp("errorMessage", `Failed to switch account: ${String(error)}`);
    } finally {
      setApp("switchingDid", null);
    }
  }

  async function logout(did: string) {
    setApp("logoutDid", did);
    try {
      await logoutRequest(did);
      closeSwitcher();
      await loadBootstrap();
    } catch (error) {
      markPotentialExpiry(error);
      setApp("errorMessage", `Failed to logout account: ${String(error)}`);
    } finally {
      setApp("logoutDid", null);
    }
  }

  async function reauthorizePrimaryAccount() {
    const account = primaryAccount();
    if (!account) {
      return;
    }

    await submitLogin(account.handle || account.did);
  }

  onMount(() => {
    let unlisten: (() => void) | undefined;
    const media = globalThis.matchMedia("(max-width: 1180px)");
    const syncViewport = () => setApp("narrowViewport", media.matches);

    const stored = globalThis.localStorage.getItem(RAIL_COLLAPSED_STORAGE_KEY);
    if (stored === "true") {
      setApp("railCollapsed", true);
    }

    syncViewport();
    media.addEventListener("change", syncViewport);

    void loadBootstrap();

    void listen<ActiveSession | null>(ACCOUNT_SWITCH_EVENT, () => {
      void loadBootstrap();
    }).then((dispose) => {
      unlisten = dispose;
    });

    onCleanup(() => {
      unlisten?.();
      media.removeEventListener("change", syncViewport);
    });
  });

  createEffect(() => {
    globalThis.localStorage.setItem(RAIL_COLLAPSED_STORAGE_KEY, app.railCollapsed ? "true" : "false");
  });

  function AppShell(props: ParentProps) {
    return (
      <>
        <main
          class="grid h-screen min-h-screen overflow-hidden grid-cols-(--app-rail-cols) transition-[grid-template-columns] duration-300 ease-out max-[1180px]:h-auto max-[1180px]:min-h-screen max-[1180px]:grid-cols-1 max-[1180px]:overflow-visible"
          style={{ "--app-rail-cols": railColumns() }}>
          <AppRail
            activeAccount={activeAccount()}
            activeSession={app.activeSession}
            accounts={app.accounts}
            collapsed={railCondensed()}
            hasSession={hasSession()}
            logoutDid={app.logoutDid}
            narrow={app.narrowViewport}
            openSwitcher={app.showSwitcher}
            onCloseSwitcher={closeSwitcher}
            switchingDid={app.switchingDid}
            onLogout={(did) => void logout(did)}
            onSwitch={(did) => void switchAccount(did)}
            onToggleCollapse={() => setApp("railCollapsed", (collapsed) => !collapsed)}
            onToggleSwitcher={() => setApp("showSwitcher", (open) => !open)} />

          <section
            class="m-5 grid min-h-0 overflow-hidden gap-6 rounded-2xl bg-surface p-6 shadow-[0_24px_40px_rgba(125,175,255,0.05)] max-[1360px]:p-6 max-[1180px]:m-0 max-[1180px]:min-h-[calc(100vh-4.75rem)] max-[1180px]:rounded-none max-[1180px]:p-5 max-[1180px]:overflow-visible max-[900px]:gap-5 max-[900px]:p-4 max-[640px]:gap-4 max-[640px]:p-3"
            aria-busy={app.bootstrapping}>
            {props.children}
          </section>
        </main>

        <ErrorToast message={app.errorMessage} onDismiss={() => setApp("errorMessage", null)} />
      </>
    );
  }

  return (
    <AppRouter
      bootstrapping={app.bootstrapping}
      hasSession={hasSession()}
      session={app.activeSession}
      onLocationChange={() => setApp("showSwitcher", false)}
      renderAuth={() => (
        <AuthWorkspace
          accounts={app.accounts}
          activeAccount={activeAccount()}
          activeSession={app.activeSession}
          activeDid={app.activeSession?.did ?? null}
          bootstrapping={app.bootstrapping}
          loggingIn={app.loggingIn}
          loginValue={app.loginValue}
          logoutDid={app.logoutDid}
          metaLabel={metaLabel()}
          reauthNeeded={app.reauthNeeded}
          shakeCount={app.shakeCount}
          switchingDid={app.switchingDid}
          onInput={(value) => setApp("loginValue", value)}
          onLogout={(did) => void logout(did)}
          onReauth={() => void reauthorizePrimaryAccount()}
          onSubmit={() => void submitLogin()}
          onSwitch={(did) => void switchAccount(did)} />
      )}
      renderShell={AppShell}
      renderTimeline={(session, context) => (
        <FeedWorkspace
          activeSession={session}
          onError={(message) => setApp("errorMessage", message)}
          onThreadRouteChange={context.onThreadRouteChange}
          threadUri={context.threadUri} />
      )} />
  );
}

function AuthWorkspace(
  props: {
    accounts: AccountSummary[];
    activeAccount: AccountSummary | null;
    activeSession: ActiveSession | null;
    activeDid: string | null;
    bootstrapping: boolean;
    loggingIn: boolean;
    loginValue: string;
    logoutDid: string | null;
    metaLabel: string;
    reauthNeeded: boolean;
    shakeCount: number;
    switchingDid: string | null;
    onInput: (value: string) => void;
    onLogout: (did: string) => void;
    onReauth: () => void;
    onSubmit: () => void;
    onSwitch: (did: string) => void;
  },
) {
  const hasAccounts = () => props.accounts.length > 0;
  const displayAccount = () => props.activeAccount ?? (props.reauthNeeded ? props.accounts[0] ?? null : null);

  return (
    <Show
      when={hasAccounts()}
      fallback={
        <div class="grid place-items-center py-8">
          <div class="w-full max-w-md">
            <LoginPanel
              value={props.loginValue}
              pending={props.loggingIn}
              shakeCount={props.shakeCount}
              onInput={props.onInput}
              onSubmit={props.onSubmit} />
          </div>
        </div>
      }>
      <>
        <HeaderPanel metaLabel={props.metaLabel} />
        <SessionSpotlight
          activeSession={props.activeSession}
          activeAccount={displayAccount()}
          bootstrapping={props.bootstrapping}
          reauthNeeded={props.reauthNeeded}
          onReauth={props.onReauth} />
        <AccountLedger
          accounts={props.accounts}
          activeDid={props.activeDid}
          busyDid={props.switchingDid}
          logoutDid={props.logoutDid}
          onSwitch={props.onSwitch}
          onLogout={props.onLogout} />
      </>
    </Show>
  );
}

function validateIdentifier(value: string) {
  const trimmed = value.trim();
  const handlePattern = /^@?[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?)+$/i;
  const didPattern = /^did:[a-z]+:[a-zA-Z0-9._:%-]+$/;
  const urlPattern = /^https?:\/\/\S+$/i;

  return handlePattern.test(trimmed) || didPattern.test(trimmed) || urlPattern.test(trimmed);
}

export default App;

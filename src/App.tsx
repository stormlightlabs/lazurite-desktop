import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { createMemo, createSignal, onCleanup, onMount, Show, startTransition } from "solid-js";
import "@fontsource-variable/google-sans";
import "./App.css";
import { AccountLedger } from "./components/AccountLedger";
import { AccountSwitcher } from "./components/AccountSwitcher";
import { FeedWorkspace } from "./components/feeds/FeedWorkspace";
import { LoginPanel } from "./components/LoginPanel";
import { HeaderPanel } from "./components/panels/Header";
import { RailButton } from "./components/RailButton";
import { SessionSpotlight } from "./components/Session";
import { ErrorToast } from "./components/shared/ErrorToast";
import { Wordmark } from "./components/Wordmark";
import type { AccountSummary, ActiveSession, AppBootstrap } from "./lib/types";

const ACCOUNT_SWITCH_EVENT = "auth:account-switched";

function App() {
  const [bootstrapping, setBootstrapping] = createSignal(true);
  const [activeSession, setActiveSession] = createSignal<ActiveSession | null>(null);
  const [accounts, setAccounts] = createSignal<AccountSummary[]>([]);
  const [loginValue, setLoginValue] = createSignal("");
  const [loggingIn, setLoggingIn] = createSignal(false);
  const [switchingDid, setSwitchingDid] = createSignal<string | null>(null);
  const [logoutDid, setLogoutDid] = createSignal<string | null>(null);
  const [showSwitcher, setShowSwitcher] = createSignal(false);
  const [errorMessage, setErrorMessage] = createSignal<string | null>(null);
  const [shakeCount, setShakeCount] = createSignal(0);
  const [reauthNeeded, setReauthNeeded] = createSignal(false);

  const activeAccount = createMemo(() => accounts().find((account) => account.did === activeSession()?.did) ?? null);
  const primaryAccount = createMemo(() => activeAccount() ?? accounts()[0] ?? null);
  const hasSession = createMemo(() => !!activeSession());
  const metaLabel = createMemo(() => {
    if (bootstrapping()) {
      return "signing you back in";
    }

    if (activeSession()) {
      return "signed in";
    }

    return "ready to sign in";
  });

  async function loadBootstrap() {
    setBootstrapping(true);

    try {
      const payload = await invoke<AppBootstrap>("get_app_bootstrap");
      startTransition(() => {
        setActiveSession(payload.activeSession);
        setAccounts(payload.accountList);
        setReauthNeeded(payload.accountList.length > 0 && !payload.activeSession);
      });
    } catch (error) {
      setErrorMessage(`Failed to load app bootstrap: ${String(error)}`);
    } finally {
      setBootstrapping(false);
    }
  }

  function closeSwitcher() {
    if (showSwitcher()) {
      setShowSwitcher(false);
    }
  }

  function triggerShake() {
    setShakeCount((count) => count + 1);
  }

  function markPotentialExpiry(error: unknown) {
    const message = String(error).toLowerCase();
    if (message.includes("refresh failed") || message.includes("session does not exist")) {
      setReauthNeeded(true);
    }
  }

  async function submitLogin(identifier = loginValue()) {
    const trimmed = identifier.trim();
    if (!validateIdentifier(trimmed)) {
      triggerShake();
      setErrorMessage("Enter a valid Bluesky handle, DID, or PDS URL.");
      return;
    }

    setLoggingIn(true);
    try {
      await invoke("login", { handle: trimmed });
      setLoginValue("");
      closeSwitcher();
      await loadBootstrap();
    } catch (error) {
      markPotentialExpiry(error);
      setErrorMessage(`Authentication failed: ${String(error)}`);
    } finally {
      setLoggingIn(false);
    }
  }

  async function switchAccount(did: string) {
    setSwitchingDid(did);
    try {
      await invoke("switch_account", { did });
      closeSwitcher();
      await loadBootstrap();
    } catch (error) {
      markPotentialExpiry(error);
      setErrorMessage(`Failed to switch account: ${String(error)}`);
    } finally {
      setSwitchingDid(null);
    }
  }

  async function logout(did: string) {
    setLogoutDid(did);
    try {
      await invoke("logout", { did });
      closeSwitcher();
      await loadBootstrap();
    } catch (error) {
      markPotentialExpiry(error);
      setErrorMessage(`Failed to logout account: ${String(error)}`);
    } finally {
      setLogoutDid(null);
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

    void loadBootstrap();

    void listen<ActiveSession | null>(ACCOUNT_SWITCH_EVENT, () => {
      void loadBootstrap();
    }).then((dispose) => {
      unlisten = dispose;
    });

    onCleanup(() => unlisten?.());
  });

  return (
    <>
      <main class="grid min-h-screen grid-cols-[16rem_minmax(0,1fr)] max-[1180px]:grid-cols-1">
        <aside
          class="flex min-h-screen flex-col gap-8 bg-surface-container-lowest px-6 pb-6 pt-8 max-[1180px]:min-h-0 max-[1180px]:grid max-[1180px]:grid-cols-[auto_auto_minmax(18rem,1fr)] max-[1180px]:items-center max-[1180px]:gap-4 max-[1180px]:p-4 max-[760px]:grid-cols-1"
          aria-label="Primary navigation">
          <Wordmark />
          <RailNavigation hasSession={hasSession()} />
          <AccountSwitcher
            activeSession={activeSession()}
            accounts={accounts()}
            busyDid={switchingDid()}
            logoutDid={logoutDid()}
            open={showSwitcher()}
            onToggle={() => setShowSwitcher((open) => !open)}
            onSwitch={(did) => void switchAccount(did)}
            onLogout={(did) => void logout(did)} />
        </aside>

        <section
          class="m-5 grid gap-8 rounded-4xl bg-[linear-gradient(160deg,rgba(14,14,14,0.92),rgba(25,25,25,0.98))] p-8 shadow-[0_24px_40px_rgba(125,175,255,0.05)] max-[1360px]:p-7 max-[1180px]:m-0 max-[1180px]:min-h-[calc(100vh-5.5rem)] max-[1180px]:rounded-none max-[1180px]:p-6 max-[760px]:gap-6 max-[760px]:p-5"
          aria-busy={bootstrapping()}>
          <Show
            when={activeSession()}
            keyed
            fallback={
              <AuthWorkspace
                accounts={accounts()}
                activeAccount={activeAccount()}
                activeDid={activeSession()?.did ?? null}
                bootstrapping={bootstrapping()}
                loggingIn={loggingIn()}
                loginValue={loginValue()}
                logoutDid={logoutDid()}
                metaLabel={metaLabel()}
                reauthNeeded={reauthNeeded()}
                shakeCount={shakeCount()}
                switchingDid={switchingDid()}
                onInput={setLoginValue}
                onLogout={(did) => void logout(did)}
                onReauth={() => void reauthorizePrimaryAccount()}
                onSubmit={() => void submitLogin()}
                onSwitch={(did) => void switchAccount(did)} />
            }>
            {(session) => <FeedWorkspace activeSession={session} onError={setErrorMessage} />}
          </Show>
        </section>
      </main>

      <ErrorToast message={errorMessage} onDismiss={() => setErrorMessage(null)} />
    </>
  );
}

function RailNavigation(props: { hasSession: boolean }) {
  return (
    <div class="grid gap-2 max-[1180px]:flex max-[1180px]:items-center">
      <Show when={props.hasSession} fallback={<RailButton label="Accounts" icon="profile" active />}>
        <>
          <RailButton label="Timeline" icon="timeline" active />
          <RailButton label="Search" icon="search" />
          <RailButton label="Notifications" icon="notifications" />
          <RailButton label="Explorer" icon="explorer" />
        </>
      </Show>
    </div>
  );
}

function AuthWorkspace(
  props: {
    accounts: AccountSummary[];
    activeAccount: AccountSummary | null;
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
  return (
    <>
      <HeaderPanel metaLabel={props.metaLabel} />
      <AuthHero
        activeAccount={props.activeAccount}
        bootstrapping={props.bootstrapping}
        loggingIn={props.loggingIn}
        loginValue={props.loginValue}
        reauthNeeded={props.reauthNeeded}
        shakeCount={props.shakeCount}
        onInput={props.onInput}
        onReauth={props.onReauth}
        onSubmit={props.onSubmit} />
      <AccountLedger
        accounts={props.accounts}
        activeDid={props.activeDid}
        busyDid={props.switchingDid}
        logoutDid={props.logoutDid}
        onSwitch={props.onSwitch}
        onLogout={props.onLogout} />
    </>
  );
}

function AuthHero(
  props: {
    activeAccount: AccountSummary | null;
    bootstrapping: boolean;
    loggingIn: boolean;
    loginValue: string;
    reauthNeeded: boolean;
    shakeCount: number;
    onInput: (value: string) => void;
    onReauth: () => void;
    onSubmit: () => void;
  },
) {
  return (
    <div class="grid gap-6 grid-cols-[minmax(0,1.25fr)_minmax(20rem,0.9fr)] max-[1320px]:grid-cols-1">
      <SessionSpotlight
        activeSession={props.activeAccount
          ? { did: props.activeAccount.did, handle: props.activeAccount.handle }
          : null}
        activeAccount={props.activeAccount}
        bootstrapping={props.bootstrapping}
        reauthNeeded={props.reauthNeeded}
        onReauth={props.onReauth} />
      <LoginPanel
        value={props.loginValue}
        pending={props.loggingIn}
        shakeCount={props.shakeCount}
        onInput={props.onInput}
        onSubmit={props.onSubmit} />
    </div>
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

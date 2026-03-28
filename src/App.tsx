import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { createEffect, createMemo, createSignal, For, onCleanup, onMount, Show, startTransition } from "solid-js";
import { Motion } from "solid-motionone";
import "@fontsource-variable/google-sans";
import "./App.css";
import { AccountSwitcher } from "./components/AccountSwitcher";
import { AvatarBadge } from "./components/AvatarBadge";
import { HeaderPanel } from "./components/panels/Header";
import { RailButton } from "./components/RailButton";
import { SessionSpotlight } from "./components/Session";
import { ErrorToast } from "./components/shared/ErrorToast";
import { Icon } from "./components/shared/Icon";
import { Wordmark } from "./components/Wordmark";
import type { AccountSummary, ActiveSession, AppBootstrap } from "./lib/types";

const ACCOUNT_SWITCH_EVENT = "auth:account-switched";

const panelTitleClass = "overline-copy text-[0.75rem] text-[color:var(--on-surface-variant)]";

const subtleTextClass = "m-0 text-[0.78rem] leading-[1.55] text-[color:var(--on-surface-variant)]";

const primaryButtonClass =
  "pill-action border-0 bg-[linear-gradient(135deg,var(--primary)_0%,var(--primary-dim)_100%)] text-[color:var(--on-primary-fixed)]";

const secondaryButtonClass = "pill-action border-0 bg-white/8 text-on-surface";

const ghostButtonClass = "pill-action border-0 bg-transparent text-[color:var(--on-surface-variant)]";

type LoginPanelProps = {
  value: string;
  pending: boolean;
  shakeCount: number;
  onInput: (value: string) => void;
  onSubmit: () => void;
};

function LoginPanel(props: LoginPanelProps) {
  let input: HTMLInputElement | undefined;

  createEffect(() => {
    if (props.shakeCount > 0) {
      input?.focus();
      input?.select();
    }
  });

  return (
    <article class="panel-surface grid gap-6 p-6">
      <div class="flex items-baseline justify-between gap-3">
        <p class={panelTitleClass}>Add account</p>
        <p class={subtleTextClass}>Enter the account you want to use.</p>
      </div>

      <Motion.form
        class="grid gap-4"
        initial={{ opacity: 0, y: 18 }}
        animate={{ opacity: 1, y: 0, x: props.shakeCount > 0 ? [0, -16, 10, -8, 0] : 0 }}
        transition={{ duration: props.shakeCount > 0 ? 0.42 : 0.24, easing: [0.22, 1, 0.36, 1] }}
        onSubmit={(event) => {
          event.preventDefault();
          props.onSubmit();
        }}>
        <label class="grid gap-[0.7rem]">
          <span class="overline-copy text-[0.76rem] tracking-[0.08em] text-on-surface-variant">
            Handle, DID, or URL
          </span>
          <input
            ref={(element) => {
              input = element;
            }}
            class="min-h-[3.4rem] w-full rounded-full border-0 bg-white/4 px-[1.15rem] text-on-surface shadow-[inset_0_0_0_1px_rgba(125,175,255,0.16)] focus:outline focus:outline-primary/50 focus:shadow-[inset_0_0_0_1px_rgba(125,175,255,0.35),0_0_28px_rgba(125,175,255,0.12)]"
            type="text"
            autocomplete="username"
            spellcheck={false}
            value={props.value}
            placeholder="alice.bsky.social"
            onInput={(event) => props.onInput(event.currentTarget.value)} />
        </label>
        <LoginSubmitButton pending={props.pending} />
      </Motion.form>
    </article>
  );
}

function LoginSubmitButton(props: { pending: boolean }) {
  return (
    <button class={primaryButtonClass} type="submit" disabled={props.pending}>
      <Show
        when={props.pending}
        fallback={
          <>
            <Icon kind="ext-link" name="ext-link" aria-hidden="true" class="mr-1" />
            <span>Continue</span>
          </>
        }>
        <>
          <Icon kind="loader" name="loader" aria-hidden="true" class="mr-1" />
          <span>Opening sign-in...</span>
        </>
      </Show>
    </button>
  );
}

type AccountLedgerProps = {
  accounts: AccountSummary[];
  activeDid: string | null;
  busyDid: string | null;
  logoutDid: string | null;
  onSwitch: (did: string) => void;
  onLogout: (did: string) => void;
};

function AccountLedger(props: AccountLedgerProps) {
  return (
    <article class="panel-surface grid gap-6 p-6">
      <div class="flex items-baseline justify-between gap-3">
        <p class={panelTitleClass}>Accounts</p>
        <p class={subtleTextClass}>{props.accounts.length} added</p>
      </div>

      <Show
        when={props.accounts.length > 0}
        fallback={
          <p class="overline-copy text-[0.72rem] text-on-surface-variant">Accounts you add will show up here.</p>
        }>
        <div class="grid gap-3" role="list">
          <For each={props.accounts}>
            {(account) => (
              <AccountLedgerCard
                account={account}
                activeDid={props.activeDid}
                busyDid={props.busyDid}
                logoutDid={props.logoutDid}
                onSwitch={props.onSwitch}
                onLogout={props.onLogout} />
            )}
          </For>
        </div>
      </Show>
    </article>
  );
}

function LogoutButton(
  props: { isSwitching: boolean; isLoggingOut: boolean; did: string; onLogout: (did: string) => void },
) {
  const isSwitching = () => props.isSwitching;
  const isLoggingOut = () => props.isLoggingOut;
  const did = () => props.did;
  return (
    <button
      class={ghostButtonClass}
      type="button"
      disabled={isSwitching() || isLoggingOut()}
      onClick={() => props.onLogout(did())}>
      <Show
        when={isLoggingOut()}
        fallback={
          <>
            <Icon kind="logout" name="logout" aria-hidden="true" />
            <span>Logout</span>
          </>
        }>
        <>
          <Icon kind="loader" name="loader" aria-hidden="true" />
          <span>Removing...</span>
        </>
      </Show>
    </button>
  );
}

function AccountSwitchButton(
  props: {
    isActive: boolean;
    switching: boolean;
    loggingOut: boolean;
    account: AccountSummary;
    onSwitch: (did: string) => void;
  },
) {
  const isActive = () => props.isActive;
  const switching = () => props.switching;
  const loggingOut = () => props.loggingOut;

  const content = createMemo(() => {
    const active = isActive();
    const isSwitching = switching();
    if (active) {
      return "Active";
    }

    if (isSwitching) {
      return "Switching...";
    }

    return "Switch";
  });
  return (
    <button
      class={secondaryButtonClass}
      type="button"
      disabled={isActive() || switching() || loggingOut()}
      onClick={() => props.onSwitch(props.account.did)}>
      <Show when={switching()} fallback={<Icon kind="user" name="user" aria-hidden="true" class="mr-1" />}>
        <Icon kind="loader" name="loader" aria-hidden="true" class="mr-1" />
        <span>{content()}</span>
      </Show>
    </button>
  );
}

type AccountLedgerCardProps = {
  account: AccountSummary;
  activeDid: string | null;
  busyDid: string | null;
  logoutDid: string | null;
  onSwitch: (did: string) => void;
  onLogout: (did: string) => void;
};

function AccountLedgerCard(props: AccountLedgerCardProps) {
  const isActive = () => props.activeDid === props.account.did;
  const switching = () => props.busyDid === props.account.did;
  const loggingOut = () => props.logoutDid === props.account.did;

  return (
    <Motion.div
      class="grid items-center gap-4 rounded-2xl bg-white/2.5 p-4 max-[920px]:grid-cols-1 grid-cols-[minmax(0,1fr)_auto]"
      classList={{ "bg-[linear-gradient(135deg,rgba(125,175,255,0.12),rgba(0,115,222,0.08))]": isActive() }}
      role="listitem"
      initial={{ opacity: 0, y: 18 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.24 }}>
      <div class="flex min-w-0 items-start gap-4">
        <AvatarBadge label={props.account.handle || props.account.did} tone={isActive() ? "primary" : "muted"} />
        <div class="min-w-0">
          <p class="m-0 wrap-break-word text-[0.92rem] font-semibold">{props.account.handle || props.account.did}</p>
          <p class="m-0 wrap-break-word text-[0.78rem] text-on-surface-variant">{props.account.did}</p>
          <p class="m-0 wrap-break-word text-[0.78rem] text-on-surface-variant">
            {props.account.pdsUrl || "PDS unavailable"}
          </p>
        </div>
      </div>

      <div class="flex items-center gap-2 max-[920px]:flex-col max-[920px]:items-stretch">
        <AccountSwitchButton
          isActive={isActive()}
          switching={switching()}
          loggingOut={loggingOut()}
          account={props.account}
          onSwitch={props.onSwitch} />
        <LogoutButton
          isSwitching={switching()}
          isLoggingOut={loggingOut()}
          did={props.account.did}
          onLogout={props.onLogout} />
      </div>
    </Motion.div>
  );
}

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
          <div class="grid gap-2 max-[1180px]:flex max-[1180px]:items-center">
            <RailButton label="Accounts" icon="profile" active />
            <RailButton label="Search" icon="search" />
          </div>
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
          <HeaderPanel metaLabel={metaLabel()} />

          <div class="grid gap-6 grid-cols-[minmax(0,1.25fr)_minmax(20rem,0.9fr)] max-[1320px]:grid-cols-1">
            <SessionSpotlight
              activeSession={activeSession()}
              activeAccount={activeAccount()}
              bootstrapping={bootstrapping()}
              reauthNeeded={reauthNeeded()}
              onReauth={() => void reauthorizePrimaryAccount()} />
            <LoginPanel
              value={loginValue()}
              pending={loggingIn()}
              shakeCount={shakeCount()}
              onInput={setLoginValue}
              onSubmit={() => void submitLogin()} />
          </div>

          <AccountLedger
            accounts={accounts()}
            activeDid={activeSession()?.did ?? null}
            busyDid={switchingDid()}
            logoutDid={logoutDid()}
            onSwitch={(did) => void switchAccount(did)}
            onLogout={(did) => void logout(did)} />
        </section>
      </main>

      <ErrorToast message={errorMessage} onDismiss={() => setErrorMessage(null)} />
    </>
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

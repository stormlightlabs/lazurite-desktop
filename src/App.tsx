import { invoke } from "@tauri-apps/api/core";
import { createSignal, For, onMount, Show } from "solid-js";
import "@fontsource-variable/google-sans";
import "./App.css";
import { ErrorToast } from "./components/ErrorToast";
import { AccountSummary, ActiveSession, AppBootstrap } from "./lib/types";

type RailButtonProps = { label: string; icon: string; active?: boolean };

function RailButton(props: RailButtonProps) {
  return (
    <button
      class="rail-button"
      classList={{ "rail-button--active": !!props.active }}
      type="button"
      aria-label={props.label}>
      <span class="flex items-center" aria-hidden="true">
        <i class={props.icon} />
      </span>
    </button>
  );
}

type SessionPanelProps = { activeSession: ActiveSession | null };

function SessionPanel(props: SessionPanelProps) {
  return (
    <article class="session-panel">
      <p class="panel-title">Active session</p>
      <Show
        when={props.activeSession}
        fallback={<p class="panel-copy">No active account yet. Authenticate to start syncing.</p>}>
        {(session) => (
          <p class="panel-copy">
            {session().handle}
            <span class="panel-subtle">{session().did}</span>
          </p>
        )}
      </Show>
    </article>
  );
}

type AccountsPanelProps = { accounts: AccountSummary[]; onActivate: (did: string) => void };

function AccountsPanel(props: AccountsPanelProps) {
  return (
    <article class="accounts-panel">
      <div class="accounts-head">
        <p class="panel-title">Known accounts</p>
        <p class="panel-copy">{props.accounts.length} loaded</p>
      </div>
      <div class="account-list" role="list">
        <Show when={props.accounts.length > 0} fallback={<p class="panel-copy">No accounts stored yet.</p>}>
          <For each={props.accounts}>
            {(account) => <AccountChip account={account} onActivate={props.onActivate} />}
          </For>
        </Show>
      </div>
    </article>
  );
}

type AccountChipProps = { account: AccountSummary; onActivate: (did: string) => void };

function AccountChip(props: AccountChipProps) {
  return (
    <button
      class="account-chip"
      classList={{ "account-chip--active": props.account.active }}
      type="button"
      role="listitem"
      onClick={() => props.onActivate(props.account.did)}>
      <span class="account-handle">{props.account.handle || props.account.did}</span>
      <span class="account-meta">{props.account.pdsUrl || "PDS unavailable"}</span>
    </button>
  );
}

function App() {
  const [bootstrapped, setBootstrapped] = createSignal(false);
  const [activeSession, setActiveSession] = createSignal<ActiveSession | null>(null);
  const [accounts, setAccounts] = createSignal<AccountSummary[]>([]);
  const [errorMessage, setErrorMessage] = createSignal<string | null>(null);

  async function loadBootstrap() {
    try {
      const payload = await invoke<AppBootstrap>("get_app_bootstrap");
      setActiveSession(payload.activeSession);
      setAccounts(payload.accountList);
      setBootstrapped(true);
    } catch (error) {
      setErrorMessage(`Failed to load app bootstrap: ${String(error)}`);
    }
  }

  async function activateAccount(did: string) {
    try {
      await invoke("set_active_account", { did });
      await loadBootstrap();
    } catch (error) {
      setErrorMessage(`Failed to switch account: ${String(error)}`);
    }
  }

  onMount(() => {
    void loadBootstrap();
  });

  return (
    <>
      <main class="app-shell">
        <aside class="app-rail" aria-label="Primary navigation">
          <RailButton label="Accounts" icon="i-ri-user-3-line" active />
          <RailButton label="Search" icon="i-ri-search-line" />
        </aside>

        <section class="work-surface" aria-busy={!bootstrapped()}>
          <header class="surface-header">
            <h1 class="headline">Lazurite</h1>
            <p class="meta">backend bootstrap complete</p>
          </header>

          <SessionPanel activeSession={activeSession()} />
          <AccountsPanel accounts={accounts()} onActivate={(did) => void activateAccount(did)} />
        </section>
      </main>

      <ErrorToast message={errorMessage} onDismiss={() => setErrorMessage(null)} />
    </>
  );
}

export default App;

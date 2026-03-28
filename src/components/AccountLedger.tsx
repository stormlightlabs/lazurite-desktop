import { AccountSummary } from "$/lib/types";
import { For, Show } from "solid-js";
import { Motion } from "solid-motionone";
import { AccountSwitchButton, LogoutButton } from "./AccountButtons";
import { AvatarBadge } from "./AvatarBadge";

type AccountLedgerProps = {
  accounts: AccountSummary[];
  activeDid: string | null;
  busyDid: string | null;
  logoutDid: string | null;
  onSwitch: (did: string) => void;
  onLogout: (did: string) => void;
};

export function AccountLedger(props: AccountLedgerProps) {
  return (
    <article class="panel-surface grid gap-6 p-6">
      <div class="flex items-baseline justify-between gap-3">
        <p class="overline-copy text-[0.75rem] text-on-surface-variant">Accounts</p>
        <p class="m-0 text-xs leading-[1.55] text-on-surface-variant">{props.accounts.length} added</p>
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
          <p class="m-0 wrap-break-word text-xs text-on-surface-variant">{props.account.did}</p>
          <p class="m-0 wrap-break-word text-xs text-on-surface-variant">{props.account.pdsUrl || "PDS unavailable"}</p>
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

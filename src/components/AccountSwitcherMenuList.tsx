import { For, Show } from "solid-js";
import { AccountSummary } from "../lib/types";
import { AccountSwitcherRow } from "./AccountSwitcherRow";

export function AccountSwitcherMenuList(
  props: {
    accounts: AccountSummary[];
    busyDid: string | null;
    logoutDid: string | null;
    onSwitch: (did: string) => void;
    onLogout: (did: string) => void;
  },
) {
  return (
    <Show
      when={props.accounts.length > 0}
      fallback={<p class="overline-copy mt-[0.9rem] text-xs text-on-surface-variant">No stored accounts yet.</p>}>
      <div class="mt-[0.9rem] grid gap-2">
        <For each={props.accounts}>
          {(account) => (
            <AccountSwitcherRow
              account={account}
              busy={props.busyDid === account.did}
              loggingOut={props.logoutDid === account.did}
              onSwitch={props.onSwitch}
              onLogout={props.onLogout} />
          )}
        </For>
      </div>
    </Show>
  );
}

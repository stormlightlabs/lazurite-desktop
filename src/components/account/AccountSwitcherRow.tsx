import { AvatarBadge } from "$/components/AvatarBadge";
import { Icon } from "$/components/shared/Icon";
import type { AccountSummary } from "$/lib/types";

type AccountSwitcherRowProps = {
  account: AccountSummary;
  busy: boolean;
  loggingOut: boolean;
  onSwitch: (did: string) => void;
  onLogout: (did: string) => void;
};

export function AccountSwitcherRow(props: AccountSwitcherRowProps) {
  const isLocked = () => props.busy || props.loggingOut;

  return (
    <div class="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-2" role="menuitem">
      <button
        class="flex min-w-0 items-center gap-3 rounded-2xl border-0 bg-white/2 p-3 text-left text-on-surface transition duration-150 ease-out hover:bg-surface-bright"
        classList={{ "bg-primary/15": props.account.active }}
        type="button"
        disabled={isLocked()}
        onClick={() => props.onSwitch(props.account.did)}>
        <AvatarBadge
          label={props.account.handle || props.account.did}
          src={props.account.avatar}
          tone={props.account.active ? "primary" : "muted"} />
        <span class="grid min-w-0">
          <span class="truncate text-[0.92rem] font-semibold">{props.account.handle || props.account.did}</span>
          <span class="text-xs text-on-surface-variant">{props.account.pdsUrl || "PDS unavailable"}</span>
        </span>
      </button>
      <button
        class="rounded-full border-0 bg-transparent p-[0.6rem] text-on-surface-variant transition duration-150 ease-out hover:bg-surface-bright"
        type="button"
        aria-label={`Logout ${props.account.handle || props.account.did}`}
        disabled={isLocked()}
        onClick={() => props.onLogout(props.account.did)}>
        <Icon kind="logout" name="logout" aria-hidden="true" />
      </button>
    </div>
  );
}

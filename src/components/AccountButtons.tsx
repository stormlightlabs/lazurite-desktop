import type { AccountSummary } from "$/lib/types";
import { createMemo, Show } from "solid-js";
import { Icon } from "./shared/Icon";

export function AccountSwitchButton(
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
      class="pill-action border-0 bg-white/8 text-on-surface"
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

export function LogoutButton(
  props: { isSwitching: boolean; isLoggingOut: boolean; did: string; onLogout: (did: string) => void },
) {
  const isSwitching = () => props.isSwitching;
  const isLoggingOut = () => props.isLoggingOut;
  const did = () => props.did;
  return (
    <button
      class="pill-action border-0 bg-transparent text-on-surface-variant"
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

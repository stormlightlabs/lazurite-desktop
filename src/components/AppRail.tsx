import type { AccountSummary, ActiveSession } from "$/lib/types";
import { Show } from "solid-js";
import { AccountSwitcher } from "./account/AccountSwitcher";
import { RailButton } from "./RailButton";
import { ArrowIcon } from "./shared/Icon";
import { Wordmark } from "./Wordmark";

function RailHeader(props: { collapsed: boolean; onToggleCollapse: () => void }) {
  return (
    <div
      class="flex shrink-0 items-center justify-between gap-3 max-[1180px]:min-w-0 max-[1180px]:justify-self-start"
      classList={{ "w-full flex-col gap-3": props.collapsed }}>
      <Wordmark compact={props.collapsed} iconClass="text-primary" />
      <button
        class="inline-flex h-10 w-10 items-center justify-center rounded-full border-0 bg-white/4 text-on-surface-variant shadow-[inset_0_0_0_1px_rgba(255,255,255,0.04)] transition duration-150 ease-out hover:-translate-y-px hover:bg-white/8 hover:text-on-surface max-[1180px]:hidden"
        type="button"
        aria-label={props.collapsed ? "Expand app rail" : "Collapse app rail"}
        aria-pressed={props.collapsed}
        onClick={() => props.onToggleCollapse()}>
        <Show when={props.collapsed} fallback={<ArrowIcon direction="left" />}>
          <ArrowIcon direction="right" />
        </Show>
      </button>
    </div>
  );
}

function RailNavigation(props: { collapsed: boolean; hasSession: boolean }) {
  return (
    <div class="grid gap-1 max-[1180px]:col-start-2 max-[1180px]:row-start-1 max-[1180px]:flex max-[1180px]:min-w-0 max-[1180px]:items-center max-[1180px]:gap-2 max-[1180px]:overflow-x-auto max-[1180px]:overscroll-contain max-[1180px]:[scrollbar-width:none] max-[1180px]:[&::-webkit-scrollbar]:hidden max-[760px]:col-start-auto max-[760px]:row-start-auto">
      <Show
        when={props.hasSession}
        fallback={<RailButton end compact={props.collapsed} href="/auth" label="Accounts" icon="profile" />}>
        <RailButton end compact={props.collapsed} href="/timeline" label="Timeline" icon="timeline" />
        <RailButton end compact={props.collapsed} href="/search" label="Search" icon="search" />
        <RailButton end compact={props.collapsed} href="/notifications" label="Notifications" icon="notifications" />
        <RailButton end compact={props.collapsed} href="/explorer" label="Explorer" icon="explorer" />
      </Show>
    </div>
  );
}

export function AppRail(
  props: {
    activeAccount: AccountSummary | null;
    activeSession: ActiveSession | null;
    accounts: AccountSummary[];
    collapsed: boolean;
    hasSession: boolean;
    logoutDid: string | null;
    narrow: boolean;
    openSwitcher: boolean;
    onCloseSwitcher: () => void;
    switchingDid: string | null;
    onLogout: (did: string) => void;
    onSwitch: (did: string) => void;
    onToggleCollapse: () => void;
    onToggleSwitcher: () => void;
  },
) {
  return (
    <aside
      class="flex min-h-screen min-w-0 flex-col gap-6 overflow-visible bg-surface-container-lowest px-6 pb-6 pt-6 transition-[padding,gap] duration-300 ease-out max-[1180px]:grid max-[1180px]:min-h-0 max-[1180px]:grid-cols-[auto_minmax(0,1fr)] max-[1180px]:items-center max-[1180px]:gap-x-4 max-[1180px]:gap-y-3 max-[1180px]:p-4 max-[760px]:grid-cols-1 max-[760px]:items-stretch"
      classList={{ "items-center px-4": props.collapsed && !props.narrow, "gap-5": props.collapsed && !props.narrow }}
      aria-label="Primary navigation">
      <RailHeader collapsed={props.collapsed} onToggleCollapse={props.onToggleCollapse} />
      <RailNavigation collapsed={props.collapsed} hasSession={props.hasSession} />
      <AccountSwitcher
        activeAccount={props.activeAccount}
        activeSession={props.activeSession}
        accounts={props.accounts}
        busyDid={props.switchingDid}
        compact={props.collapsed && !props.narrow}
        logoutDid={props.logoutDid}
        open={props.openSwitcher}
        onClose={props.onCloseSwitcher}
        onToggle={props.onToggleSwitcher}
        onSwitch={props.onSwitch}
        onLogout={props.onLogout} />
    </aside>
  );
}

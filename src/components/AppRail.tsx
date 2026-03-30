import { useAppSession } from "$/contexts/app-session";
import { useAppShellUi } from "$/contexts/app-shell-ui";
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

function RailNavigation(props: { collapsed: boolean; hasSession: boolean; unreadNotifications: number }) {
  return (
    <div class="grid gap-1 max-[1180px]:col-start-2 max-[1180px]:row-start-1 max-[1180px]:flex max-[1180px]:min-w-0 max-[1180px]:items-center max-[1180px]:gap-2 max-[1180px]:overflow-x-auto max-[1180px]:overscroll-contain max-[1180px]:[scrollbar-width:none] max-[1180px]:[&::-webkit-scrollbar]:hidden">
      <Show
        when={props.hasSession}
        fallback={<RailButton end compact={props.collapsed} href="/auth" label="Accounts" icon="profile" />}>
        <RailButton end compact={props.collapsed} href="/timeline" label="Timeline" icon="timeline" />
        <RailButton end compact={props.collapsed} href="/search" label="Search" icon="search" />
        <RailButton
          end
          badge={props.unreadNotifications}
          compact={props.collapsed}
          href="/notifications"
          label="Notifications"
          icon="notifications" />
        <RailButton end compact={props.collapsed} href="/explorer" label="AT Explorer" icon="explorer" />
        <RailButton end compact={props.collapsed} href="/settings" label="Settings" icon="settings" />
      </Show>
    </div>
  );
}

export function AppRail() {
  const session = useAppSession();
  const shell = useAppShellUi();

  return (
    <aside
      class="flex min-h-screen min-w-0 flex-col gap-6 overflow-visible bg-surface-container-lowest px-6 pb-6 pt-6 transition-[padding,gap] duration-300 ease-out max-[1180px]:grid max-[1180px]:min-h-0 max-[1180px]:grid-cols-[auto_minmax(0,1fr)_auto] max-[1180px]:items-center max-[1180px]:gap-x-4 max-[1180px]:gap-y-3 max-[1180px]:p-4"
      classList={{
        "items-center px-4": shell.railCondensed && !shell.narrowViewport,
        "gap-5": shell.railCondensed && !shell.narrowViewport,
      }}
      aria-label="Primary navigation">
      <RailHeader collapsed={shell.railCondensed} onToggleCollapse={shell.toggleRailCollapsed} />
      <RailNavigation
        collapsed={shell.railCondensed}
        hasSession={session.hasSession}
        unreadNotifications={session.unreadNotifications} />
      <AccountSwitcher />
    </aside>
  );
}

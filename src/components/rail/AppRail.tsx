import { useAppSession } from "$/contexts/app-session";
import { useAppShellUi } from "$/contexts/app-shell-ui";
import { useLocation, useNavigate } from "@solidjs/router";
import { openUrl } from "@tauri-apps/plugin-opener";
import { createEffect, createMemo, createSignal, Show } from "solid-js";
import { AccountSwitcher } from "../account/AccountSwitcher";
import { ArrowIcon, RailFoldIcon } from "../shared/Icon";
import { Wordmark } from "../Wordmark";
import { RailActionButton, RailButton } from "./AppRailButton";

function RailHeader(
  props: {
    canGoBack: boolean;
    canGoForward: boolean;
    collapsed: boolean;
    onGoBack: () => void;
    onGoForward: () => void;
    onToggleCollapse: () => void;
  },
) {
  return (
    <>
      <div
        class="flex shrink-0 items-center justify-between gap-3 max-[1180px]:min-w-0 max-[1180px]:justify-self-start"
        classList={{ "w-full flex-col gap-3": props.collapsed }}>
        <Wordmark compact={props.collapsed} iconClass="text-primary" />

        <div>
          <button
            class="inline-flex h-10 w-10 items-center justify-center rounded-full border-0 bg-white/4 text-on-surface-variant shadow-[inset_0_0_0_1px_rgba(255,255,255,0.04)] transition duration-150 ease-out hover:-translate-y-px hover:bg-white/8 hover:text-on-surface"
            type="button"
            aria-label={props.collapsed ? "Expand app rail" : "Collapse app rail"}
            aria-pressed={props.collapsed}
            onClick={() => props.onToggleCollapse()}>
            <RailFoldIcon kind={props.collapsed ? "open" : "close"} />
          </button>
        </div>
      </div>
      <div class="flex items-center gap-2 max-[1180px]:hidden">
        <button
          class="inline-flex h-10 w-10 items-center justify-center rounded-full border-0 bg-white/4 text-on-surface-variant shadow-[inset_0_0_0_1px_rgba(255,255,255,0.04)] transition duration-150 ease-out hover:-translate-y-px hover:bg-white/8 hover:text-on-surface disabled:translate-y-0 disabled:cursor-not-allowed disabled:opacity-45 disabled:hover:bg-white/4"
          type="button"
          aria-label="Back"
          disabled={!props.canGoBack}
          onClick={() => props.onGoBack()}>
          <ArrowIcon direction="left" />
        </button>

        <button
          class="inline-flex h-10 w-10 items-center justify-center rounded-full border-0 bg-white/4 text-on-surface-variant shadow-[inset_0_0_0_1px_rgba(255,255,255,0.04)] transition duration-150 ease-out hover:-translate-y-px hover:bg-white/8 hover:text-on-surface disabled:translate-y-0 disabled:cursor-not-allowed disabled:opacity-45 disabled:hover:bg-white/4"
          type="button"
          aria-label="Forward"
          disabled={!props.canGoForward}
          onClick={() => props.onGoForward()}>
          <ArrowIcon direction="right" />
        </button>
      </div>
    </>
  );
}

function useShellHistoryTracker() {
  const location = useLocation();
  const navigate = useNavigate();
  const [entries, setEntries] = createSignal<string[]>([]);
  const [index, setIndex] = createSignal(-1);
  const routeKey = createMemo(() => `${location.pathname}${location.search}`);

  createEffect(() => {
    const key = routeKey();
    const stack = entries();
    const currentIndex = index();

    if (stack.length === 0) {
      setEntries([key]);
      setIndex(0);
      return;
    }

    if (stack[currentIndex] === key) {
      return;
    }

    if (currentIndex > 0 && stack[currentIndex - 1] === key) {
      setIndex(currentIndex - 1);
      return;
    }

    if (currentIndex < stack.length - 1 && stack[currentIndex + 1] === key) {
      setIndex(currentIndex + 1);
      return;
    }

    const nextStack = [...stack.slice(0, currentIndex + 1), key];
    setEntries(nextStack);
    setIndex(nextStack.length - 1);
  });

  const canGoBack = createMemo(() => index() > 0);
  const canGoForward = createMemo(() => index() >= 0 && index() < entries().length - 1);

  function goBack() {
    if (!canGoBack()) {
      return;
    }

    void navigate(-1);
  }

  function goForward() {
    if (!canGoForward()) {
      return;
    }

    void navigate(1);
  }

  return { canGoBack, canGoForward, goBack, goForward };
}

function RailNavigation(props: { collapsed: boolean; hasSession: boolean; unreadNotifications: number }) {
  return (
    <div class="grid gap-1 max-[1180px]:col-start-2 max-[1180px]:row-start-1 max-[1180px]:flex max-[1180px]:min-w-0 max-[1180px]:items-center max-[1180px]:gap-2 max-[1180px]:overflow-x-auto max-[1180px]:overscroll-contain max-[1180px]:[scrollbar-width:none] max-[1180px]:[&::-webkit-scrollbar]:hidden">
      <Show
        when={props.hasSession}
        fallback={<RailButton end compact={props.collapsed} href="/auth" label="Accounts" icon="profile" />}>
        <RailButton end compact={props.collapsed} href="/timeline" label="Timeline" icon="timeline" />
        <RailButton compact={props.collapsed} href="/profile" label="Profile" icon="profile" />
        <RailButton end compact={props.collapsed} href="/search" label="Search" icon="search" />
        <RailButton end compact={props.collapsed} href="/saved" label="Saved" icon="bookmark" />
        <RailButton
          end
          badge={props.unreadNotifications}
          compact={props.collapsed}
          href="/notifications"
          label="Notifications"
          icon="notifications" />
        <RailButton end compact={props.collapsed} href="/messages" label="Messages" icon="messages" />
        <RailButton end compact={props.collapsed} href="/deck" label="Deck" icon="deck" />
        <RailButton end compact={props.collapsed} href="/explorer" label="AT Explorer" icon="explorer" />
        <RailButton end compact={props.collapsed} href="/settings" label="Settings" icon="settings" />
      </Show>
    </div>
  );
}

function RailSecondaryActions(props: { collapsed: boolean }) {
  return (
    <div class="grid gap-1 max-[1180px]:col-span-full max-[1180px]:grid-flow-col max-[1180px]:justify-start">
      <RailActionButton
        compact={props.collapsed}
        icon="heart"
        label="Support"
        onClick={() => void openUrl("https://github.com/sponsors/desertthunder")} />
    </div>
  );
}

export function AppRail() {
  const session = useAppSession();
  const shell = useAppShellUi();
  const history = useShellHistoryTracker();

  return (
    <aside
      class="flex min-h-screen min-w-0 flex-col gap-6 overflow-visible bg-surface-container-lowest px-6 pb-6 pt-6 transition-[padding,gap] duration-300 ease-out max-[1180px]:grid max-[1180px]:min-h-0 max-[1180px]:grid-cols-[auto_minmax(0,1fr)_auto] max-[1180px]:items-center max-[1180px]:gap-x-4 max-[1180px]:gap-y-3 max-[1180px]:p-4"
      classList={{
        "items-center px-4": shell.railCondensed && !shell.narrowViewport,
        "gap-5": shell.railCondensed && !shell.narrowViewport,
      }}
      aria-label="Primary navigation">
      <RailHeader
        canGoBack={history.canGoBack()}
        canGoForward={history.canGoForward()}
        collapsed={shell.railCondensed}
        onGoBack={history.goBack}
        onGoForward={history.goForward}
        onToggleCollapse={shell.toggleRailCollapsed} />
      <RailNavigation
        collapsed={shell.railCondensed}
        hasSession={session.hasSession}
        unreadNotifications={session.unreadNotifications} />
      <div class="mt-auto grid gap-3 max-[1180px]:contents">
        <RailSecondaryActions collapsed={shell.railCondensed} />
        <AccountSwitcher />
      </div>
    </aside>
  );
}

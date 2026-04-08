import { useAppPreferences } from "$/contexts/app-preferences";
import { useAppSession } from "$/contexts/app-session";
import { useAppShellUi } from "$/contexts/app-shell-ui";
import { useNavigationHistory } from "$/lib/navigation-history";
import { normalizeThemeSetting } from "$/lib/theme";
import type { Theme } from "$/lib/types";
import { useLocation } from "@solidjs/router";
import { openUrl } from "@tauri-apps/plugin-opener";
import { createEffect, createMemo, createSignal, For, onCleanup, onMount, Show } from "solid-js";
import { AccountSwitcher } from "../account/AccountSwitcher";
import { HistoryControls } from "../shared/HistoryControls";
import { Icon, RailFoldIcon } from "../shared/Icon";
import { Wordmark } from "../Wordmark";
import { RailActionButton, RailButton } from "./AppRailButton";

function RailHeader(props: { collapsed: boolean; onToggleCollapse: () => void }) {
  return (
    <>
      <div
        class="flex shrink-0 items-center justify-between gap-3 max-lg:min-w-0 max-lg:justify-self-start"
        classList={{ "w-full flex-col gap-3": props.collapsed }}>
        <Wordmark compact={props.collapsed} iconClass="text-primary" />

        <div class="max-lg:hidden">
          <button
            class="ui-control ui-control-hoverable inline-flex h-10 w-10 items-center justify-center rounded-full"
            type="button"
            aria-label={props.collapsed ? "Expand app rail" : "Collapse app rail"}
            aria-pressed={props.collapsed}
            onClick={() => props.onToggleCollapse()}>
            <RailFoldIcon kind={props.collapsed ? "open" : "close"} />
          </button>
        </div>
      </div>
    </>
  );
}

function OverflowMenuButton(props: { hasSession: boolean }) {
  const [open, setOpen] = createSignal(false);
  const [menuPos, setMenuPos] = createSignal({ top: 0, left: 0 });
  const location = useLocation();
  let containerRef: HTMLDivElement | undefined;
  let buttonRef: HTMLButtonElement | undefined;

  const isOverflowActive = createMemo(() =>
    ["/saved", "/deck", "/explorer", "/settings"].some((p) => location.pathname.startsWith(p))
  );

  createEffect(() => {
    void `${location.pathname}${location.search}`;
    setOpen(false);
  });

  function onOutsideClick(e: MouseEvent) {
    if (containerRef && !containerRef.contains(e.target as Node)) {
      setOpen(false);
    }
  }
  function onResize() {
    setOpen(false);
  }

  onMount(() => {
    document.addEventListener("mousedown", onOutsideClick);
    window.addEventListener("resize", onResize);
    onCleanup(() => {
      document.removeEventListener("mousedown", onOutsideClick);
      window.removeEventListener("resize", onResize);
    });
  });

  function handleToggle() {
    if (!open() && buttonRef) {
      const rect = buttonRef.getBoundingClientRect();
      const preferredLeft = rect.left;
      const maxLeft = window.innerWidth - 208;
      setMenuPos({ top: rect.bottom + 8, left: Math.max(8, Math.min(preferredLeft, maxLeft)) });
    }
    setOpen((v) => !v);
  }

  return (
    <div ref={el => (containerRef = el)}>
      <button
        ref={el => (buttonRef = el)}
        type="button"
        aria-label="More navigation"
        aria-expanded={open()}
        aria-haspopup="menu"
        onClick={handleToggle}
        class="relative flex h-11 w-11 shrink-0 items-center justify-center rounded-lg border-0 bg-transparent text-on-surface-variant transition duration-150 ease-out hover:bg-surface-bright hover:text-on-surface"
        classList={{ "bg-surface-container text-primary": open() || isOverflowActive() }}>
        <span class="flex items-center">
          <i class="i-ri-more-2-line text-[1.25rem]" />
        </span>
      </button>
      <Show when={open()}>
        <div
          role="menu"
          style={{ position: "fixed", top: `${menuPos().top}px`, left: `${menuPos().left}px` }}
          class="ui-overlay-card z-50 min-w-48 rounded-xl border ui-outline-subtle bg-surface-container p-1.5 backdrop-blur-[20px]">
          <Show when={props.hasSession}>
            <RailButton end compact={false} href="/saved" label="Saved" icon="bookmark" />
            <RailButton end compact={false} href="/deck" label="Deck" icon="deck" />
            <RailButton end compact={false} href="/explorer" label="AT Explorer" icon="explorer" />
            <RailButton end compact={false} href="/settings" label="Settings" icon="settings" />
            <hr class="my-1 border ui-outline-subtle" />
            <RailActionButton
              compact
              icon="heart"
              label="Support"
              onClick={() => void openUrl("https://github.com/sponsors/desertthunder")} />
          </Show>
        </div>
      </Show>
    </div>
  );
}

function RailNavigation(
  props: { collapsed: boolean; hasSession: boolean; narrow: boolean; unreadNotifications: number },
) {
  const useOverflowMenu = () => props.narrow || props.collapsed;

  return (
    <div class="grid gap-1 max-lg:flex max-lg:min-w-0 max-lg:flex-1 max-lg:items-center max-lg:gap-2 max-lg:overflow-x-auto max-lg:overscroll-contain max-lg:[scrollbar-width:none] max-lg:[&::-webkit-scrollbar]:hidden">
      <Show
        when={props.hasSession}
        fallback={<RailButton end compact={props.collapsed} href="/auth" label="Accounts" icon="profile" />}>
        <RailButton end compact={props.collapsed} href="/timeline" label="Timeline" icon="timeline" />
        <RailButton compact={props.collapsed} href="/profile" label="Profile" icon="profile" />
        <RailButton end compact={props.collapsed} href="/search" label="Search" icon="search" />
        <Show when={!useOverflowMenu()}>
          <RailButton end compact={props.collapsed} href="/saved" label="Saved" icon="bookmark" />
        </Show>
        <RailButton
          end
          badge={props.unreadNotifications}
          compact={props.collapsed}
          href="/notifications"
          label="Notifications"
          icon="notifications" />
        <RailButton end compact={props.collapsed} href="/messages" label="Messages" icon="messages" />
        <Show
          when={useOverflowMenu()}
          fallback={
            <>
              <RailButton end compact={props.collapsed} href="/deck" label="Deck" icon="deck" />
              <RailButton end compact={props.collapsed} href="/explorer" label="AT Explorer" icon="explorer" />
              <RailButton end compact={props.collapsed} href="/settings" label="Settings" icon="settings" />
            </>
          }>
          <OverflowMenuButton hasSession={props.hasSession} />
        </Show>
      </Show>
    </div>
  );
}

const RAIL_THEME_OPTIONS: Array<{ value: Theme; label: string; iconClass: string }> = [
  { value: "auto", label: "System", iconClass: "i-ri-computer-line" },
  { value: "light", label: "Light", iconClass: "i-ri-sun-line" },
  { value: "dark", label: "Dark", iconClass: "i-ri-moon-clear-line" },
];

function iconClassForTheme(theme: Theme) {
  return RAIL_THEME_OPTIONS.find((option) => option.value === theme)?.iconClass ?? "i-ri-computer-line";
}

function RailThemeMenu(
  props: { collapsed: boolean; currentTheme: Theme; onChangeTheme: (theme: Theme) => Promise<void> },
) {
  const [open, setOpen] = createSignal(false);
  const [menuPos, setMenuPos] = createSignal({ top: 0, left: 0 });
  const compact = () => props.collapsed;
  let containerRef: HTMLDivElement | undefined;
  let buttonRef: HTMLButtonElement | undefined;

  function closeMenu() {
    setOpen(false);
  }

  function onOutsideClick(event: MouseEvent) {
    if (containerRef && !containerRef.contains(event.target as Node)) {
      closeMenu();
    }
  }

  function onResize() {
    closeMenu();
  }

  onMount(() => {
    document.addEventListener("mousedown", onOutsideClick);
    window.addEventListener("resize", onResize);

    onCleanup(() => {
      document.removeEventListener("mousedown", onOutsideClick);
      window.removeEventListener("resize", onResize);
    });
  });

  function handleToggle() {
    if (!open() && buttonRef) {
      const rect = buttonRef.getBoundingClientRect();
      const preferredLeft = rect.left;
      const maxLeft = window.innerWidth - 176;
      setMenuPos({ top: rect.bottom + 8, left: Math.max(8, Math.min(preferredLeft, maxLeft)) });
    }

    setOpen((value) => !value);
  }

  async function handleSelect(theme: Theme) {
    await props.onChangeTheme(theme);
    closeMenu();
  }

  return (
    <div
      ref={el => (containerRef = el)}
      class="relative flex"
      classList={{ "w-full": !compact(), "justify-center": compact() }}>
      <button
        ref={el => (buttonRef = el)}
        type="button"
        aria-label="Theme menu"
        aria-expanded={open()}
        aria-haspopup="menu"
        onClick={handleToggle}
        class="relative flex h-11 shrink-0 items-center gap-2.5 rounded-lg border-0 bg-transparent text-on-surface-variant no-underline transition duration-150 ease-out hover:-translate-y-px hover:bg-surface-bright hover:text-on-surface"
        classList={{
          "w-[2.75rem] justify-center": compact(),
          "w-full justify-start px-3": !compact(),
          "bg-surface-container text-primary": open(),
        }}>
        <Icon iconClass={iconClassForTheme(props.currentTheme)} class="shrink-0 text-[1.25rem]" />
        <Show when={!compact()}>
          <span class="text-sm font-medium leading-none">Theme</span>
        </Show>
      </button>

      <Show when={open()}>
        <div
          role="menu"
          style={{ position: "fixed", top: `${menuPos().top}px`, left: `${menuPos().left}px` }}
          class="ui-overlay-card z-50 min-w-40 rounded-xl border ui-outline-subtle bg-surface-container p-1.5 backdrop-blur-[20px]">
          <For each={RAIL_THEME_OPTIONS}>
            {(option) => (
              <button
                type="button"
                role="menuitemradio"
                aria-checked={props.currentTheme === option.value}
                class="flex w-full items-center gap-2 rounded-lg border-0 bg-transparent px-3 py-2 text-left text-sm transition duration-150"
                classList={{
                  "bg-surface-bright text-primary": props.currentTheme === option.value,
                  "text-on-surface-variant hover:bg-surface-bright hover:text-on-surface":
                    props.currentTheme !== option.value,
                }}
                onClick={() => void handleSelect(option.value)}>
                <Icon iconClass={option.iconClass} />
                <span>{option.label}</span>
              </button>
            )}
          </For>
        </div>
      </Show>
    </div>
  );
}

function RailSecondaryActions(props: { collapsed: boolean }) {
  return (
    <div class="grid gap-1 max-lg:hidden max-lg:col-span-full max-lg:grid-flow-col max-lg:justify-start">
      <RailActionButton
        compact={props.collapsed}
        icon="heart"
        label="Support"
        onClick={() => void openUrl("https://github.com/sponsors/desertthunder")} />
    </div>
  );
}

export function AppRail() {
  const preferences = useAppPreferences();
  const session = useAppSession();
  const shell = useAppShellUi();
  const history = useNavigationHistory();
  const currentTheme = createMemo(() => normalizeThemeSetting(preferences.settings?.theme));

  async function handleChangeTheme(theme: Theme) {
    await preferences.updateSetting("theme", theme);
  }

  return (
    <aside
      class="flex min-h-screen min-w-0 flex-col gap-6 overflow-visible bg-surface-container-lowest px-6 pb-6 pt-6 transition-[padding,gap] duration-300 ease-out max-lg:grid max-lg:min-h-0 max-lg:grid-cols-[auto_minmax(0,1fr)_auto_auto_auto] max-lg:items-center max-lg:gap-x-4 max-lg:gap-y-3 max-lg:p-4"
      classList={{
        "items-center px-4": shell.railCondensed && !shell.narrowViewport,
        "gap-5": shell.railCondensed && !shell.narrowViewport,
      }}
      aria-label="Primary navigation">
      <RailHeader collapsed={shell.railCondensed} onToggleCollapse={shell.toggleRailCollapsed} />
      <RailNavigation
        collapsed={shell.railCondensed}
        hasSession={session.hasSession}
        narrow={shell.narrowViewport}
        unreadNotifications={session.unreadNotifications} />
      <div class="mt-auto grid gap-2 max-lg:contents">
        <Show when={!shell.railCondensed}>
          <RailSecondaryActions collapsed={shell.railCondensed} />
        </Show>
        <Show when={shell.showThemeRailControl}>
          <RailThemeMenu
            collapsed={shell.railCondensed}
            currentTheme={currentTheme()}
            onChangeTheme={handleChangeTheme} />
        </Show>
        <div class="flex items-center gap-1" classList={{ "w-full justify-center": shell.railCondensed }}>
          <HistoryControls
            canGoBack={history.canGoBack()}
            canGoForward={history.canGoForward()}
            onGoBack={history.goBack}
            onGoForward={history.goForward} />
        </div>
        <AccountSwitcher />
      </div>
    </aside>
  );
}

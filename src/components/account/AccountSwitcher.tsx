import { ArrowIcon } from "$/components/shared/Icon";
import { useAppSession } from "$/contexts/app-session";
import { useAppShellUi } from "$/contexts/app-shell-ui";
import { createMemo, onCleanup, onMount, Show } from "solid-js";
import { SwitcherIdentity } from "./AccountSwitcherIdentity";
import { AccountSwitcherMenuList } from "./AccountSwitcherMenuList";
import type { AccountIdentity } from "./types";

export function AccountSwitcher() {
  const session = useAppSession();
  const shell = useAppShellUi();
  const previewAccount = createMemo(() => session.activeAccount ?? session.accounts[0] ?? null);
  const identity = createMemo<AccountIdentity>(() => {
    if (session.activeSession) {
      return {
        avatar: session.activeAvatar,
        label: session.activeSession.handle,
        meta: "Current account",
        name: session.activeSession.handle,
        tone: "primary" as const,
      };
    }

    const account = previewAccount();
    if (account) {
      return {
        avatar: account.avatar ?? null,
        label: account.handle || account.did,
        meta: "Session expired",
        name: account.handle || account.did,
        tone: "muted" as const,
      };
    }

    return { avatar: null, label: "?", meta: "No account connected", name: "Sign in", tone: "muted" as const };
  });
  let container: HTMLDivElement | undefined;

  const compact = () => shell.railCondensed;

  onMount(() => {
    const pointerListener = {
      handleEvent(event: Event) {
        if (!shell.showSwitcher) {
          return;
        }

        if (container?.contains(event.target as Node)) {
          return;
        }

        shell.closeSwitcher();
      },
    };

    globalThis.addEventListener("pointerdown", pointerListener);
    onCleanup(() => globalThis.removeEventListener("pointerdown", pointerListener));
  });

  async function handleSwitch(did: string) {
    shell.closeSwitcher();
    await session.switchAccount(did);
  }

  async function handleLogout(did: string) {
    shell.closeSwitcher();
    await session.logout(did);
  }

  return (
    <div
      class="relative w-full transition-[width,max-width] duration-300 ease-out max-[1180px]:max-w-none"
      classList={{
        "z-40": shell.showSwitcher,
        "w-auto": compact(),
        "max-[1180px]:col-start-4 max-[1180px]:row-start-1 max-[1180px]:justify-self-end": shell.narrowViewport,
        "max-[1180px]:col-span-full max-[1180px]:justify-self-stretch": !shell.narrowViewport,
      }}
      ref={(element) => {
        container = element;
      }}>
      <button
        class="relative w-full min-w-0 cursor-pointer border-0 bg-white/4 text-on-surface shadow-[inset_0_0_0_1px_rgba(255,255,255,0.04)] transition duration-150 ease-out hover:-translate-y-px hover:bg-white/8"
        classList={{
          "rounded-xl py-[0.95rem] pr-10 pl-4": !compact(),
          "grid h-14 w-14 place-items-center overflow-visible rounded-full p-0": compact(),
        }}
        type="button"
        aria-haspopup="menu"
        aria-expanded={shell.showSwitcher}
        aria-label={session.activeSession ? `Current account ${session.activeSession.handle}` : identity().name}
        onClick={shell.toggleSwitcher}>
        <SwitcherIdentity identity={identity()} compact={compact()} />
        <span
          class="absolute flex items-center justify-center text-on-surface-variant"
          classList={{
            "right-[0.95rem] top-1/2 -translate-y-1/2": !compact(),
            "bottom-0 right-0 h-5 w-5 translate-x-[8%] translate-y-[8%] rounded-full bg-surface-container text-[0.7rem] leading-none shadow-[0_0_0_2px_rgba(8,8,8,0.9),inset_0_0_0_1px_rgba(255,255,255,0.05)]":
              compact(),
          }}
          aria-hidden="true">
          <Show when={shell.showSwitcher} fallback={<ArrowIcon direction="down" />}>
            <ArrowIcon direction="up" />
          </Show>
        </span>
      </button>

      <Show when={shell.showSwitcher}>
        <div
          class="absolute z-50 rounded-2xl bg-surface-container-highest p-4 shadow-[0_24px_40px_rgba(0,0,0,0.28)] backdrop-blur-[20px] max-[1180px]:bottom-auto max-[1180px]:top-[calc(100%+0.75rem)]"
          classList={{
            "inset-x-0 bottom-[calc(100%+0.75rem)]": !compact(),
            "bottom-0 left-[calc(100%+0.85rem)] w-[19rem]": compact() && !shell.narrowViewport,
            "right-0 w-[19rem]": compact() && shell.narrowViewport,
          }}
          role="menu">
          <p class="overline-copy text-[0.68rem] text-on-surface-variant">Accounts</p>
          <AccountSwitcherMenuList
            accounts={session.accounts}
            busyDid={session.switchingDid}
            logoutDid={session.logoutDid}
            onSwitch={(did) => void handleSwitch(did)}
            onLogout={(did) => void handleLogout(did)} />
        </div>
      </Show>
    </div>
  );
}

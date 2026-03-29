import type { AccountSummary, ActiveSession } from "$/lib/types";
import { createMemo, onCleanup, onMount, Show } from "solid-js";
import { ArrowIcon } from "../shared/Icon";
import { SwitcherIdentity } from "./AccountSwitcherIdentity";
import { AccountSwitcherMenuList } from "./AccountSwitcherMenuList";

type AccountSwitcherProps = {
  activeAccount: AccountSummary | null;
  activeSession: ActiveSession | null;
  accounts: AccountSummary[];
  busyDid: string | null;
  compact?: boolean;
  logoutDid: string | null;
  narrow?: boolean;
  open: boolean;
  onClose: () => void;
  onToggle: () => void;
  onSwitch: (did: string) => void;
  onLogout: (did: string) => void;
};

export function AccountSwitcher(props: AccountSwitcherProps) {
  const isOpen = () => props.open;
  const previewAccount = createMemo(() => props.activeAccount ?? props.accounts[0] ?? null);
  const identity = createMemo(() => {
    if (props.activeSession) {
      return {
        avatar: props.activeAccount?.avatar ?? null,
        label: props.activeSession.handle,
        meta: "Current account",
        name: props.activeSession.handle,
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

  onMount(() => {
    const pointerListener = {
      handleEvent(event: Event) {
        if (!isOpen()) {
          return;
        }

        if (container?.contains(event.target as Node)) {
          return;
        }

        props.onClose();
      },
    };

    globalThis.addEventListener("pointerdown", pointerListener);
    onCleanup(() => globalThis.removeEventListener("pointerdown", pointerListener));
  });

  return (
    <div
      class="relative mt-auto w-full transition-[width,max-width] duration-300 ease-out max-[1180px]:mt-0 max-[1180px]:max-w-none"
      classList={{
        "w-auto": !!props.compact,
        "max-[1180px]:col-start-3 max-[1180px]:row-start-1 max-[1180px]:justify-self-end": !!props.narrow,
        "max-[1180px]:col-span-full max-[1180px]:justify-self-stretch": !props.narrow,
      }}
      ref={(element) => {
        container = element;
      }}>
      <button
        class="relative w-full min-w-0 cursor-pointer border-0 bg-white/4 text-on-surface shadow-[inset_0_0_0_1px_rgba(255,255,255,0.04)] transition duration-150 ease-out hover:-translate-y-px hover:bg-white/8"
        classList={{
          "rounded-xl py-[0.95rem] pr-10 pl-4": !props.compact,
          "grid h-14 w-14 place-items-center rounded-full p-0": !!props.compact,
        }}
        type="button"
        aria-haspopup="menu"
        aria-expanded={props.open}
        aria-label={props.activeSession ? `Current account ${props.activeSession.handle}` : identity().name}
        onClick={() => props.onToggle()}>
        <SwitcherIdentity
          avatar={identity().avatar}
          compact={props.compact}
          label={identity().label}
          meta={identity().meta}
          name={identity().name}
          tone={identity().tone} />
        <span
          class="absolute flex items-center text-on-surface-variant"
          classList={{
            "right-[0.95rem] top-1/2 -translate-y-1/2": !props.compact,
            "bottom-0 right-0 h-5 w-5 rounded-full bg-surface-container text-xs shadow-[inset_0_0_0_1px_rgba(255,255,255,0.04)]":
              !!props.compact,
          }}
          aria-hidden="true">
          <Show when={props.open} fallback={<ArrowIcon direction="down" />}>
            <ArrowIcon direction="up" />
          </Show>
        </span>
      </button>

      <Show when={props.open}>
        <div
          class="absolute z-20 rounded-2xl bg-(--surface-container-highest) p-4 shadow-[0_24px_40px_rgba(0,0,0,0.28)] backdrop-blur-[20px] max-[1180px]:bottom-auto max-[1180px]:top-[calc(100%+0.75rem)]"
          classList={{
            "inset-x-0 bottom-[calc(100%+0.75rem)]": !props.compact,
            "bottom-0 left-[calc(100%+0.85rem)] w-[19rem]": !!props.compact && !props.narrow,
            "right-0 w-[19rem]": !!props.compact && !!props.narrow,
          }}
          role="menu">
          <p class="overline-copy text-[0.68rem] text-on-surface-variant">Accounts</p>
          <AccountSwitcherMenuList
            accounts={props.accounts}
            busyDid={props.busyDid}
            logoutDid={props.logoutDid}
            onSwitch={props.onSwitch}
            onLogout={props.onLogout} />
        </div>
      </Show>
    </div>
  );
}

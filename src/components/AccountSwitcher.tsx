import { onCleanup, onMount, Show } from "solid-js";
import { Motion, Presence } from "solid-motionone";
import { AccountSummary, ActiveSession } from "../lib/types";
import { SwitcherIdentity } from "./AccountSwitcherIdentity";
import { AccountSwitcherMenuList } from "./AccountSwitcherMenuList";
import { ArrowIcon } from "./shared/Icon";

type AccountSwitcherProps = {
  activeSession: ActiveSession | null;
  accounts: AccountSummary[];
  busyDid: string | null;
  compact?: boolean;
  logoutDid: string | null;
  open: boolean;
  onToggle: () => void;
  onSwitch: (did: string) => void;
  onLogout: (did: string) => void;
};

export function AccountSwitcher(props: AccountSwitcherProps) {
  const isOpen = () => props.open;
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

        props.onToggle();
      },
    };

    globalThis.addEventListener("pointerdown", pointerListener);
    onCleanup(() => globalThis.removeEventListener("pointerdown", pointerListener));
  });

  return (
    <div
      class="relative mt-auto w-full transition-[width,max-width] duration-300 ease-out max-[1180px]:mt-0 max-[1180px]:max-w-[24rem] max-[1180px]:justify-self-end max-[760px]:max-w-none"
      classList={{ "w-auto": !!props.compact }}
      ref={(element) => {
        container = element;
      }}>
      <button
        class="relative w-full cursor-pointer border-0 bg-white/4 text-on-surface shadow-[inset_0_0_0_1px_rgba(255,255,255,0.04)] transition duration-150 ease-out hover:-translate-y-px hover:bg-white/8"
        classList={{
          "rounded-xl py-[0.95rem] pr-10 pl-4": !props.compact,
          "grid h-14 w-14 place-items-center rounded-full p-0": !!props.compact,
        }}
        type="button"
        aria-haspopup="menu"
        aria-expanded={props.open}
        aria-label={props.activeSession ? `Current account ${props.activeSession.handle}` : "Sign in"}
        onClick={() => props.onToggle()}>
        <Show
          when={props.activeSession}
          keyed
          fallback={
            <SwitcherIdentity
              compact={props.compact}
              label="?"
              name="Sign in"
              meta="No account connected"
              tone="muted" />
          }>
          {(session) => (
            <SwitcherIdentity
              compact={props.compact}
              label={session.handle}
              name={session.handle}
              meta="Current account"
              tone="primary" />
          )}
        </Show>
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

      <Presence>
        <Show when={props.open}>
          <Motion.div
            class="absolute rounded-2xl bg-(--surface-container-highest) p-4 shadow-[0_24px_40px_rgba(0,0,0,0.28)] backdrop-blur-[20px] max-[1180px]:bottom-auto max-[1180px]:top-[calc(100%+0.75rem)]"
            classList={{
              "inset-x-0 bottom-[calc(100%+0.75rem)]": !props.compact,
              "bottom-0 left-[calc(100%+0.85rem)] w-[19rem]": !!props.compact,
            }}
            role="menu"
            initial={{ opacity: 0, y: 10, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 8, scale: 0.98 }}
            transition={{ duration: 0.2 }}>
            <p class="overline-copy text-[0.68rem] text-on-surface-variant">Accounts</p>
            <AccountSwitcherMenuList
              accounts={props.accounts}
              busyDid={props.busyDid}
              logoutDid={props.logoutDid}
              onSwitch={props.onSwitch}
              onLogout={props.onLogout} />
          </Motion.div>
        </Show>
      </Presence>
    </div>
  );
}

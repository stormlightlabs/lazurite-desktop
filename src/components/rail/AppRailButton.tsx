import { A } from "@solidjs/router";
import { Show } from "solid-js";
import { Motion, Presence } from "solid-motionone";
import { Icon, type IconKind } from "../shared/Icon";

type RailButtonVisualProps = { badge?: number; compact?: boolean; icon: IconKind; label: string };

type RailButtonProps = RailButtonVisualProps & { end?: boolean; href: string };

type RailActionButtonProps = RailButtonVisualProps & { onClick: () => void };

function RailButtonContent(props: RailButtonVisualProps) {
  return (
    <>
      <div class="relative">
        <Icon kind={props.icon} name={props.label} aria-hidden="true" class="shrink-0 text-[1.25rem]" />
        <Presence>
          <Show when={(props.badge ?? 0) > 0}>
            <Motion.span
              class="absolute -right-0.5 -top-0.5 h-2 w-2 rounded-full bg-primary"
              initial={{ scale: 0, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0, opacity: 0 }}
              transition={{ duration: 0.18, easing: [0.34, 1.56, 0.64, 1] }}
              aria-label={`${props.badge} unread`}
              role="status" />
          </Show>
        </Presence>
      </div>
      <Show when={!props.compact}>
        <span class="text-sm font-medium leading-none">{props.label}</span>
      </Show>
    </>
  );
}

const railButtonClass =
  "relative flex h-11 shrink-0 items-center gap-2.5 rounded-lg border-0 bg-transparent text-on-surface-variant no-underline transition duration-150 ease-out hover:-translate-y-px hover:bg-surface-bright hover:text-on-surface";

export function RailButton(props: RailButtonProps) {
  return (
    <A
      href={props.href}
      end={props.end}
      class={railButtonClass}
      activeClass="bg-surface-container text-primary"
      inactiveClass=""
      classList={{ "w-[2.75rem] justify-center": !!props.compact, "px-3": !props.compact }}
      aria-label={props.label}
      title={props.label}>
      <RailButtonContent {...props} />
    </A>
  );
}

export function RailActionButton(props: RailActionButtonProps) {
  return (
    <button
      type="button"
      class={railButtonClass}
      classList={{ "w-[2.75rem] justify-center": !!props.compact, "px-3": !props.compact }}
      aria-label={props.label}
      title={props.label}
      onClick={() => props.onClick()}>
      <RailButtonContent {...props} />
    </button>
  );
}

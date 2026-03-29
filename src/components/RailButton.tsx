import { A } from "@solidjs/router";
import { Show } from "solid-js";
import { Icon, type IconKind } from "./shared/Icon";

type RailButtonProps = { label: string; href: string; icon: IconKind; compact?: boolean; end?: boolean };

export function RailButton(props: RailButtonProps) {
  return (
    <A
      href={props.href}
      end={props.end}
      class="flex h-11 items-center gap-2.5 rounded-lg border-0 bg-transparent text-on-surface-variant no-underline transition duration-150 ease-out hover:-translate-y-px hover:bg-surface-bright hover:text-on-surface"
      activeClass="bg-surface-container text-primary"
      inactiveClass=""
      classList={{ "w-[2.75rem] justify-center": !!props.compact, "px-3": !props.compact }}
      aria-label={props.label}
      title={props.label}>
      <Icon kind={props.icon} name={props.label} aria-hidden="true" class="shrink-0 text-[1.25rem]" />
      <Show when={!props.compact}>
        <span class="text-sm font-medium leading-none">{props.label}</span>
      </Show>
    </A>
  );
}

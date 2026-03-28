import { A } from "@solidjs/router";
import { Icon, type IconKind } from "./shared/Icon";

type RailButtonProps = { label: string; href: string; icon: IconKind; end?: boolean };

export function RailButton(props: RailButtonProps) {
  return (
    <A
      href={props.href}
      end={props.end}
      class="grid h-[3.3rem] place-items-center rounded-full border-0 bg-transparent text-on-surface-variant transition duration-150 ease-out hover:-translate-y-px hover:bg-surface-bright hover:text-on-surface"
      activeClass="bg-surface-container text-primary"
      inactiveClass=""
      aria-label={props.label}
      title={props.label}>
      <Icon kind={props.icon} name={props.label} aria-hidden="true" />
    </A>
  );
}

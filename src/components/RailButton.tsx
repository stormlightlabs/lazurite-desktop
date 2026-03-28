import { Icon, type IconKind } from "./shared/Icon";

type RailButtonProps = { label: string; icon: IconKind; active?: boolean };

export function RailButton(props: RailButtonProps) {
  return (
    <button
      class="grid h-[3.3rem] place-items-center rounded-full border-0 bg-transparent text-on-surface-variant transition duration-150 ease-out hover:-translate-y-px hover:bg-surface-bright hover:text-on-surface"
      classList={{ "bg-surface-container text-primary": !!props.active }}
      type="button"
      aria-label={props.label}>
      <Icon kind={props.icon} name={props.label} aria-hidden="true" />
    </button>
  );
}

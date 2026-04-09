import { Icon } from "$/components/shared/Icon";
import { Show } from "solid-js";

type ActorTypeaheadLoadingProps = { class?: string; iconClass?: string; inline?: boolean; visible: boolean };

export function ActorTypeaheadLoading(props: ActorTypeaheadLoadingProps) {
  const defaultClass = () =>
    props.inline
      ? "flex items-center text-on-surface-variant"
      : "pointer-events-none absolute top-1/2 -translate-y-1/2 text-on-surface-variant right-3";

  return (
    <Show when={props.visible}>
      <span class={`${defaultClass()} ${props.class ?? ""}`}>
        <Icon kind="loader" aria-hidden="true" class={props.iconClass} />
      </span>
    </Show>
  );
}

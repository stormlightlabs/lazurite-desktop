import { Show } from "solid-js";
import { Icon } from "../shared/Icon";

type ModeratedAvatarProps = {
  avatar?: string | null;
  class: string;
  hidden: boolean;
  label: string;
  fallbackClass?: string;
  imageClass?: string;
};

export function ModeratedAvatar(props: ModeratedAvatarProps) {
  return (
    <div class={props.class}>
      <Show
        when={!props.hidden && props.avatar}
        fallback={
          <span
            class="flex h-full w-full items-center justify-center"
            classList={{ [props.fallbackClass ?? "text-sm font-semibold text-on-surface"]: true }}>
            <Show
              when={!props.hidden}
              fallback={<Icon aria-hidden="true" iconClass="i-ri-shield-line" class="text-lg text-on-surface" />}>
              {props.label}
            </Show>
          </span>
        }>
        {(avatar) => <img class={props.imageClass ?? "h-full w-full object-cover"} src={avatar()} alt="" />}
      </Show>
    </div>
  );
}

import { Show } from "solid-js";
import { AvatarBadge } from "../AvatarBadge";

export function SwitcherIdentity(
  props: {
    avatar?: string | null;
    compact?: boolean;
    label: string;
    name: string;
    meta: string;
    tone: "primary" | "muted";
  },
) {
  return (
    <div class="flex min-w-0 items-center gap-3" classList={{ "justify-center": !!props.compact }}>
      <AvatarBadge label={props.label} src={props.avatar} tone={props.tone} />
      <Show when={!props.compact}>
        <div class="grid min-w-0">
          <span class="truncate text-[0.92rem] font-semibold">{props.name}</span>
          <span class="text-xs text-on-surface-variant">{props.meta}</span>
        </div>
      </Show>
    </div>
  );
}

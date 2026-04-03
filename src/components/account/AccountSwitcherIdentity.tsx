import { AvatarBadge } from "$/components/AvatarBadge";
import { Show } from "solid-js";
import type { AccountIdentity } from "./types";

export function SwitcherIdentity(props: { compact: boolean; identity: AccountIdentity }) {
  const label = () => props.identity.label;
  const avatar = () => props.identity.avatar;
  const name = () => props.identity.name;
  const meta = () => props.identity.meta;
  const tone = () => props.identity.tone;

  return (
    <div class="flex min-w-0 items-center gap-3" classList={{ "justify-center": !!props.compact }}>
      <AvatarBadge label={label()} src={avatar()} tone={tone()} />
      <Show when={!props.compact}>
        <div class="grid min-w-0">
          <span class="truncate text-[0.92rem] font-semibold">{name()}</span>
          <span class="text-xs text-on-surface-variant">{meta()}</span>
        </div>
      </Show>
    </div>
  );
}

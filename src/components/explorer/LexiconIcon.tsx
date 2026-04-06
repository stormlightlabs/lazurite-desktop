import { Icon } from "$/components/shared/Icon";
import { Show } from "solid-js";

type LexiconIconProps = { class?: string; src: string | null; title: string };

export function LexiconIcon(props: LexiconIconProps) {
  return (
    <div class={`flex items-center justify-center rounded-xl bg-primary/15 ${props.class ?? ""}`.trim()}>
      <Show when={props.src} fallback={<Icon kind="folder" class="text-primary text-xl" />}>
        {(src) => (
          <img
            class="h-full w-full rounded-xl object-cover p-2"
            src={src()}
            alt={`${props.title} favicon`}
            loading="lazy" />
        )}
      </Show>
    </div>
  );
}

import { SettingsIcon, type SettingsIconKind } from "$/components/shared/Icon";
import type { ParentProps } from "solid-js";

export function SettingsCard(props: ParentProps & { icon: SettingsIconKind; title: string }) {
  return (
    <section class="panel-surface grid gap-4 p-5">
      <div class="flex items-center gap-3">
        <SettingsIcon class="text-xl text-primary" kind={props.icon} />
        <h2 class="text-lg font-medium text-on-surface">{props.title}</h2>
      </div>
      {props.children}
    </section>
  );
}

import { ArrowIcon, ExplorerLevelIcon } from "$/components/shared/Icon";
import type { ExplorerTargetKind } from "$/lib/api/types/explorer";
import { For, Show } from "solid-js";
import { Motion } from "solid-motionone";
import type { Crumb } from "./explorer-state";

type ExplorerBreadcrumbProps = { items: Crumb[]; onNavigate: (level: ExplorerTargetKind) => void };

export function ExplorerBreadcrumb(props: ExplorerBreadcrumbProps) {
  return (
    <div class="flex items-center gap-1 px-6 py-3 text-sm border-b border-white/5">
      <For each={props.items}>
        {(item, index) => (
          <>
            <Show when={index() > 0}>
              <ArrowIcon direction="right" class="px-1 text-on-surface-variant shrink-0" />
            </Show>

            <Show
              when={item.active}
              fallback={
                <button
                  onClick={() => props.onNavigate(item.level)}
                  class="flex items-center gap-1.5 px-2 py-1 rounded-lg text-primary hover:bg-white/5 transition-colors">
                  <ExplorerLevelIcon level={item.level} class="text-xs" />
                  <span class="truncate max-w-37.5">{item.label}</span>
                </button>
              }>
              <Motion.div
                initial={{ width: 0, opacity: 0 }}
                animate={{ width: "auto", opacity: 1 }}
                transition={{ duration: 0.2 }}
                class="flex items-center gap-1.5 px-2 py-1 font-medium text-on-surface">
                <ExplorerLevelIcon level={item.level} class="text-xs" />
                <span class="truncate max-w-50">{item.label}</span>
              </Motion.div>
            </Show>
          </>
        )}
      </For>
    </div>
  );
}

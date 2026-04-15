import { LoadingIcon } from "$/components/shared/Icon";
import { For, Show } from "solid-js";

export function LoadingMoreIndicator(props: { loading: boolean }) {
  return (
    <Show when={props.loading}>
      <div class="flex items-center justify-center py-4 text-sm text-on-surface-variant">
        <LoadingIcon isLoading aria-hidden />
        <span class="ml-2">Loading more</span>
      </div>
    </Show>
  );
}

export function EmptyFeedState() {
  return (
    <div class="rounded-3xl bg-white/3 p-8 text-center shadow-[inset_0_0_0_1px_rgba(255,255,255,0.04)]">
      <p class="m-0 text-[1rem] font-semibold text-on-surface">Nothing to show yet</p>
      <p class="mt-2 text-sm leading-[1.6] text-on-surface-variant">
        This feed is empty with the current filters. Try another tab or loosen the display settings.
      </p>
    </div>
  );
}

function SkeletonCard() {
  return (
    <div class="rounded-3xl bg-white/3 p-5 shadow-[inset_0_0_0_1px_rgba(255,255,255,0.03)]">
      <div class="flex gap-3">
        <div class="skeleton-block h-11 w-11 rounded-full" />
        <div class="min-w-0 flex-1">
          <div class="skeleton-block h-4 w-48 rounded-full" />
          <div class="mt-3 grid gap-2">
            <For each={["w-full", "w-[90%]", "w-[95%]"]}>
              {w => <span class={`skeleton-block h-3.5 ${w} rounded-full`} />}
            </For>
          </div>
        </div>
      </div>
    </div>
  );
}

export function FeedSkeleton() {
  return (
    <div class="grid gap-3">
      <For each={Array.from({ length: 3 })}>{() => <SkeletonCard />}</For>
    </div>
  );
}

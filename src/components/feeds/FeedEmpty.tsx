import { Show } from "solid-js";
import { Icon } from "../shared/Icon";

export function LoadingMoreIndicator(props: { loading: boolean }) {
  return (
    <Show when={props.loading}>
      <div class="flex items-center justify-center py-4 text-sm text-on-surface-variant">
        <Icon aria-hidden="true" class="animate-spin" iconClass="i-ri-loader-4-line" />
        <span class="ml-2">Loading more</span>
      </div>
    </Show>
  );
}

export function EmptyFeedState() {
  return (
    <div class="rounded-[1.6rem] bg-white/3 p-8 text-center shadow-[inset_0_0_0_1px_rgba(255,255,255,0.04)]">
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
            <div class="skeleton-block h-3.5 w-full rounded-full" />
            <div class="skeleton-block h-3.5 w-[88%] rounded-full" />
            <div class="skeleton-block h-3.5 w-[70%] rounded-full" />
          </div>
        </div>
      </div>
    </div>
  );
}

export function FeedSkeleton() {
  return (
    <div class="grid gap-3">
      <SkeletonCard />
      <SkeletonCard />
      <SkeletonCard />
    </div>
  );
}

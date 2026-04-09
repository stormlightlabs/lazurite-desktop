import { For } from "solid-js";

export function DiagnosticsListSkeleton() {
  return (
    <div class="grid gap-4">
      <For each={Array.from({ length: 3 })}>
        {() => (
          <div class="grid h-32 gap-3 rounded-3xl bg-surface-container-high p-4 shadow-(--inset-shadow)">
            <div class="skeleton-block h-4 w-28 rounded-full" />
            <div class="skeleton-block h-4 w-44 rounded-full" />
            <div class="skeleton-block h-4 w-full rounded-full" />
          </div>
        )}
      </For>
    </div>
  );
}

export function DiagnosticsLabelSkeleton() {
  return (
    <div class="flex flex-wrap gap-2">
      <For each={Array.from({ length: 5 })}>{() => <div class="skeleton-block h-10 w-32 rounded-full" />}</For>
    </div>
  );
}

export function DiagnosticsStarterPackSkeleton() {
  return (
    <div class="grid gap-3">
      <For each={Array.from({ length: 2 })}>
        {() => (
          <div class="grid h-28 gap-3 rounded-3xl bg-surface-container-high p-4 shadow-(--inset-shadow)">
            <div class="skeleton-block h-4 w-40 rounded-full" />
            <div class="skeleton-block h-4 w-28 rounded-full" />
            <div class="skeleton-block h-4 w-full rounded-full" />
          </div>
        )}
      </For>
    </div>
  );
}

export function DiagnosticsBlockSkeleton() {
  return (
    <div class="grid gap-3">
      <For each={Array.from({ length: 2 })}>{() => <div class="skeleton-block h-24 rounded-3xl" />}</For>
    </div>
  );
}

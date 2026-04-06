import { For } from "solid-js";

export function DiagnosticsListSkeleton() {
  return (
    <div class="grid gap-4">
      <For each={Array.from({ length: 3 })}>
        {() => (
          <div class="grid h-32 gap-3 rounded-3xl bg-white/3 p-4">
            <div class="h-4 w-28 rounded-full bg-white/6" />
            <div class="h-4 w-44 rounded-full bg-white/6" />
            <div class="h-4 w-full rounded-full bg-white/6" />
          </div>
        )}
      </For>
    </div>
  );
}

export function DiagnosticsLabelSkeleton() {
  return (
    <div class="flex flex-wrap gap-2">
      <For each={Array.from({ length: 5 })}>{() => <div class="h-10 w-32 rounded-full bg-white/3" />}</For>
    </div>
  );
}

export function DiagnosticsStarterPackSkeleton() {
  return (
    <div class="grid gap-3">
      <For each={Array.from({ length: 2 })}>
        {() => (
          <div class="grid h-28 gap-3 rounded-3xl bg-white/3 p-4">
            <div class="h-4 w-40 rounded-full bg-white/6" />
            <div class="h-4 w-28 rounded-full bg-white/6" />
            <div class="h-4 w-full rounded-full bg-white/6" />
          </div>
        )}
      </For>
    </div>
  );
}

export function DiagnosticsBlockSkeleton() {
  return (
    <div class="grid gap-3">
      <For each={Array.from({ length: 2 })}>{() => <div class="h-24 rounded-3xl bg-white/3" />}</For>
    </div>
  );
}

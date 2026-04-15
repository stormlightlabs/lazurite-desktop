import { For } from "solid-js";

export function ProfileSkeleton() {
  return (
    <div class="grid gap-[0.85rem]" aria-hidden>
      <span class="skeleton-block h-18 w-18 rounded-full" />
      <For each={["w-[min(16rem,80%)]", "w-[min(11rem,64%)]", "w-[min(9rem,48%)]"]}>
        {w => <span class={`skeleton-block h-[0.85rem] ${w} rounded-full`} />}
      </For>
    </div>
  );
}

import { For } from "solid-js";

export function SegmentedControl<T extends string | number>(
  props: { options: { value: T; label: string }[]; value: T; onChange: (value: T) => void },
) {
  return (
    <div class="flex rounded-xl bg-black/40 p-1">
      <For each={props.options}>
        {(option) => (
          <button
            type="button"
            onClick={() => props.onChange(option.value)}
            class="flex-1 rounded-lg px-3 py-1.5 text-sm font-medium transition-colors"
            classList={{
              "bg-primary/20 text-primary": props.value === option.value,
              "text-on-surface-variant hover:text-on-surface": props.value !== option.value,
            }}>
            {option.label}
          </button>
        )}
      </For>
    </div>
  );
}

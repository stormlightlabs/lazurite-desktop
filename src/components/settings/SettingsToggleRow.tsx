import { Motion } from "solid-motionone";

export function ToggleRow(
  props: { checked: boolean; description: string; disabled?: boolean; label: string; onChange: () => void },
) {
  return (
    <div class="flex items-center justify-between">
      <div>
        <p class="text-sm font-medium text-on-surface">{props.label}</p>
        <p class="text-xs text-on-surface-variant">{props.description}</p>
      </div>
      <button
        type="button"
        role="switch"
        aria-label={props.label}
        aria-checked={props.checked}
        disabled={props.disabled}
        onClick={() => props.onChange()}
        class="relative inline-flex h-6 w-10 items-center rounded-full transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/50 disabled:cursor-not-allowed disabled:opacity-50"
        classList={{ "bg-primary": props.checked, "bg-[var(--control-bg)]": !props.checked }}>
        <Motion.span
          class="inline-block h-4 w-4 rounded-full bg-on-primary-fixed shadow-lg"
          animate={{ x: props.checked ? 20 : 2 }}
          transition={{ duration: 0.15, easing: [0.25, 0.1, 0.25, 1] }} />
      </button>
    </div>
  );
}

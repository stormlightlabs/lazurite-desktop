type DiagnosticsColumnProps = { did: string };

/**
 * @todo implement this
 */
export function DiagnosticsColumn(props: DiagnosticsColumnProps) {
  return (
    <div class="flex min-h-0 flex-col items-center justify-center gap-3 px-6 py-12 text-center">
      <span class="flex items-center justify-center text-[2rem] text-on-surface-variant">
        <i class="i-ri-stethoscope-line" />
      </span>
      <p class="m-0 text-sm font-medium text-on-surface">Social Diagnostics</p>
      <p class="m-0 text-xs text-on-surface-variant">
        Diagnostics for <span class="font-mono text-primary">{props.did}</span>.
      </p>
      <p class="m-0 text-xs text-on-surface-variant opacity-60">Full diagnostics panel coming soon.</p>
    </div>
  );
}

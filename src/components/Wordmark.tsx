export function Wordmark() {
  return (
    <div class="flex items-center gap-3">
      <span
        class="h-[2.7rem] w-[0.95rem] rounded-full bg-[linear-gradient(180deg,var(--primary)_0%,var(--primary-dim)_100%)] shadow-[0_0_24px_rgba(125,175,255,0.24)]"
        aria-hidden="true" />
      <div class="grid">
        <p class="m-0 text-[0.9rem]">Lazurite</p>
        <p class="overline-copy text-[0.68rem] text-on-surface-variant">Desktop</p>
      </div>
    </div>
  );
}

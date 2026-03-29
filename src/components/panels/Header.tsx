import { LazuriteLogo } from "../Wordmark";

type HeaderPanelProps = { metaLabel: string };

export function HeaderPanel(props: HeaderPanelProps) {
  return (
    <header class="grid gap-4 xl:grid-cols-[minmax(0,1fr)_auto] xl:items-start">
      <div class="flex items-center gap-5">
        <span class="grid shrink-0 place-items-center rounded-xl bg-white/4 p-3 text-primary shadow-[inset_0_0_0_1px_rgba(255,255,255,0.04)]">
          <LazuriteLogo class="h-12 w-12" />
        </span>
        <div class="grid gap-0.5">
          <h1 class="m-0 text-[clamp(1.6rem,3vw,2.4rem)] font-semibold leading-[1.08] tracking-[-0.03em]">Lazurite</h1>
          <p class="m-0 text-xs text-on-surface-variant">Powered by Bluesky</p>
        </div>
      </div>
      <p class="overline-copy text-xs tracking-[0.18em] text-on-surface-variant xl:pt-2">{props.metaLabel}</p>
    </header>
  );
}

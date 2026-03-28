type HeaderPanelProps = { metaLabel: string };

export function HeaderPanel(props: HeaderPanelProps) {
  return (
    <header class="grid gap-4 xl:grid-cols-[minmax(0,1fr)_auto] xl:items-start">
      <div class="max-w-3xl">
        <p class="overline-copy text-[0.72rem] text-primary">Authentication</p>
        <h1 class="m-0 max-w-[11ch] text-balance text-[clamp(2.3rem,5vw,4.2rem)] leading-[0.94] tracking-[-0.03em] max-[760px]:text-[clamp(1.95rem,10vw,3.2rem)]">
          Join the conversation.
        </h1>
      </div>
      <p class="overline-copy text-[0.72rem] tracking-[0.18em] text-on-surface-variant xl:pt-2">{props.metaLabel}</p>
    </header>
  );
}

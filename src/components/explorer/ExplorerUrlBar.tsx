import { ArrowIcon, Icon } from "$/components/shared/Icon";

type ExplorerUrlBarProps = {
  value: string;
  canGoBack: boolean;
  canGoForward: boolean;
  canExport: boolean;
  onInput: (value: string) => void;
  onSubmit: (value: string) => void;
  onBack: () => void;
  onForward: () => void;
  onExport: () => void;
};

function NavButton(props: { direction: "left" | "right"; disabled: boolean; onClick: () => void }) {
  return (
    <button
      onClick={() => props.onClick()}
      disabled={props.disabled}
      class="p-2 rounded-lg text-on-surface-variant hover:text-on-surface hover:bg-white/5 transition-all disabled:opacity-30 disabled:cursor-not-allowed"
      aria-label={props.direction === "left" ? "Back" : "Forward"}
      title={props.direction === "left" ? "Back" : "Forward"}>
      <ArrowIcon direction={props.direction} />
    </button>
  );
}

function UrlInputForm(props: { value: string; onInput: (value: string) => void; onSubmit: (value: string) => void }) {
  function handleSubmit(event: Event) {
    event.preventDefault();
    props.onSubmit(props.value);
  }

  return (
    <form onSubmit={handleSubmit} class="flex-1 relative">
      <div class="flex items-center gap-3 px-4 py-2 rounded-xl bg-black/40 shadow-[inset_0_0_0_1px_rgba(125,175,255,0.12)]">
        <span class="flex items-center text-primary/80">
          <i class="i-ri-compass-discover-line" />
        </span>
        <input
          data-explorer-input
          type="text"
          value={props.value}
          onInput={(event) => props.onInput(event.currentTarget.value)}
          class="flex-1 bg-transparent text-sm font-mono outline-none text-on-surface placeholder:text-on-surface-variant/50"
          placeholder="at://did:... or @handle or https://pds..." />
        <button
          type="submit"
          class="p-1.5 rounded-lg text-on-surface-variant hover:text-on-surface hover:bg-white/5 transition-all">
          <Icon kind="search" />
        </button>
      </div>
    </form>
  );
}

export function ExplorerUrlBar(props: ExplorerUrlBarProps) {
  return (
    <header class="sticky top-0 z-40 border-b border-white/5 bg-surface-container/80 backdrop-blur-xl">
      <div class="px-6 py-4 flex items-center gap-3">
        <div class="flex gap-1">
          <NavButton direction="left" disabled={!props.canGoBack} onClick={props.onBack} />
          <NavButton direction="right" disabled={!props.canGoForward} onClick={props.onForward} />
        </div>

        <UrlInputForm value={props.value} onInput={props.onInput} onSubmit={props.onSubmit} />

        <button
          onClick={() => props.onSubmit(props.value)}
          class="p-2 rounded-lg text-on-surface-variant hover:text-on-surface hover:bg-white/5 transition-all"
          aria-label="Reload"
          title="Reload">
          <Icon kind="refresh" />
        </button>

        <button
          onClick={() => props.onExport()}
          disabled={!props.canExport}
          class="p-2 rounded-lg text-on-surface-variant hover:text-on-surface hover:bg-white/5 transition-all disabled:cursor-not-allowed disabled:opacity-30"
          aria-label="Download CAR"
          title="Download CAR">
          <Icon iconClass="i-ri-download-2-line" />
        </button>
      </div>
    </header>
  );
}

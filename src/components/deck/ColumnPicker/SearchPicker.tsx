import { SearchModeIcon } from "$/components/shared/Icon";
import type { SearchMode } from "$/lib/api/types/search";
import { createSignal } from "solid-js";

function SearchModeButton(props: { active: boolean; disabled?: boolean; mode: SearchMode; onClick: () => void }) {
  return (
    <button
      type="button"
      disabled={props.disabled}
      class="inline-flex items-center justify-center gap-2 rounded-xl border-0 px-3 py-2 text-xs font-medium transition duration-150 disabled:cursor-not-allowed disabled:opacity-40"
      classList={{
        "bg-primary/15 text-primary": props.active,
        "bg-white/4 text-on-surface-variant hover:bg-white/8 hover:text-on-surface": !props.active && !props.disabled,
      }}
      onClick={() => props.onClick()}>
      <SearchModeIcon mode={props.mode} class="text-sm" />
      <span class="capitalize">{props.mode}</span>
    </button>
  );
}

export function SearchPicker(props: { onSubmit: (query: string, mode: SearchMode) => void }) {
  const [mode, setMode] = createSignal<SearchMode>("network");
  const [query, setQuery] = createSignal("");

  function handleSubmit(event: Event) {
    event.preventDefault();
    const trimmed = query().trim();
    if (!trimmed) {
      return;
    }

    props.onSubmit(trimmed, mode());
  }

  return (
    <form onSubmit={handleSubmit} class="grid gap-3">
      <label class="grid gap-1.5">
        <span class="text-xs font-medium uppercase tracking-wide text-on-surface-variant">Search query</span>
        <input
          type="text"
          class="rounded-xl border-0 bg-white/6 px-4 py-2.5 text-sm text-on-surface placeholder:text-on-surface-variant/50 shadow-[inset_0_0_0_1px_rgba(255,255,255,0.06)] outline-none focus:shadow-[inset_0_0_0_1px_rgba(125,175,255,0.4)]"
          placeholder="from:alice at protocol"
          value={query()}
          onInput={(event) => setQuery(event.currentTarget.value)} />
      </label>

      <div class="grid gap-1.5">
        <span class="text-xs font-medium uppercase tracking-wide text-on-surface-variant">Search mode</span>
        <div class="grid grid-cols-2 gap-2">
          <SearchModeButton active={mode() === "network"} mode="network" onClick={() => setMode("network")} />
          <SearchModeButton active={mode() === "keyword"} mode="keyword" onClick={() => setMode("keyword")} />
          <SearchModeButton active={mode() === "semantic"} mode="semantic" onClick={() => setMode("semantic")} />
          <SearchModeButton active={mode() === "hybrid"} mode="hybrid" onClick={() => setMode("hybrid")} />
        </div>
      </div>

      <button
        type="submit"
        disabled={!query().trim()}
        class="flex items-center justify-center gap-2 rounded-xl border-0 bg-primary/15 px-4 py-2.5 text-sm font-medium text-primary transition duration-150 hover:-translate-y-px hover:bg-primary/25 disabled:cursor-not-allowed disabled:opacity-40">
        <span class="flex items-center">
          <i class="i-ri-search-line" />
        </span>
        Open search column
      </button>
    </form>
  );
}

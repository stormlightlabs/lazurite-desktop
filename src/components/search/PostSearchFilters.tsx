import type { NetworkSearchSort } from "$/lib/search-routes";
import { normalizeTagToken, type PostSearchFilters } from "$/lib/search-routes";
import { createSignal, For, Show } from "solid-js";
import { Icon } from "../shared/Icon";

type SearchSortTabsProps = { disabled?: boolean; sort: NetworkSearchSort; onChange: (sort: NetworkSearchSort) => void };

type PostSearchFiltersProps = {
  disabled?: boolean;
  filters: PostSearchFilters;
  helperText?: string;
  onChange: (next: Partial<PostSearchFilters>) => void;
};

export function SearchSortTabs(props: SearchSortTabsProps) {
  return (
    <div class="flex items-center gap-2" role="tablist" aria-label="Post search sort">
      <For each={["top", "latest"] as const}>
        {(sort) => (
          <button
            type="button"
            role="tab"
            aria-selected={props.sort === sort}
            disabled={props.disabled}
            class="inline-flex items-center gap-2 rounded-full border-0 px-3 py-1.5 text-sm font-medium transition duration-150 disabled:cursor-not-allowed"
            classList={{
              "bg-primary/16 text-primary shadow-[inset_0_0_0_1px_rgba(125,175,255,0.18)]": props.sort === sort,
              "bg-white/4 text-on-surface-variant hover:bg-white/8 hover:text-on-surface": props.sort !== sort,
              "opacity-50": !!props.disabled,
            }}
            onClick={() => props.onChange(sort)}>
            <Icon kind={sort === "top" ? "timeline" : "rss"} class="text-sm" />
            <span>{sort === "top" ? "Top" : "Latest"}</span>
          </button>
        )}
      </For>
    </div>
  );
}

export function PostSearchFiltersRow(props: PostSearchFiltersProps) {
  const [pendingTag, setPendingTag] = createSignal("");

  function commitTag(rawValue: string) {
    const nextTag = normalizeTagToken(rawValue);
    if (!nextTag) {
      setPendingTag("");
      return;
    }

    if (!props.filters.tags.includes(nextTag)) {
      props.onChange({ tags: [...props.filters.tags, nextTag] });
    }

    setPendingTag("");
  }

  function removeTag(tag: string) {
    props.onChange({ tags: props.filters.tags.filter((candidate) => candidate !== tag) });
  }

  return (
    <section class="grid gap-3 rounded-3xl bg-black/25 p-4 shadow-[inset_0_0_0_1px_rgba(255,255,255,0.04)]">
      <div class="flex flex-wrap items-center justify-between gap-3">
        <div class="grid gap-1">
          <p class="m-0 text-xs font-medium uppercase tracking-[0.12em] text-on-surface-variant">Network Filters</p>
          <Show when={props.helperText}>
            {(text) => <p class="m-0 text-xs text-on-surface-variant/80">{text()}</p>}
          </Show>
        </div>
        <SearchSortTabs
          disabled={props.disabled}
          sort={props.filters.sort}
          onChange={(sort) => props.onChange({ sort })} />
      </div>

      <div class="grid gap-3 xl:grid-cols-2">
        <FilterField
          disabled={props.disabled}
          icon="user"
          label="Author"
          placeholder="alice.test or did:plc:..."
          type="text"
          value={props.filters.author}
          onInput={(value) => props.onChange({ author: value })} />
        <FilterField
          disabled={props.disabled}
          icon="at"
          label="Mentions"
          placeholder="bob.test or did:plc:..."
          type="text"
          value={props.filters.mentions}
          onInput={(value) => props.onChange({ mentions: value })} />
        <FilterField
          disabled={props.disabled}
          icon="timeline"
          label="Since"
          placeholder=""
          type="date"
          value={props.filters.since}
          onInput={(value) => props.onChange({ since: value })} />
        <FilterField
          disabled={props.disabled}
          icon="timeline"
          label="Until"
          placeholder=""
          type="date"
          value={props.filters.until}
          onInput={(value) => props.onChange({ until: value })} />
      </div>

      <div class="grid gap-2">
        <div class="flex items-center gap-2 text-xs font-medium uppercase tracking-[0.12em] text-on-surface-variant">
          <Icon kind="hashtag" class="text-sm" />
          <span>Tags</span>
        </div>
        <div class="flex flex-wrap items-center gap-2 rounded-2xl bg-white/3 px-3 py-3 shadow-[inset_0_0_0_1px_rgba(255,255,255,0.04)]">
          <For each={props.filters.tags}>
            {(tag) => (
              <span class="inline-flex items-center gap-1.5 rounded-full bg-primary/14 px-3 py-1 text-sm text-primary shadow-[inset_0_0_0_1px_rgba(125,175,255,0.14)]">
                <span>#{tag}</span>
                <button
                  type="button"
                  disabled={props.disabled}
                  class="inline-flex border-0 bg-transparent p-0 text-primary/80 transition hover:text-primary disabled:cursor-not-allowed"
                  aria-label={`Remove #${tag}`}
                  onClick={() => removeTag(tag)}>
                  <Icon kind="close" class="text-xs" />
                </button>
              </span>
            )}
          </For>
          <input
            type="text"
            value={pendingTag()}
            disabled={props.disabled}
            placeholder={props.filters.tags.length > 0 ? "Add another tag" : "Add a tag and press Enter"}
            class="min-w-36 flex-1 border-0 bg-transparent text-sm text-on-surface placeholder:text-on-surface-variant/50 outline-none disabled:cursor-not-allowed disabled:text-on-surface-variant/50"
            onBlur={(event) => commitTag(event.currentTarget.value)}
            onInput={(event) => setPendingTag(event.currentTarget.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter" || event.key === ",") {
                event.preventDefault();
                commitTag(event.currentTarget.value);
                return;
              }

              if (event.key === "Backspace" && !event.currentTarget.value && props.filters.tags.length > 0) {
                removeTag(props.filters.tags.at(-1) ?? "");
              }
            }} />
        </div>
      </div>
    </section>
  );
}

function FilterField(
  props: {
    disabled?: boolean;
    icon: "at" | "timeline" | "user";
    label: string;
    placeholder: string;
    type: "date" | "text";
    value: string;
    onInput: (value: string) => void;
  },
) {
  return (
    <label class="grid gap-2">
      <span class="flex items-center gap-2 text-xs font-medium uppercase tracking-[0.12em] text-on-surface-variant">
        <Icon kind={props.icon} class="text-sm" />
        <span>{props.label}</span>
      </span>
      <input
        type={props.type}
        value={props.value}
        disabled={props.disabled}
        placeholder={props.placeholder}
        class="w-full rounded-2xl border-0 bg-white/3 px-3 py-2.5 text-sm text-on-surface outline-none ring-1 ring-white/5 transition focus:ring-primary/40 disabled:cursor-not-allowed disabled:text-on-surface-variant/50"
        onInput={(event) => props.onInput(event.currentTarget.value)} />
    </label>
  );
}

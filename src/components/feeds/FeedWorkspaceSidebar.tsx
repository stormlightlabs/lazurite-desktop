import { getFeedName } from "$/lib/feeds";
import type { FeedGeneratorView, FeedViewPrefItem, SavedFeedItem } from "$/lib/types";
import { For, type ParentProps, Show } from "solid-js";
import { FeedChipAvatar } from "./FeedChipAvatar";

type FeedWorkspaceSidebarProps = {
  activePref: FeedViewPrefItem;
  drawerFeeds: SavedFeedItem[];
  generators: Record<string, FeedGeneratorView>;
  onFeedSelect: (feedId: string) => void;
  onPrefChange: <K extends keyof FeedViewPrefItem>(key: K, value: FeedViewPrefItem[K]) => void;
};

export function FeedWorkspaceSidebar(props: FeedWorkspaceSidebarProps) {
  return (
    <aside class="grid min-h-0 min-w-0 gap-4 overflow-hidden md:grid-cols-2 xl:grid-cols-1 xl:overflow-y-auto xl:overscroll-contain">
      <SavedFeedsCard drawerFeeds={props.drawerFeeds} generators={props.generators} onFeedSelect={props.onFeedSelect} />
      <DisplayFiltersCard activePref={props.activePref} onPrefChange={props.onPrefChange} />
      <ShortcutsCard />
    </aside>
  );
}

function SavedFeedsCard(
  props: {
    drawerFeeds: SavedFeedItem[];
    generators: Record<string, FeedGeneratorView>;
    onFeedSelect: (feedId: string) => void;
  },
) {
  return (
    <SidebarCard title="Saved Feeds" subtitle="Drawer access">
      <div class="grid gap-2">
        <For each={props.drawerFeeds.slice(0, 4)}>
          {(feed) => (
            <SidebarFeedButton feed={feed} generator={props.generators[feed.value]} onSelect={props.onFeedSelect} />
          )}
        </For>
        <Show when={props.drawerFeeds.length === 0}>
          <p class="m-0 text-[0.8rem] leading-[1.6] text-on-surface-variant">
            All saved feeds are already pinned as tabs.
          </p>
        </Show>
      </div>
    </SidebarCard>
  );
}

function SidebarFeedButton(
  props: { feed: SavedFeedItem; generator?: FeedGeneratorView; onSelect: (feedId: string) => void },
) {
  return (
    <button
      class="flex w-full items-center gap-3 rounded-1xl border-0 bg-white/4 px-3 py-3 text-left text-on-surface transition duration-150 ease-out hover:-translate-y-px hover:bg-white/[0.07]"
      type="button"
      onClick={() => props.onSelect(props.feed.id)}>
      <FeedChipAvatar feed={props.feed} generator={props.generator} />
      <div class="min-w-0 flex-1">
        <p class="m-0 truncate text-sm font-medium">{getFeedName(props.feed, props.generator?.displayName)}</p>
        <p class="m-0 text-xs uppercase tracking-[0.08em] text-on-surface-variant">{props.feed.type}</p>
      </div>
    </button>
  );
}

function DisplayFiltersCard(
  props: {
    activePref: FeedViewPrefItem;
    onPrefChange: <K extends keyof FeedViewPrefItem>(key: K, value: FeedViewPrefItem[K]) => void;
  },
) {
  return (
    <SidebarCard title="Display Filters" subtitle="Per-feed">
      <div class="grid gap-3">
        <ToggleRow
          checked={props.activePref.hideReposts}
          label="Hide reposts"
          onChange={(checked) => void props.onPrefChange("hideReposts", checked)} />
        <ToggleRow
          checked={props.activePref.hideReplies}
          label="Hide replies"
          onChange={(checked) => void props.onPrefChange("hideReplies", checked)} />
        <ToggleRow
          checked={props.activePref.hideQuotePosts}
          label="Hide quotes"
          onChange={(checked) => void props.onPrefChange("hideQuotePosts", checked)} />
        <ReplyLikeThreshold
          value={props.activePref.hideRepliesByLikeCount}
          onChange={(value) => void props.onPrefChange("hideRepliesByLikeCount", value)} />
      </div>
    </SidebarCard>
  );
}

function ReplyLikeThreshold(props: { value: number | null; onChange: (value: number | null) => void }) {
  return (
    <label class="grid gap-2 text-[0.8rem] text-on-surface-variant">
      <span>Minimum likes for replies</span>
      <input
        class="rounded-full border-0 bg-white/6 px-4 py-2 text-on-surface shadow-[inset_0_0_0_1px_rgba(255,255,255,0.05)] focus:outline focus:outline-primary/50"
        min="0"
        type="number"
        value={props.value ?? ""}
        onInput={(event) => {
          const value = event.currentTarget.value.trim();
          props.onChange(value ? Number(value) : null);
        }} />
    </label>
  );
}

function ShortcutsCard() {
  return (
    <SidebarCard title="Shortcuts" subtitle="Feed controls">
      <div class="grid gap-2 text-[0.8rem] text-on-surface-variant">
        <ShortcutLine keys="1-9" label="Switch pinned feeds" />
        <ShortcutLine keys="j / k" label="Move focus" />
        <ShortcutLine keys="l" label="Like focused post" />
        <ShortcutLine keys="r" label="Reply to focused post" />
        <ShortcutLine keys="t" label="Repost focused post" />
        <ShortcutLine keys="o" label="Open thread" />
        <ShortcutLine keys="n" label="Open composer" />
      </div>
    </SidebarCard>
  );
}

function SidebarCard(props: ParentProps & { subtitle: string; title: string }) {
  return (
    <section class="rounded-3xl bg-white/3 p-4 shadow-[inset_0_0_0_1px_rgba(255,255,255,0.04)]">
      <p class="m-0 text-base font-semibold text-on-surface">{props.title}</p>
      <p class="mt-1 text-xs uppercase tracking-[0.12em] text-on-surface-variant">{props.subtitle}</p>
      <div class="mt-4">{props.children}</div>
    </section>
  );
}

function ToggleRow(props: { checked: boolean; label: string; onChange: (checked: boolean) => void }) {
  return (
    <label class="flex items-center justify-between gap-3 rounded-2xl bg-white/4 px-3 py-3 text-sm text-on-surface">
      <span>{props.label}</span>
      <input checked={props.checked} type="checkbox" onInput={(event) => props.onChange(event.currentTarget.checked)} />
    </label>
  );
}

function ShortcutLine(props: { keys: string; label: string }) {
  return (
    <div class="flex items-center justify-between gap-3 rounded-2xl bg-white/4 px-3 py-2.5">
      <span>{props.label}</span>
      <span class="rounded-full bg-black/30 px-2 py-1 text-[0.68rem] uppercase tracking-[0.08em] text-primary">
        {props.keys}
      </span>
    </div>
  );
}

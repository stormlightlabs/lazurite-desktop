import { getFeedName } from "$/lib/feeds";
import type { FeedGeneratorView, SavedFeedItem } from "$/lib/types";
import { For } from "solid-js";
import { Icon } from "../shared/Icon";
import { FeedChipAvatar } from "./FeedChipAvatar";

export function FeedTabBar(
  props: {
    activeFeedId: string;
    generators: Record<string, FeedGeneratorView>;
    onFeedSelect: (feedId: string) => void;
    onToggleDrawer: () => void;
    pinnedFeeds: SavedFeedItem[];
  },
) {
  return (
    <div class="mt-4 flex items-end justify-between gap-3 max-[720px]:flex-col max-[720px]:items-stretch">
      <div class="flex min-w-0 gap-1 overflow-x-auto overscroll-contain pb-1">
        <For each={props.pinnedFeeds}>
          {(feed, index) => (
            <FeedTab
              active={props.activeFeedId === feed.id}
              feed={feed}
              generator={props.generators[feed.value]}
              index={index() + 1}
              onSelect={props.onFeedSelect} />
          )}
        </For>
      </div>
      <button
        class="inline-flex h-11 items-center gap-2 rounded-full border-0 bg-white/5 px-4 text-sm text-on-surface transition duration-150 ease-out hover:-translate-y-px hover:bg-white/8"
        type="button"
        onClick={() => props.onToggleDrawer()}>
        <Icon aria-hidden="true" iconClass="i-ri-stack-line" />
        <span>Saved feeds</span>
      </button>
    </div>
  );
}

function FeedTab(
  props: {
    active: boolean;
    feed: SavedFeedItem;
    generator?: FeedGeneratorView;
    index: number;
    onSelect: (feedId: string) => void;
  },
) {
  return (
    <button
      class="relative inline-flex min-h-12 max-w-full shrink-0 items-center gap-2 rounded-full border-0 px-4 text-sm font-medium text-on-surface-variant transition duration-150 ease-out hover:bg-white/5 hover:text-on-surface"
      classList={{
        "bg-[rgba(125,175,255,0.12)] text-primary shadow-[inset_0_0_0_1px_rgba(125,175,255,0.2)]": props.active,
      }}
      type="button"
      onClick={() => props.onSelect(props.feed.id)}>
      <FeedChipAvatar feed={props.feed} generator={props.generator} />
      <span class="truncate">{getFeedName(props.feed, props.generator?.displayName)}</span>
      <span class="rounded-full bg-black/25 px-1.5 py-0.5 text-[0.65rem] text-on-surface-variant">{props.index}</span>
    </button>
  );
}

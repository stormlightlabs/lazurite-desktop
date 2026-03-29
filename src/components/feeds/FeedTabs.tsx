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
    <div class="mt-4 flex items-start gap-3 max-[720px]:mt-3 max-[720px]:gap-2">
      <div class="flex min-w-0 flex-1 gap-1.5 overflow-x-auto overscroll-contain pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        <For each={props.pinnedFeeds}>
          {(feed) => (
            <FeedTab
              active={props.activeFeedId === feed.id}
              feed={feed}
              generator={props.generators[feed.value]}
              onSelect={props.onFeedSelect} />
          )}
        </For>
      </div>
      <button
        class="inline-flex h-11 shrink-0 items-center gap-2 rounded-full border-0 bg-white/5 px-4 text-sm text-on-surface transition duration-150 ease-out hover:-translate-y-px hover:bg-white/8 max-[1040px]:px-3 max-[1040px]:text-xs max-[920px]:hidden"
        type="button"
        onClick={() => props.onToggleDrawer()}>
        <Icon aria-hidden="true" iconClass="i-ri-stack-line" />
        <span>Saved feeds</span>
      </button>
    </div>
  );
}

function FeedTab(
  props: { active: boolean; feed: SavedFeedItem; generator?: FeedGeneratorView; onSelect: (feedId: string) => void },
) {
  return (
    <button
      class="relative inline-flex min-h-12 max-w-full shrink-0 items-center gap-2 rounded-full border-0 px-4 text-sm font-medium text-on-surface-variant transition duration-150 ease-out hover:bg-white/5 hover:text-on-surface max-[720px]:min-h-11 max-[720px]:gap-1.5 max-[720px]:px-3 max-[720px]:text-[0.82rem]"
      classList={{
        "bg-[rgba(125,175,255,0.12)] text-primary shadow-[inset_0_0_0_1px_rgba(125,175,255,0.2)]": props.active,
      }}
      type="button"
      onClick={() => props.onSelect(props.feed.id)}>
      <FeedChipAvatar feed={props.feed} generator={props.generator} />
      <span class="max-w-[11rem] truncate max-[900px]:max-w-[9rem] max-[720px]:max-w-[7.5rem]">
        {getFeedName(props.feed, props.generator?.displayName)}
      </span>
    </button>
  );
}

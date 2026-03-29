import { getFeedName } from "$/lib/feeds";
import type { FeedGeneratorView, SavedFeedItem } from "$/lib/types";
import { For, Show } from "solid-js";
import { Motion, Presence } from "solid-motionone";
import { Icon } from "../shared/Icon";
import { FeedChipAvatar } from "./FeedChipAvatar";

export function SavedFeedsDrawer(
  props: {
    drawerFeeds: SavedFeedItem[];
    generators: Record<string, FeedGeneratorView>;
    open: boolean;
    pinnedFeeds: SavedFeedItem[];
    onClose: () => void;
    onPinFeed: (feedId: string) => void;
    onReorderPinned: (feedId: string, direction: "up" | "down") => void;
    onSelectFeed: (feedId: string) => void;
    onUnpinFeed: (feedId: string) => void;
  },
) {
  return (
    <Presence>
      <Show when={props.open}>
        <Motion.aside
          class="fixed inset-y-0 right-0 z-30 w-full max-w-104 overflow-y-auto overscroll-contain border-l border-white/5 bg-[rgba(12,12,12,0.95)] px-5 pb-6 pt-5 backdrop-blur-[22px] shadow-[-28px_0_50px_rgba(0,0,0,0.35)]"
          initial={{ opacity: 0, x: 20 }}
          animate={{ opacity: 1, x: 0 }}
          exit={{ opacity: 0, x: 24 }}
          transition={{ duration: 0.2 }}>
          <DrawerHeader onClose={props.onClose} />
          <DrawerContent {...props} />
        </Motion.aside>
      </Show>
    </Presence>
  );
}

function DrawerContent(
  props: {
    drawerFeeds: SavedFeedItem[];
    generators: Record<string, FeedGeneratorView>;
    pinnedFeeds: SavedFeedItem[];
    onPinFeed: (feedId: string) => void;
    onReorderPinned: (feedId: string, direction: "up" | "down") => void;
    onSelectFeed: (feedId: string) => void;
    onUnpinFeed: (feedId: string) => void;
  },
) {
  return (
    <>
      <PinnedFeedsSection {...props} />
      <UnpinnedFeedsSection {...props} />
      <Show when={props.pinnedFeeds.length === 0 && props.drawerFeeds.length === 0}>
        <p class="mt-8 text-center text-sm text-on-surface-variant">No saved feeds yet.</p>
      </Show>
    </>
  );
}

function PinnedFeedsSection(
  props: {
    generators: Record<string, FeedGeneratorView>;
    pinnedFeeds: SavedFeedItem[];
    onReorderPinned: (feedId: string, direction: "up" | "down") => void;
    onSelectFeed: (feedId: string) => void;
    onUnpinFeed: (feedId: string) => void;
  },
) {
  return (
    <Show when={props.pinnedFeeds.length > 0}>
      <div class="mt-6">
        <p class="m-0 text-xs uppercase tracking-[0.12em] text-on-surface-variant">Pinned Feeds</p>
        <div class="mt-3 grid gap-2">
          <For each={props.pinnedFeeds}>
            {(feed, index) => (
              <DrawerPinnedFeedRow
                feed={feed}
                generator={props.generators[feed.value]}
                index={index()}
                isFirst={index() === 0}
                isLast={index() === props.pinnedFeeds.length - 1}
                onSelect={() => props.onSelectFeed(feed.id)}
                onUnpin={() => props.onUnpinFeed(feed.id)}
                onMoveUp={() => props.onReorderPinned(feed.id, "up")}
                onMoveDown={() => props.onReorderPinned(feed.id, "down")} />
            )}
          </For>
        </div>
      </div>
    </Show>
  );
}

function UnpinnedFeedsSection(
  props: {
    drawerFeeds: SavedFeedItem[];
    generators: Record<string, FeedGeneratorView>;
    onPinFeed: (feedId: string) => void;
    onSelectFeed: (feedId: string) => void;
  },
) {
  return (
    <Show when={props.drawerFeeds.length > 0}>
      <div class="mt-6">
        <p class="m-0 text-xs uppercase tracking-[0.12em] text-on-surface-variant">Saved Feeds</p>
        <div class="mt-3 grid gap-2">
          <For each={props.drawerFeeds}>
            {(feed) => (
              <DrawerUnpinnedFeedRow
                feed={feed}
                generator={props.generators[feed.value]}
                onSelect={() => props.onSelectFeed(feed.id)}
                onPin={() => props.onPinFeed(feed.id)} />
            )}
          </For>
        </div>
      </div>
    </Show>
  );
}

function DrawerHeader(props: { onClose: () => void }) {
  return (
    <div class="flex items-center justify-between">
      <div>
        <p class="m-0 text-[1rem] font-semibold text-on-surface">Saved Feeds</p>
        <p class="m-0 text-xs uppercase tracking-[0.12em] text-on-surface-variant">All Saved Feeds</p>
      </div>
      <button
        class="inline-flex h-10 w-10 items-center justify-center rounded-xl border-0 bg-transparent text-on-surface-variant transition duration-150 ease-out hover:bg-white/5 hover:text-on-surface"
        type="button"
        onClick={() => props.onClose()}>
        <Icon aria-hidden="true" iconClass="i-ri-close-line" />
      </button>
    </div>
  );
}

function DrawerPinnedFeedRow(
  props: {
    feed: SavedFeedItem;
    generator?: FeedGeneratorView;
    index: number;
    isFirst: boolean;
    isLast: boolean;
    onSelect: () => void;
    onUnpin: () => void;
    onMoveUp: () => void;
    onMoveDown: () => void;
  },
) {
  return (
    <div class="flex items-center gap-2 rounded-2xl bg-white/4 px-3 py-3 transition duration-150 ease-out hover:bg-white/6">
      <button class="flex min-w-0 flex-1 items-center gap-3 text-left" type="button" onClick={() => props.onSelect()}>
        <FeedChipAvatar feed={props.feed} generator={props.generator} />
        <div class="min-w-0 flex-1">
          <p class="m-0 truncate text-[0.88rem] font-semibold text-on-surface">
            {getFeedName(props.feed, props.generator?.displayName)}
          </p>
          <p class="m-0 break-all text-xs text-on-surface-variant">{props.feed.value}</p>
        </div>
      </button>
      <div class="flex items-center gap-1">
        <button
          class="inline-flex h-8 w-8 items-center justify-center rounded-lg border-0 bg-transparent text-on-surface-variant transition duration-150 ease-out hover:bg-white/5 hover:text-on-surface disabled:opacity-30"
          type="button"
          disabled={props.isFirst}
          title="Move up"
          onClick={() => props.onMoveUp()}>
          <Icon aria-hidden="true" iconClass="i-ri-arrow-up-line" />
        </button>
        <button
          class="inline-flex h-8 w-8 items-center justify-center rounded-lg border-0 bg-transparent text-on-surface-variant transition duration-150 ease-out hover:bg-white/5 hover:text-on-surface disabled:opacity-30"
          type="button"
          disabled={props.isLast}
          title="Move down"
          onClick={() => props.onMoveDown()}>
          <Icon aria-hidden="true" iconClass="i-ri-arrow-down-line" />
        </button>
        <button
          class="inline-flex h-8 w-8 items-center justify-center rounded-lg border-0 bg-transparent text-on-surface-variant transition duration-150 ease-out hover:bg-white/5 hover:text-primary"
          type="button"
          title="Unpin from tabs"
          onClick={() => props.onUnpin()}>
          <Icon aria-hidden="true" iconClass="i-ri-unpin-line" />
        </button>
      </div>
    </div>
  );
}

function DrawerUnpinnedFeedRow(
  props: { feed: SavedFeedItem; generator?: FeedGeneratorView; onSelect: () => void; onPin: () => void },
) {
  return (
    <div class="flex items-center gap-2 rounded-2xl bg-white/4 px-3 py-3 transition duration-150 ease-out hover:bg-white/6">
      <button class="flex min-w-0 flex-1 items-center gap-3 text-left" type="button" onClick={() => props.onSelect()}>
        <FeedChipAvatar feed={props.feed} generator={props.generator} />
        <div class="min-w-0 flex-1">
          <p class="m-0 truncate text-[0.88rem] font-semibold text-on-surface">
            {getFeedName(props.feed, props.generator?.displayName)}
          </p>
          <p class="m-0 break-all text-xs text-on-surface-variant">{props.feed.value}</p>
        </div>
      </button>
      <button
        class="inline-flex h-8 w-8 items-center justify-center rounded-lg border-0 bg-transparent text-on-surface-variant transition duration-150 ease-out hover:bg-white/5 hover:text-primary"
        type="button"
        title="Pin to tabs"
        onClick={() => props.onPin()}>
        <Icon aria-hidden="true" iconClass="i-ri-pushpin-line" />
      </button>
    </div>
  );
}

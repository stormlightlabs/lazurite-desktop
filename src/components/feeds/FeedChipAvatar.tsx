import { Icon, type IconKind } from "$/components/shared/Icon";
import type { FeedGeneratorView, SavedFeedItem } from "$/lib/types";
import { createMemo, Show } from "solid-js";

export function FeedChipAvatar(props: { feed: SavedFeedItem; generator?: FeedGeneratorView }) {
  const icon = createMemo<IconKind>(() => {
    switch (props.feed.type) {
      case "list": {
        return "check";
      }
      case "timeline": {
        return "timeline";
      }
      default: {
        return "rss";
      }
    }
  });

  return (
    <Show
      when={props.generator?.avatar}
      fallback={
        <div class="flex h-8 w-8 items-center justify-center rounded-full bg-white/6 text-primary">
          <Icon aria-hidden kind={icon()} />
        </div>
      }>
      {(avatar) => <img class="h-8 w-8 rounded-full object-cover" src={avatar()} alt="" />}
    </Show>
  );
}

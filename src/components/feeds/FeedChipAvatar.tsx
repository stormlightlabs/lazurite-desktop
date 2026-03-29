import { Icon } from "$/components/shared/Icon";
import type { FeedGeneratorView, SavedFeedItem } from "$/lib/types";
import { createMemo, Show } from "solid-js";

export function FeedChipAvatar(props: { feed: SavedFeedItem; generator?: FeedGeneratorView }) {
  const icon = createMemo(() => {
    switch (props.feed.type) {
      case "list": {
        return "i-ri-list-check-2";
      }
      case "timeline": {
        return "i-ri-home-5-line";
      }
      default: {
        return "i-ri-rss-line";
      }
    }
  });

  return (
    <Show
      when={props.generator?.avatar}
      fallback={
        <div class="flex h-8 w-8 items-center justify-center rounded-full bg-white/6 text-primary">
          <Icon aria-hidden="true" iconClass={icon()} />
        </div>
      }>
      {(avatar) => <img class="h-8 w-8 rounded-full object-cover" src={avatar()} alt="" />}
    </Show>
  );
}

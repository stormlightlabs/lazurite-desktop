import { FeedController } from "$/lib/api/feeds";
import { getFeedName } from "$/lib/feeds";
import type { FeedGeneratorView, SavedFeedItem } from "$/lib/types";
import * as logger from "@tauri-apps/plugin-log";
import { createSignal, For, onMount, Show } from "solid-js";
import { FeedChipAvatar } from "../feeds/FeedChipAvatar";
import { Icon, LoadingIcon } from "../shared/Icon";
import type { FeedPickerSelection } from "./types";

function feedKindLabel(feed: SavedFeedItem) {
  switch (feed.type) {
    case "timeline": {
      return "Timeline";
    }
    case "list": {
      return "List";
    }
    default: {
      return "Feed";
    }
  }
}

export function FeedPicker(props: { onSelect: (selection: FeedPickerSelection) => void }) {
  const [feeds, setFeeds] = createSignal<SavedFeedItem[]>([]);
  const [generators, setGenerators] = createSignal<Record<string, FeedGeneratorView>>({});
  const [loading, setLoading] = createSignal(true);

  onMount(async () => {
    try {
      const prefs = await FeedController.getPreferences();
      setFeeds(prefs.savedFeeds);

      const uris = [...new Set(prefs.savedFeeds.filter((feed) => feed.type === "feed").map((feed) => feed.value))];
      if (uris.length > 0) {
        const hydrated = await FeedController.getFeedGenerators(uris);
        setGenerators(Object.fromEntries(hydrated.feeds.map((generator) => [generator.uri, generator])));
      }
    } catch (err) {
      logger.error(`Failed to load feeds for column picker: ${String(err)}`);
    } finally {
      setLoading(false);
    }
  });

  return (
    <div class="grid gap-2">
      <Show when={loading()}>
        <div class="flex items-center justify-center py-6">
          <LoadingIcon isLoading class="text-on-surface-variant" />
        </div>
      </Show>

      <Show when={!loading() && feeds().length === 0}>
        <p class="py-4 text-center text-sm text-on-surface-variant">No saved feeds found.</p>
      </Show>

      <For
        each={feeds()}
        fallback={
          <Show when={!loading()}>
            <p class="py-4 text-center text-sm text-on-surface-variant">No saved feeds found.</p>
          </Show>
        }>
        {(feed) => (
          <button
            type="button"
            class="tone-muted flex w-full items-center gap-3 rounded-xl border-0 px-4 py-3 text-left transition duration-150 hover:-translate-y-px hover:bg-surface-bright"
            onClick={() => props.onSelect({ feed, title: getFeedName(feed, generators()[feed.value]?.displayName) })}>
            <FeedChipAvatar feed={feed} generator={generators()[feed.value]} />
            <span class="min-w-0 flex-1">
              <span class="block truncate text-sm font-medium text-on-surface">
                {getFeedName(feed, generators()[feed.value]?.displayName)}
              </span>
              <span class="block truncate text-xs text-on-surface-variant">{feedKindLabel(feed)}</span>
            </span>
          </button>
        )}
      </For>
    </div>
  );
}

export function ExplorerPicker(props: { onSubmit: (uri: string) => void }) {
  const [value, setValue] = createSignal("");

  function handleSubmit(e: Event) {
    e.preventDefault();
    const uri = value().trim();
    if (uri) {
      props.onSubmit(uri);
    }
  }

  return (
    <form onSubmit={handleSubmit} class="grid gap-3">
      <label class="grid gap-1.5">
        <span class="text-xs font-medium uppercase tracking-wide text-on-surface-variant">
          Target URI / handle / DID / PDS URL
        </span>
        <input
          type="text"
          class="ui-input ui-input-strong rounded-xl px-4 py-2.5"
          placeholder="at://did:plc:… or handle.bsky.social"
          value={value()}
          onInput={(e) => setValue(e.currentTarget.value)} />
      </label>

      <button
        type="submit"
        disabled={!value().trim()}
        class="flex items-center justify-center gap-2 rounded-xl border-0 bg-primary/15 px-4 py-2.5 text-sm font-medium text-primary transition duration-150 hover:-translate-y-px hover:bg-primary/25 disabled:cursor-not-allowed disabled:opacity-40">
        <Icon kind="explore" />
        Open in column
      </button>
    </form>
  );
}

export function DiagnosticsPicker(props: { onSubmit: (did: string) => void }) {
  const [value, setValue] = createSignal("");

  function handleSubmit(e: Event) {
    e.preventDefault();
    const did = value().trim();
    if (did) {
      props.onSubmit(did);
    }
  }

  return (
    <form onSubmit={handleSubmit} class="grid gap-3">
      <label class="grid gap-1.5">
        <span class="text-xs font-medium uppercase tracking-wide text-on-surface-variant">Handle or DID</span>
        <input
          type="text"
          class="ui-input ui-input-strong rounded-xl px-4 py-2.5"
          placeholder="handle.bsky.social or did:plc:…"
          value={value()}
          onInput={(e) => setValue(e.currentTarget.value)} />
      </label>

      <button
        type="submit"
        disabled={!value().trim()}
        class="flex items-center justify-center gap-2 rounded-xl border-0 bg-primary/15 px-4 py-2.5 text-sm font-medium text-primary transition duration-150 hover:-translate-y-px hover:bg-primary/25 disabled:cursor-not-allowed disabled:opacity-40">
        <Icon kind="diagnostics" />
        Open diagnostics
      </button>
    </form>
  );
}

export function MessagesPicker(props: { onSubmit: () => void }) {
  return (
    <div class="grid gap-4">
      <div class="rounded-2xl bg-surface-container-high p-4 shadow-(--inset-shadow)">
        <div class="flex items-start gap-3">
          <Icon kind="messages" class="text-primary mt-0.5" />
          <div class="grid gap-1.5">
            <p class="m-0 text-sm font-medium text-on-surface">Direct messages</p>
            <p class="m-0 text-xs leading-relaxed text-on-surface-variant">
              Opens your DM inbox inside the deck. Message content is blurred until you hover or focus the column.
            </p>
          </div>
        </div>
      </div>

      <button
        type="button"
        class="flex items-center justify-center gap-2 rounded-xl border-0 bg-primary/15 px-4 py-2.5 text-sm font-medium text-primary transition duration-150 hover:-translate-y-px hover:bg-primary/25"
        onClick={() => props.onSubmit()}>
        <Icon kind="deck" />
        Add DM column
      </button>
    </div>
  );
}

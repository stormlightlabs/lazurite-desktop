import { Show } from "solid-js";

export function PostCount(props: { totalPosts: number; lastSync?: string | null; inline?: boolean }) {
  return (
    <Show when={props.inline} fallback={<BlockPostCount totalPosts={props.totalPosts} lastSync={props.lastSync} />}>
      <InlinePostCount totalPosts={props.totalPosts} lastSync={props.lastSync} />
    </Show>
  );
}

function InlinePostCount(props: { totalPosts: number; lastSync?: string | null }) {
  return (
    <span class="inline-flex items-center gap-1 text-xs text-on-surface-variant">
      <span class="font-medium text-primary">{props.totalPosts}</span>
      <span>Indexed</span>
      <Show when={props.lastSync}>
        {(value) => (
          <>
            <span>·</span>
            <span>Sync {value()}</span>
          </>
        )}
      </Show>
    </span>
  );
}

function BlockPostCount(props: { totalPosts: number; lastSync?: string | null }) {
  return (
    <p class="text-xs text-on-surface-variant">
      <span class="inline-flex items-center gap-2">
        <span class="font-medium text-primary">{props.totalPosts}</span>
        <span>posts indexed</span>
        <Show when={props.lastSync}>
          {(value) => (
            <>
              <span>·</span>
              <span>Last sync {value()}</span>
            </>
          )}
        </Show>
      </span>
    </p>
  );
}

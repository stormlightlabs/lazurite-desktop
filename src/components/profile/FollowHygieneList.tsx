import { queueExplorerTarget } from "$/lib/explorer-navigation";
import type { FlaggedFollow } from "$/lib/types";
import { For, Show } from "solid-js";
import { Motion } from "solid-motionone";
import { Icon } from "../shared/Icon";
import { displayHandle, type FollowHygienePhase, getAtExplorerHref, getProfileHref, statusChipClass } from "./types";

export type FollowListViewportProps = {
  exitingUris: Set<string>;
  flagged: FlaggedFollow[];
  focusedUri: string | null;
  phase: FollowHygienePhase;
  selectedUris: Set<string>;
  onFocusUri: (uri: string) => void;
  onSpaceToggle: (uri: string) => void;
  onToggle: (uri: string) => void;
};

type FollowRowProps = {
  exiting: boolean;
  follow: FlaggedFollow;
  focused: boolean;
  index: number;
  selected: boolean;
  onFocus: () => void;
  onToggle: () => void;
  onToggleBySpace: () => void;
};

function FollowRow(props: FollowRowProps) {
  return (
    <Motion.article
      class="tone-muted rounded-2xl p-3 transition-colors duration-150"
      classList={{ "bg-red-500/12": props.selected, "ring-1 ring-[var(--focus-ring)]": props.focused }}
      animate={{ opacity: props.exiting ? 0 : 1, x: props.exiting ? 20 : 0, y: 0 }}
      initial={{ opacity: 0, y: 6 }}
      transition={{ duration: 0.18, delay: Math.min(props.index * 0.02, 0.2) }}
      tabIndex={0}
      onFocus={() => props.onFocus()}
      onKeyDown={(event) => {
        if (event.key === " ") {
          event.preventDefault();
          props.onToggleBySpace();
        }
      }}>
      <div class="flex items-start gap-3">
        <input
          aria-label={`Select ${displayHandle(props.follow)}`}
          checked={props.selected}
          class="mt-0.5 h-4 w-4 rounded ui-outline-strong bg-transparent text-primary focus:ring-(--focus-ring)"
          type="checkbox"
          onChange={() => props.onToggle()} />

        <div class="grid min-w-0 flex-1 gap-1">
          <div class="flex flex-wrap items-center gap-2">
            <a
              class="truncate text-sm font-medium text-on-surface no-underline transition hover:text-primary"
              href={getProfileHref(props.follow)}
              onClick={(event) => event.stopPropagation()}>
              {displayHandle(props.follow)}
            </a>
            <span class={`rounded-full px-2 py-1 text-[0.72rem] font-medium ${statusChipClass(props.follow.status)}`}>
              {props.follow.statusLabel}
            </span>
          </div>

          <a
            class="truncate text-xs text-on-surface-variant no-underline transition hover:text-on-surface"
            href={getProfileHref(props.follow)}
            onClick={(event) => event.stopPropagation()}>
            {props.follow.did}
          </a>
        </div>

        <a
          class="inline-flex items-center gap-1 rounded-full px-2 py-1 text-xs text-on-surface-variant no-underline transition hover:bg-surface-bright hover:text-primary"
          href={getAtExplorerHref(props.follow)}
          onClick={() => queueExplorerTarget(props.follow.followUri)}>
          <span>AT Explorer</span>
          <Icon kind="ext-link" class="text-sm" />
        </a>
      </div>
    </Motion.article>
  );
}

function FollowScanSkeleton() {
  return (
    <div class="grid gap-2">
      <For each={Array.from({ length: 6 })}>
        {() => (
          <div class="tone-muted rounded-2xl p-3">
            <div class="flex items-center gap-3">
              <span class="skeleton-block h-4 w-4 rounded-sm" />
              <div class="grid flex-1 gap-1.5">
                <span class="skeleton-block h-3.5 w-40 rounded-full" />
                <span class="skeleton-block h-3 w-64 rounded-full" />
              </div>
            </div>
          </div>
        )}
      </For>
    </div>
  );
}

function FollowListEmptyState(props: { phase: FollowHygienePhase }) {
  const message = () => props.phase === "idle" ? "Run a scan to inspect your follows." : "No flagged follows found.";
  const detail = () =>
    props.phase === "idle"
      ? "This checks for deleted, deactivated, blocked, hidden, and self-follow accounts."
      : "Your following list looks clean.";

  return (
    <div class="grid min-h-56 place-items-center p-6 text-center">
      <div class="grid max-w-md gap-2">
        <p class="m-0 text-base font-medium text-on-surface">{message()}</p>
        <p class="m-0 text-sm leading-relaxed text-on-surface-variant">{detail()}</p>
      </div>
    </div>
  );
}

export function FollowListViewport(props: FollowListViewportProps) {
  return (
    <div class="panel-surface min-h-0 overflow-y-auto p-3">
      <Show when={props.phase !== "scanning"} fallback={<FollowScanSkeleton />}>
        <Show when={props.flagged.length > 0} fallback={<FollowListEmptyState phase={props.phase} />}>
          <div class="grid gap-2">
            <For each={props.flagged}>
              {(follow, index) => (
                <FollowRow
                  exiting={props.exitingUris.has(follow.followUri)}
                  follow={follow}
                  focused={props.focusedUri === follow.followUri}
                  index={index()}
                  selected={props.selectedUris.has(follow.followUri)}
                  onFocus={() => props.onFocusUri(follow.followUri)}
                  onToggle={() => props.onToggle(follow.followUri)}
                  onToggleBySpace={() => props.onSpaceToggle(follow.followUri)} />
              )}
            </For>
          </div>
        </Show>
      </Show>
    </div>
  );
}

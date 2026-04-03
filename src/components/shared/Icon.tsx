import type { SearchMode } from "$/lib/api/search";
import type { ExplorerTargetKind } from "$/lib/api/types/explorer";
import { type JSX, Match, splitProps, Switch } from "solid-js";

export type ActionIconKind = "add" | "edit" | "delete" | "save" | "cancel";

export type SettingsIconKind =
  | "computer"
  | "info"
  | "timeline"
  | "db"
  | "notifications"
  | "user"
  | "services"
  | "theme";

export type IconKind =
  | "explorer"
  | "ext-link"
  | "loader"
  | "logout"
  | "notifications"
  | "settings"
  | "profile"
  | "refresh"
  | "search"
  | "timeline"
  | "user"
  | "menu"
  | "quill"
  | "at"
  | "hashtag"
  | "quote"
  | "close"
  | "folder"
  | "file"
  | "like"
  | "heart"
  | "db"
  | "complete"
  | "explore"
  | "compass"
  | "danger"
  | "repost"
  | "reply"
  | "follow"
  | "download"
  | "info"
  | "computer"
  | "timeline"
  | "db"
  | "notifications"
  | "user"
  | "services"
  | "theme"
  | "deck"
  | "list"
  | "rss"
  | "messages"
  | "unpin"
  | "bookmark";

type IconProps = JSX.HTMLAttributes<HTMLSpanElement> & {
  class?: string;
  iconClass?: string;
  kind?: IconKind;
  name?: string;
};

export function Icon(props: IconProps) {
  const [local, rest] = splitProps(props, ["class", "iconClass", "kind", "name"]);

  return (
    <span {...rest} class="flex items-center justify-center" classList={{ [local.class ?? ""]: !!local.class }}>
      <Switch>
        <Match when={!!local.iconClass}>
          <i class={local.iconClass} />
        </Match>
        <Match when={local.kind === "quill"}>
          <i class="i-ri-quill-pen-line" />
        </Match>
        <Match when={local.kind === "menu"}>
          <i class="i-ri-menu-line" />
        </Match>
        <Match when={local.kind === "loader"}>
          <i class="i-ri-loader-4-line" />
        </Match>
        <Match when={local.kind === "user"}>
          <i class="i-ri-user-shared-line" />
        </Match>
        <Match when={local.kind === "logout"}>
          <i class="i-ri-logout-box-line" />
        </Match>
        <Match when={local.kind === "profile"}>
          <i class="i-ri-user-3-line" />
        </Match>
        <Match when={local.kind === "search"}>
          <i class="i-ri-search-line" />
        </Match>
        <Match when={local.kind === "timeline"}>
          <i class="i-ri-home-5-line" />
        </Match>
        <Match when={local.kind === "notifications"}>
          <i class="i-ri-notification-3-line" />
        </Match>
        <Match when={local.kind === "explorer"}>
          <i class="i-ri-compass-discover-line" />
        </Match>
        <Match when={local.kind === "refresh"}>
          <i class="i-ri-refresh-line" />
        </Match>
        <Match when={local.kind === "ext-link"}>
          <i class="i-ri-external-link-line" />
        </Match>
        <Match when={local.kind === "at"}>
          <i class="i-ri-at-line" />
        </Match>
        <Match when={local.kind === "hashtag"}>
          <i class="i-ri-hashtag" />
        </Match>
        <Match when={local.kind === "close"}>
          <i class="i-ri-close-line" />
        </Match>
        <Match when={local.kind === "quote"}>
          <i class="i-ri-chat-quote-line" />
        </Match>
        <Match when={local.kind === "folder"}>
          <i class="i-ri-folder-line" />
        </Match>
        <Match when={local.kind === "file"}>
          <i class="i-ri-file-line" />
        </Match>
        <Match when={local.kind === "like"}>
          <i class="i-ri-thumb-up-line" />
        </Match>
        <Match when={local.kind === "heart"}>
          <i class="i-ri-heart-line" />
        </Match>
        <Match when={local.kind === "db"}>
          <i class="i-ri-database-2-line" />
        </Match>
        <Match when={local.kind === "explore" || local.kind === "compass"}>
          <i class="i-ri-compass-discover-line" />
        </Match>
        <Match when={local.kind === "complete"}>
          <i class="i-ri-check-double-line" />
        </Match>
        <Match when={local.kind === "danger"}>
          <i class="i-ri-error-warning-line" />
        </Match>
        <Match when={local.kind === "reply"}>
          <i class="i-ri-chat-3-line" />
        </Match>
        <Match when={local.kind === "repost"}>
          <i class="i-ri-repeat-2-line" />
        </Match>
        <Match when={local.kind === "follow"}>
          <i class="i-ri-user-add-line" />
        </Match>
        <Match when={local.kind === "download"}>
          <i class="i-ri-download-cloud-line" />
        </Match>
        <Match when={local.kind === "settings"}>
          <i class="i-ri-settings-3-line" />
        </Match>
        <Match when={local.kind === "deck"}>
          <i class="i-ri-layout-column-line" />
        </Match>
        <Match when={local.kind === "list"}>
          <i class="i-ri-list-check-3-line" />
        </Match>
        <Match when={local.kind === "rss"}>
          <i class="i-ri-rss-line" />
        </Match>
        <Match when={local.kind === "messages"}>
          <i class="i-ri-message-3-line" />
        </Match>
        <Match when={local.kind === "unpin"}>
          <i class="i-ri-unpin-line" />
        </Match>
        <Match when={local.kind === "bookmark"}>
          <i class="i-ri-bookmark-line" />
        </Match>
      </Switch>
    </span>
  );
}

export function SettingsIcon(props: IconProps & { kind: SettingsIconKind }) {
  const [local, rest] = splitProps(props, ["class", "iconClass", "kind", "name"]);
  return (
    <span {...rest} class="flex items-center justify-center" classList={{ [local.class ?? ""]: !!local.class }}>
      <Switch>
        <Match when={local.kind === "info"}>
          <i class="i-ri-information-line" />
        </Match>
        <Match when={local.kind === "computer"}>
          <i class="i-ri-computer-line" />
        </Match>
        <Match when={local.kind === "timeline"}>
          <i class="i-ri-timeline-view" />
        </Match>
        <Match when={local.kind === "db"}>
          <i class="i-ri-database-2-line" />
        </Match>
        <Match when={local.kind === "notifications"}>
          <i class="i-ri-notification-3-line" />
        </Match>
        <Match when={local.kind === "user"}>
          <i class="i-ri-user-lin" />
        </Match>
        <Match when={local.kind === "services"}>
          <i class="i-ri-global-line" />
        </Match>
        <Match when={local.kind === "theme"}>
          <i class="i-ri-paint-line" />
        </Match>
      </Switch>
    </span>
  );
}

export function ArrowIcon(
  props: JSX.HTMLAttributes<HTMLSpanElement> & { class?: string; direction: "up" | "down" | "left" | "right" },
) {
  const [local, rest] = splitProps(props, ["class", "direction"]);
  return (
    <span class="flex items-center justify-center" classList={{ [local.class ?? ""]: !!local.class }} {...rest}>
      <Switch>
        <Match when={local.direction === "up"}>
          <i class="i-ri-arrow-up-s-line" />
        </Match>
        <Match when={local.direction === "down"}>
          <i class="i-ri-arrow-down-s-line" />
        </Match>
        <Match when={local.direction === "left"}>
          <i class="i-ri-arrow-left-s-line" />
        </Match>
        <Match when={local.direction === "right"}>
          <i class="i-ri-arrow-right-s-line" />
        </Match>
      </Switch>
    </span>
  );
}

export function ExplorerLevelIcon(props: { level: ExplorerTargetKind; class?: string }) {
  return (
    <span class="flex items-center justify-center" classList={{ [props.class ?? ""]: !!props.class }}>
      <Switch>
        <Match when={props.level === "pds"}>
          <i class="i-ri-server-line" />
        </Match>
        <Match when={props.level === "repo"}>
          <i class="i-ri-user-line" />
        </Match>
        <Match when={props.level === "collection"}>
          <i class="i-ri-folder-line" />
        </Match>
        <Match when={props.level === "record"}>
          <i class="i-ri-file-line" />
        </Match>
      </Switch>
    </span>
  );
}

export function SearchModeIcon(props: { mode: SearchMode; class?: string }) {
  return (
    <span class="flex items-center justify-center" classList={{ [props.class ?? ""]: !!props.class }}>
      <Switch>
        <Match when={props.mode === "network"}>
          <i class="i-ri-global-line" />
        </Match>
        <Match when={props.mode === "keyword"}>
          <i class="i-ri-search-line" />
        </Match>
        <Match when={props.mode === "semantic"}>
          <i class="i-ri-bubble-chart-line" />
        </Match>
        <Match when={props.mode === "hybrid"}>
          <i class="i-ri-stack-line" />
        </Match>
      </Switch>
    </span>
  );
}

export function ActionIcon(props: Omit<IconProps, "kind"> & { kind: ActionIconKind }) {
  const [local, rest] = splitProps(props, ["class", "iconClass", "kind", "name"]);
  return (
    <span class="flex items-center justify-center" classList={{ [local.class ?? ""]: !!local.class }} {...rest}>
      <Switch>
        <Match when={local.kind === "add"}>
          <i class="i-ri-add-line" />
        </Match>
        <Match when={local.kind === "edit"}>
          <i class="i-ri-edit-line" />
        </Match>
        <Match when={local.kind === "delete"}>
          <i class="i-ri-delete-line" />
        </Match>
        <Match when={local.kind === "save"}>
          <i class="i-ri-save-line" />
        </Match>
        <Match when={local.kind === "cancel"}>
          <i class="i-ri-close-line" />
        </Match>
      </Switch>
    </span>
  );
}

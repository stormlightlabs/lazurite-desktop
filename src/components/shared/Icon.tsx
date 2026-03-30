import type { ExplorerTargetKind } from "$/lib/api/types/explorer";
import { type JSX, Match, splitProps, Switch } from "solid-js";

export type IconKind =
  | "explorer"
  | "ext-link"
  | "loader"
  | "logout"
  | "notifications"
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
  | "file";

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
      </Switch>
    </span>
  );
}

export function ArrowIcon(props: { class?: string; direction: "up" | "down" | "left" | "right" }) {
  return (
    <span class="flex items-center justify-center" classList={{ [props.class ?? ""]: !!props.class }}>
      <Switch>
        <Match when={props.direction === "up"}>
          <i class="i-ri-arrow-up-s-line" />
        </Match>
        <Match when={props.direction === "down"}>
          <i class="i-ri-arrow-down-s-line" />
        </Match>
        <Match when={props.direction === "left"}>
          <i class="i-ri-arrow-left-s-line" />
        </Match>
        <Match when={props.direction === "right"}>
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

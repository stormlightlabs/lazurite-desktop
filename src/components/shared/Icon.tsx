import { Match, Switch } from "solid-js";

export type IconKind = "loader" | "user" | "logout" | "profile" | "search" | "refresh" | "ext-link";

export function Icon(props: { name: string; class?: string; kind: IconKind }) {
  return (
    <span class="flex items-center justify-center" classList={{ [props.class ?? ""]: !!props.class }}>
      <Switch>
        <Match when={props.kind === "loader"}>
          <i class="i-ri-loader-4-line" />
        </Match>
        <Match when={props.kind === "user"}>
          <i class="i-ri-user-shared-line" />
        </Match>
        <Match when={props.kind === "logout"}>
          <i class="i-ri-logout-box-line" />
        </Match>
        <Match when={props.kind === "profile"}>
          <i class="i-ri-user-3-line" />
        </Match>
        <Match when={props.kind === "search"}>
          <i class="i-ri-search-line" />
        </Match>
        <Match when={props.kind === "refresh"}>
          <i class="i-ri-refresh-line" />
        </Match>
        <Match when={props.kind === "ext-link"}>
          <i class="i-ri-external-link-line" />
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

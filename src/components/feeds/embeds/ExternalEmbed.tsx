import { openExternalUrlFromEvent } from "$/lib/external-url";
import { Show } from "solid-js";

export function ExternalEmbed(props: { description?: string; thumb?: string; title?: string; uri?: string }) {
  function handleClick(event: MouseEvent) {
    openExternalUrlFromEvent(event, props.uri, "external-embed");
  }

  return (
    <a
      class="ui-input-strong grid min-w-0 gap-3 overflow-hidden rounded-2xl p-3 text-inherit no-underline shadow-(--inset-shadow) transition duration-150 ease-out hover:bg-surface-bright"
      href={props.uri}
      rel="noreferrer"
      target="_blank"
      onClick={handleClick}>
      <Show when={props.thumb}>
        {(thumb) => <img class="max-h-64 w-full rounded-2xl object-cover" src={thumb()} alt="" />}
      </Show>
      <div class="grid gap-1">
        <p class="m-0 wrap-break-word text-sm font-semibold text-on-surface">{props.title || "External link"}</p>
        <Show when={props.description}>
          {(description) => (
            <p class="m-0 wrap-break-word text-sm leading-[1.55] text-on-surface-variant">{description()}</p>
          )}
        </Show>
        <Show when={props.uri}>
          {(uri) => (
            <p class="m-0 break-all text-xs uppercase tracking-[0.08em] text-primary">
              {uri().replace(/^https?:\/\//, "")}
            </p>
          )}
        </Show>
      </div>
    </a>
  );
}

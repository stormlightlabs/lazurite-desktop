import { getDisplayName } from "$/lib/feeds";
import type { ProfileViewBasic } from "$/lib/types";
import { createMemo, Show } from "solid-js";

export function QuotedPostPreview(
  props: { author: ProfileViewBasic | null; class?: string; href?: string | null; text?: unknown; title: string },
) {
  const preview = createMemo(() => (typeof props.text === "string" ? props.text : ""));

  return (
    <div class={props.class ?? "rounded-2xl bg-black/30 p-4 shadow-[inset_0_0_0_1px_rgba(255,255,255,0.05)]"}>
      <p class="m-0 text-xs uppercase tracking-[0.12em] text-on-surface-variant">{props.title}</p>
      <Show when={props.href} fallback={<QuotedPreviewContent author={props.author} preview={preview()} />}>
        {(href) => (
          <a
            class="mt-2 block rounded-xl px-1 py-1 text-inherit no-underline transition duration-150 ease-out hover:bg-white/4"
            href={href()}
            rel="noreferrer"
            target="_blank"
            onClick={(event) => event.stopPropagation()}>
            <QuotedPreviewContent author={props.author} preview={preview()} />
          </a>
        )}
      </Show>
    </div>
  );
}

function QuotedPreviewContent(props: { author: ProfileViewBasic | null; preview: string }) {
  return (
    <>
      <Show when={props.author}>
        {(author) => (
          <p class="m-0 wrap-break-word text-sm font-semibold text-on-surface">
            {getDisplayName(author())}
            <span class="ml-1 break-all text-xs font-normal text-on-surface-variant">
              @{author().handle.replace(/^@/, "")}
            </span>
          </p>
        )}
      </Show>
      <Show
        when={props.preview}
        fallback={<p class="mt-2 text-sm leading-[1.55] text-on-surface-variant">Quoted post</p>}>
        {(text) => <p class="mt-2 line-clamp-4 text-sm leading-[1.55] text-on-secondary-container">{text()}</p>}
      </Show>
    </>
  );
}

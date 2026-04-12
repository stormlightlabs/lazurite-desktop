import { PostRichText } from "$/components/shared/PostRichText";
import { getDisplayName } from "$/lib/feeds";
import type { ProfileViewBasic, RichTextFacet } from "$/lib/types";
import { formatHandle } from "$/lib/utils/text";
import { createMemo, Show } from "solid-js";

function QuotedText(props: { facets?: RichTextFacet[] | null; text: string; truncated: boolean }) {
  return (
    <Show
      when={props.facets}
      fallback={
        <Show
          when={props.truncated}
          fallback={
            <p class="mt-2 whitespace-pre-wrap wrap-break-word text-sm leading-[1.55] text-on-secondary-container">
              {props.text}
            </p>
          }>
          <p class="mt-2 line-clamp-4 text-sm leading-[1.55] text-on-secondary-container">{props.text}</p>
        </Show>
      }>
      {facets => (
        <div class="mt-2" classList={{ "line-clamp-4": props.truncated }}>
          <PostRichText
            class="m-0 text-sm leading-[1.55] text-on-secondary-container [&_p]:text-sm [&_p]:leading-[1.55] [&_p]:text-on-secondary-container"
            facets={facets()}
            text={props.text} />
        </div>
      )}
    </Show>
  );
}

type QuotedPreviewContentProps = {
  author: ProfileViewBasic | null;
  emptyText?: string;
  facets?: RichTextFacet[] | null;
  preview: string;
  truncated: boolean;
};

function QuotedPreviewContent(props: QuotedPreviewContentProps) {
  return (
    <>
      <Show when={props.author}>
        {(value) => {
          const author = value();
          return (
            <p class="m-0 wrap-break-word text-sm font-semibold text-on-surface">
              {getDisplayName(author)}
              <span class="ml-1 break-all text-xs font-normal text-on-surface-variant">
                {formatHandle(author.handle, author.did)}
              </span>
            </p>
          );
        }}
      </Show>
      <Show
        when={props.preview}
        fallback={
          <p class="mt-2 text-sm leading-[1.55] text-on-surface-variant">{props.emptyText ?? "Quoted post"}</p>
        }>
        {(text) => <QuotedText facets={props.facets} text={text()} truncated={props.truncated} />}
      </Show>
    </>
  );
}

type QuotedPostPreviewProps = {
  author: ProfileViewBasic | null;
  class?: string;
  emptyText?: string;
  facets?: RichTextFacet[] | null;
  href?: string | null;
  onOpenPost?: () => void;
  text?: unknown;
  title: string;
  truncate?: boolean;
};

export function QuotedPostPreview(props: QuotedPostPreviewProps) {
  const preview = createMemo(() => (typeof props.text === "string" ? props.text : ""));
  const openInNewTab = createMemo(() => !!props.href && /^https?:\/\//i.test(props.href));
  const truncated = createMemo(() => props.truncate ?? false);

  return (
    <div class={props.class ?? "ui-input-strong rounded-2xl p-4 shadow-(--inset-shadow)"}>
      <p class="m-0 text-xs uppercase tracking-[0.12em] text-on-surface-variant">{props.title}</p>
      <Show
        when={props.onOpenPost}
        fallback={
          <Show
            when={props.href}
            fallback={
              <QuotedPreviewContent
                author={props.author}
                emptyText={props.emptyText}
                preview={preview()}
                truncated={truncated()} />
            }>
            {(href) => (
              <a
                class="mt-2 block rounded-xl px-1 py-1 text-inherit no-underline transition duration-150 ease-out hover:bg-surface-bright"
                href={href()}
                rel={openInNewTab() ? "noreferrer" : undefined}
                target={openInNewTab() ? "_blank" : undefined}
                onClick={(event) => event.stopPropagation()}>
                <QuotedPreviewContent
                  author={props.author}
                  emptyText={props.emptyText}
                  facets={props.facets}
                  preview={preview()}
                  truncated={truncated()} />
              </a>
            )}
          </Show>
        }>
        <button
          class="mt-2 block w-full rounded-xl border-0 bg-transparent px-1 py-1 text-left text-inherit transition duration-150 ease-out hover:bg-surface-bright"
          type="button"
          onClick={(event) => {
            event.stopPropagation();
            props.onOpenPost?.();
          }}>
          <QuotedPreviewContent
            author={props.author}
            emptyText={props.emptyText}
            facets={props.facets}
            preview={preview()}
            truncated={truncated()} />
        </button>
      </Show>
    </div>
  );
}

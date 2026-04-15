import { openExternalUrlFromEvent } from "$/lib/external-url";
import {
  type LegacyRichTextPart,
  parsePostRichText,
  type ResolvedRichTextFacet,
  resolveRichTextFacets,
  type RichTextBlock,
  type RichTextInlineSegment,
  type RichTextLine,
  splitLegacyRichText,
} from "$/lib/post-rich-text";
import { buildProfileRoute } from "$/lib/profile";
import { buildHashtagRoute } from "$/lib/search-routes";
import type { RichTextFacet } from "$/lib/types";
import { For, type JSX, Show } from "solid-js";

type PostRichTextProps = { class?: string; facets?: RichTextFacet[] | null; text: string };

type TextSegmentProps = {
  facets: ResolvedRichTextFacet[];
  hasFacets: boolean;
  text: string;
  textEnd: number;
  textStart: number;
};

export function PostRichText(props: PostRichTextProps) {
  const blocks = () => parsePostRichText(props.text);
  const facets = () => resolveRichTextFacets(props.text, props.facets);
  const hasFacets = () => facets().length > 0;

  return (
    <div class={props.class}>
      <For each={blocks()}>
        {(block, index) => (
          <>
            <Show when={index() > 0}>
              <div class="h-4" />
            </Show>
            {renderBlock(block, props.text, facets(), hasFacets())}
          </>
        )}
      </For>
    </div>
  );
}

function renderBlock(block: RichTextBlock, text: string, facets: ResolvedRichTextFacet[], hasFacets: boolean) {
  if (block.kind === "paragraph") {
    return <TextBlock facets={facets} hasFacets={hasFacets} lines={block.lines} text={text} />;
  }

  if (block.kind === "blockquote") {
    return (
      <blockquote class="m-0 rounded-r-2xl border-l-2 border-primary/40 bg-white/3 px-4 py-3">
        <TextBlock facets={facets} hasFacets={hasFacets} lines={block.lines} text={text} />
      </blockquote>
    );
  }

  return (
    <pre class="m-0 overflow-x-auto rounded-2xl bg-black/45 p-4 shadow-[inset_0_0_0_1px_rgba(255,255,255,0.05)]">
      <Show when={block.language}>
        {(language) => <p class="mb-3 mt-0 text-xs uppercase tracking-[0.12em] text-on-surface-variant">{language()}</p>}
      </Show>
      <code class="block whitespace-pre-wrap wrap-break-word font-mono text-[0.92rem] leading-[1.65] text-on-secondary-container">
        {block.code}
      </code>
    </pre>
  );
}

function TextBlock(
  props: { facets: ResolvedRichTextFacet[]; hasFacets: boolean; lines: RichTextLine[]; text: string },
) {
  return (
    <p class="m-0 whitespace-pre-wrap wrap-break-word text-base leading-[1.65] text-on-secondary-container">
      <For each={props.lines}>
        {(line, lineIndex) => (
          <>
            <Show when={lineIndex() > 0}>
              <br />
            </Show>
            <For each={line.segments}>
              {(segment) => renderLineSegment(segment, props.text, props.facets, props.hasFacets)}
            </For>
          </>
        )}
      </For>
    </p>
  );
}

function renderLineSegment(
  segment: RichTextInlineSegment,
  text: string,
  facets: ResolvedRichTextFacet[],
  hasFacets: boolean,
) {
  if (segment.kind === "code") {
    return (
      <code class="rounded-md bg-black/45 px-1.5 py-0.5 font-mono text-[0.92em] text-on-surface">{segment.text}</code>
    );
  }

  return (
    <TextSegment facets={facets} hasFacets={hasFacets} text={text} textEnd={segment.end} textStart={segment.start} />
  );
}

function TextSegment(props: TextSegmentProps) {
  const content = () => props.text.slice(props.textStart, props.textEnd);
  const relevantFacets = () =>
    props.facets.filter((facet) => facet.start >= props.textStart && facet.end <= props.textEnd);

  return (
    <>
      <Show
        when={relevantFacets().length > 0}
        fallback={<LegacyText text={content()} useFallback={!props.hasFacets} />}>
        <For each={buildFacetNodes(content(), props.textStart, relevantFacets())}>{(node) => node}</For>
      </Show>
    </>
  );
}

function buildFacetNodes(text: string, offset: number, facets: ResolvedRichTextFacet[]) {
  const nodes: JSX.Element[] = [];
  let cursor = offset;

  for (const facet of facets) {
    if (facet.start > cursor) {
      nodes.push(<span class="wrap-anywhere">{text.slice(cursor - offset, facet.start - offset)}</span>);
    }

    const label = text.slice(facet.start - offset, facet.end - offset);
    nodes.push(renderFacetNode(facet, label));
    cursor = facet.end;
  }

  if (cursor < offset + text.length) {
    nodes.push(<span class="wrap-anywhere">{text.slice(cursor - offset)}</span>);
  }

  return nodes;
}

function renderFacetNode(facet: ResolvedRichTextFacet, label: string) {
  if (facet.feature.$type === "app.bsky.richtext.facet#link") {
    const linkUri = facet.feature.uri;
    return (
      <a
        class="break-all text-primary no-underline hover:underline"
        href={linkUri}
        rel="noreferrer"
        target="_blank"
        onClick={(event) => openExternalUrlFromEvent(event, linkUri, "post-rich-text-facet-link")}>
        {label}
      </a>
    );
  }

  if (facet.feature.$type === "app.bsky.richtext.facet#mention") {
    return (
      <a
        class="break-all text-primary no-underline hover:underline"
        href={`#${buildProfileRoute(facet.feature.did)}`}
        onClick={(event) => event.stopPropagation()}>
        {label}
      </a>
    );
  }

  return (
    <a
      class="break-all text-primary no-underline hover:underline"
      href={`#${buildHashtagRoute(facet.feature.tag)}`}
      onClick={(event) => event.stopPropagation()}>
      {label}
    </a>
  );
}

function LegacyText(props: { text: string; useFallback: boolean }) {
  return (
    <Show when={props.useFallback} fallback={<span class="wrap-anywhere">{props.text}</span>}>
      <For each={splitLegacyRichText(props.text)}>{(part) => renderLegacyPart(part)}</For>
    </Show>
  );
}

function renderLegacyPart(part: LegacyRichTextPart) {
  switch (part.kind) {
    case "url": {
      return (
        <a
          class="break-all text-primary no-underline hover:underline"
          href={part.href}
          rel="noreferrer"
          target="_blank"
          onClick={(event) => openExternalUrlFromEvent(event, part.href, "post-rich-text-fallback-url")}>
          {part.text}
        </a>
      );
    }
    case "mention": {
      return (
        <a
          class="break-all text-primary no-underline hover:underline"
          href={`#${buildProfileRoute(part.handle)}`}
          onClick={(event) => event.stopPropagation()}>
          {part.text}
        </a>
      );
    }
    case "hashtag": {
      return (
        <a
          class="break-all text-primary no-underline hover:underline"
          href={`#${buildHashtagRoute(part.tag)}`}
          onClick={(event) => event.stopPropagation()}>
          {part.text}
        </a>
      );
    }
    default: {
      return <span class="wrap-anywhere">{part.text}</span>;
    }
  }
}

import type { RichTextFacet, RichTextFacetFeature } from "./types";

export type ResolvedRichTextFacet = { end: number; feature: RichTextFacetFeature; start: number };

export type RichTextInlineSegment = { end: number; kind: "text"; start: number } | { kind: "code"; text: string };

export type RichTextLine = { segments: RichTextInlineSegment[] };

export type RichTextBlock = { kind: "blockquote"; lines: RichTextLine[] } | {
  code: string;
  kind: "codeBlock";
  language: string | null;
} | { kind: "paragraph"; lines: RichTextLine[] };

const URL_REGEX = /https?:\/\/\S+/giu;

export function parsePostRichText(text: string): RichTextBlock[] {
  const blocks: RichTextBlock[] = [];
  const lines = getLineEntries(text);
  let index = 0;

  while (index < lines.length) {
    const line = lines[index];

    if (isFenceLine(line.text)) {
      const language = line.text.slice(3).trim() || null;
      const codeLines: string[] = [];
      index += 1;

      while (index < lines.length && !isFenceLine(lines[index].text)) {
        codeLines.push(lines[index].text);
        index += 1;
      }

      if (index < lines.length && isFenceLine(lines[index].text)) {
        index += 1;
      }

      blocks.push({ code: codeLines.join("\n"), kind: "codeBlock", language });
      continue;
    }

    if (line.text.trim() === "") {
      index += 1;
      continue;
    }

    if (line.text.startsWith(">")) {
      const quoteLines: RichTextLine[] = [];

      while (index < lines.length && lines[index].text.startsWith(">")) {
        const current = lines[index];
        const markerLength = current.text.startsWith("> ") ? 2 : 1;
        quoteLines.push(parseInlineSegments(current.text.slice(markerLength), current.start + markerLength));
        index += 1;
      }

      blocks.push({ kind: "blockquote", lines: quoteLines });
      continue;
    }

    const paragraphLines: RichTextLine[] = [];

    while (index < lines.length) {
      const current = lines[index];
      if (current.text.trim() === "" || current.text.startsWith(">") || isFenceLine(current.text)) {
        break;
      }

      paragraphLines.push(parseInlineSegments(current.text, current.start));
      index += 1;
    }

    blocks.push({ kind: "paragraph", lines: paragraphLines });
  }

  return blocks.length > 0 ? blocks : [{ kind: "paragraph", lines: [parseInlineSegments("", 0)] }];
}

export function resolveRichTextFacets(
  text: string,
  facets: RichTextFacet[] | null | undefined,
): ResolvedRichTextFacet[] {
  if (!facets || facets.length === 0) {
    return [];
  }

  const byteOffsets = buildUtf8BoundaryMap(text);
  const resolved: ResolvedRichTextFacet[] = [];

  for (const facet of facets) {
    const start = byteOffsets.get(facet.index.byteStart);
    const end = byteOffsets.get(facet.index.byteEnd);
    const feature = facet.features.find(isSupportedFacetFeature);

    if (start === undefined || end === undefined || start >= end || !feature) {
      continue;
    }

    resolved.push({ end, feature, start });
  }

  return resolved.toSorted((left, right) => left.start - right.start || left.end - right.end);
}

export function splitLegacyUrls(text: string) {
  const parts: Array<{ kind: "text" | "url"; text: string }> = [];
  let lastIndex = 0;

  for (const match of text.matchAll(URL_REGEX)) {
    const url = match[0];
    const start = match.index ?? 0;

    if (start > lastIndex) {
      parts.push({ kind: "text", text: text.slice(lastIndex, start) });
    }

    parts.push({ kind: "url", text: url });
    lastIndex = start + url.length;
  }

  if (lastIndex < text.length) {
    parts.push({ kind: "text", text: text.slice(lastIndex) });
  }

  return parts.length > 0 ? parts : [{ kind: "text" as const, text }];
}

function buildUtf8BoundaryMap(text: string) {
  const offsets = new Map<number, number>();
  const encoder = new TextEncoder();
  let byteOffset = 0;
  let codeUnitOffset = 0;

  offsets.set(0, 0);

  for (const char of text) {
    byteOffset += encoder.encode(char).length;
    codeUnitOffset += char.length;
    offsets.set(byteOffset, codeUnitOffset);
  }

  return offsets;
}

function getLineEntries(text: string) {
  const lines: Array<{ start: number; text: string }> = [];
  let start = 0;

  while (start <= text.length) {
    const newlineIndex = text.indexOf("\n", start);
    if (newlineIndex === -1) {
      lines.push({ start, text: text.slice(start) });
      break;
    }

    lines.push({ start, text: text.slice(start, newlineIndex) });
    start = newlineIndex + 1;
  }

  return lines;
}

function isFenceLine(line: string) {
  return line.startsWith("```");
}

function isSupportedFacetFeature(feature: RichTextFacetFeature | undefined): feature is RichTextFacetFeature {
  return feature !== undefined;
}

function parseInlineSegments(text: string, offset: number): RichTextLine {
  const segments: RichTextInlineSegment[] = [];
  let cursor = 0;

  while (cursor < text.length) {
    const opener = text.indexOf("`", cursor);
    if (opener === -1) {
      pushTextSegment(segments, offset + cursor, offset + text.length);
      break;
    }

    pushTextSegment(segments, offset + cursor, offset + opener);
    const closer = text.indexOf("`", opener + 1);

    if (closer === -1) {
      pushTextSegment(segments, offset + opener, offset + text.length);
      break;
    }

    segments.push({ kind: "code", text: text.slice(opener + 1, closer) });
    cursor = closer + 1;
  }

  if (segments.length === 0) {
    segments.push({ end: offset, kind: "text", start: offset });
  }

  return { segments };
}

function pushTextSegment(segments: RichTextInlineSegment[], start: number, end: number) {
  if (start >= end) {
    return;
  }

  segments.push({ end, kind: "text", start });
}

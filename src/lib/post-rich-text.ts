import { normalizeAndEnsureValidHandle } from "@atproto/syntax";
import * as linkify from "linkifyjs";
import "linkify-plugin-hashtag";
import type { RichTextFacet, RichTextFacetFeature } from "./types";

export type ResolvedRichTextFacet = { end: number; feature: RichTextFacetFeature; start: number };

export type RichTextInlineSegment = { end: number; kind: "text"; start: number } | { kind: "code"; text: string };

export type RichTextLine = { segments: RichTextInlineSegment[] };

export type RichTextBlock = { kind: "blockquote"; lines: RichTextLine[] } | {
  code: string;
  kind: "codeBlock";
  language: string | null;
} | { kind: "paragraph"; lines: RichTextLine[] };

const HANDLE_CHAR_REGEX = /[a-z0-9.-]/i;
const HANDLE_PREFIX_CHAR_REGEX = /[a-z0-9_.-]/i;

type LegacyToken = { end: number; href: string; kind: "url"; start: number; text: string } | {
  end: number;
  handle: string;
  kind: "mention";
  start: number;
  text: string;
} | { end: number; kind: "hashtag"; start: number; tag: string; text: string };

export type LegacyRichTextPart = { kind: "text"; text: string } | { href: string; kind: "url"; text: string } | {
  handle: string;
  kind: "mention";
  text: string;
} | { kind: "hashtag"; tag: string; text: string };

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

export function splitLegacyRichText(text: string): LegacyRichTextPart[] {
  const tokens = collectLegacyTokens(text);
  if (tokens.length === 0) {
    return [{ kind: "text", text }];
  }

  const parts: LegacyRichTextPart[] = [];
  let cursor = 0;

  for (const token of tokens) {
    if (token.start < cursor) {
      continue;
    }

    if (token.start > cursor) {
      parts.push({ kind: "text", text: text.slice(cursor, token.start) });
    }

    switch (token.kind) {
      case "url": {
        parts.push({ href: token.href, kind: "url", text: token.text });
        break;
      }
      case "mention": {
        parts.push({ handle: token.handle, kind: "mention", text: token.text });
        break;
      }
      case "hashtag": {
        parts.push({ kind: "hashtag", tag: token.tag, text: token.text });
        break;
      }
    }

    cursor = token.end;
  }

  if (cursor < text.length) {
    parts.push({ kind: "text", text: text.slice(cursor) });
  }

  return parts.length > 0 ? parts : [{ kind: "text", text }];
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

function collectLegacyTokens(text: string): LegacyToken[] {
  const linkifyTokens = collectLinkifyTokens(text);
  const mentionTokens = collectMentionTokens(text);
  const tokens = [...linkifyTokens, ...mentionTokens];

  return tokens.toSorted((left, right) => left.start - right.start || right.end - left.end);
}

function collectLinkifyTokens(text: string): LegacyToken[] {
  const tokens: LegacyToken[] = [];
  // linkify is not an array -> this is a false positive
  // eslint-disable-next-line unicorn/no-array-callback-reference
  const matches = linkify.find(text);

  for (const match of matches) {
    const start = match.start;
    const end = match.end;
    if (typeof start !== "number" || typeof end !== "number" || start >= end) {
      continue;
    }

    if (match.type === "url") {
      tokens.push({ end, href: match.href, kind: "url", start, text: match.value });
      continue;
    }

    if (match.type === "hashtag") {
      const tag = match.value.replace(/^#/, "").trim();
      if (!tag) {
        continue;
      }
      tokens.push({ end, kind: "hashtag", start, tag, text: match.value });
    }
  }

  return tokens;
}

function collectMentionTokens(text: string): LegacyToken[] {
  const mentions: LegacyToken[] = [];
  let cursor = 0;

  while (cursor < text.length) {
    const atIndex = text.indexOf("@", cursor);
    if (atIndex === -1) {
      break;
    }

    if (atIndex > 0 && HANDLE_PREFIX_CHAR_REGEX.test(text[atIndex - 1] ?? "")) {
      cursor = atIndex + 1;
      continue;
    }

    let end = atIndex + 1;
    while (end < text.length && HANDLE_CHAR_REGEX.test(text[end] ?? "")) {
      end += 1;
    }

    const rawCandidate = text.slice(atIndex + 1, end);
    const normalized = normalizeMentionCandidate(rawCandidate);
    if (!normalized) {
      cursor = atIndex + 1;
      continue;
    }

    const normalizedEnd = atIndex + 1 + normalized.length;
    mentions.push({
      end: normalizedEnd,
      handle: normalized,
      kind: "mention",
      start: atIndex,
      text: text.slice(atIndex, normalizedEnd),
    });
    cursor = normalizedEnd;
  }

  return mentions;
}

function normalizeMentionCandidate(rawCandidate: string): string | null {
  if (!rawCandidate) {
    return null;
  }

  let candidate = rawCandidate;
  while (candidate.endsWith(".") || candidate.endsWith("-")) {
    candidate = candidate.slice(0, -1);
  }

  if (!candidate) {
    return null;
  }

  try {
    return normalizeAndEnsureValidHandle(candidate);
  } catch {
    return null;
  }
}

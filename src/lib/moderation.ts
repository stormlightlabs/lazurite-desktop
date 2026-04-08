import type { ModerationLabel, ModerationUiDecision } from "$/lib/types";

/**
 * Official Bluesky labeler DID (@moderation.bsky.app)
 */
export const BUILTIN_LABELER_DID = "did:plc:ar7c4by46qjdydhdevvrndac";

export const DEFAULT_MODERATION_DECISION: ModerationUiDecision = {
  alert: false,
  blur: "none",
  filter: false,
  inform: false,
  noOverride: false,
};

export type ModerationLabelSummary = { key: string; source: string; value: string };

export function asModerationLabels(value: unknown): ModerationLabel[] {
  const record = asRecord(value);
  const labels = record?.["labels"];
  if (!Array.isArray(labels)) {
    return [];
  }

  return labels.filter((label): label is ModerationLabel => isRecordLike(label));
}

export function collectModerationLabels(...values: unknown[]): ModerationLabel[] {
  const labels = values.flatMap((value) => asModerationLabels(value));
  if (labels.length <= 1) {
    return labels;
  }

  const deduped: ModerationLabel[] = [];
  const seen = new Set<string>();

  for (const label of labels) {
    const source = typeof label.src === "string" ? label.src : "";
    const value = typeof label.val === "string" ? label.val : "";
    const uri = typeof label.uri === "string" ? label.uri : "";
    const key = `${source}|${value}|${uri}`;
    if (seen.has(key)) {
      continue;
    }

    seen.add(key);
    deduped.push(label);
  }

  return deduped;
}

export function moderationLabelsKey(labels: ModerationLabel[]): string {
  if (labels.length === 0) {
    return "";
  }

  const tokens = labels.map((label) => {
    const source = typeof label.src === "string" ? label.src.trim() : "";
    const value = typeof label.val === "string" ? label.val.trim() : "";
    const uri = typeof label.uri === "string" ? label.uri.trim() : "";
    return `${source}|${value}|${uri}`;
  });

  return tokens.toSorted().join(";");
}

export function summarizeModerationLabels(labels: ModerationLabel[], limit = 3): ModerationLabelSummary[] {
  if (labels.length === 0) {
    return [];
  }

  const summaries: ModerationLabelSummary[] = [];
  const seen = new Set<string>();

  for (const label of labels) {
    const value = toLabelDisplayValue(label.val);
    if (!value) {
      continue;
    }

    const source = toSourceDisplayValue(label.src);
    const key = `${source}|${value}`;
    if (seen.has(key)) {
      continue;
    }

    seen.add(key);
    summaries.push({ key, source, value });

    if (summaries.length >= limit) {
      break;
    }
  }

  return summaries;
}

function toLabelDisplayValue(value: unknown): string | null {
  if (typeof value !== "string") {
    return null;
  }

  const normalized = value.trim();
  if (!normalized) {
    return null;
  }

  if (normalized.startsWith("!")) {
    return `Not ${normalized.slice(1)}`;
  }

  return normalized;
}

function toSourceDisplayValue(source: unknown): string {
  if (typeof source !== "string") {
    return "Unknown";
  }

  const normalized = source.trim();
  if (!normalized) {
    return "Unknown";
  }

  if (!normalized.startsWith("did:")) {
    return normalized;
  }

  if (normalized.length <= 22) {
    return normalized;
  }

  return `${normalized.slice(0, 16)}...${normalized.slice(-6)}`;
}

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!isRecordLike(value)) {
    return null;
  }

  return value;
}

function isRecordLike(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === "object" && !Array.isArray(value);
}

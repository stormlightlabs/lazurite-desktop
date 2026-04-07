import type { LogEntry, Maybe } from "$/lib/types";

export function escapeForRegex(value: string) {
  return value.replaceAll(/[.*+?^${}()|[\]\\]/g, String.raw`\$&`);
}

export function formatCount(value: Maybe<number>) {
  if (!value) {
    return "0";
  }

  if (value >= 1000) {
    return `${(value / 1000).toFixed(value >= 10_000 ? 0 : 1)}K`;
  }

  return value.toString();
}

export function normalizeError(err: unknown): string {
  if (err instanceof Error) {
    return err.message;
  } else {
    return String(err);
  }
}

export function formatEtaSeconds(value: number) {
  if (value < 60) {
    return `${value}s`;
  }

  const minutes = Math.floor(value / 60);
  const seconds = value % 60;
  return `${minutes}m ${seconds}s`;
}

export function formatProgress(value: number | null | undefined) {
  if (typeof value !== "number" || Number.isNaN(value)) {
    return "Pending";
  }

  return `${Math.round(value)}%`;
}

export function formatBytes(bytes: number): string {
  if (bytes === 0) return "0 B";
  const k = 1024;
  const sizes = ["B", "KB", "MB", "GB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${Number.parseFloat((bytes / Math.pow(k, i)).toFixed(1))} ${sizes[i]}`;
}

export function formatLogTimestamp(timestamp: string | null) {
  if (!timestamp) {
    return "--";
  }

  const parsed = new Date(timestamp);
  if (Number.isNaN(parsed.getTime())) {
    return timestamp;
  }

  return parsed.toLocaleString(undefined, {
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    month: "short",
    second: "2-digit",
  });
}

export function formatLogCopyLine(log: LogEntry) {
  const prefix = [formatLogTimestamp(log.timestamp), log.level, log.target ?? "app"].join(" ");
  return `${prefix} ${log.message}`;
}

export function formatJoinedDate(value?: string | null) {
  if (!value) {
    return null;
  }

  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return null;
  }

  return parsed.toLocaleDateString(undefined, { month: "long", year: "numeric" });
}

export function initials(name: string) {
  return name.trim().slice(0, 1).toUpperCase() || "?";
}

export function formatHandle(handle: string | null | undefined, did: string | null | undefined) {
  if (!handle) {
    return did ?? "Unknown";
  }

  return handle.startsWith("did:") || handle.startsWith("@") ? handle : `@${handle}`;
}

export function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max);
}

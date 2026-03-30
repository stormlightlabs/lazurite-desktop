import type { Maybe } from "$/lib/types";

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

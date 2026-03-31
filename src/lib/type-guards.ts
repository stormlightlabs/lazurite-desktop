/**
 * @module type-guards
 * A collection of common, reusable type guard functions
 * for runtime type checking and type narrowing.
 */

export function isRecordLike(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function isString(value: unknown): value is string {
  return typeof value === "string";
}

export function getStringProperty(value: Record<string, unknown>, key: string): string | null {
  const candidate = value[key];
  return typeof candidate === "string" ? candidate : null;
}

export function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }

  return value as Record<string, unknown>;
}

export function asArray(value: unknown) {
  return Array.isArray(value) ? value : null;
}

export function optionalNumber(value: unknown) {
  return typeof value === "number" ? value : null;
}

export function optionalString(value: unknown) {
  return typeof value === "string" ? value : null;
}

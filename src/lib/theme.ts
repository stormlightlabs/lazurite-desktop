import type { Theme } from "$/lib/types";

export type EffectiveTheme = "light" | "dark";

export function normalizeThemeSetting(value: string | null | undefined): Theme {
  return value === "light" || value === "dark" || value === "auto" ? value : "auto";
}

export function resolveEffectiveTheme(setting: Theme, systemTheme: EffectiveTheme): EffectiveTheme {
  if (setting === "light") {
    return "light";
  }

  if (setting === "dark") {
    return "dark";
  }

  return systemTheme;
}

export function toEffectiveTheme(value: string | null | undefined, fallback: EffectiveTheme): EffectiveTheme {
  return value === "light" || value === "dark" ? value : fallback;
}

export function applyThemeToDocument(theme: EffectiveTheme, doc: Document = document) {
  doc.documentElement.dataset.theme = theme;
  doc.documentElement.style.colorScheme = theme;
}

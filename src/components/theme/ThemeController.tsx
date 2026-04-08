import { useAppPreferences } from "$/contexts/app-preferences";
import {
  applyThemeToDocument,
  normalizeThemeSetting,
  resolveEffectiveTheme,
  toEffectiveTheme,
  type EffectiveTheme,
} from "$/lib/theme";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { createEffect, createMemo, createSignal, onCleanup, onMount } from "solid-js";

function toSystemTheme(matches: boolean): EffectiveTheme {
  return matches ? "dark" : "light";
}

export function ThemeController() {
  const preferences = useAppPreferences();
  const [systemTheme, setSystemTheme] = createSignal<EffectiveTheme>("dark");

  const selectedTheme = createMemo(() => normalizeThemeSetting(preferences.settings?.theme));

  const effectiveTheme = createMemo(() => resolveEffectiveTheme(selectedTheme(), systemTheme()));

  onMount(() => {
    const media = globalThis.matchMedia?.("(prefers-color-scheme: dark)");

    if (media) {
      setSystemTheme(toSystemTheme(media.matches));
      const handleChange = (event: MediaQueryListEvent) => {
        setSystemTheme(toSystemTheme(event.matches));
      };
      media.addEventListener("change", handleChange);
      onCleanup(() => media.removeEventListener("change", handleChange));
    }

    let cancelled = false;
    let unlistenThemeChange: (() => void) | null = null;

    try {
      const currentWindow = getCurrentWindow();
      void currentWindow
        .theme()
        .then((theme) => {
          if (cancelled) {
            return;
          }

          setSystemTheme((current) => toEffectiveTheme(theme, current));
        })
        .catch(() => {
          // Browser test environments may not provide native window theme APIs.
        });

      void currentWindow
        .onThemeChanged(({ payload }) => {
          setSystemTheme((current) => toEffectiveTheme(payload, current));
        })
        .then((unlisten) => {
          if (cancelled) {
            unlisten();
            return;
          }
          unlistenThemeChange = unlisten;
        })
        .catch(() => {
          // Browser test environments may not provide native window theme APIs.
        });
    } catch {
      // Browser test environments may not provide native window APIs.
    }

    onCleanup(() => {
      cancelled = true;
      unlistenThemeChange?.();
    });
  });

  createEffect(() => {
    applyThemeToDocument(effectiveTheme());
  });

  return null;
}

import { ThemeController } from "$/components/theme/ThemeController";
import type { AppSettings } from "$/lib/types";
import { AppTestProviders } from "$/test/providers";
import { render, waitFor } from "@solidjs/testing-library";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

type ThemeChangeHandler = (event: { payload: "light" | "dark" }) => void;
const noopUnlisten = () => {};

const tauriThemeMock = vi.hoisted(() => vi.fn(async () => null as "light" | "dark" | null));
const onThemeChangedMock = vi.hoisted(() => vi.fn(async (_handler: ThemeChangeHandler) => noopUnlisten));

vi.mock(
  "@tauri-apps/api/window",
  () => ({ getCurrentWindow: () => ({ label: "main", onThemeChanged: onThemeChangedMock, theme: tauriThemeMock }) }),
);

function installMatchMedia(initialDark: boolean) {
  const listeners = new Set<(event: MediaQueryListEvent) => void>();
  const media = {
    matches: initialDark,
    media: "(prefers-color-scheme: dark)",
    onchange: null,
    addEventListener: (_type: string, listener: (event: MediaQueryListEvent) => void) => {
      listeners.add(listener);
    },
    removeEventListener: (_type: string, listener: (event: MediaQueryListEvent) => void) => {
      listeners.delete(listener);
    },
    addListener: (listener: (event: MediaQueryListEvent) => void) => {
      listeners.add(listener);
    },
    removeListener: (listener: (event: MediaQueryListEvent) => void) => {
      listeners.delete(listener);
    },
    dispatch(nextDark: boolean) {
      media.matches = nextDark;
      const event = { matches: nextDark } as MediaQueryListEvent;
      for (const listener of listeners) {
        listener(event);
      }
    },
  };

  Object.defineProperty(globalThis, "matchMedia", { configurable: true, writable: true, value: vi.fn(() => media) });

  return media;
}

describe("ThemeController", () => {
  const baseSettings: AppSettings = {
    theme: "auto",
    timelineRefreshSecs: 60,
    notificationsDesktop: true,
    notificationsBadge: true,
    notificationsSound: false,
    embeddingsEnabled: false,
    constellationUrl: "https://constellation.microcosm.blue",
    spacedustUrl: "https://spacedust.microcosm.blue",
    spacedustInstant: false,
    spacedustEnabled: false,
    globalShortcut: "Ctrl+Shift+N",
    downloadDirectory: "/Users/test/Downloads",
  };

  beforeEach(() => {
    tauriThemeMock.mockReset();
    tauriThemeMock.mockResolvedValue(null);
    onThemeChangedMock.mockReset();
    onThemeChangedMock.mockResolvedValue(noopUnlisten);
  });

  afterEach(() => {
    delete document.documentElement.dataset.theme;
    document.documentElement.style.colorScheme = "";
  });

  it("applies explicit light theme", async () => {
    installMatchMedia(true);

    render(() => (
      <AppTestProviders preferences={{ settings: { ...baseSettings, theme: "light" } }}>
        <ThemeController />
      </AppTestProviders>
    ));

    await waitFor(() => expect(document.documentElement.dataset.theme).toBe("light"));
    expect(document.documentElement.style.colorScheme).toBe("light");
  });

  it("follows system theme changes when setting is auto", async () => {
    const media = installMatchMedia(true);

    render(() => (
      <AppTestProviders preferences={{ settings: { ...baseSettings, theme: "auto" } }}>
        <ThemeController />
      </AppTestProviders>
    ));

    await waitFor(() => expect(document.documentElement.dataset.theme).toBe("dark"));

    media.dispatch(false);
    await waitFor(() => expect(document.documentElement.dataset.theme).toBe("light"));
  });
});

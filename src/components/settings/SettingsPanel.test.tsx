import { AppTestProviders } from "$/test/providers";
import { fireEvent, render, screen, waitFor } from "@solidjs/testing-library";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { SettingsPanel } from "./SettingsPanel";

const getSettingsMock = vi.hoisted(() => vi.fn());
const updateSettingMock = vi.hoisted(() => vi.fn());
const getCacheSizeMock = vi.hoisted(() => vi.fn());
const clearCacheMock = vi.hoisted(() => vi.fn());
const exportDataMock = vi.hoisted(() => vi.fn());
const resetAppMock = vi.hoisted(() => vi.fn());
const resetAndRestartAppMock = vi.hoisted(() => vi.fn());
const getLogEntriesMock = vi.hoisted(() => vi.fn());
const navigateMock = vi.hoisted(() => vi.fn());
const infoMock = vi.hoisted(() => vi.fn());

const DEFAULT_EMBEDDINGS_CONFIG = {
  enabled: false,
  preflightSeen: false,
  modelName: "nomic-embed-text-v1.5",
  dimensions: 768,
  modelSizeBytes: 1024 * 1024 * 384,
  downloaded: false,
  downloadActive: false,
};

vi.mock(
  "$/lib/api/settings",
  () => ({
    getSettings: getSettingsMock,
    updateSetting: updateSettingMock,
    getCacheSize: getCacheSizeMock,
    clearCache: clearCacheMock,
    exportData: exportDataMock,
    resetApp: resetAppMock,
    resetAndRestartApp: resetAndRestartAppMock,
    getLogEntries: getLogEntriesMock,
  }),
);

vi.mock("@solidjs/router", () => ({ useNavigate: () => navigateMock }));

vi.mock("@tauri-apps/plugin-log", () => ({ info: infoMock }));

function createMockSettings(overrides = {}) {
  return {
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
    ...overrides,
  };
}

function createMockCacheSize(overrides = {}) {
  return {
    feedsBytes: 1024 * 1024 * 100,
    embeddingsBytes: 1024 * 1024 * 200,
    ftsBytes: 1024 * 1024 * 50,
    totalBytes: 1024 * 1024 * 350,
    ...overrides,
  };
}

function createMockLogEntry(level = "INFO", message = "Test log message") {
  return { timestamp: new Date().toISOString(), level, target: "test", message };
}

function renderSettingsPanel(
  options: { preferences?: Record<string, unknown>; session?: Record<string, unknown> } = {},
) {
  render(() => (
    <AppTestProviders
      preferences={{
        settings: createMockSettings(),
        embeddingsConfig: DEFAULT_EMBEDDINGS_CONFIG,
        updateSetting: updateSettingMock,
        ...options.preferences,
      }}
      session={options.session}>
      <SettingsPanel />
    </AppTestProviders>
  ));
}

describe("SettingsPanel", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    getSettingsMock.mockResolvedValue(createMockSettings());
    getCacheSizeMock.mockResolvedValue(createMockCacheSize());
    getLogEntriesMock.mockResolvedValue([createMockLogEntry()]);
    updateSettingMock.mockResolvedValue(void 0);
    clearCacheMock.mockResolvedValue(void 0);
    exportDataMock.mockResolvedValue(void 0);
    resetAppMock.mockResolvedValue(void 0);
    resetAndRestartAppMock.mockResolvedValue(void 0);
  });

  it("loads and displays settings", async () => {
    renderSettingsPanel();

    expect(await screen.findByText("Settings")).toBeInTheDocument();
    expect(await screen.findByText("Appearance")).toBeInTheDocument();
    expect(await screen.findByText("Timeline")).toBeInTheDocument();
    expect(await screen.findByText("Notifications")).toBeInTheDocument();
    expect(await screen.findByText("Accounts")).toBeInTheDocument();
    expect(await screen.findByText("Services")).toBeInTheDocument();
    expect(await screen.findByText("Data")).toBeInTheDocument();
    expect(await screen.findByText("Danger Zone")).toBeInTheDocument();
    expect(await screen.findByText("Logs")).toBeInTheDocument();
    expect(await screen.findByText("About")).toBeInTheDocument();
    expect(await screen.findAllByText(/384 MB download/i)).toHaveLength(1);
  });

  it("displays cache size information", async () => {
    renderSettingsPanel();

    await screen.findByText("Settings");
    expect(await screen.findByText("100 MB")).toBeInTheDocument();
    expect(await screen.findByText("Feeds cache")).toBeInTheDocument();
  });

  it("allows toggling desktop notifications", async () => {
    renderSettingsPanel();

    await screen.findByText("Settings");
    const toggle = await screen.findByRole("switch", { name: /desktop notifications/i });

    fireEvent.click(toggle);
    await waitFor(() => expect(updateSettingMock).toHaveBeenCalledWith("notificationsDesktop", false));
  });

  it("allows toggling badge count", async () => {
    renderSettingsPanel();

    await screen.findByText("Settings");
    const toggle = await screen.findByRole("switch", { name: /badge count/i });

    fireEvent.click(toggle);
    await waitFor(() => expect(updateSettingMock).toHaveBeenCalledWith("notificationsBadge", false));
  });

  it("allows changing theme", async () => {
    renderSettingsPanel();

    await screen.findByText("Settings");
    const darkButton = await screen.findByRole("button", { name: /dark/i });

    fireEvent.click(darkButton);
    await waitFor(() => expect(updateSettingMock).toHaveBeenCalledWith("theme", "dark"));
  });

  it("allows changing refresh interval", async () => {
    renderSettingsPanel();

    await screen.findByText("Settings");
    const manualButton = await screen.findByRole("button", { name: /manual/i });

    fireEvent.click(manualButton);
    await waitFor(() => expect(updateSettingMock).toHaveBeenCalledWith("timelineRefreshSecs", 0));
  });

  it("allows clearing feeds cache", async () => {
    renderSettingsPanel();

    await screen.findByText("Settings");
    const clearFeedsButton = await screen.findByRole("button", { name: /clear feeds/i });

    fireEvent.click(clearFeedsButton);
    await waitFor(() => expect(clearCacheMock).toHaveBeenCalledWith("feeds"));
  });

  it("shows confirmation modal before clearing all cache", async () => {
    renderSettingsPanel();

    await screen.findByText("Settings");
    const clearAllButton = await screen.findByRole("button", { name: /clear all/i });

    fireEvent.click(clearAllButton);
    expect(await screen.findByText("Clear All Cache")).toBeInTheDocument();
  });

  it("allows exporting data as JSON", async () => {
    renderSettingsPanel();

    await screen.findByText("Settings");
    const jsonButton = await screen.findByRole("button", { name: /json/i });

    fireEvent.click(jsonButton);
    await waitFor(() => expect(exportDataMock).toHaveBeenCalledWith("json"));
  });

  it("allows exporting data as CSV", async () => {
    renderSettingsPanel();

    await screen.findByText("Settings");
    const csvButton = await screen.findByRole("button", { name: /csv/i });

    fireEvent.click(csvButton);
    await waitFor(() => expect(exportDataMock).toHaveBeenCalledWith("csv"));
  });

  it("shows confirmation modal with RESET text for app reset and restart", async () => {
    renderSettingsPanel();

    await screen.findByText("Settings");
    const resetButton = await screen.findByRole("button", { name: /reset & restart/i });

    fireEvent.click(resetButton);
    expect(await screen.findByText("Reset And Restart")).toBeInTheDocument();
    expect(await screen.findByPlaceholderText(/type "reset" to confirm/i)).toBeInTheDocument();
  });

  it("invokes reset-and-restart after confirmation", async () => {
    renderSettingsPanel();

    await screen.findByText("Settings");
    const resetButton = await screen.findByRole("button", { name: /reset & restart/i });

    fireEvent.click(resetButton);
    const input = await screen.findByPlaceholderText(/type "reset" to confirm/i);
    fireEvent.input(input, { target: { value: "RESET" } });

    const confirmButton = await screen.findByRole("button", { name: /^confirm$/i });
    fireEvent.click(confirmButton);

    await waitFor(() => expect(resetAndRestartAppMock).toHaveBeenCalled());
  });

  it("navigates back when close button is clicked", async () => {
    renderSettingsPanel();

    await screen.findByText("Settings");
    const closeButton = await screen.findByRole("button", { name: /close settings/i });

    fireEvent.click(closeButton);
    await waitFor(() => expect(navigateMock).toHaveBeenCalledWith(-1));
  });

  it("expands and collapses log viewer", async () => {
    renderSettingsPanel();

    await screen.findByText("Settings");
    const expandButton = await screen.findByRole("button", { name: /expand logs/i });

    fireEvent.click(expandButton);
    expect(await screen.findByRole("button", { name: /collapse logs/i })).toBeInTheDocument();
  });

  it("copies logs to clipboard", async () => {
    const clipboardWriteText = vi.fn().mockResolvedValue(void 0);
    Object.assign(navigator, { clipboard: { writeText: clipboardWriteText } });

    renderSettingsPanel();

    await screen.findByText("Settings");
    const copyButton = await screen.findByRole("button", { name: /copy all/i });

    fireEvent.click(copyButton);
    await waitFor(() => expect(clipboardWriteText).toHaveBeenCalled());
  });

  it("filters logs by level", async () => {
    getLogEntriesMock.mockResolvedValue([
      createMockLogEntry("INFO", "Info message"),
      createMockLogEntry("WARN", "Warning message"),
      createMockLogEntry("ERROR", "Error message"),
    ]);

    renderSettingsPanel();

    await screen.findByText("Settings");
    const warnButton = await screen.findByRole("button", { name: /warn/i });

    fireEvent.click(warnButton);
    await waitFor(() => expect(getLogEntriesMock).toHaveBeenCalledWith(100, "warn"));
  });

  it("displays accounts from session", async () => {
    const accounts = [{
      did: "did:plc:abc123",
      handle: "user.bsky.social",
      pdsUrl: "https://bsky.social",
      active: true,
    }, { did: "did:plc:xyz789", handle: "alt.bsky.social", pdsUrl: "https://bsky.social", active: false }];

    renderSettingsPanel({ session: { accounts } });

    await screen.findByText("Settings");
    expect(await screen.findByText("@user.bsky.social")).toBeInTheDocument();
    expect(await screen.findByText("@alt.bsky.social")).toBeInTheDocument();
  });
});

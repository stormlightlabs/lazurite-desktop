import { AppTestProviders } from "$/test/providers";
import { fireEvent, render, screen, waitFor } from "@solidjs/testing-library";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { SettingsPanel } from "../SettingsPanel";

const getSettingsMock = vi.hoisted(() => vi.fn());
const updateSettingMock = vi.hoisted(() => vi.fn());
const getCacheSizeMock = vi.hoisted(() => vi.fn());
const clearCacheMock = vi.hoisted(() => vi.fn());
const exportDataMock = vi.hoisted(() => vi.fn());
const resetAppMock = vi.hoisted(() => vi.fn());
const resetAndRestartAppMock = vi.hoisted(() => vi.fn());
const getLogEntriesMock = vi.hoisted(() => vi.fn());
const getDownloadDirectoryMock = vi.hoisted(() => vi.fn());
const setDownloadDirectoryMock = vi.hoisted(() => vi.fn());
const getModerationPrefsMock = vi.hoisted(() => vi.fn());
const setAdultContentEnabledMock = vi.hoisted(() => vi.fn());
const setLabelPreferenceMock = vi.hoisted(() => vi.fn());
const subscribeLabelerMock = vi.hoisted(() => vi.fn());
const unsubscribeLabelerMock = vi.hoisted(() => vi.fn());
const getLabelerPolicyDefinitionsMock = vi.hoisted(() => vi.fn());
const getDistributionChannelMock = vi.hoisted(() => vi.fn());
const dialogOpenMock = vi.hoisted(() => vi.fn());
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
    SettingsController: {
      getSettings: getSettingsMock,
      updateSetting: updateSettingMock,
      getCacheSize: getCacheSizeMock,
      clearCache: clearCacheMock,
      exportData: exportDataMock,
      resetApp: resetAppMock,
      resetAndRestartApp: resetAndRestartAppMock,
      getLogEntries: getLogEntriesMock,
    },
  }),
);

vi.mock(
  "$/lib/api/moderation",
  () => ({
    ModerationController: {
      getModerationPrefs: getModerationPrefsMock,
      setAdultContentEnabled: setAdultContentEnabledMock,
      setLabelPreference: setLabelPreferenceMock,
      subscribeLabeler: subscribeLabelerMock,
      unsubscribeLabeler: unsubscribeLabelerMock,
      getLabelerPolicyDefinitions: getLabelerPolicyDefinitionsMock,
      getDistributionChannel: getDistributionChannelMock,
    },
  }),
);

vi.mock(
  "$/lib/api/media",
  () => ({
    MediaController: { getDownloadDirectory: getDownloadDirectoryMock, setDownloadDirectory: setDownloadDirectoryMock },
  }),
);

vi.mock("@tauri-apps/plugin-dialog", () => ({ open: dialogOpenMock }));

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
    downloadDirectory: "/Users/test/Downloads",
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
  options: {
    preferences?: Record<string, unknown>;
    session?: Record<string, unknown>;
    shell?: Record<string, unknown>;
  } = {},
) {
  render(() => (
    <AppTestProviders
      preferences={{
        settings: createMockSettings(),
        embeddingsConfig: DEFAULT_EMBEDDINGS_CONFIG,
        updateSetting: updateSettingMock,
        ...options.preferences,
      }}
      session={options.session}
      shell={options.shell}>
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
    getDownloadDirectoryMock.mockResolvedValue("/Users/test/Downloads");
    setDownloadDirectoryMock.mockResolvedValue(void 0);
    getModerationPrefsMock.mockResolvedValue({
      adultContentEnabled: false,
      subscribedLabelers: [],
      labelPreferences: {},
    });
    setAdultContentEnabledMock.mockResolvedValue(void 0);
    setLabelPreferenceMock.mockResolvedValue(void 0);
    subscribeLabelerMock.mockResolvedValue(void 0);
    unsubscribeLabelerMock.mockResolvedValue(void 0);
    getLabelerPolicyDefinitionsMock.mockResolvedValue([]);
    getDistributionChannelMock.mockResolvedValue("github");
    dialogOpenMock.mockResolvedValue(null);
  });

  it("loads and displays settings", async () => {
    renderSettingsPanel();

    expect(await screen.findByText("Settings")).toBeInTheDocument();
    expect(await screen.findByText("Appearance")).toBeInTheDocument();
    expect(await screen.findByText("Timeline")).toBeInTheDocument();
    expect(await screen.findByText("Notifications")).toBeInTheDocument();
    expect(await screen.findByText("Moderation")).toBeInTheDocument();
    expect(await screen.findByText("Accounts")).toBeInTheDocument();
    expect(await screen.findByRole("button", { name: "Audit follows" })).toBeInTheDocument();
    expect(await screen.findByText("Services")).toBeInTheDocument();
    expect(await screen.findByText("Data")).toBeInTheDocument();
    expect(await screen.findByText("Downloads")).toBeInTheDocument();
    expect(await screen.findByText("Danger Zone")).toBeInTheDocument();
    expect(await screen.findByText("Logs")).toBeInTheDocument();
    expect(await screen.findByText("Help")).toBeInTheDocument();
    expect(await screen.findByText("About")).toBeInTheDocument();
    expect(await screen.findByText("Open repost menu (choose repost or quote)")).toBeInTheDocument();
    expect(await screen.findByText("Shift+Click Repost")).toBeInTheDocument();
    expect(await screen.findAllByText(/384 MB download/i)).toHaveLength(1);
  });

  it("places downloads between data and danger zone", async () => {
    renderSettingsPanel();
    await screen.findByText("Settings");

    const headings = await screen.findAllByRole("heading", { level: 2 });
    const titles = headings.map((heading) => heading.textContent?.trim() ?? "");
    const dataIndex = titles.indexOf("Data");
    const downloadsIndex = titles.indexOf("Downloads");
    const dangerIndex = titles.indexOf("Danger Zone");

    expect(dataIndex).toBeGreaterThanOrEqual(0);
    expect(downloadsIndex).toBeGreaterThanOrEqual(0);
    expect(dangerIndex).toBeGreaterThanOrEqual(0);
    expect(dataIndex).toBeLessThan(downloadsIndex);
    expect(downloadsIndex).toBeLessThan(dangerIndex);
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

  it("allows toggling rail theme control visibility", async () => {
    const setShowThemeRailControl = vi.fn();

    renderSettingsPanel({ shell: { showThemeRailControl: true, setShowThemeRailControl } });

    await screen.findByText("Settings");
    const toggle = await screen.findByRole("switch", { name: /show theme control in app rail/i });

    fireEvent.click(toggle);
    expect(setShowThemeRailControl).toHaveBeenCalledWith(false);
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
    expect(await screen.findByText("Cleared feeds cache.")).toBeInTheDocument();
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
    expect(await screen.findByText("Exported data as JSON.")).toBeInTheDocument();
  });

  it("allows exporting data as CSV", async () => {
    renderSettingsPanel();

    await screen.findByText("Settings");
    const csvButton = await screen.findByRole("button", { name: /csv/i });

    fireEvent.click(csvButton);
    await waitFor(() => expect(exportDataMock).toHaveBeenCalledWith("csv"));
    expect(await screen.findByText("Exported data as CSV.")).toBeInTheDocument();
  });

  it("shows export errors inline in data settings", async () => {
    exportDataMock.mockRejectedValueOnce(new Error("export path is invalid"));
    renderSettingsPanel();

    await screen.findByText("Settings");
    const jsonButton = await screen.findByRole("button", { name: /json/i });
    fireEvent.click(jsonButton);

    expect(await screen.findByText("Couldn't export data — check that the destination path is valid."))
      .toBeInTheDocument();
  });

  it("allows selecting the download folder from the directory picker", async () => {
    getDownloadDirectoryMock.mockResolvedValueOnce("/Users/test/Downloads").mockResolvedValueOnce(
      "/Users/test/Pictures",
    );
    dialogOpenMock.mockResolvedValue("/Users/test/Pictures");

    renderSettingsPanel();

    await screen.findByText("Settings");
    const browseButton = await screen.findByRole("button", { name: /browse/i });
    fireEvent.click(browseButton);

    await waitFor(() => expect(setDownloadDirectoryMock).toHaveBeenCalledWith("/Users/test/Pictures"));
    await waitFor(() => expect(screen.getByDisplayValue("/Users/test/Pictures")).toBeInTheDocument());
    expect(await screen.findByText("Download folder updated.")).toBeInTheDocument();
  });

  it("resets the download folder to the default path", async () => {
    getDownloadDirectoryMock.mockResolvedValueOnce("/Users/test/Pictures").mockResolvedValueOnce(
      "/Users/test/Downloads",
    );

    renderSettingsPanel();

    await screen.findByText("Settings");
    const resetButton = await screen.findByRole("button", { name: /reset to default/i });
    fireEvent.click(resetButton);

    await waitFor(() => expect(setDownloadDirectoryMock).toHaveBeenCalledWith("~/Downloads"));
    expect(await screen.findByText("Download folder reset to default.")).toBeInTheDocument();
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

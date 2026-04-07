import { AppPreferencesProvider } from "$/contexts/app-preferences";
import { fireEvent, render, screen, waitFor } from "@solidjs/testing-library";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { EmbeddingsSettings } from "./EmbeddingsSettings";

const getEmbeddingsConfigMock = vi.hoisted(() => vi.fn());
const prepareEmbeddingsModelMock = vi.hoisted(() => vi.fn());
const setEmbeddingsEnabledMock = vi.hoisted(() => vi.fn());
const setEmbeddingsPreflightSeenMock = vi.hoisted(() => vi.fn());
const getSettingsMock = vi.hoisted(() => vi.fn());
const updateSettingMock = vi.hoisted(() => vi.fn());

vi.mock(
  "$/lib/api/search",
  () => ({
    getEmbeddingsConfig: getEmbeddingsConfigMock,
    prepareEmbeddingsModel: prepareEmbeddingsModelMock,
    setEmbeddingsEnabled: setEmbeddingsEnabledMock,
    setEmbeddingsPreflightSeen: setEmbeddingsPreflightSeenMock,
  }),
);

vi.mock("$/lib/api/settings", () => ({ getSettings: getSettingsMock, updateSetting: updateSettingMock }));

vi.mock("@tauri-apps/plugin-log", () => ({ info: vi.fn(), error: vi.fn(), warn: vi.fn() }));

function renderEmbeddingsSettings() {
  render(() => (
    <AppPreferencesProvider>
      <EmbeddingsSettings />
    </AppPreferencesProvider>
  ));
}

describe("EmbeddingsSettings", () => {
  beforeEach(() => {
    getEmbeddingsConfigMock.mockReset();
    prepareEmbeddingsModelMock.mockReset();
    setEmbeddingsEnabledMock.mockReset();
    setEmbeddingsPreflightSeenMock.mockReset();
    getSettingsMock.mockReset();
    updateSettingMock.mockReset();

    getSettingsMock.mockResolvedValue({
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
    });
    getEmbeddingsConfigMock.mockResolvedValue({
      enabled: false,
      preflightSeen: false,
      modelName: "nomic-embed-text-v1.5",
      dimensions: 768,
      downloaded: false,
      downloadActive: false,
    });
    prepareEmbeddingsModelMock.mockResolvedValue({
      enabled: true,
      preflightSeen: true,
      modelName: "nomic-embed-text-v1.5",
      dimensions: 768,
      modelSizeBytes: 1024 * 1024 * 384,
      downloaded: true,
      downloadActive: false,
    });
    setEmbeddingsEnabledMock.mockResolvedValue(void 0);
  });

  it("renders embeddings settings with model info", async () => {
    renderEmbeddingsSettings();

    expect(await screen.findByText("Optional Semantic Search")).toBeInTheDocument();
    expect(await screen.findAllByText(/nomic-embed-text-v1\.5/)).toHaveLength(1);
    expect(await screen.findAllByText(/768D/)).toHaveLength(1);
    expect(await screen.findAllByText(/384 MB download/i)).toHaveLength(1);
    expect(await screen.findAllByText(/off by default/i)).toHaveLength(2);
  });

  it("does not auto-download on mount while embeddings are off", async () => {
    renderEmbeddingsSettings();

    await screen.findByRole("switch");
    expect(prepareEmbeddingsModelMock).not.toHaveBeenCalled();
  });

  it("shows toggle in disabled state when embeddings are disabled", async () => {
    getEmbeddingsConfigMock.mockResolvedValue({
      enabled: false,
      preflightSeen: false,
      modelName: "nomic-embed-text-v1.5",
      dimensions: 768,
      downloaded: false,
      downloadActive: false,
    });

    renderEmbeddingsSettings();

    const toggle = await screen.findByRole("switch");
    expect(toggle).toHaveAttribute("aria-checked", "false");
  });

  it("toggles embeddings when clicking the switch", async () => {
    getEmbeddingsConfigMock.mockResolvedValueOnce({
      enabled: false,
      preflightSeen: false,
      modelName: "nomic-embed-text-v1.5",
      dimensions: 768,
      downloaded: false,
      downloadActive: false,
    }).mockResolvedValueOnce({
      enabled: true,
      preflightSeen: true,
      modelName: "nomic-embed-text-v1.5",
      dimensions: 768,
      downloaded: false,
      downloadActive: false,
    });

    renderEmbeddingsSettings();

    const toggle = await screen.findByRole("switch");
    expect(toggle).toHaveAttribute("aria-checked", "false");

    fireEvent.click(toggle);

    await waitFor(() => {
      expect(setEmbeddingsEnabledMock).toHaveBeenCalledWith(true);
    });

    await waitFor(() => {
      expect(prepareEmbeddingsModelMock).toHaveBeenCalled();
    });
  });

  it("shows download progress when model is not downloaded", async () => {
    getEmbeddingsConfigMock.mockResolvedValue({
      enabled: true,
      preflightSeen: true,
      modelName: "nomic-embed-text-v1.5",
      dimensions: 768,
      downloaded: false,
      downloadActive: true,
      downloadProgress: 0,
      downloadFile: "onnx/model.onnx",
      downloadFileIndex: 1,
      downloadFileTotal: 5,
    });

    renderEmbeddingsSettings();

    expect(await screen.findAllByText(/downloading model files/i)).toHaveLength(2);
    expect(await screen.findByText(/0%/)).toBeInTheDocument();
  });

  it("displays semantic search description", async () => {
    renderEmbeddingsSettings();
    expect(await screen.findByText(/semantic search is optional/i)).toBeInTheDocument();
  });

  it("handles errors when loading config gracefully", async () => {
    getEmbeddingsConfigMock.mockRejectedValue(new Error("Failed to load"));

    renderEmbeddingsSettings();

    await waitFor(() => {
      expect(getEmbeddingsConfigMock).toHaveBeenCalled();
    });
    expect(await screen.findByText("Optional Semantic Search")).toBeInTheDocument();
  });

  it("handles errors when toggling gracefully", async () => {
    setEmbeddingsEnabledMock.mockRejectedValue(new Error("Failed to save"));

    renderEmbeddingsSettings();

    const toggle = await screen.findByRole("switch");
    fireEvent.click(toggle);

    await waitFor(() => {
      expect(setEmbeddingsEnabledMock).toHaveBeenCalled();
    });

    expect(toggle).toHaveAttribute("aria-checked", "false");
  });
});

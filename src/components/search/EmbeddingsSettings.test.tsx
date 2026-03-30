import { AppPreferencesProvider } from "$/contexts/app-preferences";
import { fireEvent, render, screen, waitFor } from "@solidjs/testing-library";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { EmbeddingsSettings } from "./EmbeddingsSettings";

const getEmbeddingsConfigMock = vi.hoisted(() => vi.fn());
const prepareEmbeddingsModelMock = vi.hoisted(() => vi.fn());
const setEmbeddingsEnabledMock = vi.hoisted(() => vi.fn());
const getSettingsMock = vi.hoisted(() => vi.fn());
const updateSettingMock = vi.hoisted(() => vi.fn());

vi.mock(
  "$/lib/api/search",
  () => ({
    getEmbeddingsConfig: getEmbeddingsConfigMock,
    prepareEmbeddingsModel: prepareEmbeddingsModelMock,
    setEmbeddingsEnabled: setEmbeddingsEnabledMock,
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
    getSettingsMock.mockReset();
    updateSettingMock.mockReset();

    getSettingsMock.mockResolvedValue({
      theme: "auto",
      timelineRefreshSecs: 60,
      notificationsDesktop: true,
      notificationsBadge: true,
      notificationsSound: false,
      embeddingsEnabled: true,
      constellationUrl: "https://constellation.microcosm.blue",
      spacedustUrl: "https://spacedust.microcosm.blue",
      spacedustInstant: false,
      spacedustEnabled: false,
      globalShortcut: "Ctrl+Shift+N",
    });
    getEmbeddingsConfigMock.mockResolvedValue({
      enabled: true,
      modelName: "nomic-embed-text-v1.5",
      dimensions: 768,
      modelSizeBytes: 1024 * 1024 * 384,
      downloaded: true,
      downloadActive: false,
    });
    prepareEmbeddingsModelMock.mockResolvedValue({
      enabled: true,
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

    expect(await screen.findByText("Semantic Search")).toBeInTheDocument();
    expect(await screen.findByText(/nomic-embed-text-v1\.5/)).toBeInTheDocument();
    expect(await screen.findByText(/768D/)).toBeInTheDocument();
    expect(await screen.findByText(/384 MB on disk/i)).toBeInTheDocument();
  });

  it("shows toggle in enabled state when embeddings are enabled", async () => {
    renderEmbeddingsSettings();

    const toggle = await screen.findByRole("switch");
    expect(toggle).toHaveAttribute("aria-checked", "true");
  });

  it("shows toggle in disabled state when embeddings are disabled", async () => {
    getEmbeddingsConfigMock.mockResolvedValue({
      enabled: false,
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
      enabled: true,
      modelName: "nomic-embed-text-v1.5",
      dimensions: 768,
      downloaded: true,
      downloadActive: false,
    }).mockResolvedValueOnce({
      enabled: false,
      modelName: "nomic-embed-text-v1.5",
      dimensions: 768,
      downloaded: false,
      downloadActive: false,
    });

    renderEmbeddingsSettings();

    const toggle = await screen.findByRole("switch");
    expect(toggle).toHaveAttribute("aria-checked", "true");

    fireEvent.click(toggle);

    await waitFor(() => {
      expect(setEmbeddingsEnabledMock).toHaveBeenCalledWith(false);
    });

    await waitFor(() => {
      expect(toggle).toHaveAttribute("aria-checked", "false");
    });
  });

  it("shows download progress when model is not downloaded", async () => {
    getEmbeddingsConfigMock.mockResolvedValue({
      enabled: true,
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
    expect(await screen.findByText(/conceptually similar posts/i)).toBeInTheDocument();
  });

  it("handles errors when loading config gracefully", async () => {
    getEmbeddingsConfigMock.mockRejectedValue(new Error("Failed to load"));

    renderEmbeddingsSettings();

    await waitFor(() => {
      expect(getEmbeddingsConfigMock).toHaveBeenCalled();
    });
    expect(await screen.findByText("Semantic Search")).toBeInTheDocument();
  });

  it("handles errors when toggling gracefully", async () => {
    setEmbeddingsEnabledMock.mockRejectedValue(new Error("Failed to save"));

    renderEmbeddingsSettings();

    const toggle = await screen.findByRole("switch");
    fireEvent.click(toggle);

    await waitFor(() => {
      expect(setEmbeddingsEnabledMock).toHaveBeenCalled();
    });

    expect(toggle).toHaveAttribute("aria-checked", "true");
  });
});

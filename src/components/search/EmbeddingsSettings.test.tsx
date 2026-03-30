import { fireEvent, render, screen, waitFor } from "@solidjs/testing-library";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { EmbeddingsSettings } from "./EmbeddingsSettings";

const getEmbeddingsConfigMock = vi.hoisted(() => vi.fn());
const prepareEmbeddingsModelMock = vi.hoisted(() => vi.fn());
const setEmbeddingsEnabledMock = vi.hoisted(() => vi.fn());

vi.mock(
  "$/lib/api/search",
  () => ({
    getEmbeddingsConfig: getEmbeddingsConfigMock,
    prepareEmbeddingsModel: prepareEmbeddingsModelMock,
    setEmbeddingsEnabled: setEmbeddingsEnabledMock,
  }),
);

vi.mock("@tauri-apps/plugin-log", () => ({ info: vi.fn(), error: vi.fn(), warn: vi.fn() }));

describe("EmbeddingsSettings", () => {
  beforeEach(() => {
    getEmbeddingsConfigMock.mockReset();
    prepareEmbeddingsModelMock.mockReset();
    setEmbeddingsEnabledMock.mockReset();

    getEmbeddingsConfigMock.mockResolvedValue({
      enabled: true,
      modelName: "nomic-embed-text-v1.5",
      dimensions: 768,
      downloaded: true,
      downloadActive: false,
    });
    prepareEmbeddingsModelMock.mockResolvedValue({
      enabled: true,
      modelName: "nomic-embed-text-v1.5",
      dimensions: 768,
      downloaded: true,
      downloadActive: false,
    });
    setEmbeddingsEnabledMock.mockResolvedValue(void 0);
  });

  it("renders embeddings settings with model info", async () => {
    render(() => <EmbeddingsSettings />);

    expect(await screen.findByText("Semantic Search")).toBeInTheDocument();
    expect(await screen.findByText(/nomic-embed-text-v1\.5/)).toBeInTheDocument();
    expect(await screen.findByText(/768D/)).toBeInTheDocument();
  });

  it("shows toggle in enabled state when embeddings are enabled", async () => {
    render(() => <EmbeddingsSettings />);

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

    render(() => <EmbeddingsSettings />);

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

    render(() => <EmbeddingsSettings />);

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

    render(() => <EmbeddingsSettings />);

    expect(await screen.findAllByText(/downloading model files/i)).toHaveLength(2);
    expect(await screen.findByText(/0%/)).toBeInTheDocument();
  });

  it("displays semantic search description", async () => {
    render(() => <EmbeddingsSettings />);
    expect(await screen.findByText(/conceptually similar posts/i)).toBeInTheDocument();
  });

  it("handles errors when loading config gracefully", async () => {
    getEmbeddingsConfigMock.mockRejectedValue(new Error("Failed to load"));

    render(() => <EmbeddingsSettings />);

    // Should still render without crashing
    await waitFor(() => {
      expect(getEmbeddingsConfigMock).toHaveBeenCalled();
    });
  });

  it("handles errors when toggling gracefully", async () => {
    setEmbeddingsEnabledMock.mockRejectedValue(new Error("Failed to save"));

    render(() => <EmbeddingsSettings />);

    const toggle = await screen.findByRole("switch");
    fireEvent.click(toggle);

    await waitFor(() => {
      expect(setEmbeddingsEnabledMock).toHaveBeenCalled();
    });

    // Toggle state should remain unchanged on error
    expect(toggle).toHaveAttribute("aria-checked", "true");
  });
});

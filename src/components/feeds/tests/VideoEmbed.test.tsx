import { fireEvent, render, screen, waitFor } from "@solidjs/testing-library";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { VideoEmbed } from "../VideoEmbed";

const downloadVideoMock = vi.hoisted(() => vi.fn());
const listenMock = vi.hoisted(() => vi.fn());
const revealItemInDirMock = vi.hoisted(() => vi.fn());

vi.mock("$/lib/api/media", () => ({ MediaController: { downloadVideo: downloadVideoMock } }));
vi.mock("@tauri-apps/api/event", () => ({ listen: listenMock }));
vi.mock("@tauri-apps/plugin-opener", () => ({ revealItemInDir: revealItemInDirMock }));

describe("VideoEmbed", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    downloadVideoMock.mockReset();
    listenMock.mockReset();
    revealItemInDirMock.mockReset();
    listenMock.mockResolvedValue(() => {});
    revealItemInDirMock.mockResolvedValue(void 0);
  });

  it("starts playback from the click-to-play overlay and renders caption text", async () => {
    const playSpy = vi.spyOn(HTMLMediaElement.prototype, "play").mockResolvedValue();
    vi.spyOn(HTMLMediaElement.prototype, "canPlayType").mockReturnValue("probably");

    render(() => (
      <VideoEmbed
        alt="Clip caption"
        playlist="https://cdn.example.com/video/master.m3u8"
        thumbnail="https://cdn.example.com/video/thumb.jpg" />
    ));

    fireEvent.click(screen.getByRole("button", { name: "Play video" }));

    await waitFor(() => expect(playSpy).toHaveBeenCalled());
    const video = document.querySelector("video");
    expect(video?.src).toContain("master.m3u8");
    expect(screen.getByText("Clip caption")).toBeInTheDocument();
  });

  it("downloads a video and offers an open-in-finder action", async () => {
    downloadVideoMock.mockResolvedValue({ bytes: 42, path: "/tmp/example.mp4" });

    render(() => <VideoEmbed playlist="https://cdn.example.com/video/master.m3u8" />);

    fireEvent.click(screen.getByRole("button", { name: "Download video" }));

    await waitFor(() =>
      expect(downloadVideoMock).toHaveBeenCalledWith("https://cdn.example.com/video/master.m3u8", null)
    );
    expect(await screen.findByText("Saved example.mp4.")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Open in Finder" }));
    await waitFor(() => expect(revealItemInDirMock).toHaveBeenCalledWith("/tmp/example.mp4"));
  });

  it("shows a human-readable error when a download fails", async () => {
    downloadVideoMock.mockRejectedValue(new Error("download folder missing"));

    render(() => <VideoEmbed playlist="https://cdn.example.com/video/master.m3u8" />);

    fireEvent.click(screen.getByRole("button", { name: "Download video" }));

    expect(await screen.findByText("Couldn't save — check that the download folder exists.")).toBeInTheDocument();
  });
});

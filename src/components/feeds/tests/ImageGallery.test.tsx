import { fireEvent, render, screen, waitFor } from "@solidjs/testing-library";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ImageGallery } from "./ImageGallery";

const downloadImageMock = vi.hoisted(() => vi.fn());
const revealItemInDirMock = vi.hoisted(() => vi.fn());

vi.mock("$/lib/api/media", () => ({ MediaController: { downloadImage: downloadImageMock } }));
vi.mock("@tauri-apps/plugin-opener", () => ({ revealItemInDir: revealItemInDirMock }));

const GALLERY_IMAGES = [{ alt: "First image", fullsize: "https://cdn.example.com/first.jpg" }, {
  alt: "Second image",
  fullsize: "https://cdn.example.com/second.jpg",
}] as const;

describe("ImageGallery", () => {
  beforeEach(() => {
    downloadImageMock.mockReset();
    revealItemInDirMock.mockReset();
    revealItemInDirMock.mockResolvedValue(void 0);
  });

  it("supports keyboard navigation and escape close", async () => {
    const onClose = vi.fn();
    render(() => (
      <ImageGallery images={[...GALLERY_IMAGES]} open postText="Post text" startIndex={0} onClose={onClose} />
    ));

    expect(screen.getByText("1 / 2")).toBeInTheDocument();
    expect(screen.getByAltText("First image")).toBeInTheDocument();

    fireEvent.keyDown(globalThis as unknown as Window, { key: "ArrowRight" });
    await waitFor(() => expect(screen.getByAltText("Second image")).toBeInTheDocument());

    fireEvent.keyDown(globalThis as unknown as Window, { key: "Escape" });
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("truncates post copy and toggles expansion", () => {
    render(() => (
      <ImageGallery images={[...GALLERY_IMAGES]} open postText={"x".repeat(220)} startIndex={0} onClose={() => {}} />
    ));

    const toggle = screen.getByRole("button", { name: "Show more" });
    fireEvent.click(toggle);
    expect(screen.getByRole("button", { name: "Show less" })).toBeInTheDocument();
  });

  it("downloads the selected image and reveals it in Finder", async () => {
    downloadImageMock.mockResolvedValue({ bytes: 1200, path: "/tmp/gallery.jpg" });

    render(() => (
      <ImageGallery
        authorHandle="@alice.test"
        authorHref="/profile/alice.test"
        downloadFilenameForIndex={(index) => `post-rkey_${index + 1}`}
        images={[...GALLERY_IMAGES]}
        open
        postText="Gallery post"
        startIndex={0}
        onClose={() => {}} />
    ));

    fireEvent.click(screen.getByRole("button", { name: "Download image" }));

    await waitFor(() =>
      expect(downloadImageMock).toHaveBeenCalledWith("https://cdn.example.com/first.jpg", "post-rkey_1")
    );
    expect(await screen.findByText("Saved gallery.jpg.")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Open in Finder" }));
    await waitFor(() => expect(revealItemInDirMock).toHaveBeenCalledWith("/tmp/gallery.jpg"));
  });
});

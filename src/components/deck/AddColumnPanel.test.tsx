import { fireEvent, render, screen, waitFor } from "@solidjs/testing-library";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { AddColumnPanel } from "./AddColumnPanel";

const getFeedGeneratorsMock = vi.hoisted(() => vi.fn());
const getPreferencesMock = vi.hoisted(() => vi.fn());

vi.mock("$/lib/api/feeds", () => ({ getFeedGenerators: getFeedGeneratorsMock, getPreferences: getPreferencesMock }));
vi.mock("@tauri-apps/plugin-log", () => ({ error: vi.fn(), info: vi.fn(), warn: vi.fn() }));

describe("AddColumnPanel", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    getFeedGeneratorsMock.mockResolvedValue({ feeds: [] });
    getPreferencesMock.mockResolvedValue({
      feedViewPrefs: [],
      savedFeeds: [{ id: "following", pinned: true, type: "timeline", value: "following" }],
    });
  });

  it("renders the picker when open", async () => {
    render(() => <AddColumnPanel open={true} onAdd={vi.fn()} onClose={vi.fn()} />);

    expect(await screen.findByRole("dialog")).toBeInTheDocument();
    expect(await screen.findByText("Add column")).toBeInTheDocument();
    expect(await screen.findByText("Following")).toBeInTheDocument();
  });

  it("submits the selected feed as a deck column", async () => {
    const onAdd = vi.fn();

    render(() => <AddColumnPanel open={true} onAdd={onAdd} onClose={vi.fn()} />);

    fireEvent.click(await screen.findByRole("button", { name: /timeline/i }));

    await waitFor(() =>
      expect(onAdd).toHaveBeenCalledWith(
        "feed",
        JSON.stringify({ feedType: "timeline", feedUri: "following", title: "Following" }),
      )
    );
  });

  it("hydrates feed generator labels in the picker and submission config", async () => {
    const onAdd = vi.fn();
    getPreferencesMock.mockResolvedValue({
      feedViewPrefs: [],
      savedFeeds: [{
        id: "at://did:plc:alice/app.bsky.feed.generator/for-you",
        pinned: true,
        type: "feed",
        value: "at://did:plc:alice/app.bsky.feed.generator/for-you",
      }],
    });
    getFeedGeneratorsMock.mockResolvedValue({
      feeds: [{
        avatar: "https://cdn.example.com/for-you.png",
        did: "did:plc:alice",
        displayName: "For You",
        uri: "at://did:plc:alice/app.bsky.feed.generator/for-you",
      }],
    });

    render(() => <AddColumnPanel open={true} onAdd={onAdd} onClose={vi.fn()} />);

    expect(await screen.findByText("For You")).toBeInTheDocument();
    expect(document.querySelector("img[src=\"https://cdn.example.com/for-you.png\"]")).toBeTruthy();

    fireEvent.click(await screen.findByRole("button", { name: /for you/i }));

    await waitFor(() =>
      expect(onAdd).toHaveBeenCalledWith(
        "feed",
        JSON.stringify({
          feedType: "feed",
          feedUri: "at://did:plc:alice/app.bsky.feed.generator/for-you",
          title: "For You",
        }),
      )
    );
  });
});

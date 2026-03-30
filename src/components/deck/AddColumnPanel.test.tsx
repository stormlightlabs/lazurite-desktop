import { fireEvent, render, screen, waitFor } from "@solidjs/testing-library";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { AddColumnPanel } from "./AddColumnPanel";

const getPreferencesMock = vi.hoisted(() => vi.fn());

vi.mock("$/lib/api/feeds", () => ({ getPreferences: getPreferencesMock }));
vi.mock("@tauri-apps/plugin-log", () => ({ error: vi.fn(), info: vi.fn(), warn: vi.fn() }));

describe("AddColumnPanel", () => {
  beforeEach(() => {
    vi.resetAllMocks();
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
      expect(onAdd).toHaveBeenCalledWith("feed", JSON.stringify({ feedType: "timeline", feedUri: "following" }))
    );
  });
});

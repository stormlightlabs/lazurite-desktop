import { fireEvent, render, screen, waitFor } from "@solidjs/testing-library";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ExternalEmbed } from "../embeds/ExternalEmbed";

const openUrlMock = vi.hoisted(() => vi.fn());

vi.mock("@tauri-apps/plugin-opener", () => ({ openUrl: openUrlMock }));

describe("ExternalEmbed", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    openUrlMock.mockResolvedValue(void 0);
  });

  it("opens embed links with the system browser via the opener plugin", async () => {
    render(() => <ExternalEmbed title="External article" uri="https://example.com/article" />);

    fireEvent.click(screen.getByRole("link", { name: /external article/i }));

    await waitFor(() => expect(openUrlMock).toHaveBeenCalledWith("https://example.com/article"));
  });
});

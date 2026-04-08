import { AppTestProviders } from "$/test/providers";
import { HashRouter, Route } from "@solidjs/router";
import { fireEvent, render, screen, waitFor } from "@solidjs/testing-library";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { AppRail } from "./AppRail";

const openUrlMock = vi.hoisted(() => vi.fn());

vi.mock("@tauri-apps/plugin-opener", () => ({ openUrl: openUrlMock }));

function renderRail() {
  globalThis.location.hash = "#/timeline";

  return render(() => (
    <AppTestProviders
      session={{
        activeDid: "did:plc:alice",
        activeHandle: "alice.test",
        activeSession: { did: "did:plc:alice", handle: "alice.test" },
        hasSession: true,
      }}>
      <HashRouter>
        <Route path="*" component={AppRail} />
      </HashRouter>
    </AppTestProviders>
  ));
}

describe("AppRail", () => {
  beforeEach(() => {
    openUrlMock.mockReset();
  });

  it("renders the saved navigation link", async () => {
    renderRail();

    const link = await screen.findByRole("link", { name: "Saved" });
    expect(link).toHaveAttribute("href", "#/saved");
  });

  it("tracks in-app history and enables back/forward controls", async () => {
    renderRail();

    const backButton = await screen.findByRole("button", { name: "Back" });
    const forwardButton = await screen.findByRole("button", { name: "Forward" });
    expect(backButton).toBeDisabled();
    expect(forwardButton).toBeDisabled();

    fireEvent.click(screen.getByRole("link", { name: "Profile" }));
    await waitFor(() => expect(globalThis.location.hash).toBe("#/profile"));
    expect(backButton).toBeEnabled();
    expect(forwardButton).toBeDisabled();

    fireEvent.click(backButton);
    await waitFor(() => expect(globalThis.location.hash).toBe("#/timeline"));
    expect(backButton).toBeDisabled();
    expect(forwardButton).toBeEnabled();
  });

  it("opens the support URL with the opener plugin", async () => {
    renderRail();

    fireEvent.click(await screen.findByRole("button", { name: "Support" }));

    await waitFor(() => expect(openUrlMock).toHaveBeenCalledWith("https://github.com/sponsors/desertthunder"));
    expect(screen.queryByRole("link", { name: "Support" })).not.toBeInTheDocument();
  });
});

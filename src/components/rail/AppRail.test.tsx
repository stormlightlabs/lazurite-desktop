import { AppTestProviders } from "$/test/providers";
import { HashRouter, Route } from "@solidjs/router";
import { fireEvent, render, screen, waitFor } from "@solidjs/testing-library";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { AppRail } from "./AppRail";

const openUrlMock = vi.hoisted(() => vi.fn());
const updateSettingMock = vi.hoisted(() => vi.fn());

vi.mock("@tauri-apps/plugin-opener", () => ({ openUrl: openUrlMock }));

function renderRail(options: { preferences?: Record<string, unknown>; shell?: Record<string, unknown> } = {}) {
  globalThis.location.hash = "#/timeline";

  return render(() => (
    <AppTestProviders
      preferences={{ updateSetting: updateSettingMock, ...options.preferences }}
      shell={options.shell}
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
    updateSettingMock.mockReset();
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

  it("shows the theme menu trigger when enabled", async () => {
    renderRail();

    expect(await screen.findByRole("button", { name: "Theme menu" })).toBeInTheDocument();
  });

  it("hides the theme menu trigger when disabled in shell preferences", async () => {
    renderRail({ shell: { showThemeRailControl: false } });

    await screen.findByRole("link", { name: "Timeline" });
    expect(screen.queryByRole("button", { name: "Theme menu" })).not.toBeInTheDocument();
  });

  it("keeps the theme menu trigger visible on narrow viewports", async () => {
    renderRail({ shell: { narrowViewport: true, railCondensed: true } });

    expect(await screen.findByRole("button", { name: "Theme menu" })).toBeInTheDocument();
    expect(await screen.findByRole("button", { name: "More navigation" })).toBeInTheDocument();
  });

  it("uses overflow navigation when desktop rail is collapsed", async () => {
    renderRail({ shell: { railCollapsed: true, railCondensed: true } });

    expect(await screen.findByRole("button", { name: "More navigation" })).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "Saved" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Support" })).not.toBeInTheDocument();
  });

  it("updates the persisted theme from the rail theme menu", async () => {
    renderRail({ preferences: { settings: { theme: "auto" } } });

    fireEvent.click(await screen.findByRole("button", { name: "Theme menu" }));
    const darkThemeOption = await screen.findByRole("menuitemradio", { name: "Dark" });
    fireEvent.mouseDown(darkThemeOption);
    fireEvent.click(darkThemeOption);

    await waitFor(() => expect(updateSettingMock).toHaveBeenCalledWith("theme", "dark"));
  });
});

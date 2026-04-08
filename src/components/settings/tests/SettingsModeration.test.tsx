import { fireEvent, render, screen, waitFor } from "@solidjs/testing-library";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { SettingsModeration } from "../SettingsModeration";

const getModerationPrefsMock = vi.hoisted(() => vi.fn());
const setAdultContentEnabledMock = vi.hoisted(() => vi.fn());
const setLabelPreferenceMock = vi.hoisted(() => vi.fn());
const subscribeLabelerMock = vi.hoisted(() => vi.fn());
const unsubscribeLabelerMock = vi.hoisted(() => vi.fn());
const getLabelerPolicyDefinitionsMock = vi.hoisted(() => vi.fn());
const getDistributionChannelMock = vi.hoisted(() => vi.fn());
const openUrlMock = vi.hoisted(() => vi.fn());

vi.mock(
  "$/lib/api/moderation",
  () => ({
    ModerationController: {
      getModerationPrefs: getModerationPrefsMock,
      setAdultContentEnabled: setAdultContentEnabledMock,
      setLabelPreference: setLabelPreferenceMock,
      subscribeLabeler: subscribeLabelerMock,
      unsubscribeLabeler: unsubscribeLabelerMock,
      getLabelerPolicyDefinitions: getLabelerPolicyDefinitionsMock,
      getDistributionChannel: getDistributionChannelMock,
    },
  }),
);

vi.mock("@tauri-apps/plugin-opener", () => ({ openUrl: openUrlMock }));

describe("SettingsModeration", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    getModerationPrefsMock.mockResolvedValue({
      adultContentEnabled: false,
      subscribedLabelers: ["did:plc:custom-labeler"],
      labelPreferences: { "did:plc:custom-labeler": { porn: "hide" } },
    });
    setAdultContentEnabledMock.mockResolvedValue(void 0);
    setLabelPreferenceMock.mockResolvedValue(void 0);
    subscribeLabelerMock.mockResolvedValue(void 0);
    unsubscribeLabelerMock.mockResolvedValue(void 0);
    getLabelerPolicyDefinitionsMock.mockResolvedValue([{
      labelerDid: "did:plc:ar7c4by46qjdydhdevvrndac",
      definitions: [{ identifier: "graphic-media", adultOnly: false, severity: "alert", blurs: "media", locales: [] }],
    }, {
      labelerDid: "did:plc:custom-labeler",
      definitions: [{ identifier: "porn", adultOnly: true, severity: "alert", blurs: "media", locales: [] }],
    }]);
    getDistributionChannelMock.mockResolvedValue("github");
    openUrlMock.mockResolvedValue(void 0);
  });

  it("toggles adult content on github builds", async () => {
    render(() => <SettingsModeration />);

    const toggle = await screen.findByRole("switch", { name: "Adult content" });
    fireEvent.click(toggle);

    await waitFor(() => expect(setAdultContentEnabledMock).toHaveBeenCalledWith(true));
  });

  it("shows web-settings path for mac app store builds", async () => {
    getDistributionChannelMock.mockResolvedValue("mac_app_store");
    render(() => <SettingsModeration />);

    expect(await screen.findByText(/use Bluesky web settings/i)).toBeInTheDocument();
    expect(screen.queryByRole("switch", { name: "Adult content" })).not.toBeInTheDocument();
  });

  it("adds custom labelers", async () => {
    render(() => <SettingsModeration />);

    const input = await screen.findByPlaceholderText("did:plc:...");
    fireEvent.input(input, { target: { value: "did:plc:new-labeler" } });
    fireEvent.click(screen.getByRole("button", { name: "Add labeler" }));

    await waitFor(() => expect(subscribeLabelerMock).toHaveBeenCalledWith("did:plc:new-labeler"));
  });

  it("removes custom labelers", async () => {
    render(() => <SettingsModeration />);

    await screen.findByText("Subscribed labelers");
    fireEvent.click(screen.getByRole("button", { name: "Remove" }));
    await waitFor(() => expect(unsubscribeLabelerMock).toHaveBeenCalledWith("did:plc:custom-labeler"));
  });

  it("adds a label visibility override", async () => {
    render(() => <SettingsModeration />);

    const inputs = await screen.findAllByPlaceholderText("label identifier (for example: sexual)");
    fireEvent.input(inputs[0], { target: { value: "graphic-media" } });
    fireEvent.click(screen.getAllByRole("button", { name: "Add override" })[0]);

    await waitFor(() =>
      expect(setLabelPreferenceMock).toHaveBeenCalledWith("did:plc:ar7c4by46qjdydhdevvrndac", "graphic-media", "warn")
    );
  });

  it("disables adult-only overrides when adult content is off", async () => {
    render(() => <SettingsModeration />);

    const helperText = await screen.findByText("Enable adult content to edit this label.");
    const controls = helperText.closest("div");
    const select = controls?.querySelector("select");
    expect(select).toBeTruthy();
    expect(select).toBeDisabled();
  });
});

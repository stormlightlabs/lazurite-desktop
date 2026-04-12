import { AppTestProviders } from "$/test/providers";
import { fireEvent, render, screen, waitFor } from "@solidjs/testing-library";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { DiagnosticsPanel } from "../DiagnosticsPanel";

const getAccountListsMock = vi.hoisted(() => vi.fn());
const getAccountLabelsMock = vi.hoisted(() => vi.fn());
const getAccountBlockedByMock = vi.hoisted(() => vi.fn());
const getAccountBlockingMock = vi.hoisted(() => vi.fn());
const getAccountStarterPacksMock = vi.hoisted(() => vi.fn());
const getRecordBacklinksMock = vi.hoisted(() => vi.fn());
const moderateContentMock = vi.hoisted(() => vi.fn());

vi.mock(
  "$/lib/api/diagnostics",
  () => ({
    DiagnosticsController: {
      getAccountBlockedBy: getAccountBlockedByMock,
      getAccountBlocking: getAccountBlockingMock,
      getAccountLabels: getAccountLabelsMock,
      getAccountLists: getAccountListsMock,
      getAccountStarterPacks: getAccountStarterPacksMock,
      getRecordBacklinks: getRecordBacklinksMock,
    },
  }),
);
vi.mock("$/lib/api/moderation", () => ({ ModerationController: { moderateContent: moderateContentMock } }));

function renderPanel(recordUri?: string) {
  render(() => (
    <AppTestProviders session={{ activeDid: "did:plc:test", activeHandle: "test.bsky.social" }}>
      <DiagnosticsPanel did="did:plc:test" onClose={vi.fn()} recordUri={recordUri ?? null} />
    </AppTestProviders>
  ));
}

describe("DiagnosticsPanel", () => {
  beforeEach(() => {
    getAccountListsMock.mockReset();
    getAccountLabelsMock.mockReset();
    getAccountBlockedByMock.mockReset();
    getAccountBlockingMock.mockReset();
    getAccountStarterPacksMock.mockReset();
    getRecordBacklinksMock.mockReset();
    moderateContentMock.mockReset();
    moderateContentMock.mockResolvedValue({
      alert: false,
      blur: "none",
      filter: false,
      inform: false,
      noOverride: false,
    });

    getAccountListsMock.mockResolvedValue({
      lists: [{
        description: "Builders and product people.",
        memberCount: 12,
        purpose: "app.bsky.graph.defs#curatelist",
        title: "Builders",
        creator: { handle: "mira.test" },
      }, {
        description: "Moderation boundary set.",
        listItemCount: 5,
        purpose: "app.bsky.graph.defs#modlist",
        title: "Safety",
        creator: { handle: "safety.test" },
      }],
      total: 2,
      truncated: false,
    });
    getAccountLabelsMock.mockResolvedValue({
      labels: [{ src: "did:plc:labeler", val: "!hide" }],
      sourceProfiles: { "did:plc:labeler": { displayName: "Safety Service", handle: "safety.service" } },
      cursor: null,
    });
    getAccountBlockedByMock.mockResolvedValue({
      cursor: null,
      items: [{ availability: "available", did: "did:plc:blocker", profile: { handle: "blocker.test" } }],
      total: 1,
    });
    getAccountBlockingMock.mockResolvedValue({
      cursor: null,
      items: [{ availability: "available", subjectDid: "did:plc:boundary", profile: { handle: "boundary.test" } }],
    });
    getAccountStarterPacksMock.mockResolvedValue({
      starterPacks: [{
        creator: { handle: "packer.test" },
        description: "Starter pack desc.",
        listItemCount: 8,
        title: "Newcomers",
      }],
      total: 1,
      truncated: false,
    });
    getRecordBacklinksMock.mockResolvedValue({
      likes: { cursor: null, records: [], total: 0 },
      quotes: { cursor: null, records: [], total: 0 },
      replies: { cursor: null, records: [], total: 0 },
      reposts: { cursor: null, records: [], total: 0 },
    });
  });

  it("renders the tab shell and switches tabs with keys", async () => {
    renderPanel();

    expect(await screen.findByText("Social Diagnostics")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Lists" })).toHaveAttribute("aria-pressed", "true");

    fireEvent.keyDown(document, { key: "2" });
    expect(screen.getByRole("button", { name: "Labels" })).toBeInTheDocument();
    fireEvent.keyDown(document, { key: "Escape" });
  });

  it("groups lists and shows neutral labels", async () => {
    renderPanel();

    fireEvent.click(await screen.findByRole("button", { name: "Lists" }));
    expect(screen.getAllByText("Curation").length).toBeGreaterThan(0);
    expect(screen.getByText("Builders")).toBeInTheDocument();
    expect(screen.getAllByText("Moderation").length).toBeGreaterThan(0);
  });

  it("shows blocks and starter packs with progressive disclosure", async () => {
    renderPanel();

    fireEvent.click(await screen.findByRole("button", { name: "Blocks" }));
    expect(await screen.findByText("Boundaries around you")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /show details/i })).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /show details/i }));
    await waitFor(() => expect(screen.getAllByText("blocker.test").length).toBeGreaterThan(0));

    fireEvent.click(screen.getByRole("button", { name: "Starter Packs" }));
    expect(await screen.findByText("Newcomers")).toBeInTheDocument();
    expect(screen.getByText("8 members")).toBeInTheDocument();
  });

  it("renders unavailable block rows without breaking the section", async () => {
    getAccountBlockedByMock.mockResolvedValueOnce({
      cursor: null,
      items: [{
        availability: "unavailable",
        did: "did:plc:missing",
        unavailableMessage: "This profile is unavailable right now.",
      }],
      total: 1,
    });

    renderPanel();

    fireEvent.click(await screen.findByRole("button", { name: "Blocks" }));
    fireEvent.click(screen.getByRole("button", { name: /show details/i }));

    const missing = await screen.findAllByText("did:plc:missing");
    expect(missing.length).toBeGreaterThan(0);
    expect(screen.getByText("This profile is unavailable right now.")).toBeInTheDocument();
  });

  it("renders moderation badges for labeled block-list profiles", async () => {
    getAccountBlockedByMock.mockResolvedValueOnce({
      cursor: null,
      items: [{
        availability: "available",
        did: "did:plc:blocker",
        profile: { handle: "blocker.test", labels: [{ src: "did:plc:labeler", val: "sexual" }] },
      }],
      total: 1,
    });
    moderateContentMock.mockImplementation(async (_labels, context: string) => {
      if (context === "profileList") {
        return { alert: true, blur: "none", filter: false, inform: false, noOverride: false };
      }

      return { alert: false, blur: "none", filter: false, inform: false, noOverride: false };
    });

    renderPanel();

    fireEvent.click(await screen.findByRole("button", { name: "Blocks" }));
    fireEvent.click(screen.getByRole("button", { name: /show details/i }));

    expect(await screen.findByText("blocker.test")).toBeInTheDocument();
    expect(await screen.findByText("Alert")).toBeInTheDocument();
  });

  it("explains backlinks when no record URI is selected", async () => {
    renderPanel();

    fireEvent.click(await screen.findByRole("button", { name: "Backlinks" }));

    expect(await screen.findByText(/Backlinks are record-specific engagement context/i)).toBeInTheDocument();
    expect(screen.getByText(/Open a post or record to inspect the public references pointing at it/i))
      .toBeInTheDocument();
  });

  it("renders moderation badges for labeled backlink profiles", async () => {
    getRecordBacklinksMock.mockResolvedValueOnce({
      likes: {
        cursor: null,
        records: [{
          collection: "app.bsky.feed.like",
          did: "did:plc:fan",
          profile: { handle: "fan.test", labels: [{ src: "did:plc:labeler", val: "sexual" }] },
          rkey: "1",
          uri: "at://did:plc:fan/app.bsky.feed.like/1",
        }],
        total: 1,
      },
      quotes: { cursor: null, records: [], total: 0 },
      replies: { cursor: null, records: [], total: 0 },
      reposts: { cursor: null, records: [], total: 0 },
    });
    moderateContentMock.mockImplementation(async (_labels, context: string) => {
      if (context === "profileList") {
        return { alert: true, blur: "none", filter: false, inform: false, noOverride: false };
      }

      return { alert: false, blur: "none", filter: false, inform: false, noOverride: false };
    });

    renderPanel("at://did:plc:test/app.bsky.feed.post/123");

    fireEvent.click(await screen.findByRole("button", { name: "Backlinks" }));
    fireEvent.click(await screen.findByRole("button", { name: /likes/i }));

    expect(await screen.findByText("fan.test")).toBeInTheDocument();
    expect(await screen.findByText("Alert")).toBeInTheDocument();
  });
});

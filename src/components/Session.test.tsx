import { render, screen } from "@solidjs/testing-library";
import { describe, expect, it, vi } from "vitest";
import { SessionEmptyState, SessionSpotlight } from "./Session";

describe("SessionEmptyState", () => {
  it("renders empty state copy", () => {
    render(() => <SessionEmptyState />);

    expect(screen.getByText("No account connected yet.")).toBeInTheDocument();
    expect(screen.getByText("Connect your Bluesky account to start exploring.")).toBeInTheDocument();
  });
});

describe("SessionSpotlight", () => {
  it("renders 'Your account' label", () => {
    render(() => (
      <SessionSpotlight
        activeSession={null}
        activeAccount={null}
        bootstrapping={false}
        reauthNeeded={false}
        onReauth={vi.fn()} />
    ));

    expect(screen.getByText("Your account")).toBeInTheDocument();
  });

  it("shows Ready status when no session and not bootstrapping", () => {
    render(() => (
      <SessionSpotlight
        activeSession={null}
        activeAccount={null}
        bootstrapping={false}
        reauthNeeded={false}
        onReauth={vi.fn()} />
    ));

    expect(screen.getByText("Ready")).toBeInTheDocument();
  });

  it("shows expired account state when reauth is needed", () => {
    render(() => (
      <SessionSpotlight
        activeSession={null}
        activeAccount={{ active: false, did: "did:plc:alice", handle: "alice.test", pdsUrl: "https://pds.example.com" }}
        bootstrapping={false}
        reauthNeeded
        onReauth={vi.fn()} />
    ));

    expect(screen.getByText("Expired")).toBeInTheDocument();
    expect(screen.getByText("alice.test")).toBeInTheDocument();
    expect(screen.getByText("Stored account")).toBeInTheDocument();
  });

  it("shows Reconnecting status when bootstrapping", () => {
    render(() => (
      <SessionSpotlight
        activeSession={null}
        activeAccount={null}
        bootstrapping
        reauthNeeded={false}
        onReauth={vi.fn()} />
    ));

    expect(screen.getByText("Reconnecting")).toBeInTheDocument();
  });
});

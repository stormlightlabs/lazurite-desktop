import { AppTestProviders } from "$/test/providers";
import { render, screen } from "@solidjs/testing-library";
import { describe, expect, it } from "vitest";
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
      <AppTestProviders session={{ activeSession: null, activeAccount: null, hasSession: false }}>
        <SessionSpotlight />
      </AppTestProviders>
    ));

    expect(screen.getByText("Your account")).toBeInTheDocument();
  });

  it("shows Ready status when no session and not bootstrapping", () => {
    render(() => (
      <AppTestProviders session={{ activeSession: null, activeAccount: null, hasSession: false }}>
        <SessionSpotlight />
      </AppTestProviders>
    ));

    expect(screen.getByText("Ready")).toBeInTheDocument();
  });

  it("shows expired account state when reauth is needed", () => {
    const account = { active: false, did: "did:plc:alice", handle: "alice.test", pdsUrl: "https://pds.example.com" };

    render(() => (
      <AppTestProviders
        session={{
          accounts: [account],
          activeAccount: null,
          activeSession: null,
          hasSession: false,
          primaryAccount: account,
          reauthNeeded: true,
        }}>
        <SessionSpotlight />
      </AppTestProviders>
    ));

    expect(screen.getByText("Expired")).toBeInTheDocument();
    expect(screen.getByText("alice.test")).toBeInTheDocument();
    expect(screen.getByText("Stored account")).toBeInTheDocument();
  });

  it("shows Reconnecting status when bootstrapping", () => {
    render(() => (
      <AppTestProviders session={{ activeSession: null, activeAccount: null, bootstrapping: true, hasSession: false }}>
        <SessionSpotlight />
      </AppTestProviders>
    ));
    expect(screen.getByText("Reconnecting")).toBeInTheDocument();
  });
});

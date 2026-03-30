import { AppTestProviders } from "$/test/providers";
import { fireEvent, render, screen } from "@solidjs/testing-library";
import { describe, expect, it, vi } from "vitest";
import { AccountSwitcher } from "./AccountSwitcher";

const ACCOUNT = {
  active: false,
  avatar: "https://example.com/avatar.png",
  did: "did:plc:alice",
  handle: "alice.test",
  pdsUrl: "https://pds.example.com",
} as const;

describe("AccountSwitcher", () => {
  it("renders the stored account when no active session exists", () => {
    render(() => (
      <AppTestProviders
        session={{
          accounts: [ACCOUNT],
          activeAccount: null,
          activeSession: null,
          hasSession: false,
          primaryAccount: ACCOUNT,
        }}>
        <AccountSwitcher />
      </AppTestProviders>
    ));

    expect(screen.getByText("alice.test")).toBeInTheDocument();
    expect(screen.getByText("Session expired")).toBeInTheDocument();
  });

  it("closes the menu on outside pointerdown instead of toggling", () => {
    const closeSwitcher = vi.fn();
    const toggleSwitcher = vi.fn();

    render(() => (
      <>
        <AppTestProviders
          session={{
            accounts: [ACCOUNT],
            activeAccount: ACCOUNT,
            activeSession: { did: ACCOUNT.did, handle: ACCOUNT.handle },
          }}
          shell={{ closeSwitcher, showSwitcher: true, toggleSwitcher }}>
          <AccountSwitcher />
        </AppTestProviders>
        <div data-testid="outside">outside</div>
      </>
    ));

    fireEvent.pointerDown(screen.getByTestId("outside"));

    expect(closeSwitcher).toHaveBeenCalledTimes(1);
    expect(toggleSwitcher).not.toHaveBeenCalled();
  });
});

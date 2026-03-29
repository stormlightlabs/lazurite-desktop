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
      <AccountSwitcher
        activeAccount={null}
        activeSession={null}
        accounts={[ACCOUNT]}
        busyDid={null}
        logoutDid={null}
        open={false}
        onClose={vi.fn()}
        onLogout={vi.fn()}
        onSwitch={vi.fn()}
        onToggle={vi.fn()} />
    ));

    expect(screen.getByText("alice.test")).toBeInTheDocument();
    expect(screen.getByText("Session expired")).toBeInTheDocument();
  });

  it("closes the menu on outside pointerdown instead of toggling", () => {
    const onClose = vi.fn();
    const onToggle = vi.fn();

    render(() => (
      <>
        <AccountSwitcher
          activeAccount={ACCOUNT}
          activeSession={{ did: ACCOUNT.did, handle: ACCOUNT.handle }}
          accounts={[ACCOUNT]}
          busyDid={null}
          logoutDid={null}
          open
          onClose={onClose}
          onLogout={vi.fn()}
          onSwitch={vi.fn()}
          onToggle={onToggle} />
        <div data-testid="outside">outside</div>
      </>
    ));

    fireEvent.pointerDown(screen.getByTestId("outside"));

    expect(onClose).toHaveBeenCalledTimes(1);
    expect(onToggle).not.toHaveBeenCalled();
  });
});

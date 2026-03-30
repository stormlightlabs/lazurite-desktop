import { ACCOUNT_SWITCH_EVENT, NOTIFICATIONS_UNREAD_COUNT_EVENT } from "$/lib/constants/events";
import { render, screen, waitFor } from "@solidjs/testing-library";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { AppSessionProvider, useAppSession } from "./app-session";

const getAppBootstrapMock = vi.hoisted(() => vi.fn());
const loginMock = vi.hoisted(() => vi.fn());
const logoutMock = vi.hoisted(() => vi.fn());
const switchAccountMock = vi.hoisted(() => vi.fn());
const getUnreadCountMock = vi.hoisted(() => vi.fn());
const listenMock = vi.hoisted(() => vi.fn());

vi.mock(
  "$/lib/api/app",
  () => ({
    getAppBootstrap: getAppBootstrapMock,
    login: loginMock,
    logout: logoutMock,
    switchAccount: switchAccountMock,
  }),
);
vi.mock("$/lib/api/notifications", () => ({ getUnreadCount: getUnreadCountMock }));
vi.mock("@tauri-apps/api/event", () => ({ listen: listenMock }));

function SessionProbe() {
  const session = useAppSession();

  return (
    <div>
      <p data-testid="active-account">{session.activeAccount?.handle ?? "none"}</p>
      <p data-testid="primary-account">{session.primaryAccount?.handle ?? "none"}</p>
      <p data-testid="active-did">{session.activeDid ?? "none"}</p>
    </div>
  );
}

describe("AppSessionProvider", () => {
  beforeEach(() => {
    getAppBootstrapMock.mockReset();
    loginMock.mockReset();
    logoutMock.mockReset();
    switchAccountMock.mockReset();
    getUnreadCountMock.mockReset();
    listenMock.mockReset();
    getUnreadCountMock.mockResolvedValue(0);
  });

  it("keeps active account, primary account, and viewer identity in sync across bootstrap refreshes", async () => {
    let accountSwitchListener: (() => void) | undefined;

    getAppBootstrapMock.mockResolvedValueOnce({
      activeSession: { did: "did:plc:alice", handle: "alice.test" },
      accountList: [{ active: true, did: "did:plc:alice", handle: "alice.test", pdsUrl: "https://alice.pds" }, {
        active: false,
        did: "did:plc:bob",
        handle: "bob.test",
        pdsUrl: "https://bob.pds",
      }],
    }).mockResolvedValueOnce({
      activeSession: { did: "did:plc:bob", handle: "bob.test" },
      accountList: [{ active: false, did: "did:plc:alice", handle: "alice.test", pdsUrl: "https://alice.pds" }, {
        active: true,
        did: "did:plc:bob",
        handle: "bob.test",
        pdsUrl: "https://bob.pds",
      }],
    });

    listenMock.mockImplementation((event: string, callback: () => void) => {
      if (event === ACCOUNT_SWITCH_EVENT) {
        accountSwitchListener = callback;
      }

      if (event === NOTIFICATIONS_UNREAD_COUNT_EVENT) {
        return Promise.resolve(() => {});
      }

      return Promise.resolve(() => {});
    });

    render(() => (
      <AppSessionProvider>
        <SessionProbe />
      </AppSessionProvider>
    ));

    await waitFor(() => {
      expect(screen.getByTestId("active-account")).toHaveTextContent("alice.test");
      expect(screen.getByTestId("primary-account")).toHaveTextContent("alice.test");
      expect(screen.getByTestId("active-did")).toHaveTextContent("did:plc:alice");
    });

    accountSwitchListener?.();

    await waitFor(() => {
      expect(screen.getByTestId("active-account")).toHaveTextContent("bob.test");
      expect(screen.getByTestId("primary-account")).toHaveTextContent("bob.test");
      expect(screen.getByTestId("active-did")).toHaveTextContent("did:plc:bob");
    });
  });
});

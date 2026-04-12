import { AppTestProviders } from "$/test/providers";
import { render, screen, waitFor } from "@solidjs/testing-library";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { MessagesPanel } from "../MessagesPanel";

const getConvoForMembersMock = vi.hoisted(() => vi.fn());
const getMessagesMock = vi.hoisted(() => vi.fn());
const listConvosMock = vi.hoisted(() => vi.fn());
const sendMessageMock = vi.hoisted(() => vi.fn());
const updateReadMock = vi.hoisted(() => vi.fn());
const moderateContentMock = vi.hoisted(() => vi.fn());

vi.mock(
  "$/lib/api/conversations",
  () => ({
    ConvoController: {
      getConvoForMembers: getConvoForMembersMock,
      getMessages: getMessagesMock,
      listConvos: listConvosMock,
      sendMessage: sendMessageMock,
      updateRead: updateReadMock,
    },
  }),
);
vi.mock("$/lib/api/moderation", () => ({ ModerationController: { moderateContent: moderateContentMock } }));

describe("MessagesPanel", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    listConvosMock.mockResolvedValue({
      convos: [{
        id: "convo-1",
        lastMessage: {
          id: "msg-1",
          rev: "1",
          sender: { did: "did:plc:bob" },
          sentAt: "2026-03-29T12:00:00.000Z",
          text: "Hello there",
        },
        members: [{ did: "did:plc:alice", handle: "alice.test" }, {
          did: "did:plc:bob",
          displayName: "Bob",
          handle: "bob.test",
          labels: [{ src: "did:plc:labeler", val: "sexual" }],
        }],
        muted: false,
        rev: "1",
        unreadCount: 0,
      }],
      cursor: null,
    });
    getMessagesMock.mockResolvedValue({
      cursor: null,
      messages: [{
        id: "msg-1",
        rev: "1",
        sender: { did: "did:plc:bob" },
        sentAt: "2026-03-29T12:00:00.000Z",
        text: "Hello there",
      }],
    });
    getConvoForMembersMock.mockResolvedValue({ convo: null });
    sendMessageMock.mockResolvedValue({
      id: "msg-2",
      rev: "2",
      sender: { did: "did:plc:alice" },
      sentAt: "2026-03-29T12:01:00.000Z",
      text: "Reply",
    });
    updateReadMock.mockResolvedValue(void 0);
    moderateContentMock.mockImplementation(async (_labels, context: string) => {
      if (context === "profileList") {
        return { alert: true, blur: "none", filter: false, inform: false, noOverride: false };
      }

      return { alert: false, blur: "none", filter: false, inform: false, noOverride: false };
    });
  });

  it("renders moderation badges for labeled conversation profiles", async () => {
    render(() => (
      <AppTestProviders
        session={{
          activeDid: "did:plc:alice",
          activeHandle: "alice.test",
          activeSession: { did: "did:plc:alice", handle: "alice.test" },
        }}>
        <MessagesPanel />
      </AppTestProviders>
    ));

    expect(await screen.findAllByText("Bob")).toBeTruthy();
    await waitFor(() => {
      expect(screen.getAllByText("Alert").length).toBeGreaterThan(0);
    });
  });
});

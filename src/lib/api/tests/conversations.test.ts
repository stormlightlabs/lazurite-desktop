import { describe, expect, it } from "vitest";
import {
  parseGetConvoForMembersResponse,
  parseGetMessagesResponse,
  parseListConvosResponse,
  parseSendMessageResponse,
} from "../conversations";

function createMember(overrides: Record<string, unknown> = {}) {
  return { did: "did:plc:bob", displayName: "Bob", handle: "bob.test", ...overrides };
}

function createMessage(overrides: Record<string, unknown> = {}) {
  return {
    $type: "chat.bsky.convo.defs#messageView",
    id: "msg-1",
    rev: "1",
    sender: { did: "did:plc:bob" },
    sentAt: "2026-03-29T12:00:00.000Z",
    text: "hello",
    ...overrides,
  };
}

function createConvo(overrides: Record<string, unknown> = {}) {
  return {
    id: "convo-1",
    lastMessage: createMessage(),
    members: [createMember()],
    muted: false,
    rev: "1",
    status: "active",
    unreadCount: 2,
    ...overrides,
  };
}

describe("conversation payload parsers", () => {
  it("parses the conversation list response", () => {
    const response = parseListConvosResponse({ convos: [createConvo()], cursor: "cursor-1" });

    expect(response.cursor).toBe("cursor-1");
    expect(response.convos).toHaveLength(1);
    expect(response.convos[0]?.members[0]?.handle).toBe("bob.test");
  });

  it("parses a conversation lookup response", () => {
    const response = parseGetConvoForMembersResponse({ convo: createConvo() });

    expect(response.convo.id).toBe("convo-1");
  });

  it("parses mixed message payloads", () => {
    const response = parseGetMessagesResponse({
      cursor: "cursor-2",
      messages: [createMessage(), {
        $type: "chat.bsky.convo.defs#deletedMessageView",
        id: "msg-2",
        rev: "2",
        sender: { did: "did:plc:alice" },
        sentAt: "2026-03-29T12:01:00.000Z",
      }],
    });

    expect(response.cursor).toBe("cursor-2");
    expect(response.messages).toHaveLength(2);
    expect(response.messages[1]?.$type).toBe("chat.bsky.convo.defs#deletedMessageView");
  });

  it("parses a sent message payload", () => {
    const response = parseSendMessageResponse(createMessage({ id: "msg-3" }));

    expect(response.id).toBe("msg-3");
    expect(response.text).toBe("hello");
  });

  it("rejects invalid conversations", () => {
    expect(() => parseListConvosResponse({ convos: [{ nope: true }] })).toThrow(
      "conversations response contains an invalid conversation",
    );
  });

  it("rejects invalid messages", () => {
    expect(() => parseGetMessagesResponse({ messages: [{ nope: true }] })).toThrow(
      "messages response contains an invalid message",
    );
  });
});

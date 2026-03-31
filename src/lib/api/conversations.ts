import type {
  ConvoView,
  DeletedMessageView,
  GetConvoForMembersResponse,
  GetMessagesResponse,
  ListConvosResponse,
  MessageView,
  ProfileViewBasic,
} from "$/lib/types";
import { invoke } from "@tauri-apps/api/core";
import { asArray, asRecord } from "../type-guards";

function optionalNumber(value: unknown) {
  return typeof value === "number" ? value : null;
}

function optionalString(value: unknown) {
  return typeof value === "string" ? value : null;
}

function parseProfileBasic(value: unknown): ProfileViewBasic | null {
  const record = asRecord(value);
  if (!record || typeof record.did !== "string" || typeof record.handle !== "string") {
    return null;
  }

  const viewer = asRecord(record.viewer);

  return {
    avatar: optionalString(record.avatar),
    did: record.did,
    displayName: optionalString(record.displayName),
    handle: record.handle,
    viewer: viewer ? { following: optionalString(viewer.following) } : null,
  };
}

function parseMessageSender(value: unknown) {
  const record = asRecord(value);
  if (!record || typeof record.did !== "string") {
    return null;
  }

  return { did: record.did };
}

function parseDeletedMessageView(value: unknown): DeletedMessageView | null {
  const record = asRecord(value);
  const sender = parseMessageSender(record?.sender);
  if (
    !record || !sender || typeof record.id !== "string" || typeof record.rev !== "string"
    || typeof record.sentAt !== "string"
  ) {
    return null;
  }

  return {
    $type: optionalString(record.$type) as DeletedMessageView["$type"],
    id: record.id,
    rev: record.rev,
    sender,
    sentAt: record.sentAt,
  };
}

function parseMessageView(value: unknown): MessageView | null {
  const record = asRecord(value);
  const sender = parseMessageSender(record?.sender);
  if (
    !record
    || !sender
    || typeof record.id !== "string"
    || typeof record.rev !== "string"
    || typeof record.sentAt !== "string"
    || typeof record.text !== "string"
  ) {
    return null;
  }

  return {
    $type: optionalString(record.$type) as MessageView["$type"],
    id: record.id,
    rev: record.rev,
    sender,
    sentAt: record.sentAt,
    text: record.text,
  };
}

function parseConvoMessage(value: unknown) {
  const record = asRecord(value);
  if (!record) {
    return null;
  }

  if (record.$type === "chat.bsky.convo.defs#deletedMessageView") {
    return parseDeletedMessageView(record);
  }

  return parseMessageView(record);
}

function parseConvoView(value: unknown): ConvoView | null {
  const record = asRecord(value);
  const rawMembers = asArray(record?.members);
  if (
    !record
    || !rawMembers
    || typeof record.id !== "string"
    || typeof record.rev !== "string"
    || typeof record.muted !== "boolean"
  ) {
    return null;
  }

  const members = rawMembers.map((member) => parseProfileBasic(member));
  if (members.some((member) => !member)) {
    return null;
  }

  const lastMessage = record.lastMessage === null || record.lastMessage === undefined
    ? null
    : parseConvoMessage(record.lastMessage);
  if (record.lastMessage !== null && record.lastMessage !== undefined && !lastMessage) {
    return null;
  }

  return {
    id: record.id,
    lastMessage,
    members: members as ProfileViewBasic[],
    muted: record.muted,
    rev: record.rev,
    status: optionalString(record.status),
    unreadCount: optionalNumber(record.unreadCount) ?? 0,
  };
}

export function parseListConvosResponse(value: unknown): ListConvosResponse {
  const record = asRecord(value);
  const rawConvos = asArray(record?.convos);
  if (!record || !rawConvos) {
    throw new Error("conversations response payload is invalid");
  }

  const convos = rawConvos.map((convo) => parseConvoView(convo));
  if (convos.some((convo) => !convo)) {
    throw new Error("conversations response contains an invalid conversation");
  }

  if (record.cursor !== undefined && record.cursor !== null && typeof record.cursor !== "string") {
    throw new Error("conversations response cursor is invalid");
  }

  return { convos: convos as ConvoView[], cursor: optionalString(record.cursor) };
}

export function parseGetConvoForMembersResponse(value: unknown): GetConvoForMembersResponse {
  const record = asRecord(value);
  const convo = parseConvoView(record?.convo);
  if (!record || !convo) {
    throw new Error("conversation payload is invalid");
  }

  return { convo };
}

export function parseGetMessagesResponse(value: unknown): GetMessagesResponse {
  const record = asRecord(value);
  const rawMessages = asArray(record?.messages);
  if (!record || !rawMessages) {
    throw new Error("messages response payload is invalid");
  }

  const messages = rawMessages.map((message) => parseConvoMessage(message));
  if (messages.some((message) => !message)) {
    throw new Error("messages response contains an invalid message");
  }

  if (record.cursor !== undefined && record.cursor !== null && typeof record.cursor !== "string") {
    throw new Error("messages response cursor is invalid");
  }

  return { cursor: optionalString(record.cursor), messages: messages as Array<MessageView | DeletedMessageView> };
}

export function parseSendMessageResponse(value: unknown): MessageView {
  const message = parseMessageView(value);
  if (!message) {
    throw new Error("sent message payload is invalid");
  }

  return message;
}

export async function listConvos(cursor?: string | null, limit?: number): Promise<ListConvosResponse> {
  return invoke("list_convos", { cursor: cursor ?? null, limit: limit ?? null }).then(parseListConvosResponse);
}

export async function getConvoForMembers(members: string[]): Promise<GetConvoForMembersResponse> {
  return invoke("get_convo_for_members", { members }).then(parseGetConvoForMembersResponse);
}

export async function getMessages(
  convoId: string,
  cursor?: string | null,
  limit?: number,
): Promise<GetMessagesResponse> {
  return invoke("get_messages", { convoId, cursor: cursor ?? null, limit: limit ?? null }).then(
    parseGetMessagesResponse,
  );
}

export async function sendMessage(convoId: string, text: string): Promise<MessageView> {
  return invoke("send_message", { convoId, text }).then(parseSendMessageResponse);
}

export async function updateRead(convoId: string, messageId?: string | null): Promise<void> {
  return invoke("update_read", { convoId, messageId: messageId ?? null });
}

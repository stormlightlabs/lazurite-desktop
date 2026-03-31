import { useAppSession } from "$/contexts/app-session";
import { getConvoForMembers, getMessages, listConvos, sendMessage, updateRead } from "$/lib/api/conversations";
import { formatRelativeTime, getDisplayName } from "$/lib/feeds";
import type { ConvoView, DeletedMessageView, MessageView } from "$/lib/types";
import { normalizeError } from "$/lib/utils/text";
import * as logger from "@tauri-apps/plugin-log";
import { createEffect, createMemo, createSignal, For, Show } from "solid-js";
import { AvatarBadge } from "../AvatarBadge";
import { Icon } from "../shared/Icon";

type MessagesPanelProps = { embedded?: boolean; memberDid?: string | null };

type MessagesState = {
  convos: ConvoView[];
  convoCursor: string | null;
  loadingConvos: boolean;
  convoError: string | null;
};

type ConvoContentState = {
  messages: Array<MessageView | DeletedMessageView>;
  messageCursor: string | null;
  loadingMessages: boolean;
  sending: boolean;
  messageError: string | null;
};

function createMessagesState(loadingConvos = true): MessagesState {
  return { convos: [], convoCursor: null, loadingConvos, convoError: null };
}

function createConvoContentState(loadingMessages = false): ConvoContentState {
  return { messages: [], messageCursor: null, loadingMessages, sending: false, messageError: null };
}

function isMessageView(item: MessageView | DeletedMessageView): item is MessageView {
  return "text" in item;
}

function getConvoOtherMember(convo: ConvoView, selfDid: string | null) {
  return convo.members.find((member) => member.did !== selfDid) ?? convo.members[0];
}

function getConvoDisplayName(convo: ConvoView, selfDid: string | null): string {
  const other = getConvoOtherMember(convo, selfDid);
  return other ? getDisplayName(other) : "Unknown account";
}

function getLastMessageText(convo: ConvoView): string {
  const message = convo.lastMessage;
  if (!message) {
    return "No messages yet";
  }

  return isMessageView(message) ? message.text : "Message deleted";
}

function getLastMessageTime(convo: ConvoView): string {
  const message = convo.lastMessage;
  return message ? formatRelativeTime(message.sentAt) : "";
}

function mergeConvos(current: ConvoView[], incoming: ConvoView[]) {
  const byId = new Map(current.map((convo) => [convo.id, convo]));
  for (const convo of incoming) {
    byId.set(convo.id, convo);
  }

  return [...byId.values()];
}

function upsertConvo(current: ConvoView[], convo: ConvoView) {
  return [convo, ...current.filter((item) => item.id !== convo.id)];
}

function updateConvo(current: ConvoView[], convoId: string, updater: (convo: ConvoView) => ConvoView) {
  return current.map((convo) => convo.id === convoId ? updater(convo) : convo);
}

function UnreadCount(props: { count: number }) {
  return (
    <Show when={props.count > 0}>
      <span class="inline-flex h-5 min-w-5 shrink-0 items-center justify-center rounded-full bg-primary px-1 text-xs font-semibold text-on-primary-fixed">
        {props.count}
      </span>
    </Show>
  );
}

function Retry(props: { error: string; onRetry: () => void }) {
  return (
    <div class="flex flex-1 flex-col items-center justify-center gap-3 px-6 py-12 text-center">
      <Icon kind="danger" />
      <p class="m-0 text-sm text-on-surface-variant">{props.error}</p>
      <button
        type="button"
        class="rounded-full border-0 bg-primary/15 px-4 py-2 text-xs font-medium text-primary transition hover:bg-primary/25"
        onClick={() => props.onRetry()}>
        Retry
      </button>
    </div>
  );
}

function MessageMeta(props: { name: string; time: string; unread: number; text: string }) {
  return (
    <div class="min-w-0 flex-1">
      <div class="mb-0.5 flex items-center justify-between gap-2">
        <span class="truncate text-sm font-medium text-on-surface">{props.name}</span>
        <Show when={props.time}>
          <span
            class="shrink-0 text-xs"
            classList={{ "text-primary": props.unread > 0, "text-on-surface-variant": props.unread === 0 }}>
            {props.time}
          </span>
        </Show>
      </div>
      <div class="flex items-center justify-between gap-2">
        <p
          class="truncate text-xs"
          classList={{ "text-on-surface": props.unread > 0, "text-on-surface-variant": props.unread === 0 }}>
          {props.text}
        </p>
        <UnreadCount count={props.unread} />
      </div>
    </div>
  );
}

function ConvoItem(props: { active: boolean; convo: ConvoView; onClick: () => void; selfDid: string | null }) {
  const other = createMemo(() => getConvoOtherMember(props.convo, props.selfDid));
  const displayName = createMemo(() => getConvoDisplayName(props.convo, props.selfDid));
  const lastText = createMemo(() => getLastMessageText(props.convo));
  const lastTime = createMemo(() => getLastMessageTime(props.convo));

  return (
    <button
      type="button"
      class="w-full cursor-pointer border-0 border-b border-white/5 bg-transparent px-4 py-3.5 text-left transition duration-150 ease-out hover:bg-white/3"
      classList={{ "bg-primary/10 hover:bg-primary/12": props.active }}
      onClick={() => props.onClick()}>
      <div class="flex items-start gap-3">
        <AvatarBadge label={other()?.handle ?? "?"} src={other()?.avatar} tone="primary" />
        <MessageMeta name={displayName()} text={lastText()} time={lastTime()} unread={props.convo.unreadCount ?? 0} />
      </div>
    </button>
  );
}

function MessageBubble(props: { isSelf: boolean; message: MessageView; senderAvatar?: string | null }) {
  const timeLabel = createMemo(() => {
    const parsed = new Date(props.message.sentAt);
    return parsed.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  });

  return (
    <Show
      when={props.isSelf}
      fallback={
        <div class="flex items-end gap-2">
          <AvatarBadge label={props.message.sender.did} src={props.senderAvatar} />
          <div class="max-w-[70%] rounded-2xl rounded-bl-md bg-surface-container-high px-4 py-2.5 text-sm text-on-surface">
            <p class="m-0">{props.message.text}</p>
          </div>
          <span class="shrink-0 text-xs text-on-surface-variant">{timeLabel()}</span>
        </div>
      }>
      <div class="flex items-end justify-end gap-2">
        <span class="shrink-0 text-xs text-on-surface-variant">{timeLabel()}</span>
        <div class="max-w-[70%] rounded-2xl rounded-br-md bg-primary px-4 py-2.5 text-sm font-medium text-on-primary-fixed">
          <p class="m-0">{props.message.text}</p>
        </div>
      </div>
    </Show>
  );
}

function DeletedBubble(props: { isSelf: boolean }) {
  return (
    <div class="flex" classList={{ "justify-end": props.isSelf }}>
      <p class="rounded-xl border border-white/10 px-3 py-2 text-xs italic text-on-surface-variant">Message deleted</p>
    </div>
  );
}

function ComposeBar(props: { disabled: boolean; onSend: (text: string) => Promise<boolean> }) {
  const [text, setText] = createSignal("");

  async function submit() {
    const trimmed = text().trim();
    if (!trimmed || props.disabled) {
      return;
    }

    const sent = await props.onSend(trimmed);
    if (sent) {
      setText("");
    }
  }

  function handleKeyDown(event: KeyboardEvent) {
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      void submit();
    }
  }

  return (
    <div class="flex items-end gap-2 border-t border-white/5 p-4 bg-surface-container/80">
      <div class="relative flex-1">
        <textarea
          value={text()}
          onInput={(event) => {
            const element = event.currentTarget;
            element.style.height = "";
            element.style.height = `${Math.min(element.scrollHeight, 120)}px`;
            setText(element.value);
          }}
          onKeyDown={handleKeyDown}
          placeholder="Type a message…"
          rows={1}
          class="w-full resize-none rounded-2xl border border-white/8 bg-black/40 px-4 py-3 text-sm text-on-surface outline-none transition focus:border-primary/50 focus:ring-1 focus:ring-primary/30"
          style={{ "min-height": "48px", "max-height": "120px" }}
          disabled={props.disabled} />
      </div>

      <button
        type="button"
        class="flex h-12 w-12 shrink-0 items-center justify-center rounded-full border-0 bg-primary text-on-primary-fixed transition duration-150 ease-out hover:-translate-y-px hover:bg-primary/90 disabled:translate-y-0 disabled:opacity-40"
        disabled={props.disabled || !text().trim()}
        aria-label="Send message"
        onClick={() => void submit()}>
        <Icon iconClass="i-ri-send-plane-fill" />
      </button>
    </div>
  );
}

function EmptyChatPane() {
  return (
    <div class="flex flex-1 flex-col items-center justify-center gap-4 text-center">
      <Icon kind="messages" class="text-5xl text-on-surface-variant opacity-20" />
      <div>
        <p class="m-0 text-sm font-medium text-on-surface">No conversation selected</p>
        <p class="m-0 mt-1 text-xs text-on-surface-variant">Choose a conversation from the list to start messaging.</p>
      </div>
    </div>
  );
}

function EmptyConvoList() {
  return (
    <div class="flex flex-1 flex-col items-center justify-center gap-3 px-6 text-center">
      <Icon iconClass="i-ri-chat-smile-3-line" class="text-4xl text-on-surface-variant opacity-20" />
      <div>
        <p class="m-0 text-sm font-medium text-on-surface">No conversations yet</p>
        <p class="m-0 mt-1 text-xs text-on-surface-variant">Open a profile and start a chat to see it here.</p>
      </div>
    </div>
  );
}

function ReloadMessagesButton(props: { isLoading: boolean; onLoadMore: () => void }) {
  return (
    <div class="flex justify-center">
      <button
        type="button"
        class="rounded-full border-0 bg-white/5 px-4 py-1.5 text-xs text-on-surface-variant transition hover:bg-white/8 disabled:opacity-40"
        disabled={props.isLoading}
        onClick={() => props.onLoadMore()}>
        <Show when={props.isLoading} fallback="Load earlier messages">
          <Icon kind="loader" class="animate-spin text-xs" name="Loading" />
        </Show>
      </button>
    </div>
  );
}

function MessageError(props: { error: string | null }) {
  return (
    <Show when={props.error}>
      {(error) => (
        <div class="flex justify-center">
          <p class="m-0 text-sm text-on-surface-variant">{error()}</p>
        </div>
      )}
    </Show>
  );
}

function ChatPane(
  props: {
    chatState: ConvoContentState;
    convo: ConvoView;
    onLoadMore: () => void;
    onSend: (text: string) => Promise<boolean>;
    selfDid: string | null;
  },
) {
  const otherMember = createMemo(() => getConvoOtherMember(props.convo, props.selfDid));
  const displayName = createMemo(() => getConvoDisplayName(props.convo, props.selfDid));

  function getMemberAvatar(did: string) {
    return props.convo.members.find((member) => member.did === did)?.avatar;
  }

  return (
    <>
      <header class="flex shrink-0 items-center gap-3 border-b border-white/5 bg-surface-container/80 px-5 py-3.5 backdrop-blur-[12px]">
        <AvatarBadge label={otherMember()?.handle ?? "?"} src={otherMember()?.avatar} tone="primary" />
        <div class="min-w-0 flex-1">
          <p class="m-0 truncate text-sm font-semibold text-on-surface">{displayName()}</p>
          <p class="m-0 truncate text-xs text-on-surface-variant">@{otherMember()?.handle ?? ""}</p>
        </div>
      </header>

      <div class="flex flex-1 flex-col gap-3 overflow-y-auto px-5 py-4 [scrollbar-width:thin]">
        <Show when={props.chatState.messageCursor}>
          <ReloadMessagesButton isLoading={props.chatState.loadingMessages} onLoadMore={props.onLoadMore} />
        </Show>

        <Show
          when={!props.chatState.loadingMessages || props.chatState.messages.length > 0}
          fallback={
            <div class="flex flex-1 items-center justify-center">
              <Icon kind="loader" class="animate-spin text-xl text-on-surface-variant" name="Loading" />
            </div>
          }>
          <MessageError error={props.chatState.messageError} />
          <For each={props.chatState.messages}>
            {(message) => (
              <Show
                when={isMessageView(message) ? message : null}
                keyed
                fallback={<DeletedBubble isSelf={message.sender.did === props.selfDid} />}>
                {(item) => (
                  <MessageBubble
                    isSelf={item.sender.did === props.selfDid}
                    message={item}
                    senderAvatar={getMemberAvatar(item.sender.did)} />
                )}
              </Show>
            )}
          </For>
        </Show>
      </div>

      <ComposeBar disabled={props.chatState.sending} onSend={props.onSend} />
    </>
  );
}

export function MessagesPanel(props: MessagesPanelProps) {
  const session = useAppSession();

  const [listState, setListState] = createSignal<MessagesState>(createMessagesState(false));
  const [activeConvoId, setActiveConvoId] = createSignal<string | null>(null);
  const [chatState, setChatState] = createSignal<ConvoContentState>(createConvoContentState());

  const requestedMemberDid = createMemo(() => {
    const trimmed = props.memberDid?.trim();
    return trimmed && trimmed !== session.activeDid ? trimmed : null;
  });
  const activeConvo = createMemo(() => listState().convos.find((convo) => convo.id === activeConvoId()) ?? null);

  let convoListRequest = 0;
  let openMemberRequest = 0;
  let messageRequest = 0;

  createEffect(() => {
    const activeDid = session.activeDid;
    const memberDid = requestedMemberDid();

    convoListRequest += 1;
    openMemberRequest += 1;
    messageRequest += 1;

    setListState(createMessagesState(!!activeDid));
    setActiveConvoId(null);
    setChatState(createConvoContentState());

    if (!activeDid) {
      setListState(createMessagesState(false));
      return;
    }

    void loadConvos({ preserveActive: false, targetMemberDid: memberDid });
  });

  async function loadConvos(options: { preserveActive: boolean; targetMemberDid: string | null }) {
    const currentRequest = ++convoListRequest;

    setListState((prev) => ({ ...prev, loadingConvos: true, convoError: null }));

    try {
      const response = await listConvos();
      if (currentRequest !== convoListRequest) {
        return;
      }

      setListState({
        convos: response.convos,
        convoCursor: response.cursor ?? null,
        convoError: null,
        loadingConvos: false,
      });

      const preservedConvo = options.preserveActive
        ? response.convos.find((convo) => convo.id === activeConvoId()) ?? null
        : null;
      const targetedConvo = options.targetMemberDid
        ? response.convos.find((convo) => convo.members.some((member) => member.did === options.targetMemberDid))
          ?? null
        : null;
      const nextConvo = preservedConvo ?? targetedConvo
        ?? (!options.preserveActive ? response.convos[0] ?? null : null);

      if (nextConvo && nextConvo.id !== activeConvoId()) {
        void openConvo(nextConvo);
        return;
      }

      if (!nextConvo && options.targetMemberDid) {
        await ensureConvoForMember(options.targetMemberDid);
      }
    } catch (error) {
      const message = normalizeError(error);
      logger.warn("failed to list conversations", { keyValues: { error: message } });
      if (currentRequest !== convoListRequest) {
        return;
      }

      setListState((prev) => ({
        ...prev,
        convoError: "Could not load conversations. Please try again.",
        loadingConvos: false,
      }));
    }
  }

  async function loadMoreConvos() {
    const cursor = listState().convoCursor;
    if (!cursor) {
      return;
    }

    const currentRequest = ++convoListRequest;
    setListState((prev) => ({ ...prev, loadingConvos: true }));

    try {
      const response = await listConvos(cursor);
      if (currentRequest !== convoListRequest) {
        return;
      }

      setListState((prev) => ({
        convos: mergeConvos(prev.convos, response.convos),
        convoCursor: response.cursor ?? null,
        convoError: prev.convoError,
        loadingConvos: false,
      }));
    } catch (error) {
      logger.error("listConvos (load more) failed", { keyValues: { error: normalizeError(error) } });
      if (currentRequest !== convoListRequest) {
        return;
      }

      setListState((prev) => ({ ...prev, loadingConvos: false }));
    }
  }

  async function ensureConvoForMember(memberDid: string) {
    const currentRequest = ++openMemberRequest;

    try {
      const response = await getConvoForMembers([memberDid]);
      if (currentRequest !== openMemberRequest) {
        return;
      }

      setListState((prev) => ({ ...prev, convos: upsertConvo(prev.convos, response.convo) }));

      if (response.convo.id !== activeConvoId()) {
        await openConvo(response.convo);
      }
    } catch (error) {
      logger.error("getConvoForMembers failed", { keyValues: { error: normalizeError(error), memberDid } });
      session.reportError("Could not open a conversation with this account.");
    }
  }

  async function openConvo(convo: ConvoView) {
    const currentRequest = ++messageRequest;

    setActiveConvoId(convo.id);
    setChatState(createConvoContentState(true));

    try {
      const response = await getMessages(convo.id);
      if (currentRequest !== messageRequest || activeConvoId() !== convo.id) {
        return;
      }

      const ordered = [...response.messages].toReversed();
      setChatState({
        loadingMessages: false,
        messageCursor: response.cursor ?? null,
        messageError: null,
        messages: ordered,
        sending: false,
      });

      if ((convo.unreadCount ?? 0) > 0) {
        const newestMessage = ordered.at(-1);
        void updateRead(convo.id, newestMessage?.id ?? null).catch(() => {
          logger.error("updateRead failed", { keyValues: { convoId: convo.id } });
        });

        setListState((prev) => ({
          ...prev,
          convos: updateConvo(prev.convos, convo.id, (item) => ({ ...item, unreadCount: 0 })),
        }));
      }
    } catch (error) {
      logger.error("getMessages failed", { keyValues: { error: normalizeError(error), convoId: convo.id } });
      if (currentRequest !== messageRequest || activeConvoId() !== convo.id) {
        return;
      }

      setChatState((prev) => ({
        ...prev,
        loadingMessages: false,
        messageError: "Could not load messages. Please try again.",
      }));
    }
  }

  async function loadMoreMessages() {
    const convoId = activeConvoId();
    const cursor = chatState().messageCursor;
    if (!convoId || !cursor || chatState().loadingMessages) {
      return;
    }

    setChatState((prev) => ({ ...prev, loadingMessages: true }));

    try {
      const response = await getMessages(convoId, cursor);
      if (activeConvoId() !== convoId) {
        return;
      }

      setChatState((prev) => ({
        ...prev,
        loadingMessages: false,
        messageCursor: response.cursor ?? null,
        messages: [...response.messages.toReversed(), ...prev.messages],
      }));
    } catch (error) {
      logger.error("getMessages (load more) failed", { keyValues: { error: normalizeError(error), convoId } });
      if (activeConvoId() !== convoId) {
        return;
      }

      setChatState((prev) => ({
        ...prev,
        loadingMessages: false,
        messageError: "Could not load more messages. Please try again.",
      }));
    }
  }

  async function handleSend(text: string) {
    const convoId = activeConvoId();
    const convo = activeConvo();
    if (!convoId || !convo) {
      return false;
    }

    setChatState((prev) => ({ ...prev, messageError: null, sending: true }));

    try {
      const message = await sendMessage(convoId, text);
      if (activeConvoId() !== convoId) {
        return false;
      }

      setChatState((prev) => ({ ...prev, messages: [...prev.messages, message], sending: false }));

      setListState((prev) => ({
        ...prev,
        convos: upsertConvo(prev.convos, { ...convo, lastMessage: message, unreadCount: 0 }),
      }));

      return true;
    } catch (error) {
      logger.error("sendMessage failed", { keyValues: { error: normalizeError(error), convoId } });
      if (activeConvoId() !== convoId) {
        return false;
      }

      setChatState((prev) => ({ ...prev, messageError: "Failed to send message. Please try again.", sending: false }));

      return false;
    }
  }

  function handleRefresh() {
    void loadConvos({ preserveActive: true, targetMemberDid: requestedMemberDid() });
  }

  return (
    <div class="flex h-full min-h-0 gap-0">
      <aside
        class="flex shrink-0 flex-col overflow-hidden border-r border-white/5 bg-surface-container/40"
        classList={{
          "rounded-2xl": !props.embedded,
          "max-w-64 min-w-40 w-[44%]": props.embedded,
          "w-80": !props.embedded,
        }}>
        <header class="flex shrink-0 items-center justify-between border-b border-white/5 bg-surface-container/80 px-5 py-4 backdrop-blur-[12px]">
          <div>
            <h1 class="m-0 text-lg font-semibold tracking-tight text-on-surface">Messages</h1>
          </div>
          <button
            type="button"
            class="inline-flex h-9 w-9 items-center justify-center rounded-full border-0 bg-white/5 text-on-surface-variant transition duration-150 ease-out hover:-translate-y-px hover:bg-white/8 hover:text-on-surface"
            aria-label="Refresh conversations"
            title="Refresh conversations"
            onClick={handleRefresh}>
            <Icon kind="refresh" />
          </button>
        </header>

        <div class="flex flex-1 flex-col overflow-y-auto">
          <Show
            when={!listState().loadingConvos || listState().convos.length > 0}
            fallback={
              <div class="flex flex-1 items-center justify-center py-12">
                <Icon kind="loader" class="animate-spin text-xl text-on-surface-variant" name="Loading" />
              </div>
            }>
            <Show
              when={listState().convoError}
              fallback={
                <Show when={listState().convos.length > 0} fallback={<EmptyConvoList />}>
                  <div class="flex flex-1 flex-col">
                    <For each={listState().convos}>
                      {(convo) => (
                        <ConvoItem
                          active={activeConvoId() === convo.id}
                          convo={convo}
                          selfDid={session.activeDid}
                          onClick={() => void openConvo(convo)} />
                      )}
                    </For>

                    <Show when={listState().convoCursor}>
                      <button
                        type="button"
                        class="my-3 self-center rounded-full border-0 bg-white/5 px-4 py-2 text-xs text-on-surface-variant transition hover:bg-white/8 disabled:opacity-40"
                        disabled={listState().loadingConvos}
                        onClick={() => void loadMoreConvos()}>
                        Load more
                      </button>
                    </Show>
                  </div>
                </Show>
              }>
              {(error) => <Retry error={error()} onRetry={handleRefresh} />}
            </Show>
          </Show>
        </div>
      </aside>

      <div class="flex min-w-0 flex-1 flex-col overflow-hidden bg-surface/10">
        <Show when={activeConvo()} keyed fallback={<EmptyChatPane />}>
          {(convo) => (
            <ChatPane
              chatState={chatState()}
              convo={convo}
              selfDid={session.activeDid}
              onLoadMore={() => void loadMoreMessages()}
              onSend={handleSend} />
          )}
        </Show>
      </div>
    </div>
  );
}

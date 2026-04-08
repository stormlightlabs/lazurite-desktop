import { fireEvent, render, screen, waitFor } from "@solidjs/testing-library";
import { describe, expect, it, vi } from "vitest";
import { useFeedWorkspaceController } from "../useFeedWorkspaceController";

const invokeMock = vi.hoisted(() => vi.fn());
const listenMock = vi.hoisted(() => vi.fn());
const onErrorMock = vi.hoisted(() => vi.fn());

vi.mock("@tauri-apps/api/core", () => ({ invoke: invokeMock }));
vi.mock("@tauri-apps/api/event", () => ({ listen: listenMock }));
vi.mock("@tauri-apps/plugin-log", () => ({ error: vi.fn(), info: vi.fn(), warn: vi.fn(), debug: vi.fn() }));

const ACTIVE_SESSION = { did: "did:plc:alice", handle: "alice.test" } as const;
const SAMPLE_POST = {
  author: { did: "did:plc:bob", handle: "bob.test", displayName: "Bob" },
  cid: "cid-bob",
  indexedAt: "2026-03-28T12:00:00.000Z",
  likeCount: 0,
  record: { createdAt: "2026-03-28T12:00:00.000Z", text: "Sample" },
  replyCount: 0,
  repostCount: 0,
  uri: "at://did:plc:bob/app.bsky.feed.post/post-1",
  viewer: {},
} as const;

const QUOTE_POST = { ...SAMPLE_POST, cid: "bafy-quote-cid", uri: "at://did:plc:quote/app.bsky.feed.post/123" } as const;

const REPLY_PARENT_POST = {
  ...SAMPLE_POST,
  cid: "bafy-parent-cid",
  uri: "at://did:plc:reply-parent/app.bsky.feed.post/456",
} as const;

const REPLY_ROOT_POST = {
  ...SAMPLE_POST,
  cid: "bafy-root-cid",
  uri: "at://did:plc:reply-root/app.bsky.feed.post/789",
} as const;

const SAMPLE_DRAFT = {
  id: "draft-abc-123",
  accountDid: ACTIVE_SESSION.did,
  text: "Draft text",
  replyParentUri: null,
  replyParentCid: null,
  replyRootUri: null,
  replyRootCid: null,
  quoteUri: null,
  quoteCid: null,
  title: null,
  createdAt: "2026-03-28T10:00:00.000Z",
  updatedAt: "2026-03-28T10:00:00.000Z",
} as const;

const SAMPLE_REFERENCED_DRAFT = {
  ...SAMPLE_DRAFT,
  id: "draft-with-refs",
  quoteCid: "bafy-quote-cid",
  quoteUri: "at://did:plc:quote/app.bsky.feed.post/123",
  replyParentCid: "bafy-parent-cid",
  replyParentUri: "at://did:plc:reply-parent/app.bsky.feed.post/456",
  replyRootCid: "bafy-root-cid",
  replyRootUri: "at://did:plc:reply-root/app.bsky.feed.post/789",
} as const;

function defaultInvokeImplementation(command: string) {
  if (command === "get_preferences") {
    return Promise.resolve({
      savedFeeds: [{ id: "following", pinned: true, type: "timeline", value: "following" }],
      feedViewPrefs: [],
    });
  }

  if (command === "get_timeline") {
    return Promise.resolve({ cursor: null, feed: [] });
  }

  if (command === "create_post") {
    return Promise.resolve({ cid: "cid-created", uri: "at://did:plc:alice/app.bsky.feed.post/new-post" });
  }

  if (command === "list_drafts") {
    return Promise.resolve([]);
  }

  if (command === "save_draft") {
    return Promise.resolve(SAMPLE_DRAFT);
  }

  if (command === "delete_draft") {
    return Promise.resolve();
  }

  if (command === "get_post_thread") {
    return Promise.resolve({ thread: { $type: "app.bsky.feed.defs#threadViewPost", post: SAMPLE_POST } });
  }

  throw new Error(`unexpected invoke: ${command}`);
}

function ControllerHarness() {
  const controller = useFeedWorkspaceController({
    activeSession: ACTIVE_SESSION,
    onError: onErrorMock,
    onOpenThread: () => {},
  });

  return (
    <div>
      <button type="button" onClick={() => controller.openReplyComposer(SAMPLE_POST, SAMPLE_POST)}>Reply</button>
      <button type="button" onClick={() => controller.openQuoteComposer(SAMPLE_POST)}>Quote</button>
      <button type="button" onClick={controller.clearReplyComposer}>Clear reply</button>
      <button type="button" onClick={controller.clearQuoteComposer}>Clear quote</button>
      <button type="button" onClick={() => void controller.submitPost()}>Submit</button>
      <button type="button" onClick={() => void controller.resetComposer()}>Discard</button>
      <button type="button" onClick={() => void controller.saveAndCloseComposer()}>Save draft</button>
      <button type="button" onClick={() => controller.loadDraft(SAMPLE_DRAFT)}>Load draft</button>
      <button type="button" onClick={() => controller.loadDraft(SAMPLE_REFERENCED_DRAFT)}>Load referenced draft</button>
      <button type="button" onClick={() => controller.setComposerText("hello world")}>Set text</button>
      <p data-testid="active-feed">{controller.workspace.activeFeedId ?? "none"}</p>
      <p data-testid="reply-state">{controller.workspace.composer.replyTarget ? "on" : "off"}</p>
      <p data-testid="quote-state">{controller.workspace.composer.quoteTarget ? "on" : "off"}</p>
      <p data-testid="draft-id">{controller.workspace.composer.draftId ?? "none"}</p>
      <p data-testid="composer-open">{controller.workspace.composer.open ? "open" : "closed"}</p>
      <p data-testid="autosave-status">{controller.workspace.composer.autosaveStatus}</p>
      <p data-testid="drafts-open">{controller.workspace.showDraftsList ? "open" : "closed"}</p>
    </div>
  );
}

function setupTest() {
  invokeMock.mockReset();
  listenMock.mockReset();
  onErrorMock.mockReset();
  globalThis.localStorage?.removeItem?.(`lazurite:autosave:${ACTIVE_SESSION.did}`);
  listenMock.mockResolvedValue(() => {});
  invokeMock.mockImplementation(defaultInvokeImplementation);
}

describe("useFeedWorkspaceController", () => {
  it("keeps reply and quote state together and submits both", async () => {
    setupTest();

    render(() => <ControllerHarness />);

    await screen.findByText("following");

    fireEvent.click(screen.getByRole("button", { name: "Reply" }));
    fireEvent.click(screen.getByRole("button", { name: "Quote" }));

    expect(screen.getByTestId("reply-state")).toHaveTextContent("on");
    expect(screen.getByTestId("quote-state")).toHaveTextContent("on");

    fireEvent.click(screen.getByRole("button", { name: "Clear quote" }));
    expect(screen.getByTestId("reply-state")).toHaveTextContent("on");
    expect(screen.getByTestId("quote-state")).toHaveTextContent("off");

    fireEvent.click(screen.getByRole("button", { name: "Quote" }));
    fireEvent.click(screen.getByRole("button", { name: "Clear reply" }));
    expect(screen.getByTestId("reply-state")).toHaveTextContent("off");
    expect(screen.getByTestId("quote-state")).toHaveTextContent("on");

    fireEvent.click(screen.getByRole("button", { name: "Reply" }));
    fireEvent.click(screen.getByRole("button", { name: "Submit" }));

    await waitFor(() => {
      expect(invokeMock).toHaveBeenCalledWith("create_post", {
        embed: { record: { cid: SAMPLE_POST.cid, uri: SAMPLE_POST.uri }, type: "record" },
        replyTo: {
          parent: { cid: SAMPLE_POST.cid, uri: SAMPLE_POST.uri },
          root: { cid: SAMPLE_POST.cid, uri: SAMPLE_POST.uri },
        },
        text: "",
      });
    });
  });

  it("loadDraft sets draftId and text in composer state", async () => {
    setupTest();

    render(() => <ControllerHarness />);
    await screen.findByText("following");

    fireEvent.click(screen.getByRole("button", { name: "Load draft" }));

    expect(screen.getByTestId("draft-id")).toHaveTextContent(SAMPLE_DRAFT.id);
    expect(screen.getByTestId("composer-open")).toHaveTextContent("open");
  });

  it("resetComposer deletes the autosave draft when draftId is set", async () => {
    setupTest();

    render(() => <ControllerHarness />);
    await screen.findByText("following");

    fireEvent.click(screen.getByRole("button", { name: "Load draft" }));
    expect(screen.getByTestId("draft-id")).toHaveTextContent(SAMPLE_DRAFT.id);

    fireEvent.click(screen.getByRole("button", { name: "Discard" }));

    await waitFor(() => {
      expect(invokeMock).toHaveBeenCalledWith("delete_draft", { id: SAMPLE_DRAFT.id });
    });

    await waitFor(() => {
      expect(screen.getByTestId("draft-id")).toHaveTextContent("none");
      expect(screen.getByTestId("composer-open")).toHaveTextContent("closed");
    }, { timeout: 3000 });
  });

  it("saveAndCloseComposer saves draft then closes composer", async () => {
    setupTest();

    render(() => <ControllerHarness />);
    await screen.findByText("following");

    fireEvent.click(screen.getByRole("button", { name: "Reply" }));
    fireEvent.click(screen.getByRole("button", { name: "Set text" }));
    expect(screen.getByTestId("composer-open")).toHaveTextContent("open");

    fireEvent.click(screen.getByRole("button", { name: "Save draft" }));

    await waitFor(() => {
      expect(invokeMock).toHaveBeenCalledWith("save_draft", expect.objectContaining({ input: expect.any(Object) }));
    }, { timeout: 3000 });

    await waitFor(() => {
      expect(screen.getByTestId("composer-open")).toHaveTextContent("closed");
    }, { timeout: 3000 });
  });

  it("submitPost deletes the draft after success when draftId is set", async () => {
    setupTest();

    render(() => <ControllerHarness />);
    await screen.findByText("following");

    fireEvent.click(screen.getByRole("button", { name: "Load draft" }));
    expect(screen.getByTestId("draft-id")).toHaveTextContent(SAMPLE_DRAFT.id);

    fireEvent.click(screen.getByRole("button", { name: "Submit" }));

    await waitFor(() => {
      expect(invokeMock).toHaveBeenCalledWith("create_post", expect.any(Object));
    });

    await waitFor(() => {
      expect(invokeMock).toHaveBeenCalledWith("delete_draft", { id: SAMPLE_DRAFT.id });
    }, { timeout: 3000 });

    await waitFor(() => {
      expect(screen.getByTestId("draft-id")).toHaveTextContent("none");
      expect(screen.getByTestId("composer-open")).toHaveTextContent("closed");
    }, { timeout: 3000 });
  });

  it("submitPost keeps reply and quote references from a loaded draft", async () => {
    setupTest();
    invokeMock.mockImplementation((command: string, args?: { uri?: string }) => {
      if (command === "get_post_thread" && args?.uri === SAMPLE_REFERENCED_DRAFT.quoteUri) {
        return Promise.resolve({ thread: { $type: "app.bsky.feed.defs#threadViewPost", post: QUOTE_POST } });
      }

      if (command === "get_post_thread" && args?.uri === SAMPLE_REFERENCED_DRAFT.replyParentUri) {
        return Promise.resolve({ thread: { $type: "app.bsky.feed.defs#threadViewPost", post: REPLY_PARENT_POST } });
      }

      if (command === "get_post_thread" && args?.uri === SAMPLE_REFERENCED_DRAFT.replyRootUri) {
        return Promise.resolve({ thread: { $type: "app.bsky.feed.defs#threadViewPost", post: REPLY_ROOT_POST } });
      }

      return defaultInvokeImplementation(command);
    });

    render(() => <ControllerHarness />);
    await screen.findByText("following");

    fireEvent.click(screen.getByRole("button", { name: "Load referenced draft" }));

    await waitFor(() => {
      expect(screen.getByTestId("reply-state")).toHaveTextContent("on");
      expect(screen.getByTestId("quote-state")).toHaveTextContent("on");
    });

    fireEvent.click(screen.getByRole("button", { name: "Submit" }));

    await waitFor(() => {
      expect(invokeMock).toHaveBeenCalledWith("create_post", {
        embed: {
          record: { cid: SAMPLE_REFERENCED_DRAFT.quoteCid, uri: SAMPLE_REFERENCED_DRAFT.quoteUri },
          type: "record",
        },
        replyTo: {
          parent: { cid: SAMPLE_REFERENCED_DRAFT.replyParentCid, uri: SAMPLE_REFERENCED_DRAFT.replyParentUri },
          root: { cid: SAMPLE_REFERENCED_DRAFT.replyRootCid, uri: SAMPLE_REFERENCED_DRAFT.replyRootUri },
        },
        text: SAMPLE_REFERENCED_DRAFT.text,
      });
    });
  });

  it("caches per-URI draft hydration across repeated loads", async () => {
    setupTest();
    invokeMock.mockImplementation((command: string, args?: { uri?: string }) => {
      if (command === "get_post_thread" && args?.uri === SAMPLE_REFERENCED_DRAFT.quoteUri) {
        return Promise.resolve({ thread: { $type: "app.bsky.feed.defs#threadViewPost", post: QUOTE_POST } });
      }

      if (command === "get_post_thread" && args?.uri === SAMPLE_REFERENCED_DRAFT.replyParentUri) {
        return Promise.resolve({ thread: { $type: "app.bsky.feed.defs#threadViewPost", post: REPLY_PARENT_POST } });
      }

      if (command === "get_post_thread" && args?.uri === SAMPLE_REFERENCED_DRAFT.replyRootUri) {
        return Promise.resolve({ thread: { $type: "app.bsky.feed.defs#threadViewPost", post: REPLY_ROOT_POST } });
      }

      return defaultInvokeImplementation(command);
    });

    render(() => <ControllerHarness />);
    await screen.findByText("following");

    fireEvent.click(screen.getByRole("button", { name: "Load referenced draft" }));
    await waitFor(() => {
      expect(screen.getByTestId("reply-state")).toHaveTextContent("on");
      expect(screen.getByTestId("quote-state")).toHaveTextContent("on");
    });

    const firstHydrationCalls = invokeMock.mock.calls.filter((call) => call[0] === "get_post_thread").length;
    expect(firstHydrationCalls).toBe(3);

    fireEvent.click(screen.getByRole("button", { name: "Clear reply" }));
    fireEvent.click(screen.getByRole("button", { name: "Clear quote" }));
    expect(screen.getByTestId("reply-state")).toHaveTextContent("off");
    expect(screen.getByTestId("quote-state")).toHaveTextContent("off");

    fireEvent.click(screen.getByRole("button", { name: "Load referenced draft" }));
    await waitFor(() => {
      expect(screen.getByTestId("reply-state")).toHaveTextContent("on");
      expect(screen.getByTestId("quote-state")).toHaveTextContent("on");
    });

    const secondHydrationCalls = invokeMock.mock.calls.filter((call) => call[0] === "get_post_thread").length;
    expect(secondHydrationCalls).toBe(firstHydrationCalls);
  });

  it("autosave schedules a save after text changes with composer open", async () => {
    vi.useFakeTimers();
    setupTest();

    render(() => <ControllerHarness />);
    await screen.findByText("following");

    fireEvent.click(screen.getByRole("button", { name: "Reply" }));
    expect(screen.getByTestId("composer-open")).toHaveTextContent("open");

    fireEvent.click(screen.getByRole("button", { name: "Set text" }));
    expect(screen.getByTestId("autosave-status")).toHaveTextContent("idle");

    vi.advanceTimersByTime(3100);

    await waitFor(() => {
      expect(invokeMock).toHaveBeenCalledWith("save_draft", expect.objectContaining({ input: expect.any(Object) }));
    });

    vi.useRealTimers();
  });

  it("autosave schedules a save for quote-only composer state", async () => {
    vi.useFakeTimers();
    setupTest();

    render(() => <ControllerHarness />);
    await screen.findByText("following");

    fireEvent.click(screen.getByRole("button", { name: "Quote" }));
    expect(screen.getByTestId("composer-open")).toHaveTextContent("open");

    vi.advanceTimersByTime(3100);

    await waitFor(() => {
      expect(invokeMock).toHaveBeenCalledWith("save_draft", {
        input: expect.objectContaining({ quoteCid: SAMPLE_POST.cid, quoteUri: SAMPLE_POST.uri, text: "" }),
      });
    });

    vi.useRealTimers();
  });

  it("saveAndCloseComposer keeps composer open when save fails", async () => {
    setupTest();
    invokeMock.mockImplementation((command: string) => {
      if (command === "save_draft") {
        return Promise.reject(new Error("db unavailable"));
      }

      return defaultInvokeImplementation(command);
    });

    render(() => <ControllerHarness />);
    await screen.findByText("following");

    fireEvent.click(screen.getByRole("button", { name: "Reply" }));
    fireEvent.click(screen.getByRole("button", { name: "Set text" }));
    fireEvent.click(screen.getByRole("button", { name: "Save draft" }));

    await waitFor(() => {
      expect(invokeMock).toHaveBeenCalledWith("save_draft", expect.objectContaining({ input: expect.any(Object) }));
    });
    expect(screen.getByTestId("composer-open")).toHaveTextContent("open");
    expect(onErrorMock).toHaveBeenCalledWith("Couldn't save your draft. Please try again.");
  });

  it("opens drafts list on Ctrl/Cmd+D regardless of key casing", async () => {
    setupTest();

    render(() => <ControllerHarness />);
    await screen.findByText("following");
    expect(screen.getByTestId("drafts-open")).toHaveTextContent("closed");

    globalThis.dispatchEvent(new KeyboardEvent("keydown", { ctrlKey: true, key: "D" }));
    expect(screen.getByTestId("drafts-open")).toHaveTextContent("open");
  });

  it("saves draft on Ctrl/Cmd+S regardless of key casing", async () => {
    setupTest();

    render(() => <ControllerHarness />);
    await screen.findByText("following");

    fireEvent.click(screen.getByRole("button", { name: "Reply" }));
    globalThis.dispatchEvent(new KeyboardEvent("keydown", { ctrlKey: true, key: "S" }));

    await waitFor(() => {
      expect(invokeMock).toHaveBeenCalledWith("save_draft", expect.objectContaining({ input: expect.any(Object) }));
    });
  });
});

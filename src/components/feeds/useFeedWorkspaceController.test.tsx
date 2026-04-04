import { fireEvent, render, screen, waitFor } from "@solidjs/testing-library";
import { describe, expect, it, vi } from "vitest";
import { useFeedWorkspaceController } from "./useFeedWorkspaceController";

const invokeMock = vi.hoisted(() => vi.fn());
const listenMock = vi.hoisted(() => vi.fn());

vi.mock("@tauri-apps/api/core", () => ({ invoke: invokeMock }));
vi.mock("@tauri-apps/api/event", () => ({ listen: listenMock }));

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

function ControllerHarness() {
  const controller = useFeedWorkspaceController({
    activeSession: ACTIVE_SESSION,
    onError: () => {},
    onOpenThread: () => {},
  });

  return (
    <div>
      <button type="button" onClick={() => controller.openReplyComposer(SAMPLE_POST, SAMPLE_POST)}>Reply</button>
      <button type="button" onClick={() => controller.openQuoteComposer(SAMPLE_POST)}>Quote</button>
      <button type="button" onClick={controller.clearReplyComposer}>Clear reply</button>
      <button type="button" onClick={controller.clearQuoteComposer}>Clear quote</button>
      <button type="button" onClick={() => void controller.submitPost()}>Submit</button>
      <p data-testid="active-feed">{controller.workspace.activeFeedId ?? "none"}</p>
      <p data-testid="reply-state">{controller.workspace.composer.replyTarget ? "on" : "off"}</p>
      <p data-testid="quote-state">{controller.workspace.composer.quoteTarget ? "on" : "off"}</p>
    </div>
  );
}

describe("useFeedWorkspaceController", () => {
  it("keeps reply and quote state together and submits both", async () => {
    invokeMock.mockReset();
    listenMock.mockReset();
    listenMock.mockResolvedValue(() => {});
    invokeMock.mockImplementation((command: string) => {
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

      throw new Error(`unexpected invoke: ${command}`);
    });

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
});

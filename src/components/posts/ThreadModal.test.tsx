import { AppTestProviders } from "$/test/providers";
import { HashRouter, Route } from "@solidjs/router";
import { fireEvent, render, screen, waitFor } from "@solidjs/testing-library";
import { describe, expect, it, vi } from "vitest";
import { ThreadModal } from "./ThreadModal";

const invokeMock = vi.hoisted(() => vi.fn());

vi.mock("@tauri-apps/api/core", () => ({ invoke: invokeMock }));

function createThreadPayload() {
  return {
    thread: {
      $type: "app.bsky.feed.defs#threadViewPost",
      post: {
        author: { did: "did:plc:alice", handle: "alice.test", displayName: "Alice" },
        cid: "cid-post",
        indexedAt: "2026-03-28T12:00:00.000Z",
        likeCount: 4,
        record: { createdAt: "2026-03-28T12:00:00.000Z", text: "Thread root" },
        replyCount: 2,
        repostCount: 1,
        uri: "at://did:plc:alice/app.bsky.feed.post/123",
        viewer: {},
      },
      replies: [],
    },
  };
}

describe("ThreadModal", () => {
  it("opens from the thread query param on top of the current route and closes without changing the base path", async () => {
    invokeMock.mockImplementation((command: string) => {
      if (command === "get_post_thread") {
        return Promise.resolve(createThreadPayload());
      }

      throw new Error(`unexpected invoke: ${command}`);
    });

    globalThis.location.hash = "#/profile/alice?thread=at%3A%2F%2Fdid%3Aplc%3Aalice%2Fapp.bsky.feed.post%2F123";

    render(() => (
      <AppTestProviders
        session={{
          activeDid: "did:plc:alice",
          activeHandle: "alice.test",
          activeSession: { did: "did:plc:alice", handle: "alice.test" },
        }}>
        <HashRouter>
          <Route
            path="/profile/:actor"
            component={() => (
              <>
                <div data-testid="profile-screen">profile underneath</div>
                <ThreadModal />
              </>
            )} />
        </HashRouter>
      </AppTestProviders>
    ));

    expect(await screen.findByText("Thread root")).toBeInTheDocument();
    expect(screen.getByTestId("profile-screen")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Close thread" }));

    await waitFor(() => expect(globalThis.location.hash).toBe("#/profile/alice"));
    expect(screen.queryByText("Thread root")).not.toBeInTheDocument();
  });
});

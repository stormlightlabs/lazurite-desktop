import { AppTestProviders } from "$/test/providers";
import { HashRouter, Route } from "@solidjs/router";
import { fireEvent, render, screen, waitFor } from "@solidjs/testing-library";
import { describe, expect, it, vi } from "vitest";
import { ThreadDrawer } from "../ThreadDrawer";

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

function createThreadPayloadWithParent() {
  return {
    thread: {
      $type: "app.bsky.feed.defs#threadViewPost",
      post: {
        author: { did: "did:plc:alice", handle: "alice.test", displayName: "Alice" },
        cid: "cid-child",
        indexedAt: "2026-03-28T12:05:00.000Z",
        likeCount: 1,
        record: { createdAt: "2026-03-28T12:05:00.000Z", text: "Child post" },
        replyCount: 0,
        repostCount: 0,
        uri: "at://did:plc:alice/app.bsky.feed.post/child",
        viewer: {},
      },
      parent: {
        $type: "app.bsky.feed.defs#threadViewPost",
        post: {
          author: { did: "did:plc:bob", handle: "bob.test", displayName: "Bob" },
          cid: "cid-parent",
          indexedAt: "2026-03-28T12:00:00.000Z",
          likeCount: 2,
          record: { createdAt: "2026-03-28T12:00:00.000Z", text: "Parent root" },
          replyCount: 1,
          repostCount: 0,
          uri: "at://did:plc:bob/app.bsky.feed.post/parent",
          viewer: {},
        },
        replies: [],
      },
      replies: [],
    },
  };
}

describe("ThreadDrawer", () => {
  it("opens from the thread query param on eligible routes and closes to the base route", async () => {
    invokeMock.mockImplementation((command: string) => {
      if (command === "get_post_thread") {
        return Promise.resolve(createThreadPayload());
      }

      throw new Error(`unexpected invoke: ${command}`);
    });

    globalThis.location.hash = "#/timeline?thread=at%3A%2F%2Fdid%3Aplc%3Aalice%2Fapp.bsky.feed.post%2F123";

    render(() => (
      <AppTestProviders
        session={{
          activeDid: "did:plc:alice",
          activeHandle: "alice.test",
          activeSession: { did: "did:plc:alice", handle: "alice.test" },
        }}>
        <HashRouter>
          <Route path="/timeline" component={() => <ThreadDrawer />} />
        </HashRouter>
      </AppTestProviders>
    ));

    expect(await screen.findByText("Thread root")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Back" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Forward" })).toBeDisabled();

    fireEvent.click(screen.getByRole("button", { name: "Close thread" }));

    await waitFor(() => expect(globalThis.location.hash).toBe("#/timeline"));
    expect(screen.queryByText("Thread root")).not.toBeInTheDocument();
  });

  it("keeps parent links in drawer mode and supports maximize to the full post screen", async () => {
    const childUri = "at://did:plc:alice/app.bsky.feed.post/child";
    const parentUri = "at://did:plc:bob/app.bsky.feed.post/parent";

    invokeMock.mockImplementation((command: string, args?: { uri?: string }) => {
      if (command !== "get_post_thread") {
        throw new Error(`unexpected invoke: ${command}`);
      }

      if (args?.uri === parentUri) {
        return Promise.resolve({
          thread: {
            $type: "app.bsky.feed.defs#threadViewPost",
            post: createThreadPayloadWithParent().thread.parent.post,
            replies: [],
          },
        });
      }

      return Promise.resolve(createThreadPayloadWithParent());
    });

    globalThis.location.hash = `#/timeline?foo=bar&thread=${encodeURIComponent(childUri)}`;

    render(() => (
      <AppTestProviders
        session={{
          activeDid: "did:plc:alice",
          activeHandle: "alice.test",
          activeSession: { did: "did:plc:alice", handle: "alice.test" },
        }}>
        <HashRouter>
          <Route path="/timeline" component={() => <ThreadDrawer />} />
        </HashRouter>
      </AppTestProviders>
    ));

    expect(await screen.findByText("Child post")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Parent post" })).toBeInTheDocument();

    fireEvent.click(screen.getByRole("link", { name: "Parent post" }));

    await waitFor(() =>
      expect(globalThis.location.hash).toBe(`#/timeline?foo=bar&thread=${encodeURIComponent(parentUri)}`)
    );
    expect(screen.queryByRole("link", { name: "Parent post" })).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Open full post" }));

    await waitFor(() => expect(globalThis.location.hash).toBe(`#/post/${encodeURIComponent(parentUri)}`));
  });

  it("does not render on ineligible routes even when a thread query param exists", async () => {
    globalThis.location.hash = "#/profile/alice?thread=at%3A%2F%2Fdid%3Aplc%3Aalice%2Fapp.bsky.feed.post%2F123";

    render(() => (
      <AppTestProviders
        session={{
          activeDid: "did:plc:alice",
          activeHandle: "alice.test",
          activeSession: { did: "did:plc:alice", handle: "alice.test" },
        }}>
        <HashRouter>
          <Route path="/profile/:actor" component={() => <ThreadDrawer />} />
        </HashRouter>
      </AppTestProviders>
    ));

    expect(screen.queryByText("Thread root")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Close thread" })).not.toBeInTheDocument();
  });
});

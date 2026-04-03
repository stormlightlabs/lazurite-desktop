import { AppTestProviders } from "$/test/providers";
import { HashRouter, Route } from "@solidjs/router";
import { fireEvent, render, screen } from "@solidjs/testing-library";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { FeedWorkspace } from "./FeedWorkspace";

const invokeMock = vi.hoisted(() => vi.fn());
const listenMock = vi.hoisted(() => vi.fn());

vi.mock("@tauri-apps/api/core", () => ({ invoke: invokeMock }));
vi.mock("@tauri-apps/api/event", () => ({ listen: listenMock }));

type ObserverInstance = {
  callback: IntersectionObserverCallback;
  disconnect: ReturnType<typeof vi.fn>;
  observe: ReturnType<typeof vi.fn>;
  unobserve: ReturnType<typeof vi.fn>;
};

const observers: ObserverInstance[] = [];

const ACTIVE_SESSION = { did: "did:plc:alice", handle: "alice.test" } as const;

function createFeedItem(id: string, text = `Post ${id}`) {
  return {
    post: {
      author: { did: `did:plc:${id}`, handle: `${id}.test`, displayName: `Author ${id}` },
      cid: `cid-${id}`,
      indexedAt: "2026-03-28T12:00:00.000Z",
      likeCount: 0,
      record: { createdAt: "2026-03-28T12:00:00.000Z", text },
      replyCount: 0,
      repostCount: 0,
      uri: `at://did:plc:${id}/app.bsky.feed.post/${id}`,
      viewer: {},
    },
  };
}

function createReplyItem(id: string, likeCount: number, text = `Reply ${id}`) {
  const base = createFeedItem(id, text);
  return {
    ...base,
    post: {
      ...base.post,
      author: { ...base.post.author, viewer: { following: "at://did:plc:alice/app.bsky.graph.follow/1" } },
      likeCount,
    },
    reply: {
      parent: { $type: "app.bsky.feed.defs#postView", ...createFeedItem("root").post },
      root: { $type: "app.bsky.feed.defs#postView", ...createFeedItem("root").post },
    },
  };
}

function createDeferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((innerResolve) => {
    resolve = innerResolve;
  });
  return { promise, resolve };
}

async function flushMicrotasks() {
  await Promise.resolve();
  await Promise.resolve();
}

function triggerIntersection(index = 0) {
  const observer = observers[index];
  if (!observer) {
    throw new Error(`missing intersection observer at index ${index}`);
  }

  observer.callback([{ isIntersecting: true } as IntersectionObserverEntry], {} as IntersectionObserver);
}

describe("FeedWorkspace", () => {
  beforeEach(() => {
    observers.length = 0;
    invokeMock.mockReset();
    listenMock.mockReset();
    listenMock.mockResolvedValue(() => {});
    globalThis.location.hash = "#/timeline";

    Object.defineProperty(globalThis, "IntersectionObserver", {
      configurable: true,
      value: class MockIntersectionObserver {
        callback: IntersectionObserverCallback;
        disconnect = vi.fn();
        observe = vi.fn();
        unobserve = vi.fn();

        constructor(callback: IntersectionObserverCallback) {
          this.callback = callback;
          observers.push(this);
        }
      },
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("keeps the latest scroll position when more feed items arrive", async () => {
    const nextPage = createDeferred<{ cursor: string | null; feed: Array<ReturnType<typeof createFeedItem>> }>();

    invokeMock.mockImplementation((command: string, args: { cursor?: string | null }) => {
      if (command === "get_preferences") {
        return Promise.resolve({
          savedFeeds: [{ id: "following", pinned: true, type: "timeline", value: "following" }],
          feedViewPrefs: [],
        });
      }

      if (command === "get_timeline" && !args?.cursor) {
        return Promise.resolve({ cursor: "cursor-2", feed: [createFeedItem("1", "Page 1")] });
      }

      if (command === "get_timeline" && args.cursor === "cursor-2") {
        return nextPage.promise;
      }

      throw new Error(`unexpected invoke: ${command}`);
    });

    const { container } = render(() => (
      <AppTestProviders
        session={{ activeDid: ACTIVE_SESSION.did, activeHandle: ACTIVE_SESSION.handle, activeSession: ACTIVE_SESSION }}>
        <HashRouter>
          <Route path="/timeline" component={() => <FeedWorkspace />} />
        </HashRouter>
      </AppTestProviders>
    ));

    await screen.findByText("Page 1");

    const scroller = container.querySelector(".feed-scroll-region") as HTMLDivElement | null;
    expect(scroller).not.toBeNull();

    scroller!.scrollTop = 120;
    fireEvent.scroll(scroller!);

    triggerIntersection();

    scroller!.scrollTop = 260;
    fireEvent.scroll(scroller!);

    nextPage.resolve({ cursor: null, feed: [createFeedItem("2", "Page 2")] });

    await screen.findByText("Page 2");
    await flushMicrotasks();

    expect(scroller!.scrollTop).toBe(260);
  });

  it("filters replies when the minimum like threshold changes", async () => {
    invokeMock.mockImplementation((command: string) => {
      if (command === "get_preferences") {
        return Promise.resolve({
          savedFeeds: [{ id: "following", pinned: true, type: "timeline", value: "following" }],
          feedViewPrefs: [],
        });
      }

      if (command === "get_timeline") {
        return Promise.resolve({ cursor: null, feed: [createReplyItem("1", 2, "Low-like reply")] });
      }

      if (command === "update_feed_view_pref") {
        return Promise.resolve(null);
      }

      throw new Error(`unexpected invoke: ${command}`);
    });

    render(() => (
      <AppTestProviders
        session={{ activeDid: ACTIVE_SESSION.did, activeHandle: ACTIVE_SESSION.handle, activeSession: ACTIVE_SESSION }}>
        <HashRouter>
          <Route path="/timeline" component={() => <FeedWorkspace />} />
        </HashRouter>
      </AppTestProviders>
    ));

    await screen.findByText("Low-like reply");

    const thresholdInput = screen.getByRole("spinbutton", { name: /Minimum likes for replies/i });
    fireEvent.input(thresholdInput, { target: { value: "5" } });

    expect(await screen.findByDisplayValue("5")).toBeInTheDocument();
    expect(screen.queryByText("Low-like reply")).not.toBeInTheDocument();
  });
});

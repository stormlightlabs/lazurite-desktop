import { buildPostRoute, decodePostRouteUri } from "$/lib/post-routes";
import { AppTestProviders } from "$/test/providers";
import { HashRouter, Route, useParams } from "@solidjs/router";
import { fireEvent, render, screen, waitFor } from "@solidjs/testing-library";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { PostPanel } from "../PostPanel";

const invokeMock = vi.hoisted(() => vi.fn());

vi.mock("@tauri-apps/api/core", () => ({ invoke: invokeMock }));

function createThreadPayload(uri: string, text: string, embed?: Record<string, unknown>) {
  return {
    thread: {
      $type: "app.bsky.feed.defs#threadViewPost",
      post: {
        author: { did: "did:plc:alice", handle: "alice.test", displayName: "Alice" },
        cid: `cid-${text}`,
        indexedAt: "2026-03-28T12:00:00.000Z",
        likeCount: 0,
        record: { createdAt: "2026-03-28T12:00:00.000Z", text },
        replyCount: 0,
        repostCount: 0,
        uri,
        viewer: {},
        ...(embed ? { embed } : {}),
      },
      replies: [],
    },
  };
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error?: unknown) => void;
  const promise = new Promise<T>((innerResolve, innerReject) => {
    resolve = innerResolve;
    reject = innerReject;
  });

  return { promise, reject, resolve };
}

describe("PostPanel", () => {
  beforeEach(() => {
    invokeMock.mockReset();
  });

  it("updates visible post content when navigating between post routes", async () => {
    const uriA = "at://did:plc:alice/app.bsky.feed.post/a";
    const uriB = "at://did:plc:alice/app.bsky.feed.post/b";

    invokeMock.mockImplementation((command: string, args?: { uri?: string }) => {
      if (command !== "get_post_thread") {
        throw new Error(`unexpected invoke: ${command}`);
      }

      if (args?.uri === uriA) {
        return Promise.resolve(createThreadPayload(uriA, "Post A"));
      }

      if (args?.uri === uriB) {
        return Promise.resolve(createThreadPayload(uriB, "Post B"));
      }

      throw new Error(`unexpected uri: ${args?.uri}`);
    });

    globalThis.location.hash = `#/post/${encodeURIComponent(uriA)}`;

    render(() => (
      <AppTestProviders
        session={{
          activeDid: "did:plc:alice",
          activeHandle: "alice.test",
          activeSession: { did: "did:plc:alice", handle: "alice.test" },
        }}>
        <HashRouter>
          <Route path="/post/:encodedUri" component={TestPostRoute} />
        </HashRouter>
      </AppTestProviders>
    ));

    expect(await screen.findByText("Post A")).toBeInTheDocument();

    globalThis.location.hash = `#/post/${encodeURIComponent(uriB)}`;

    await waitFor(() => expect(screen.getByText("Post B")).toBeInTheDocument());
    expect(screen.queryByText("Post A")).not.toBeInTheDocument();
  });

  it("ignores stale thread responses when switching to a newer route", async () => {
    const uriA = "at://did:plc:alice/app.bsky.feed.post/a";
    const uriB = "at://did:plc:alice/app.bsky.feed.post/b";
    const first = deferred<ReturnType<typeof createThreadPayload>>();

    invokeMock.mockImplementation((command: string, args?: { uri?: string }) => {
      if (command !== "get_post_thread") {
        throw new Error(`unexpected invoke: ${command}`);
      }

      if (args?.uri === uriA) {
        return first.promise;
      }

      if (args?.uri === uriB) {
        return Promise.resolve(createThreadPayload(uriB, "Post B"));
      }

      throw new Error(`unexpected uri: ${args?.uri}`);
    });

    globalThis.location.hash = `#/post/${encodeURIComponent(uriA)}`;

    render(() => (
      <AppTestProviders
        session={{
          activeDid: "did:plc:alice",
          activeHandle: "alice.test",
          activeSession: { did: "did:plc:alice", handle: "alice.test" },
        }}>
        <HashRouter>
          <Route path="/post/:encodedUri" component={TestPostRoute} />
        </HashRouter>
      </AppTestProviders>
    ));

    globalThis.location.hash = `#/post/${encodeURIComponent(uriB)}`;
    expect(await screen.findByText("Post B")).toBeInTheDocument();

    first.resolve(createThreadPayload(uriA, "Post A"));

    await waitFor(() => expect(screen.queryByText("Post A")).not.toBeInTheDocument());
    expect(screen.getByText("Post B")).toBeInTheDocument();
  });

  it("renders nested quoted posts in post views and links quotes to their original post route", async () => {
    const uri = "at://did:plc:alice/app.bsky.feed.post/a";
    const quotedUri = "at://did:plc:bob/app.bsky.feed.post/quoted";
    const nestedQuotedUri = "at://did:plc:carol/app.bsky.feed.post/nested";
    const embed = {
      $type: "app.bsky.embed.record#view",
      record: {
        $type: "app.bsky.embed.record#viewRecord",
        author: { did: "did:plc:bob", handle: "bob.test", displayName: "Bob" },
        embeds: [{
          $type: "app.bsky.embed.record#view",
          record: {
            $type: "app.bsky.embed.record#viewRecord",
            author: { did: "did:plc:carol", handle: "carol.test", displayName: "Carol" },
            uri: nestedQuotedUri,
            value: { text: "Nested quoted post" },
          },
        }],
        uri: quotedUri,
        value: { text: "Quoted post body" },
      },
    } as const;

    invokeMock.mockImplementation((command: string, args?: { uri?: string }) => {
      if (command !== "get_post_thread") {
        throw new Error(`unexpected invoke: ${command}`);
      }

      if (args?.uri === uri) {
        return Promise.resolve(createThreadPayload(uri, "Root post", embed));
      }

      if (args?.uri === quotedUri) {
        return Promise.resolve(createThreadPayload(quotedUri, "Opened quoted thread"));
      }

      throw new Error(`unexpected uri: ${args?.uri}`);
    });

    globalThis.location.hash = `#/post/${encodeURIComponent(uri)}`;

    render(() => (
      <AppTestProviders
        session={{
          activeDid: "did:plc:alice",
          activeHandle: "alice.test",
          activeSession: { did: "did:plc:alice", handle: "alice.test" },
        }}>
        <HashRouter>
          <Route path="/post/:encodedUri" component={TestPostRoute} />
        </HashRouter>
      </AppTestProviders>
    ));

    expect(await screen.findByText("Quoted post body")).toBeInTheDocument();
    expect(screen.getByText("Nested quoted post")).toBeInTheDocument();
    const quotedLink = screen.getByRole("link", { name: /quoted post body/i });
    expect(quotedLink).toHaveAttribute("href", `#${buildPostRoute(quotedUri)}`);

    globalThis.location.hash = `#${buildPostRoute(uri)}`;
    fireEvent.click(quotedLink);
    expect(await screen.findByText("Opened quoted thread")).toBeInTheDocument();
  });
});

function TestPostRoute() {
  const params = useParams<{ encodedUri: string }>();
  return <PostPanel uri={decodePostRouteUri(params.encodedUri)} />;
}

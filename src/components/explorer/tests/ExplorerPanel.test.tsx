import { fireEvent, render, screen, waitFor } from "@solidjs/testing-library";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ExplorerPanel } from "../ExplorerPanel";

const describeRepoMock = vi.hoisted(() => vi.fn());
const describeServerMock = vi.hoisted(() => vi.fn());
const exportRepoCarMock = vi.hoisted(() => vi.fn());
const clearLexiconFaviconCacheMock = vi.hoisted(() => vi.fn());
const getLexiconFaviconsMock = vi.hoisted(() => vi.fn());
const getRecordMock = vi.hoisted(() => vi.fn());
const getRecordBacklinksMock = vi.hoisted(() => vi.fn());
const getProfileMock = vi.hoisted(() => vi.fn());
const listRecordsMock = vi.hoisted(() => vi.fn());
const queryLabelsMock = vi.hoisted(() => vi.fn());
const resolveInputMock = vi.hoisted(() => vi.fn());
const listenMock = vi.hoisted(() => vi.fn());

vi.mock(
  "$/lib/api/explorer",
  () => ({
    ExplorerController: {
      describeRepo: describeRepoMock,
      describeServer: describeServerMock,
      exportRepoCar: exportRepoCarMock,
      clearLexiconFaviconCache: clearLexiconFaviconCacheMock,
      getLexiconFavicons: getLexiconFaviconsMock,
      getRecord: getRecordMock,
      listRecords: listRecordsMock,
      queryLabels: queryLabelsMock,
      resolveInput: resolveInputMock,
    },
  }),
);

vi.mock("$/lib/api/profile", () => ({ ProfileController: { getProfile: getProfileMock } }));
vi.mock("$/lib/api/diagnostics", () => ({ getRecordBacklinks: getRecordBacklinksMock }));
vi.mock("@tauri-apps/api/event", () => ({ listen: listenMock }));

function renderPanel() {
  return render(() => <ExplorerPanel />);
}

describe("ExplorerPanel", () => {
  beforeEach(() => {
    describeRepoMock.mockReset();
    describeServerMock.mockReset();
    exportRepoCarMock.mockReset();
    clearLexiconFaviconCacheMock.mockReset();
    getLexiconFaviconsMock.mockReset();
    getRecordMock.mockReset();
    getRecordBacklinksMock.mockReset();
    getProfileMock.mockReset();
    listRecordsMock.mockReset();
    queryLabelsMock.mockReset();
    resolveInputMock.mockReset();
    listenMock.mockReset();

    exportRepoCarMock.mockResolvedValue({ did: "did:plc:alice", path: "/tmp/alice.car", bytesWritten: 64 });
    clearLexiconFaviconCacheMock.mockResolvedValue(void 0);
    getLexiconFaviconsMock.mockResolvedValue({});
    getProfileMock.mockResolvedValue({
      status: "available",
      profile: { did: "did:plc:alice", handle: "alice.test", followersCount: 28, followsCount: 14 },
    });
    getRecordBacklinksMock.mockResolvedValue({
      likes: { cursor: null, records: [], total: 3 },
      quotes: { cursor: null, records: [], total: 1 },
      replies: { cursor: null, records: [], total: 2 },
      reposts: { cursor: null, records: [], total: 4 },
    });
    listenMock.mockResolvedValue(() => {});
    queryLabelsMock.mockResolvedValue({ labels: [] });
  });

  it("accepts raw handle input and renders repo collections from describeRepo", async () => {
    resolveInputMock.mockResolvedValue({
      input: "@alice.test",
      inputKind: "handle",
      targetKind: "repo",
      normalizedInput: "did:plc:alice",
      uri: "at://did:plc:alice",
      did: "did:plc:alice",
      handle: "alice.test",
      pdsUrl: "https://pds.example.com",
      collection: null,
      rkey: null,
    });
    describeRepoMock.mockResolvedValue({ collections: ["app.bsky.feed.like", "app.bsky.feed.post"] });

    renderPanel();

    const input = screen.getByPlaceholderText(/at:\/\/did:\.\.\. or @handle or https:\/\/pds/u);
    fireEvent.input(input, { target: { value: "@alice.test" } });
    fireEvent.submit(input.closest("form")!);

    expect(resolveInputMock).toHaveBeenCalledWith("@alice.test");
    expect(await screen.findByRole("button", { name: /app\.bsky\.feed\.like/u })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /app\.bsky\.feed\.post/u })).toBeInTheDocument();
    expect(await screen.findByText("Followers")).toBeInTheDocument();
    expect(screen.getByText("28")).toBeInTheDocument();
    expect(screen.getByText("14")).toBeInTheDocument();
    expect(screen.queryByText("0 records")).not.toBeInTheDocument();
    expect(screen.queryByText("Count unavailable")).not.toBeInTheDocument();
  });

  it("renders the initial empty state and submits example chips", async () => {
    resolveInputMock.mockRejectedValueOnce(new Error("network unavailable"));

    renderPanel();

    expect(screen.getByText("Start from a handle, DID, URI, or PDS.")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /@alice\.bsky\.social/u }));

    await waitFor(() => expect(resolveInputMock).toHaveBeenCalledWith("@alice.bsky.social"));
  });

  it("loads additional collection pages", async () => {
    resolveInputMock.mockResolvedValue({
      input: "at://did:plc:alice/app.bsky.feed.post",
      inputKind: "atUri",
      targetKind: "collection",
      normalizedInput: "at://did:plc:alice/app.bsky.feed.post",
      uri: "at://did:plc:alice/app.bsky.feed.post",
      did: "did:plc:alice",
      handle: "alice.test",
      pdsUrl: "https://pds.example.com",
      collection: "app.bsky.feed.post",
      rkey: null,
    });
    listRecordsMock.mockResolvedValueOnce({
      cursor: "cursor-2",
      records: [{
        uri: "at://did:plc:alice/app.bsky.feed.post/first",
        cid: "cid-first",
        value: { text: "First page" },
      }],
    }).mockResolvedValueOnce({
      cursor: null,
      records: [{
        uri: "at://did:plc:alice/app.bsky.feed.post/second",
        cid: "cid-second",
        value: { text: "Second page" },
      }],
    });

    renderPanel();

    const input = screen.getByPlaceholderText(/at:\/\/did:\.\.\. or @handle or https:\/\/pds/u);
    fireEvent.input(input, { target: { value: "at://did:plc:alice/app.bsky.feed.post" } });
    fireEvent.submit(input.closest("form")!);

    expect(await screen.findByRole("button", { name: /first/u })).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /load more\.\.\./iu }));

    await screen.findByRole("button", { name: /second/u });
    expect(listRecordsMock).toHaveBeenNthCalledWith(2, "did:plc:alice", "app.bsky.feed.post", "cursor-2");
  });

  it("handles deep-link navigation events for PDS targets", async () => {
    let navigationHandler: ((event: { payload: { target: Record<string, unknown> } }) => void) | undefined;

    listenMock.mockImplementation((_event: string, callback: typeof navigationHandler) => {
      navigationHandler = callback;
      return Promise.resolve(() => {});
    });
    resolveInputMock.mockResolvedValue({
      input: "https://pds.example.com",
      inputKind: "pdsUrl",
      targetKind: "pds",
      normalizedInput: "https://pds.example.com",
      uri: null,
      did: null,
      handle: null,
      pdsUrl: "https://pds.example.com",
      collection: null,
      rkey: null,
    });
    describeServerMock.mockResolvedValue({
      pdsUrl: "https://pds.example.com",
      server: { inviteCodeRequired: true, version: "0.4.0" },
      repos: [{ did: "did:plc:hosted", head: "head", rev: "rev-1", active: true, status: null }],
      cursor: null,
    });

    renderPanel();

    await waitFor(() => expect(listenMock).toHaveBeenCalledOnce());

    navigationHandler?.({
      payload: {
        target: {
          input: "https://pds.example.com",
          inputKind: "pdsUrl",
          targetKind: "pds",
          normalizedInput: "https://pds.example.com",
          uri: null,
          did: null,
          handle: null,
          pdsUrl: "https://pds.example.com",
          collection: null,
          rkey: null,
        },
      },
    });

    expect(resolveInputMock).toHaveBeenCalledWith("https://pds.example.com");
    expect(await screen.findByText("Hosted Repositories")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /did:plc:hosted/u })).toBeInTheDocument();
  });

  it("shows record backlinks as a supplementary explorer panel", async () => {
    resolveInputMock.mockResolvedValue({
      input: "at://did:plc:alice/app.bsky.feed.post/123",
      inputKind: "atUri",
      targetKind: "record",
      normalizedInput: "at://did:plc:alice/app.bsky.feed.post/123",
      uri: "at://did:plc:alice/app.bsky.feed.post/123",
      did: "did:plc:alice",
      handle: "alice.test",
      pdsUrl: "https://pds.example.com",
      collection: "app.bsky.feed.post",
      rkey: "123",
    });
    getRecordMock.mockResolvedValue({
      cid: "cid-123",
      value: { $type: "app.bsky.feed.post", text: "Explorer record" },
    });
    getRecordBacklinksMock.mockResolvedValue({
      likes: { cursor: null, records: [], total: 3 },
      quotes: { cursor: null, records: [], total: 1 },
      replies: { cursor: null, records: [], total: 2 },
      reposts: { cursor: null, records: [], total: 4 },
    });

    renderPanel();

    const input = screen.getByPlaceholderText(/at:\/\/did:\.\.\. or @handle or https:\/\/pds/u);
    fireEvent.input(input, { target: { value: "at://did:plc:alice/app.bsky.feed.post/123" } });
    fireEvent.submit(input.closest("form")!);

    expect(await screen.findByText("Backlinks")).toBeInTheDocument();
    expect(await screen.findByText("3 records")).toBeInTheDocument();
    expect(screen.getByText("4 records")).toBeInTheDocument();
  });

  it("renders lexicon favicons in repo and collection views when available", async () => {
    resolveInputMock.mockResolvedValueOnce({
      input: "@alice.test",
      inputKind: "handle",
      targetKind: "repo",
      normalizedInput: "did:plc:alice",
      uri: "at://did:plc:alice",
      did: "did:plc:alice",
      handle: "alice.test",
      pdsUrl: "https://pds.example.com",
      collection: null,
      rkey: null,
    }).mockResolvedValueOnce({
      input: "at://did:plc:alice/app.bsky.feed.post",
      inputKind: "atUri",
      targetKind: "collection",
      normalizedInput: "at://did:plc:alice/app.bsky.feed.post",
      uri: "at://did:plc:alice/app.bsky.feed.post",
      did: "did:plc:alice",
      handle: "alice.test",
      pdsUrl: "https://pds.example.com",
      collection: "app.bsky.feed.post",
      rkey: null,
    });
    describeRepoMock.mockResolvedValue({ collections: ["app.bsky.feed.post"] });
    listRecordsMock.mockResolvedValue({ cursor: null, records: [] });
    getLexiconFaviconsMock.mockResolvedValue({ "app.bsky.feed.post": "data:image/png;base64,Zm9v" });

    renderPanel();

    const input = screen.getByPlaceholderText(/at:\/\/did:\.\.\. or @handle or https:\/\/pds/u);
    fireEvent.input(input, { target: { value: "@alice.test" } });
    fireEvent.submit(input.closest("form")!);

    expect(await screen.findByAltText("app.bsky.feed.post favicon")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /app\.bsky\.feed\.post/u }));

    expect(await screen.findAllByAltText("app.bsky.feed.post favicon")).not.toHaveLength(0);
  });

  it("clears and rehydrates the explorer icon cache for the current repo view", async () => {
    resolveInputMock.mockResolvedValue({
      input: "@alice.test",
      inputKind: "handle",
      targetKind: "repo",
      normalizedInput: "did:plc:alice",
      uri: "at://did:plc:alice",
      did: "did:plc:alice",
      handle: "alice.test",
      pdsUrl: "https://pds.example.com",
      collection: null,
      rkey: null,
    });
    describeRepoMock.mockResolvedValue({ collections: ["sh.tangled.feed.star"] });
    getLexiconFaviconsMock.mockResolvedValue({ "sh.tangled.feed.star": null });

    renderPanel();

    const input = screen.getByPlaceholderText(/at:\/\/did:\.\.\. or @handle or https:\/\/pds/u);
    fireEvent.input(input, { target: { value: "@alice.test" } });
    fireEvent.submit(input.closest("form")!);

    expect(await screen.findByRole("button", { name: /sh\.tangled\.feed\.star/u })).toBeInTheDocument();
    await waitFor(() => expect(getLexiconFaviconsMock).toHaveBeenCalledWith(["sh.tangled.feed.star"]));

    fireEvent.click(screen.getByRole("button", { name: /clear icon cache/i }));

    await waitFor(() => expect(clearLexiconFaviconCacheMock).toHaveBeenCalledOnce());
    await waitFor(() => expect(getLexiconFaviconsMock).toHaveBeenCalledTimes(2));
    expect(await screen.findByText("Cleared explorer icon cache.")).toBeInTheDocument();
  });
});

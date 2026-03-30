import { fireEvent, render, screen, waitFor } from "@solidjs/testing-library";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ExplorerPanel } from "./ExplorerPanel";

const describeRepoMock = vi.hoisted(() => vi.fn());
const describeServerMock = vi.hoisted(() => vi.fn());
const exportRepoCarMock = vi.hoisted(() => vi.fn());
const getRecordMock = vi.hoisted(() => vi.fn());
const listRecordsMock = vi.hoisted(() => vi.fn());
const queryLabelsMock = vi.hoisted(() => vi.fn());
const resolveInputMock = vi.hoisted(() => vi.fn());
const listenMock = vi.hoisted(() => vi.fn());

vi.mock(
  "$/lib/api/explorer",
  () => ({
    describeRepo: describeRepoMock,
    describeServer: describeServerMock,
    exportRepoCar: exportRepoCarMock,
    getRecord: getRecordMock,
    listRecords: listRecordsMock,
    queryLabels: queryLabelsMock,
    resolveInput: resolveInputMock,
  }),
);

vi.mock("@tauri-apps/api/event", () => ({ listen: listenMock }));

function renderPanel() {
  return render(() => <ExplorerPanel />);
}

describe("ExplorerPanel", () => {
  beforeEach(() => {
    describeRepoMock.mockReset();
    describeServerMock.mockReset();
    exportRepoCarMock.mockReset();
    getRecordMock.mockReset();
    listRecordsMock.mockReset();
    queryLabelsMock.mockReset();
    resolveInputMock.mockReset();
    listenMock.mockReset();

    exportRepoCarMock.mockResolvedValue({ did: "did:plc:alice", path: "/tmp/alice.car", bytesWritten: 64 });
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
    expect(screen.queryByText("0 records")).not.toBeInTheDocument();
    expect(screen.getAllByText("Count unavailable")).toHaveLength(2);
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
});

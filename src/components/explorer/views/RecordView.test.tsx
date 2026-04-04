import { render, screen } from "@solidjs/testing-library";
import { describe, expect, it, vi } from "vitest";
import { RecordView } from "./RecordView";

const getRecordBacklinksMock = vi.hoisted(() => vi.fn());

vi.mock("$/lib/api/diagnostics", () => ({ getRecordBacklinks: getRecordBacklinksMock }));

describe("RecordView", () => {
  it("renders falsey JSON values and moderation labels", () => {
    getRecordBacklinksMock.mockResolvedValue({
      likes: { cursor: null, records: [], total: 0 },
      quotes: { cursor: null, records: [], total: 0 },
      replies: { cursor: null, records: [], total: 0 },
      reposts: { cursor: null, records: [], total: 0 },
    });

    render(() => (
      <RecordView
        record={{ $type: "app.test.record", empty: "", flagged: false, nested: { count: 0 } }}
        cid={null}
        uri="at://did:plc:alice/app.test.record/123"
        labels={[{ src: "did:plc:labeler", uri: "at://did:plc:alice/app.test.record/123", val: "!warn" }]} />
    ));

    expect(screen.getByText("\"empty\"")).toBeInTheDocument();
    expect(screen.getByText("\"\"")).toBeInTheDocument();
    expect(screen.getByText("false")).toBeInTheDocument();
    expect(screen.getByText("0")).toBeInTheDocument();
    expect(screen.getByText("Backlinks")).toBeInTheDocument();
    expect(screen.getByText("Moderation Labels")).toBeInTheDocument();
    expect(screen.getByText("!warn")).toBeInTheDocument();
  });

  it("renders post previews with rich text formatting", async () => {
    getRecordBacklinksMock.mockResolvedValue({
      likes: { cursor: null, records: [], total: 0 },
      quotes: { cursor: null, records: [], total: 0 },
      replies: { cursor: null, records: [], total: 0 },
      reposts: { cursor: null, records: [], total: 0 },
    });

    render(() => (
      <RecordView
        record={{
          $type: "app.bsky.feed.post",
          facets: [{
            features: [{ $type: "app.bsky.richtext.facet#link", uri: "https://example.com" }],
            index: { byteEnd: 19, byteStart: 0 },
          }],
          text: "https://example.com\n\n```ts\nconst reply = true;\n```",
        }}
        cid="cid-post"
        uri="at://did:plc:alice/app.bsky.feed.post/123"
        labels={[]} />
    ));

    expect(screen.getByRole("link", { name: "https://example.com" })).toHaveAttribute("href", "https://example.com");
    expect(screen.getByText("const reply = true;")).toBeInTheDocument();
  });
});

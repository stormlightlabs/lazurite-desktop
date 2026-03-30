import { render, screen } from "@solidjs/testing-library";
import { describe, expect, it } from "vitest";
import { RecordView } from "./RecordView";

describe("RecordView", () => {
  it("renders falsey JSON values and moderation labels", () => {
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
    expect(screen.getByText("Moderation Labels")).toBeInTheDocument();
    expect(screen.getByText("!warn")).toBeInTheDocument();
  });
});

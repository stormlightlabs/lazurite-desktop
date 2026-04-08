import { describe, expect, it } from "vitest";
import {
  buildPostEngagementRoute,
  buildPostEngagementTabRoute,
  parsePostEngagementTab,
} from "../post-engagement-routes";

describe("post-engagement-routes", () => {
  it("builds a canonical engagement route with tab query", () => {
    const uri = "at://did:plc:alice/app.bsky.feed.post/abc123";
    expect(buildPostEngagementRoute(uri, "quotes")).toBe(
      "/post/at%3A%2F%2Fdid%3Aplc%3Aalice%2Fapp.bsky.feed.post%2Fabc123/engagement?tab=quotes",
    );
  });

  it("defaults to likes tab for missing or invalid tab values", () => {
    expect(parsePostEngagementTab("")).toBe("likes");
    expect(parsePostEngagementTab("?foo=bar")).toBe("likes");
    expect(parsePostEngagementTab("?tab=invalid")).toBe("likes");
  });

  it("parses valid tabs", () => {
    expect(parsePostEngagementTab("?tab=likes")).toBe("likes");
    expect(parsePostEngagementTab("?tab=reposts")).toBe("reposts");
    expect(parsePostEngagementTab("?tab=quotes")).toBe("quotes");
  });

  it("updates the tab while preserving other query params", () => {
    expect(buildPostEngagementTabRoute("/post/foo/engagement", "?foo=bar&tab=likes", "reposts")).toBe(
      "/post/foo/engagement?foo=bar&tab=reposts",
    );
  });
});

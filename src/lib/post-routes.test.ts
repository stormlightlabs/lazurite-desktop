import { describe, expect, it } from "vitest";
import { buildPostRoute, decodePostRouteUri, isThreadDrawerPath } from "./post-routes";

describe("post-routes", () => {
  it("builds a canonical encoded post route", () => {
    const uri = "at://did:plc:alice/app.bsky.feed.post/abc123";
    expect(buildPostRoute(uri)).toBe("/post/at%3A%2F%2Fdid%3Aplc%3Aalice%2Fapp.bsky.feed.post%2Fabc123");
  });

  it("decodes valid encoded at:// URIs", () => {
    expect(decodePostRouteUri("at%3A%2F%2Fdid%3Aplc%3Aalice%2Fapp.bsky.feed.post%2Fabc123")).toBe(
      "at://did:plc:alice/app.bsky.feed.post/abc123",
    );
  });

  it("rejects malformed or non-at URI values", () => {
    expect(decodePostRouteUri("not-a-uri")).toBeNull();
    expect(decodePostRouteUri("%E0%A4%A")).toBeNull();
    expect(decodePostRouteUri(null)).toBeNull();
    expect(decodePostRouteUri()).toBeNull();
  });

  it("marks only feed, notifications, and deck as drawer routes", () => {
    expect(isThreadDrawerPath("/timeline")).toBe(true);
    expect(isThreadDrawerPath("/notifications")).toBe(true);
    expect(isThreadDrawerPath("/deck")).toBe(true);
    expect(isThreadDrawerPath("/profile/alice")).toBe(false);
    expect(isThreadDrawerPath("/search")).toBe(false);
  });
});

import { buildHashtagRoute } from "$/lib/search-routes";
import { render, screen } from "@solidjs/testing-library";
import { describe, expect, it } from "vitest";
import { PostRichText } from "../PostRichText";

describe("PostRichText", () => {
  it("renders link, mention, and tag facets", () => {
    render(() => (
      <PostRichText
        facets={[{
          features: [{ $type: "app.bsky.richtext.facet#link", uri: "https://example.com" }],
          index: { byteEnd: 25, byteStart: 6 },
        }, {
          features: [{ $type: "app.bsky.richtext.facet#mention", did: "did:plc:bob" }],
          index: { byteEnd: 35, byteStart: 26 },
        }, {
          features: [{ $type: "app.bsky.richtext.facet#tag", tag: "solid" }],
          index: { byteEnd: 42, byteStart: 36 },
        }]}
        text="Visit https://example.com @bob.test #solid" />
    ));

    expect(screen.getByRole("link", { name: "https://example.com" })).toHaveAttribute("href", "https://example.com");
    expect(screen.getByRole("link", { name: "@bob.test" })).toHaveAttribute("href", "#/profile/did%3Aplc%3Abob");
    expect(screen.getByRole("link", { name: "#solid" })).toHaveAttribute("href", `#${buildHashtagRoute("solid")}`);
  });

  it("renders markdown blocks and does not linkify inside code", () => {
    render(() => (
      <PostRichText
        facets={[{
          features: [{ $type: "app.bsky.richtext.facet#link", uri: "https://example.com" }],
          index: { byteEnd: 27, byteStart: 8 },
        }]}
        text={"Inline `https://example.com`\n\n> quoted line\n\n```ts\nconst url = 'https://example.com';\n```"} />
    ));

    expect(screen.queryByRole("link", { name: "https://example.com" })).not.toBeInTheDocument();
    expect(screen.getByText("https://example.com", { selector: "code" })).toBeInTheDocument();
    expect(screen.getByText("quoted line")).toBeInTheDocument();
    expect(screen.getByText("ts")).toBeInTheDocument();
    expect(screen.getByText("const url = 'https://example.com';")).toBeInTheDocument();
  });
});

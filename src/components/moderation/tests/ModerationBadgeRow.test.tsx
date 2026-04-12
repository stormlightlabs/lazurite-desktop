import { render, screen } from "@solidjs/testing-library";
import { describe, expect, it } from "vitest";
import { ModerationBadgeRow } from "../ModerationBadgeRow";

describe("ModerationBadgeRow", () => {
  it("renders a neutral label badge when labels exist but moderation is neutral", async () => {
    render(() => (
      <ModerationBadgeRow
        decision={{ alert: false, blur: "none", filter: false, inform: false, noOverride: false }}
        labels={[{ src: "did:plc:labeler", val: "my-label" }]} />
    ));

    expect(await screen.findByText(/my-label/i)).toBeInTheDocument();
  });

  it("renders nothing for empty labels with a neutral decision", () => {
    const { container } = render(() => (
      <ModerationBadgeRow
        decision={{ alert: false, blur: "none", filter: false, inform: false, noOverride: false }}
        labels={[]} />
    ));

    expect(container).toBeEmptyDOMElement();
  });

  it("hides generic advisory pill when concrete label badges are available", async () => {
    render(() => (
      <ModerationBadgeRow
        decision={{ alert: false, blur: "none", filter: false, inform: true, noOverride: false }}
        labels={[{ src: "did:plc:labeler", val: "my-label" }]} />
    ));

    expect(await screen.findByText(/my-label/i)).toBeInTheDocument();
    expect(screen.queryByText("Advisory")).not.toBeInTheDocument();
  });
});

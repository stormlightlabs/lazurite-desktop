import { fireEvent, render, screen } from "@solidjs/testing-library";
import { describe, expect, it } from "vitest";
import { ModeratedBlurOverlay } from "../ModeratedBlurOverlay";

describe("ModeratedBlurOverlay", () => {
  it("shows overlay and allows reveal when decision is blur-only", () => {
    render(() => (
      <ModeratedBlurOverlay
        decision={{ alert: false, blur: "media", filter: false, inform: false, noOverride: false }}
        labels={[{ src: "did:plc:labeler", val: "sexual" }]}>
        <p>Hidden body</p>
      </ModeratedBlurOverlay>
    ));

    expect(screen.getByText("Content blurred")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Show content" }));
    expect(screen.queryByText("Content blurred")).not.toBeInTheDocument();
  });

  it("hides reveal button when content is fully filtered", () => {
    render(() => (
      <ModeratedBlurOverlay
        decision={{ alert: true, blur: "content", filter: true, inform: false, noOverride: true }}
        labels={[{ src: "did:plc:labeler", val: "porn" }]}>
        <p>Hidden body</p>
      </ModeratedBlurOverlay>
    ));

    expect(screen.getByText("Hidden by your moderation settings.")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Show content" })).not.toBeInTheDocument();
  });
});

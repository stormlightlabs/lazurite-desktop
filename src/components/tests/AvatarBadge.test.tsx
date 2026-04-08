import { render } from "@solidjs/testing-library";
import { describe, expect, it } from "vitest";
import { AvatarBadge } from "../AvatarBadge";

describe("AvatarBadge", () => {
  it("uses solid primary background (no gradient)", () => {
    render(() => <AvatarBadge label="alice.bsky.social" tone="primary" />);

    const badge = document.querySelector("span");
    expect(badge?.className).toContain("bg-primary");
    expect(badge?.className).not.toContain("gradient");
  });

  it("extracts initials from handle", () => {
    render(() => <AvatarBadge label="alice.bsky.social" tone="primary" />);

    const badge = document.querySelector("span");
    expect(badge?.textContent).toBe("AL");
  });

  it("renders muted tone without primary background", () => {
    render(() => <AvatarBadge label="bob.bsky.social" tone="muted" />);

    const badge = document.querySelector("span");
    expect(badge?.className).toContain("bg-white/8");
    expect(badge?.className).not.toContain("bg-primary");
  });
});

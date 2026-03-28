import { render, screen } from "@solidjs/testing-library";
import { describe, expect, it, vi } from "vitest";
import { LoginPanel } from "./LoginPanel";

function renderPanel(overrides: Partial<Parameters<typeof LoginPanel>[0]> = {}) {
  const defaults = { value: "", pending: false, shakeCount: 0, onInput: vi.fn(), onSubmit: vi.fn() };

  return render(() => <LoginPanel {...{ ...defaults, ...overrides }} />);
}

describe("LoginPanel", () => {
  it("renders branded header with Lazurite logo", () => {
    renderPanel();

    expect(screen.getByText("Lazurite")).toBeInTheDocument();
    expect(screen.getByText("Powered by Bluesky")).toBeInTheDocument();
    expect(screen.getByText("Sign in with your Internet Handle or DID")).toBeInTheDocument();

    const svg = document.querySelector("svg");
    expect(svg).toBeInTheDocument();
    expect(svg).toHaveAttribute("fill", "currentColor");
  });

  it("uses solid primary background on submit button (no gradient)", () => {
    renderPanel();

    const button = screen.getByRole("button", { name: /continue/i });
    expect(button.className).toContain("bg-primary");
    expect(button.className).not.toContain("gradient");
  });

  it("uses rounded-xl on input (not rounded-full)", () => {
    renderPanel();

    const input = screen.getByPlaceholderText("alice.bsky.social");
    expect(input.className).toContain("rounded-xl");
    expect(input.className).not.toContain("rounded-full");
  });

  it("shows loading state when pending", () => {
    renderPanel({ pending: true });

    expect(screen.getByText("Opening sign-in...")).toBeInTheDocument();
    expect(screen.getByRole("button")).toBeDisabled();
  });
});

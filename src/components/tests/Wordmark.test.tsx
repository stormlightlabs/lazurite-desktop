import { render, screen } from "@solidjs/testing-library";
import { describe, expect, it } from "vitest";
import { Wordmark } from "../Wordmark";

describe("Wordmark", () => {
  it("renders inline SVG logo with currentColor fill", () => {
    render(() => <Wordmark />);

    const svg = document.querySelector("svg");
    expect(svg).toBeInTheDocument();
    expect(svg).toHaveAttribute("fill", "currentColor");
  });

  it("shows text labels when not compact", () => {
    render(() => <Wordmark />);

    expect(screen.getByText("Lazurite")).toBeInTheDocument();
    expect(screen.getByText("Desktop")).toBeInTheDocument();
  });

  it("hides text labels when compact", () => {
    render(() => <Wordmark compact />);

    expect(screen.queryByText("Lazurite")).not.toBeInTheDocument();
    expect(screen.queryByText("Desktop")).not.toBeInTheDocument();
  });

  it("does not use gradient backgrounds", () => {
    render(() => <Wordmark />);

    const container = document.querySelector("[aria-hidden='true']");
    expect(container).toBeInTheDocument();
    expect(container?.className).not.toContain("gradient");
  });

  it("applies primary color to logo container", () => {
    render(() => <Wordmark />);

    const container = document.querySelector("[aria-hidden='true']");
    expect(container?.className).toContain("text-primary");
  });
});

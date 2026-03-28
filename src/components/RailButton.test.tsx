import { MemoryRouter, Route } from "@solidjs/router";
import { render, screen } from "@solidjs/testing-library";
import { describe, expect, it } from "vitest";
import { RailButton } from "./RailButton";

function renderInRouter(ui: () => ReturnType<typeof RailButton>) {
  return render(() => (
    <MemoryRouter root={ui}>
      <Route path="*" component={() => null} />
    </MemoryRouter>
  ));
}

describe("RailButton", () => {
  it("shows label text when not compact", () => {
    renderInRouter(() => <RailButton href="/auth" label="Accounts" icon="profile" />);

    expect(screen.getByText("Accounts")).toBeInTheDocument();
  });

  it("hides label text when compact", () => {
    renderInRouter(() => <RailButton href="/auth" label="Accounts" icon="profile" compact />);

    expect(screen.queryByText("Accounts")).not.toBeInTheDocument();
  });

  it("uses rounded-lg (not rounded-full) for reduced rounding", () => {
    renderInRouter(() => <RailButton href="/auth" label="Accounts" icon="profile" />);

    const link = screen.getByRole("link");
    expect(link.className).toContain("rounded-lg");
    expect(link.className).not.toContain("rounded-full");
  });
});

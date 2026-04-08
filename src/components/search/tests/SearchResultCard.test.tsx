import { fireEvent, render, screen } from "@solidjs/testing-library";
import { describe, expect, it, vi } from "vitest";
import { SearchResultCard } from "../SearchResultCard";

describe("SearchResultCard", () => {
  it("opens the thread from the post body but keeps profile navigation explicit", () => {
    const onOpenThread = vi.fn();

    render(() => (
      <SearchResultCard
        authorDid="did:plc:alice"
        authorHandle="alice.test"
        createdAt="2026-04-03T12:00:00.000Z"
        onOpenThread={onOpenThread}
        source="bookmark"
        text="Saved post body" />
    ));

    const primaryRegion = screen.getByRole("button", { name: "Open thread" });
    fireEvent.click(primaryRegion);
    fireEvent.keyDown(primaryRegion, { key: "Enter" });
    fireEvent.click(screen.getByRole("link", { name: "@alice.test" }));

    expect(onOpenThread).toHaveBeenCalledTimes(2);
  });
});

import { render, screen } from "@solidjs/testing-library";
import { describe, expect, it } from "vitest";
import { FeedComposer } from "./FeedComposer";

const suggestions = Array.from(
  { length: 13 },
  (_, index) => ({ label: `@handle-${index + 1}.test`, type: "handle" as const }),
);

describe("FeedComposer", () => {
  it("renders a contained scroll region for typeahead suggestions", () => {
    render(() => (
      <FeedComposer
        activeHandle="alice.test"
        open
        pending={false}
        quoteTarget={null}
        replyTarget={null}
        suggestions={suggestions}
        text="@ha"
        onApplySuggestion={() => {}}
        onClearQuote={() => {}}
        onClearReply={() => {}}
        onClose={() => {}}
        onSubmit={() => {}}
        onTextChange={() => {}} />
    ));

    expect(screen.getByText("@handle-12.test")).toBeInTheDocument();
    expect(screen.queryByText("@handle-13.test")).not.toBeInTheDocument();

    const suggestionsHeading = screen.getByText("Suggestions");
    const scrollRegion = suggestionsHeading.nextElementSibling as HTMLElement;
    expect(scrollRegion.className).toContain("overflow-y-auto");
  });
});

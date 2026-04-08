import { render, screen } from "@solidjs/testing-library";
import { describe, expect, it } from "vitest";
import { FeedComposer } from "./FeedComposer";

const suggestions = Array.from(
  { length: 13 },
  (_, index) => ({ label: `@handle-${index + 1}.test`, type: "handle" as const }),
);

const BASE_PROPS = {
  activeHandle: "alice.test",
  open: true,
  pending: false,
  quoteTarget: null,
  replyTarget: null,
  suggestions: [],
  text: "",
  onApplySuggestion: () => {},
  onClearQuote: () => {},
  onClearReply: () => {},
  onClose: () => {},
  onSubmit: () => {},
  onTextChange: () => {},
};

describe("FeedComposer", () => {
  it("renders a contained scroll region for typeahead suggestions", () => {
    render(() => <FeedComposer {...BASE_PROPS} suggestions={suggestions} text="@ha" />);

    expect(screen.getByText("@handle-12.test")).toBeInTheDocument();
    expect(screen.queryByText("@handle-13.test")).not.toBeInTheDocument();

    const suggestionsHeading = screen.getByText("Suggestions");
    const scrollRegion = suggestionsHeading.nextElementSibling as HTMLElement;
    expect(scrollRegion.className).toContain("overflow-y-auto");
  });

  it("shows 'Saving...' autosave indicator when status is saving", () => {
    render(() => <FeedComposer {...BASE_PROPS} autosaveStatus="saving" text="hello" />);

    expect(screen.getByText("Saving...")).toBeInTheDocument();
  });

  it("shows 'Saved' autosave indicator when status is saved", () => {
    render(() => <FeedComposer {...BASE_PROPS} autosaveStatus="saved" text="hello" />);

    expect(screen.getByText("Saved")).toBeInTheDocument();
  });

  it("does not show autosave indicator when status is idle", () => {
    render(() => <FeedComposer {...BASE_PROPS} autosaveStatus="idle" text="hello" />);

    expect(screen.queryByText("Saving...")).not.toBeInTheDocument();
    expect(screen.queryByText("Saved")).not.toBeInTheDocument();
  });

  it("shows 'Save' button when onSaveDraft is provided", () => {
    render(() => <FeedComposer {...BASE_PROPS} onSaveDraft={() => {}} />);

    expect(screen.getByTitle("Save as draft (Ctrl+S)")).toBeInTheDocument();
  });

  it("does not show 'Save' button when onSaveDraft is not provided", () => {
    render(() => <FeedComposer {...BASE_PROPS} />);

    expect(screen.queryByTitle("Save as draft (Ctrl+S)")).not.toBeInTheDocument();
  });

  it("shows draft count badge on drafts button when draftCount is positive", () => {
    render(() => <FeedComposer {...BASE_PROPS} draftCount={3} onOpenDrafts={() => {}} />);

    expect(screen.getByText("3")).toBeInTheDocument();
  });

  it("does not show draft count badge when draftCount is zero", () => {
    render(() => <FeedComposer {...BASE_PROPS} draftCount={0} onOpenDrafts={() => {}} />);

    const draftsButton = screen.getByTitle("Drafts (Ctrl+D)");
    expect(draftsButton).toBeInTheDocument();
    expect(draftsButton.textContent?.trim()).toBe("");
  });
});

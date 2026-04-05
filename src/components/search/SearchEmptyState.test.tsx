import { render, screen } from "@solidjs/testing-library";
import { describe, expect, it } from "vitest";
import { SearchEmptyState } from "./SearchEmptyState";

describe("SearchEmptyState", () => {
  it("renders the composed no-sync illustration", () => {
    render(() => <SearchEmptyState reason="no-sync" scope="local" />);

    expect(screen.getByTestId("no-sync-illustration")).toBeInTheDocument();
    expect(screen.getByText(/run a sync to fill local search/i)).toBeInTheDocument();
  });
});

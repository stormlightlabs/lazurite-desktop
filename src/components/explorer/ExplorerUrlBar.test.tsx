import { cleanup, fireEvent, render, screen, waitFor } from "@solidjs/testing-library";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ExplorerUrlBar } from "./ExplorerUrlBar";

const searchActorSuggestionsMock = vi.hoisted(() => vi.fn());

vi.mock("$/lib/api/actors", () => ({ searchActorSuggestions: searchActorSuggestionsMock }));

describe("ExplorerUrlBar", () => {
  beforeEach(() => {
    searchActorSuggestionsMock.mockReset();
  });

  it("opens typeahead for @ input and not for other input kinds", async () => {
    const onInput = vi.fn();
    const onSubmit = vi.fn();
    searchActorSuggestionsMock.mockResolvedValue([{ did: "did:plc:alice", handle: "alice.test" }]);

    render(() => (
      <ExplorerUrlBar
        value="@ali"
        canGoBack={false}
        canGoForward={false}
        canExport={false}
        onInput={onInput}
        onSubmit={onSubmit}
        onBack={() => {}}
        onForward={() => {}}
        onExport={() => {}} />
    ));

    const input = screen.getByRole("combobox");
    input.focus();
    fireEvent.focus(input);

    await waitFor(() => expect(searchActorSuggestionsMock).toHaveBeenCalledWith("ali"));
    await waitFor(() => expect(input).toHaveAttribute("aria-expanded", "true"));
    expect(await screen.findByRole("option", { name: /alice\.test/u })).toBeInTheDocument();

    cleanup();
    render(() => (
      <ExplorerUrlBar
        value="did:plc:alice"
        canGoBack={false}
        canGoForward={false}
        canExport={false}
        onInput={onInput}
        onSubmit={onSubmit}
        onBack={() => {}}
        onForward={() => {}}
        onExport={() => {}} />
    ));

    expect(screen.queryByRole("option", { name: /alice\.test/u })).not.toBeInTheDocument();
  });

  it("submits the highlighted suggestion on enter and on click", async () => {
    const onInput = vi.fn();
    const onSubmit = vi.fn();
    searchActorSuggestionsMock.mockResolvedValue([{ did: "did:plc:alice", handle: "alice.test" }]);

    render(() => (
      <ExplorerUrlBar
        value="@ali"
        canGoBack={false}
        canGoForward={false}
        canExport={false}
        onInput={onInput}
        onSubmit={onSubmit}
        onBack={() => {}}
        onForward={() => {}}
        onExport={() => {}} />
    ));

    const input = screen.getByRole("combobox");
    input.focus();
    fireEvent.focus(input);
    await waitFor(() => expect(input).toHaveAttribute("aria-expanded", "true"));
    await screen.findByRole("option", { name: /alice\.test/u });

    fireEvent.keyDown(input, { key: "Enter" });

    expect(onInput).toHaveBeenCalledWith("@alice.test");
    expect(onSubmit).toHaveBeenCalledWith("@alice.test");

    cleanup();
    render(() => (
      <ExplorerUrlBar
        value="@ali"
        canGoBack={false}
        canGoForward={false}
        canExport={false}
        onInput={onInput}
        onSubmit={onSubmit}
        onBack={() => {}}
        onForward={() => {}}
        onExport={() => {}} />
    ));

    const rerenderedInput = screen.getByRole("combobox");
    rerenderedInput.focus();
    fireEvent.focus(rerenderedInput);
    fireEvent.click(await screen.findByRole("option", { name: /alice\.test/u }));

    expect(onSubmit).toHaveBeenCalledTimes(2);
  });
});

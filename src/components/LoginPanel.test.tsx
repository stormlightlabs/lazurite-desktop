import { fireEvent, render, screen } from "@solidjs/testing-library";
import { createSignal } from "solid-js";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { LoginPanel } from "./LoginPanel";

const invokeMock = vi.hoisted(() => vi.fn());

vi.mock("@tauri-apps/api/core", () => ({ invoke: invokeMock }));

function renderPanel(overrides: Partial<Parameters<typeof LoginPanel>[0]> = {}) {
  const defaults = { value: "", pending: false, shakeCount: 0, onInput: vi.fn(), onSubmit: vi.fn() };

  return render(() => <LoginPanel {...{ ...defaults, ...overrides }} />);
}

function renderInteractivePanel() {
  const onSubmit = vi.fn();

  return {
    onSubmit,
    ...render(() => {
      const [value, setValue] = createSignal("");
      return <LoginPanel value={value()} pending={false} shakeCount={0} onInput={setValue} onSubmit={onSubmit} />;
    }),
  };
}

describe("LoginPanel", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    invokeMock.mockReset();
    invokeMock.mockResolvedValue([]);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("renders branded header with Lazurite logo", () => {
    renderPanel();

    expect(screen.getByText("Lazurite")).toBeInTheDocument();
    expect(screen.getByText("Powered by Bluesky")).toBeInTheDocument();
    expect(screen.getByText(/sign in with your/i)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Internet Handle" })).toBeInTheDocument();

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

  it("requests autocomplete suggestions for handle-like input", async () => {
    invokeMock.mockResolvedValue([{
      did: "did:plc:alice",
      handle: "alice.bsky.social",
      displayName: "Alice Example",
      avatar: null,
    }]);

    renderInteractivePanel();

    const input = screen.getByPlaceholderText("alice.bsky.social");
    input.focus();
    fireEvent.input(input, { target: { value: "ali" } });
    await vi.advanceTimersByTimeAsync(200);

    expect(invokeMock).toHaveBeenCalledWith("search_login_suggestions", { query: "ali" });
    expect(await screen.findByText("Alice Example")).toBeInTheDocument();
    expect(screen.getByText("@alice.bsky.social")).toBeInTheDocument();
  });

  it("applies the highlighted suggestion on enter instead of submitting immediately", async () => {
    const { onSubmit } = renderInteractivePanel();
    invokeMock.mockResolvedValue([{
      did: "did:plc:alice",
      handle: "alice.bsky.social",
      displayName: "Alice Example",
      avatar: null,
    }]);

    const input = screen.getByPlaceholderText("alice.bsky.social");
    input.focus();
    fireEvent.input(input, { target: { value: "ali" } });
    await vi.advanceTimersByTimeAsync(200);

    fireEvent.keyDown(input, { key: "Enter" });

    expect(screen.getByDisplayValue("alice.bsky.social")).toBeInTheDocument();
    expect(onSubmit).not.toHaveBeenCalled();
  });
});

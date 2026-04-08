import { fireEvent, render, screen, waitFor } from "@solidjs/testing-library";
import { createSignal } from "solid-js";
import { describe, expect, it, vi } from "vitest";
import { ContextMenu, type ContextMenuAnchor } from "../ContextMenu";

function TestMenu(props: { anchor: ContextMenuAnchor | null; onClose?: () => void }) {
  const [open, setOpen] = createSignal(true);
  const [triggerRef, setTriggerRef] = createSignal<HTMLButtonElement>();

  return (
    <div>
      <button ref={setTriggerRef}>Trigger</button>
      <ContextMenu
        anchor={props.anchor}
        items={[{ label: "First action", onSelect: vi.fn() }, { label: "Second action", onSelect: vi.fn() }]}
        label="Test menu"
        open={open()}
        returnFocusTo={triggerRef()}
        onClose={() => {
          props.onClose?.();
          setOpen(false);
        }} />
    </div>
  );
}

describe("ContextMenu", () => {
  it("renders menuitems and closes on outside pointerdown", async () => {
    const onClose = vi.fn();
    render(() => <TestMenu anchor={{ kind: "point", x: 100, y: 80 }} onClose={onClose} />);

    expect(screen.getByRole("menu", { name: "Test menu" })).toBeInTheDocument();
    fireEvent.pointerDown(document.body);
    await waitFor(() => expect(onClose).toHaveBeenCalledTimes(1));
  });

  it("supports keyboard navigation and escape close", async () => {
    const onClose = vi.fn();
    render(() => <TestMenu anchor={{ kind: "point", x: 100, y: 80 }} onClose={onClose} />);

    const menu = screen.getByRole("menu", { name: "Test menu" });
    await waitFor(() => expect(screen.getByRole("menuitem", { name: "First action" })).toHaveFocus());
    fireEvent.keyDown(menu, { key: "ArrowDown" });
    await waitFor(() => expect(screen.getByRole("menuitem", { name: "Second action" })).toHaveFocus());

    fireEvent.keyDown(menu, { key: "Escape" });
    await waitFor(() => expect(onClose).toHaveBeenCalledTimes(1));
  });

  it("returns focus to the trigger after closing", async () => {
    render(() => <TestMenu anchor={{ kind: "point", x: 100, y: 80 }} />);

    fireEvent.pointerDown(document.body);
    await waitFor(() => expect(screen.getByRole("button", { name: "Trigger" })).toHaveFocus());
  });
});

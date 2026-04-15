import { Icon } from "$/components/shared/Icon";
import { clamp } from "$/lib/utils/text";
import { createEffect, createMemo, createSignal, For, onCleanup, Show } from "solid-js";
import { Portal } from "solid-js/web";

export type ContextMenuAnchor = { kind: "element"; rect: DOMRect } | { kind: "point"; x: number; y: number };

export type ContextMenuItem = {
  disabled?: boolean;
  icon?: string;
  label: string;
  onSelect: () => void;
  tone?: "default" | "danger";
};

type ContextMenuProps = {
  anchor: ContextMenuAnchor | null;
  items: ContextMenuItem[];
  label: string;
  onClose: () => void;
  open: boolean;
  returnFocusTo?: HTMLElement | null;
};

const MENU_MARGIN = 8;

export function ContextMenu(props: ContextMenuProps) {
  const [activeIndex, setActiveIndex] = createSignal(-1);
  const [menuStyle, setMenuStyle] = createSignal<Record<string, string>>({});
  let menuRef: HTMLDivElement | undefined;
  let previousOpen = false;
  const enabledItems = createMemo(() => props.items.filter((item) => !item.disabled));

  createEffect(() => {
    if (!props.open || !props.anchor || !menuRef) {
      return;
    }

    const anchor = props.anchor;
    const initialIndex = props.items.findIndex((item) => !item.disabled);
    queueMicrotask(() => {
      positionMenu(anchor, initialIndex);
    });
  });

  createEffect(() => {
    if (props.open) {
      previousOpen = true;
      return;
    }

    if (previousOpen) {
      props.returnFocusTo?.focus();
      previousOpen = false;
      setActiveIndex(-1);
    }
  });

  createEffect(() => {
    if (!props.open) {
      return;
    }

    const handlePointerDown = (event: PointerEvent) => {
      if (menuRef?.contains(event.target as Node)) {
        return;
      }

      props.onClose();
    };

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        props.onClose();
      }
    };

    globalThis.addEventListener("pointerdown", handlePointerDown, true);
    globalThis.addEventListener("keydown", handleKeyDown);
    onCleanup(() => {
      globalThis.removeEventListener("pointerdown", handlePointerDown, true);
      globalThis.removeEventListener("keydown", handleKeyDown);
    });
  });

  function focusItem(index: number) {
    const nextIndex = index < 0 ? props.items.findIndex((item) => !item.disabled) : index;
    if (nextIndex < 0) {
      return;
    }

    setActiveIndex(nextIndex);
    queueMicrotask(() => {
      menuRef?.querySelectorAll<HTMLButtonElement>("[role='menuitem']")[nextIndex]?.focus();
    });
  }

  function moveFocus(direction: 1 | -1) {
    const items = props.items;
    if (enabledItems().length === 0) {
      return;
    }

    let index = activeIndex();
    for (let offset = 0; offset < items.length; offset += 1) {
      index = (index + direction + items.length) % items.length;
      if (!items[index]?.disabled) {
        focusItem(index);
        return;
      }
    }
  }

  function positionMenu(anchor: ContextMenuAnchor, initialIndex: number) {
    if (!menuRef) {
      return;
    }

    const width = menuRef.offsetWidth;
    const height = menuRef.offsetHeight;
    const viewportWidth = globalThis.innerWidth;
    const viewportHeight = globalThis.innerHeight;
    const preferredLeft = anchor.kind === "point" ? anchor.x : anchor.rect.right - width;
    const preferredTop = anchor.kind === "point" ? anchor.y : anchor.rect.bottom + 8;
    const fallbackTop = anchor.kind === "point" ? anchor.y - height : anchor.rect.top - height - 8;
    const left = clamp(preferredLeft, MENU_MARGIN, viewportWidth - width - MENU_MARGIN);
    const top = preferredTop + height > viewportHeight - MENU_MARGIN
      ? clamp(fallbackTop, MENU_MARGIN, viewportHeight - height - MENU_MARGIN)
      : clamp(preferredTop, MENU_MARGIN, viewportHeight - height - MENU_MARGIN);

    setMenuStyle({ left: `${left}px`, top: `${top}px` });
    focusItem(initialIndex);
  }

  return (
    <Portal>
      <Show when={props.open && props.anchor}>
        <div class="fixed inset-0 z-60">
          <div
            ref={(element) => {
              menuRef = element;
            }}
            class="fixed min-w-48 rounded-2xl bg-surface-container-high/95 p-1.5 shadow-[0_16px_50px_rgba(0,0,0,0.45),inset_0_0_0_1px_rgba(255,255,255,0.05)] backdrop-blur-[20px]"
            role="menu"
            aria-label={props.label}
            style={menuStyle()}
            onKeyDown={(event) => {
              switch (event.key) {
                case "ArrowDown": {
                  event.preventDefault();
                  moveFocus(1);
                  break;
                }
                case "ArrowUp": {
                  event.preventDefault();
                  moveFocus(-1);
                  break;
                }
                case "Home": {
                  event.preventDefault();
                  focusItem(props.items.findIndex((item) => !item.disabled));
                  break;
                }
                case "End": {
                  event.preventDefault();
                  focusItem(findLastEnabledIndex(props.items));
                  break;
                }
                default: {
                  break;
                }
              }
            }}
            onPointerDown={(event) => event.stopPropagation()}>
            <For each={props.items}>
              {(item, index) => (
                <button
                  type="button"
                  role="menuitem"
                  tabIndex={index() === activeIndex() ? 0 : -1}
                  class="flex w-full items-center gap-2 rounded-xl border-0 bg-transparent px-3 py-2.5 text-left text-sm text-on-surface transition duration-150 hover:bg-white/6 disabled:cursor-not-allowed disabled:opacity-50"
                  classList={{ "text-error hover:bg-[rgba(138,31,31,0.18)]": item.tone === "danger" }}
                  disabled={item.disabled}
                  onFocus={() => setActiveIndex(index())}
                  onClick={() => {
                    if (item.disabled) {
                      return;
                    }

                    item.onSelect();
                    props.onClose();
                  }}>
                  <Show when={item.icon}>{(icon) => <Icon aria-hidden iconClass={icon()} class="text-base" />}</Show>
                  <span>{item.label}</span>
                </button>
              )}
            </For>
          </div>
        </div>
      </Show>
    </Portal>
  );
}

function findLastEnabledIndex(items: ContextMenuItem[]) {
  for (let index = items.length - 1; index >= 0; index -= 1) {
    if (!items[index]?.disabled) {
      return index;
    }
  }

  return -1;
}

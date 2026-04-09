import { For } from "solid-js";
import { SettingsCard } from "./SettingsCard";

type ShortcutEntry = { action: string; keys: string };

type ShortcutGroup = { entries: ShortcutEntry[]; title: string };

const KEYBOARD_GROUPS: ShortcutGroup[] = [{
  title: "Global",
  entries: [{ action: "Open settings (outside text inputs)", keys: "," }, {
    action: "Open composer from anywhere",
    keys: "Ctrl+Shift+N",
  }],
}, {
  title: "Feed & Composer",
  entries: [
    { action: "Switch pinned feeds", keys: "1-9" },
    { action: "Move focused post", keys: "j / k" },
    { action: "Like focused post", keys: "l" },
    { action: "Reply to focused post", keys: "r" },
    { action: "Repost focused post", keys: "t" },
    { action: "Open focused thread", keys: "o / Enter" },
    { action: "Open composer", keys: "n" },
    { action: "Save draft (composer open)", keys: "Ctrl/Cmd+S" },
    { action: "Open drafts list", keys: "Ctrl/Cmd+D" },
  ],
}, {
  title: "Search",
  entries: [{ action: "Focus search input", keys: "/ or Ctrl/Cmd+F" }, {
    action: "Cycle post search modes",
    keys: "Tab",
  }, { action: "Clear query / close profile suggestions", keys: "Escape" }],
}, {
  title: "Deck & Diagnostics",
  entries: [
    { action: "Add deck column", keys: "Ctrl/Cmd+Shift+N" },
    { action: "Close last deck column", keys: "Ctrl/Cmd+Shift+W" },
    { action: "Switch diagnostics tabs", keys: "1-5" },
    { action: "Close diagnostics view", keys: "Escape" },
  ],
}, {
  title: "Explorer",
  entries: [{ action: "Focus explorer input", keys: "Ctrl/Cmd+L" }, {
    action: "Navigate up one level",
    keys: "Backspace",
  }, { action: "Back / forward", keys: "Ctrl/Cmd+[ or Ctrl/Cmd+]" }],
}, {
  title: "Messaging & Overlays",
  entries: [{ action: "Send message", keys: "Enter" }, {
    action: "Insert newline in message composer",
    keys: "Shift+Enter",
  }, { action: "Close thread drawer, image gallery, and menus", keys: "Escape" }],
}];

const CLICK_GROUPS: ShortcutGroup[] = [{
  title: "Core Click Combos",
  entries: [
    { action: "Open repost menu (choose repost or quote)", keys: "Click Repost" },
    { action: "Toggle repost directly", keys: "Shift+Click Repost" },
    { action: "Open likes engagement list", keys: "Shift+Click Like" },
    { action: "Open quotes engagement list", keys: "Shift+Click Quote" },
    { action: "Open post actions menu", keys: "Right-click post" },
    { action: "Open thread", keys: "Click post body" },
  ],
}];

export function SettingsHelp() {
  return (
    <SettingsCard icon="info" title="Help">
      <div class="grid gap-5">
        <For each={KEYBOARD_GROUPS}>{(group) => <ShortcutGroupBlock group={group} />}</For>
        <For each={CLICK_GROUPS}>{(group) => <ShortcutGroupBlock group={group} />}</For>
      </div>
    </SettingsCard>
  );
}

function ShortcutGroupBlock(props: { group: ShortcutGroup }) {
  return (
    <section class="grid gap-2">
      <p class="m-0 text-xs uppercase tracking-[0.12em] text-on-surface-variant">{props.group.title}</p>
      <div class="grid gap-2">
        <For each={props.group.entries}>{(entry) => <ShortcutLine action={entry.action} keys={entry.keys} />}</For>
      </div>
    </section>
  );
}

function ShortcutLine(props: ShortcutEntry) {
  return (
    <div class="tone-muted flex items-center justify-between gap-3 rounded-2xl px-3 py-2.5 shadow-(--inset-shadow)">
      <span class="text-sm text-on-surface">{props.action}</span>
      <kbd class="ui-input-strong rounded-full px-2 py-1 text-[0.68rem] uppercase tracking-[0.08em] text-primary">
        {props.keys}
      </kbd>
    </div>
  );
}

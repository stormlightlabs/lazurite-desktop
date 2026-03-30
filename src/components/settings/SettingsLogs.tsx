import type { LogEntry, LogLevelFilter } from "$/lib/types";
import { For, Show } from "solid-js";
import { Motion, Presence } from "solid-motionone";
import { Icon } from "../shared/Icon";
import { SegmentedControl } from "../shared/SegmentedControl";
import { SettingsCard } from "./SettingsCard";

const LOG_LEVEL_OPTIONS: { value: LogLevelFilter; label: string }[] = [
  { value: "all", label: "All" },
  { value: "info", label: "Info" },
  { value: "warn", label: "Warn" },
  { value: "error", label: "Error" },
];

type SettingsLogsProps = {
  expanded: boolean;
  logLevel: LogLevelFilter;
  handleChange: (level: LogLevelFilter) => void;
  logs: LogEntry[];
  loadLogs: () => Promise<void>;
  expand: (expanded: boolean) => void;
};

export function SettingsLogs(props: SettingsLogsProps) {
  const expanded = () => props.expanded;
  const level = () => props.logLevel;
  const logs = () => props.logs;
  return (
    <SettingsCard icon="computer" title="Logs">
      <div class="grid gap-3">
        <div class="flex items-center justify-between">
          <SegmentedControl options={LOG_LEVEL_OPTIONS} value={level()} onChange={(v) => props.handleChange(v)} />
          <div class="flex gap-2">
            <button
              type="button"
              onClick={() => {
                void navigator.clipboard.writeText(
                  logs().map((l) => `[${l.timestamp}] ${l.level}: ${l.message}`).join("\n"),
                );
              }}
              class="rounded-lg border border-white/20 px-3 py-1.5 text-xs font-medium text-on-surface transition hover:bg-white/5">
              Copy all
            </button>
            <button
              type="button"
              onClick={() => void props.loadLogs()}
              class="rounded-lg border border-white/20 px-3 py-1.5 text-xs font-medium text-on-surface transition hover:bg-white/5">
              Refresh
            </button>
          </div>
        </div>
        <button
          type="button"
          onClick={() => props.expand(!expanded())}
          class="flex items-center justify-between rounded-lg bg-black/40 px-4 py-2 text-sm text-on-surface transition hover:bg-black/50">
          <span>{expanded() ? "Collapse" : "Expand"} log viewer</span>
          <Icon kind={expanded() ? "close" : "menu"} class="text-xs" />
        </button>
        <Presence>
          <Show when={expanded()}>
            <LogDisplay logs={logs()} />
          </Show>
        </Presence>
      </div>
    </SettingsCard>
  );
}

function LogDisplay(props: { logs: LogEntry[] }) {
  return (
    <Motion.div
      class="overflow-hidden"
      initial={{ height: 0 }}
      animate={{ height: "auto" }}
      exit={{ height: 0 }}
      transition={{ duration: 0.2 }}>
      <div class="max-h-48 overflow-y-auto rounded-xl bg-black/50 p-4 font-mono text-xs">
        <For each={props.logs} fallback={<p class="text-on-surface-variant">No log entries found</p>}>
          {(log) => (
            <div class="mb-1 flex gap-3">
              <span class="text-on-surface-variant">{log.timestamp?.split("T")[1]?.slice(0, 8) ?? "--:--:--"}</span>
              <span
                classList={{
                  "text-primary": log.level === "INFO",
                  "text-yellow-400": log.level === "WARN",
                  "text-red-400": log.level === "ERROR",
                }}>
                {log.level}
              </span>
              <span class="text-on-secondary-container">{log.message}</span>
            </div>
          )}
        </For>
      </div>
    </Motion.div>
  );
}

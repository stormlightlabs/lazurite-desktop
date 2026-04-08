import type { LogEntry, LogLevelFilter } from "$/lib/types";
import { formatLogCopyLine, formatLogTimestamp } from "$/lib/utils/text";
import { createMemo, For, Show } from "solid-js";
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

function ExpandButton(props: { expanded: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={() => props.onClick()}
      class="ui-input-strong flex items-center justify-between rounded-lg border px-4 py-2 text-sm text-on-surface transition hover:bg-surface-bright ui-outline-subtle">
      <Show
        when={props.expanded}
        fallback={
          <>
            <span>Expand Logs</span>
            <Icon kind="menu" class="text-xs" />
          </>
        }>
        <>
          <span>Collapse Logs</span>
          <Icon kind="close" class="text-xs" />
        </>
      </Show>
    </button>
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
      <div class="ui-input-strong max-h-64 overflow-y-auto rounded-xl border p-4 font-mono text-xs ui-outline-subtle">
        <For each={props.logs} fallback={<p class="text-on-surface-variant">No log entries found</p>}>
          {(log) => (
            <div class="tone-muted mb-2 grid gap-2 rounded-xl px-3 py-2 md:grid-cols-[auto_auto_auto_minmax(0,1fr)] md:items-start">
              <span class="text-on-surface-variant">{formatLogTimestamp(log.timestamp)}</span>
              <span
                class="font-semibold"
                classList={{
                  "text-on-surface-variant": log.level === "DEBUG" || log.level === "TRACE",
                  "text-primary": log.level === "INFO",
                  "text-yellow-400": log.level === "WARN",
                  "text-red-400": log.level === "ERROR",
                }}>
                {log.level}
              </span>
              <span class="break-all text-on-surface-variant">{log.target ?? "app"}</span>
              <span class="whitespace-pre-wrap wrap-break-word text-on-secondary-container">{log.message}</span>
            </div>
          )}
        </For>
      </div>
    </Motion.div>
  );
}

export function SettingsLogs(props: SettingsLogsProps) {
  const expanded = () => props.expanded;
  const level = () => props.logLevel;
  const logs = () => props.logs;
  const output = createMemo(() => logs().map((log) => formatLogCopyLine(log)).join("\n"));
  return (
    <SettingsCard icon="computer" title="Logs">
      <div class="grid gap-3">
        <div class="flex items-center justify-between">
          <SegmentedControl options={LOG_LEVEL_OPTIONS} value={level()} onChange={(v) => props.handleChange(v)} />
          <div class="flex gap-2">
            <button
              type="button"
              onClick={() => {
                void navigator.clipboard.writeText(output());
              }}
              class="ui-button-secondary px-3 py-1.5 text-xs">
              Copy all
            </button>
            <button type="button" onClick={() => void props.loadLogs()} class="ui-button-secondary px-3 py-1.5 text-xs">
              Refresh
            </button>
          </div>
        </div>
        <ExpandButton expanded={expanded()} onClick={() => props.expand(!expanded())} />
        <Presence>
          <Show when={expanded()}>
            <LogDisplay logs={logs()} />
          </Show>
        </Presence>
      </div>
    </SettingsCard>
  );
}

import type { AppSettings, RefreshInterval } from "$/lib/types";
import { SegmentedControl } from "../shared/SegmentedControl";
import { SettingsCard } from "./SettingsCard";

const REFRESH_OPTIONS: { value: RefreshInterval; label: string }[] = [
  { value: 30, label: "30s" },
  { value: 60, label: "1m" },
  { value: 120, label: "2m" },
  { value: 300, label: "5m" },
  { value: 0, label: "Manual" },
];

export function TimelineControl(
  props: {
    currentRefresh: RefreshInterval;
    handleUpdateSetting: (key: keyof AppSettings, value: string | number) => void;
  },
) {
  return (
    <SettingsCard icon="timeline" title="Timeline">
      <div class="flex items-center justify-between gap-4">
        <div>
          <p class="text-sm font-medium text-on-surface">Auto-refresh interval</p>
          <p class="text-xs text-on-surface-variant">How often to check for new posts</p>
        </div>
        <SegmentedControl
          options={REFRESH_OPTIONS}
          value={props.currentRefresh}
          onChange={(v) => void props.handleUpdateSetting("timelineRefreshSecs", v)} />
      </div>
    </SettingsCard>
  );
}

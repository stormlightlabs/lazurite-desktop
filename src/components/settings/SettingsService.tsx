import type { AppSettings } from "$/lib/types";
import { SettingsCard } from "./SettingsCard";
import { ToggleRow } from "./SettingsToggleRow";

export function SettingsService(
  props: {
    settings: AppSettings | null;
    handleUpdateSetting: (key: keyof AppSettings, value: string | boolean | number) => Promise<void>;
  },
) {
  const constellationUrl = () => props.settings?.constellationUrl ?? "https://constellation.microcosm.blue";
  const spacedustUrl = () => props.settings?.spacedustUrl ?? "https://spacedust.microcosm.blue";
  const spacedustEnabled = () => props.settings?.spacedustEnabled ?? false;
  const spacedustInstant = () => props.settings?.spacedustInstant ?? false;
  return (
    <SettingsCard icon="services" title="Services">
      <div class="grid gap-4">
        <div>
          <label class="mb-2 block text-sm font-medium text-on-surface">Constellation URL</label>
          <div class="flex gap-2">
            <input
              type="text"
              value={constellationUrl()}
              onChange={(e) => void props.handleUpdateSetting("constellationUrl", e.currentTarget.value)}
              class="ui-input flex-1" />
          </div>
        </div>
        <div>
          <label class="mb-2 block text-sm font-medium text-on-surface">Spacedust URL</label>
          <div class="flex gap-2">
            <input
              type="text"
              value={spacedustUrl()}
              onChange={(e) => void props.handleUpdateSetting("spacedustUrl", e.currentTarget.value)}
              class="ui-input flex-1" />
          </div>
        </div>
        <ToggleRow
          label="Use Spacedust for real-time"
          description="WebSocket push notifications"
          checked={spacedustEnabled()}
          onChange={() => void props.handleUpdateSetting("spacedustEnabled", !spacedustEnabled())} />
        <ToggleRow
          label="Instant mode"
          description="Bypass 21s debounce buffer"
          checked={spacedustInstant()}
          onChange={() => void props.handleUpdateSetting("spacedustInstant", !spacedustInstant())} />
      </div>
    </SettingsCard>
  );
}

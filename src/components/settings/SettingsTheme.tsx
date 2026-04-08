import type { AppSettings, Theme } from "$/lib/types";
import { SegmentedControl } from "../shared/SegmentedControl";
import { SettingsCard } from "./SettingsCard";
import { ToggleRow } from "./SettingsToggleRow";

const THEME_OPTIONS: { value: Theme; label: string }[] = [{ value: "light", label: "Light" }, {
  value: "dark",
  label: "Dark",
}, { value: "auto", label: "Auto" }];

export function AppearanceControl(
  props: {
    currentTheme: Theme;
    handleUpdateSetting: (key: keyof AppSettings, value: string) => void;
    setShowThemeRailControl: (enabled: boolean) => void;
    showThemeRailControl: boolean;
  },
) {
  return (
    <SettingsCard icon="theme" title="Appearance">
      <div class="grid gap-4">
        <div class="flex items-center justify-between">
          <div>
            <p class="text-sm font-medium text-on-surface">Theme</p>
            <p class="text-xs text-on-surface-variant">Choose your preferred color scheme</p>
          </div>
          <SegmentedControl
            options={THEME_OPTIONS}
            value={props.currentTheme}
            onChange={(v) => void props.handleUpdateSetting("theme", v)} />
        </div>
        <ToggleRow
          label="Show theme control in app rail"
          description="Keep the System, Light, and Dark menu visible in the rail."
          checked={props.showThemeRailControl}
          onChange={() => props.setShowThemeRailControl(!props.showThemeRailControl)} />
      </div>
    </SettingsCard>
  );
}

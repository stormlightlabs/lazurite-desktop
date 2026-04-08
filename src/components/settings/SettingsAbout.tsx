import * as logger from "@tauri-apps/plugin-log";
import { openUrl } from "@tauri-apps/plugin-opener";
import { SettingsCard } from "./SettingsCard";

export function SettingsAbout() {
  return (
    <SettingsCard icon="info" title="About">
      <div class="grid gap-4">
        <div class="flex items-center justify-between">
          <div>
            <p class="text-sm font-medium text-on-surface">Version</p>
            <p class="text-xs text-on-surface-variant">0.1.0-alpha</p>
          </div>
          <button
            type="button"
            onClick={() => logger.info("checking for updates...")}
            class="inline-flex items-center justify-center gap-2 rounded-full border-0 bg-primary px-4 py-2 text-sm font-medium text-on-primary-fixed transition hover:opacity-90">
            Check for updates
          </button>
        </div>
        <div class="flex items-center justify-between">
          <div>
            <p class="text-sm font-medium text-on-surface">License</p>
            <p class="text-xs text-on-surface-variant">MIT License</p>
          </div>
          <button
            type="button"
            onClick={() => void openUrl("https://github.com/stormlightlabs/lazurite/blob/main/LICENSE")}
            class="ui-button-secondary">
            View license
          </button>
        </div>
        <div class="flex items-center justify-between">
          <div>
            <p class="text-sm font-medium text-on-surface">Source code</p>
            <p class="text-xs text-on-surface-variant">github.com/stormlightlabs/lazurite</p>
          </div>
          <button
            type="button"
            onClick={() => void openUrl("https://github.com/stormlightlabs/lazurite")}
            class="ui-button-secondary">
            Open
          </button>
        </div>
      </div>
    </SettingsCard>
  );
}

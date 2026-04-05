import { SettingsCard } from "./SettingsCard";

type SettingsDangerZoneProps = {
  handleResetAndRestartApp: () => Promise<void>;
  openConfirmation: (
    options: {
      title: string;
      message: string;
      confirmText?: string;
      type?: "default" | "danger";
      onConfirm: () => void;
    },
  ) => void;
};

export function SettingsDangerZone(props: SettingsDangerZoneProps) {
  return (
    <SettingsCard icon="danger" title="Danger Zone">
      <div class="grid gap-4">
        <div class="rounded-2xl bg-[rgba(138,31,31,0.16)] p-4 text-sm text-on-surface">
          <p class="font-medium text-red-300">Clear local data and restart</p>
          <p class="mt-2 text-xs text-on-surface-variant">
            This removes every local account, cache entry, saved setting, and synced record, then restarts Lazurite.
          </p>
        </div>
        <div class="flex items-center justify-between gap-4 rounded-2xl bg-black/30 p-4">
          <div>
            <p class="text-sm font-medium text-red-300">Reset application</p>
            <p class="text-xs text-on-surface-variant">Return Lazurite to a clean install state.</p>
          </div>
          <button
            type="button"
            onClick={() =>
              props.openConfirmation({
                title: "Reset And Restart",
                message:
                  "This will clear all local data, return Lazurite to its defaults, and restart the app. Type RESET to confirm.",
                confirmText: "RESET",
                type: "danger",
                onConfirm: () => void props.handleResetAndRestartApp(),
              })}
            class="rounded-lg border border-red-500/30 bg-red-500/10 px-4 py-2 text-sm font-medium text-red-400 transition hover:bg-red-500/20">
            Reset &amp; restart
          </button>
        </div>
      </div>
    </SettingsCard>
  );
}

import type { AppSettings } from "$/lib/types";
import { SettingsCard } from "./SettingsCard";
import { ToggleRow } from "./SettingsToggleRow";

export function NotificationsControl(
  props: {
    handleUpdateSetting?: (key: keyof AppSettings, value: string | boolean) => void;
    settings?: AppSettings | null;
  },
) {
  const notificationsDesktop = () => props.settings?.notificationsDesktop ?? true;
  const notificationsBadge = () => props.settings?.notificationsBadge ?? true;
  const notificationsSound = () => props.settings?.notificationsSound ?? false;

  return (
    <SettingsCard icon="notifications" title="Notifications">
      <div class="grid gap-4">
        <ToggleRow
          label="Desktop notifications"
          description="Show OS-level notification popups"
          checked={notificationsDesktop()}
          onChange={() => void props.handleUpdateSetting?.("notificationsDesktop", !notificationsDesktop())} />
        <ToggleRow
          label="Badge count"
          description="Show unread count on dock icon"
          checked={notificationsBadge()}
          onChange={() => void props.handleUpdateSetting?.("notificationsBadge", !notificationsBadge())} />
        <ToggleRow
          label="Sound"
          description="Play sound for new notifications"
          checked={notificationsSound()}
          onChange={() => void props.handleUpdateSetting?.("notificationsSound", !notificationsSound())} />
      </div>
    </SettingsCard>
  );
}

import { EmbeddingsSettings } from "$/components/search/EmbeddingsSettings";
import { useAppPreferences } from "$/contexts/app-preferences";
import { useAppShellUi } from "$/contexts/app-shell-ui";
import { SettingsController } from "$/lib/api/settings";
import type {
  AppSettings,
  CacheClearScope,
  CacheSize,
  LogEntry,
  LogLevelFilter,
  RefreshInterval,
  Theme,
} from "$/lib/types";
import { normalizeError } from "$/lib/utils/text";
import { useNavigate } from "@solidjs/router";
import * as logger from "@tauri-apps/plugin-log";
import { createEffect, createMemo, createSignal, For, onCleanup, onMount, Show } from "solid-js";
import { createStore } from "solid-js/store";
import { Motion, Presence } from "solid-motionone";
import { FollowHygienePanel } from "../profile/FollowHygienePanel";
import { Icon } from "../shared/Icon";
import { SettingsAbout } from "./SettingsAbout";
import { AccountControl } from "./SettingsAccount";
import { SettingsDangerZone } from "./SettingsDangerZone";
import { SettingsData } from "./SettingsData";
import { SettingsDownloads } from "./SettingsDownloads";
import { SettingsHelp } from "./SettingsHelp";
import { SettingsLogs } from "./SettingsLogs";
import { SettingsModeration } from "./SettingsModeration";
import { NotificationsControl } from "./SettingsNotification";
import { SettingsService } from "./SettingsService";
import { AppearanceControl } from "./SettingsTheme";
import { TimelineControl } from "./SettingsTimeline";

type SettingsPanelState = {
  cacheSize: CacheSize | null;
  logLevel: LogLevelFilter;
  logs: LogEntry[];
  logsExpanded: boolean;
  modalConfig: {
    title: string;
    message: string;
    confirmText?: string;
    type?: "danger" | "default";
    onConfirm: () => void;
  } | null;
  modalOpen: boolean;
  followHygieneOpen: boolean;
};

function ConfirmationModal(
  props: {
    confirmText?: string;
    isOpen: boolean;
    message: string;
    onCancel: () => void;
    onConfirm: () => void;
    title: string;
    type?: "danger" | "default";
  },
) {
  const [inputValue, setInputValue] = createSignal("");
  const requiresConfirmText = () => props.confirmText !== undefined;
  const canConfirm = () => !requiresConfirmText() || inputValue() === props.confirmText;

  return (
    <Presence>
      <Show when={props.isOpen}>
        <Motion.div
          class="fixed inset-0 z-50 flex items-center justify-center bg-surface-container-highest/70 p-4 backdrop-blur-xl"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.2 }}>
          <Motion.div
            class="w-full max-w-md rounded-2xl bg-surface-container p-6"
            style={{ "box-shadow": "var(--overlay-shadow)" }}
            initial={{ scale: 0.95, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            exit={{ scale: 0.95, opacity: 0 }}
            transition={{ duration: 0.2 }}>
            <h3 class="mb-2 text-lg font-semibold text-on-surface">{props.title}</h3>
            <p class="mb-4 text-sm text-on-surface-variant">{props.message}</p>

            <ConfirmTextInput
              required={requiresConfirmText()}
              value={inputValue()}
              handleInput={setInputValue}
              confirmText={props.confirmText ?? ""} />
            <Actions
              confirmable={canConfirm()}
              type={props.type}
              onConfirm={props.onConfirm}
              onCancel={props.onCancel} />
          </Motion.div>
        </Motion.div>
      </Show>
    </Presence>
  );
}

function ConfirmTextInput(
  props: { required: boolean; value: string; handleInput: (value: string) => void; confirmText: string },
) {
  return (
    <Show when={props.required}>
      <input
        type="text"
        value={props.value}
        onInput={(e) => props.handleInput(e.currentTarget.value)}
        placeholder={`Type "${props.confirmText}" to confirm`}
        class="ui-input mb-4 w-full px-4 py-2" />
    </Show>
  );
}

function Actions(
  props: { confirmable: boolean; type?: "danger" | "default"; onConfirm: () => void; onCancel: () => void },
) {
  return (
    <div class="flex justify-end gap-2">
      <button type="button" onClick={() => props.onCancel()} class="ui-button-secondary">Cancel</button>
      <button
        type="button"
        disabled={!props.confirmable}
        onClick={() => props.onConfirm()}
        class="rounded-lg px-4 py-2 text-sm font-medium text-on-primary-fixed transition disabled:cursor-not-allowed disabled:opacity-50"
        classList={{
          "bg-red-500 hover:bg-red-600": props.type === "danger",
          "bg-primary hover:bg-primary-dim": props.type !== "danger",
        }}>
        Confirm
      </button>
    </div>
  );
}

function SettingsSkeleton() {
  return (
    <div class="grid gap-8">
      <For each={Array.from({ length: 5 })}>
        {() => (
          <div class="panel-surface animate-pulse p-5">
            <div class="mb-4 flex items-center gap-3">
              <div class="h-6 w-6 rounded-full tone-muted" />
              <div class="h-5 w-24 rounded-full tone-muted" />
            </div>
            <div class="grid gap-3">
              <div class="h-10 rounded-lg tone-muted" />
              <div class="h-10 rounded-lg tone-muted" />
            </div>
          </div>
        )}
      </For>
    </div>
  );
}

async function handleResetAndRestartApp() {
  try {
    await SettingsController.resetAndRestartApp();
  } catch (err) {
    logger.error("failed to reset and restart app", { keyValues: { error: normalizeError(err) } });
  }
}

export function SettingsPanel() {
  const preferences = useAppPreferences();
  const shell = useAppShellUi();
  const navigate = useNavigate();
  const [panel, setPanel] = createStore<SettingsPanelState>({
    cacheSize: null,
    followHygieneOpen: false,
    logLevel: "all",
    logs: [],
    logsExpanded: false,
    modalConfig: null,
    modalOpen: false,
  });

  const settings = () => preferences.settings;
  const loading = () => preferences.settingsLoading;

  async function loadCacheSize() {
    try {
      setPanel("cacheSize", await SettingsController.getCacheSize());
    } catch (err) {
      logger.error("failed to load cache size", { keyValues: { error: normalizeError(err) } });
    }
  }

  async function loadLogs(level = panel.logLevel) {
    try {
      setPanel("logs", await SettingsController.getLogEntries(100, level));
    } catch (err) {
      logger.error("failed to load logs", { keyValues: { error: normalizeError(err) } });
    }
  }

  async function handleUpdateSetting(key: keyof AppSettings, value: string | boolean | number) {
    await preferences.updateSetting(key, value);
  }

  async function handleClearCache(scope: CacheClearScope) {
    try {
      await SettingsController.clearCache(scope);
      await loadCacheSize();
    } catch (err) {
      logger.error("failed to clear cache", { keyValues: { scope, error: normalizeError(err) } });
      throw err;
    }
  }

  function openConfirmation(
    config: {
      title: string;
      message: string;
      confirmText?: string;
      type?: "danger" | "default";
      onConfirm: () => void;
    },
  ) {
    setPanel("modalConfig", config);
    setPanel("modalOpen", true);
  }

  onMount(() => {
    void loadCacheSize();
    globalThis.addEventListener("keydown", handleKeyDown);
    onCleanup(() => globalThis.removeEventListener("keydown", handleKeyDown));
  });

  const handleKeyDown = (e: KeyboardEvent) => {
    if (e.key === "Escape" && panel.modalOpen) {
      setPanel("modalOpen", false);
    }
  };

  createEffect(() => {
    void loadLogs(panel.logLevel);
  });

  const currentTheme = createMemo((): Theme => {
    const s = settings();
    if (!s) return "auto";
    const t = s.theme;
    return t === "light" || t === "dark" || t === "auto" ? t : "auto";
  });

  const currentRefresh = createMemo((): RefreshInterval => {
    const s = settings();
    if (!s) return 60;
    const secs = s.timelineRefreshSecs;
    return [30, 60, 120, 300, 0].includes(secs) ? (secs as RefreshInterval) : 60;
  });

  return (
    <article class="grid min-h-0 grid-rows-[auto_1fr] overflow-hidden rounded-4xl bg-surface-container shadow-(--inset-shadow)">
      <header class="grid gap-5 px-6 pb-4 pt-6">
        <div class="flex items-center justify-between gap-4">
          <div class="grid gap-1">
            <p class="overline-copy text-xs text-on-surface-variant">Configuration</p>
            <h1 class="m-0 text-xl font-semibold tracking-tight text-on-surface">Settings</h1>
          </div>
          <button
            type="button"
            onClick={() => navigate(-1)}
            class="ui-control ui-control-hoverable inline-flex h-10 w-10 items-center justify-center rounded-full"
            title="Close settings">
            <Icon kind="close" aria-hidden="true" class="text-lg" />
          </button>
        </div>
      </header>

      <div class="min-h-0 overflow-y-auto px-6 pb-6">
        <div class="mx-auto grid max-w-2xl gap-8">
          <Show
            when={loading()}
            fallback={
              <Presence>
                <Motion.div
                  class="grid gap-8"
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.3 }}>
                  <AppearanceControl
                    currentTheme={currentTheme()}
                    handleUpdateSetting={handleUpdateSetting}
                    showThemeRailControl={shell.showThemeRailControl}
                    setShowThemeRailControl={shell.setShowThemeRailControl} />
                  <TimelineControl currentRefresh={currentRefresh()} handleUpdateSetting={handleUpdateSetting} />
                  <NotificationsControl settings={settings()} handleUpdateSetting={handleUpdateSetting} />
                  <SettingsModeration />
                  <EmbeddingsSettings />
                  <AccountControl
                    openConfirmation={openConfirmation}
                    onOpenFollowHygiene={() => setPanel("followHygieneOpen", true)} />
                  <SettingsService settings={settings()} handleUpdateSetting={handleUpdateSetting} />
                  <SettingsData
                    cacheSize={panel.cacheSize}
                    handleClearCache={handleClearCache}
                    openConfirmation={openConfirmation} />
                  <SettingsDownloads settings={settings()} />
                  <SettingsDangerZone
                    handleResetAndRestartApp={handleResetAndRestartApp}
                    openConfirmation={openConfirmation} />
                  <SettingsLogs
                    expanded={panel.logsExpanded}
                    logLevel={panel.logLevel}
                    handleChange={(level) => setPanel("logLevel", level)}
                    logs={panel.logs}
                    loadLogs={loadLogs}
                    expand={(expanded) => setPanel("logsExpanded", expanded)} />
                  <SettingsHelp />
                  <SettingsAbout />
                </Motion.div>
              </Presence>
            }>
            <SettingsSkeleton />
          </Show>
        </div>
      </div>

      <ConfirmationModal
        isOpen={panel.modalOpen}
        title={panel.modalConfig?.title ?? ""}
        message={panel.modalConfig?.message ?? ""}
        confirmText={panel.modalConfig?.confirmText}
        type={panel.modalConfig?.type}
        onCancel={() => setPanel("modalOpen", false)}
        onConfirm={() => {
          panel.modalConfig?.onConfirm();
          setPanel("modalOpen", false);
        }} />

      <Presence>
        <Show when={panel.followHygieneOpen}>
          <FollowHygienePanel onClose={() => setPanel("followHygieneOpen", false)} />
        </Show>
      </Presence>
    </article>
  );
}

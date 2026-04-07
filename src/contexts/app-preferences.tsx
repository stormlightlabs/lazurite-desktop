import {
  getEmbeddingsConfig,
  prepareEmbeddingsModel as prepareEmbeddingsModelRequest,
  setEmbeddingsEnabled as setEmbeddingsEnabledRequest,
  setEmbeddingsPreflightSeen as setEmbeddingsPreflightSeenRequest,
} from "$/lib/api/search";
import type { EmbeddingsConfig } from "$/lib/api/search";
import { SettingsController } from "$/lib/api/settings";
import type { AppSettings } from "$/lib/types";
import * as logger from "@tauri-apps/plugin-log";
import { createContext, onMount, type ParentProps, splitProps, untrack, useContext } from "solid-js";
import { createStore } from "solid-js/store";

type AppPreferencesState = {
  embeddingsConfig: EmbeddingsConfig | null;
  embeddingsLoading: boolean;
  settings: AppSettings | null;
  settingsLoading: boolean;
};

export type AppPreferencesContextValue = {
  readonly embeddingsConfig: EmbeddingsConfig | null;
  readonly embeddingsEnabled: boolean;
  readonly embeddingsLoading: boolean;
  readonly settings: AppSettings | null;
  readonly settingsLoading: boolean;
  loadEmbeddingsConfig: () => Promise<void>;
  loadSettings: () => Promise<void>;
  prepareEmbeddingsModel: () => Promise<void>;
  refresh: () => Promise<void>;
  setEmbeddingsEnabled: (enabled: boolean) => Promise<void>;
  setEmbeddingsPreflightSeen: (seen: boolean) => Promise<void>;
  updateSetting: (key: keyof AppSettings, value: string | boolean | number) => Promise<void>;
};

const AppPreferencesContext = createContext<AppPreferencesContextValue>();

function createInitialAppPreferencesState(): AppPreferencesState {
  return { embeddingsConfig: null, embeddingsLoading: true, settings: null, settingsLoading: true };
}

function createAppPreferencesValue(): AppPreferencesContextValue {
  const [preferences, setPreferences] = createStore<AppPreferencesState>(createInitialAppPreferencesState());

  async function loadSettings() {
    setPreferences("settingsLoading", true);

    try {
      setPreferences("settings", await SettingsController.getSettings());
    } catch (error) {
      logger.error("failed to load settings", { keyValues: { error: String(error) } });
    } finally {
      setPreferences("settingsLoading", false);
    }
  }

  async function updateSetting(key: keyof AppSettings, value: string | boolean | number) {
    const serialized = typeof value === "boolean" ? (value ? "1" : "0") : String(value);

    try {
      await SettingsController.updateSetting(key, serialized);

      setPreferences("settings", (current) => {
        if (!current) {
          return current;
        }

        return { ...current, [key]: value };
      });
    } catch (error) {
      logger.error("failed to update setting", { keyValues: { key, error: String(error) } });
    }
  }

  async function loadEmbeddingsConfig() {
    setPreferences("embeddingsLoading", true);

    try {
      const nextConfig = await getEmbeddingsConfig();
      setPreferences("embeddingsConfig", nextConfig);
      setPreferences("settings", (current) => {
        if (!current) {
          return current;
        }

        return { ...current, embeddingsEnabled: nextConfig.enabled };
      });
    } catch (error) {
      logger.error("failed to load embeddings config", { keyValues: { error: String(error) } });
    } finally {
      setPreferences("embeddingsLoading", false);
    }
  }

  async function prepareEmbeddingsModel() {
    try {
      const nextConfig = await prepareEmbeddingsModelRequest();
      setPreferences("embeddingsConfig", nextConfig);
      setPreferences("settings", (current) => {
        if (!current) {
          return current;
        }

        return { ...current, embeddingsEnabled: nextConfig.enabled };
      });
    } catch (error) {
      logger.error("failed to prepare embeddings model", { keyValues: { error: String(error) } });
    }
  }

  async function setEmbeddingsEnabled(enabled: boolean) {
    try {
      await setEmbeddingsEnabledRequest(enabled);
      setPreferences("settings", (current) => {
        if (!current) {
          return current;
        }

        return { ...current, embeddingsEnabled: enabled };
      });
      await loadEmbeddingsConfig();
    } catch (error) {
      logger.error("failed to set embeddings enabled", {
        keyValues: { enabled: String(enabled), error: String(error) },
      });
    }
  }

  async function setEmbeddingsPreflightSeen(seen: boolean) {
    try {
      await setEmbeddingsPreflightSeenRequest(seen);
      setPreferences("embeddingsConfig", (current) => current ? { ...current, preflightSeen: seen } : current);
    } catch (error) {
      logger.error("failed to set embeddings preflight seen", {
        keyValues: { seen: String(seen), error: String(error) },
      });
    }
  }

  async function refresh() {
    await Promise.all([loadSettings(), loadEmbeddingsConfig()]);
  }

  onMount(() => {
    void refresh();
  });

  return {
    get embeddingsConfig() {
      return preferences.embeddingsConfig;
    },
    get embeddingsEnabled() {
      return preferences.embeddingsConfig?.enabled ?? preferences.settings?.embeddingsEnabled ?? false;
    },
    get embeddingsLoading() {
      return preferences.embeddingsLoading;
    },
    get settings() {
      return preferences.settings;
    },
    get settingsLoading() {
      return preferences.settingsLoading;
    },
    loadEmbeddingsConfig,
    loadSettings,
    prepareEmbeddingsModel,
    refresh,
    setEmbeddingsEnabled,
    setEmbeddingsPreflightSeen,
    updateSetting,
  };
}

export function AppPreferencesProvider(props: ParentProps) {
  const value = createAppPreferencesValue();

  return <AppPreferencesContext.Provider value={value}>{props.children}</AppPreferencesContext.Provider>;
}

export function AppPreferencesContextProvider(props: ParentProps<{ value: AppPreferencesContextValue }>) {
  const [local] = splitProps(props, ["children", "value"]);
  const value = untrack(() => local.value);

  return <AppPreferencesContext.Provider value={value}>{local.children}</AppPreferencesContext.Provider>;
}

export function useAppPreferences() {
  const context = useContext(AppPreferencesContext);
  if (!context) {
    throw new Error("useAppPreferences must be used within an AppPreferencesProvider");
  }

  return context;
}

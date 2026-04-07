import type { AppSettings, CacheClearScope, CacheSize, ExportFormat, LogEntry, LogLevelFilter } from "$/lib/types";
import { invoke } from "@tauri-apps/api/core";

export function getSettings() {
  return invoke<AppSettings>("get_settings");
}

export function updateSetting(key: string, value: string) {
  return invoke("update_setting", { key, value });
}

export function getCacheSize() {
  return invoke<CacheSize>("get_cache_size");
}

export function clearCache(scope: CacheClearScope) {
  return invoke("clear_cache", { scope });
}

export function exportData(format: ExportFormat, path?: string) {
  const now = Date.now();
  return invoke("export_data", { format, path: path ?? `lazurite_${now}_export.${format}` });
}

function resetApp() {
  return invoke("reset_app");
}

export async function resetAndRestartApp() {
  await resetApp();
  restartClient("/auth");
}

export function getLogEntries(limit: number, level?: LogLevelFilter) {
  const filterLevel = level === "all" ? null : level;
  return invoke<LogEntry[]>("get_log_entries", { limit, level: filterLevel });
}

function restartClient(hash: string) {
  const url = new URL(globalThis.location.href);
  url.hash = hash;
  globalThis.location.replace(url.toString());
  globalThis.setTimeout(() => globalThis.location.reload(), 0);
}

export const SettingsController = {
  getSettings,
  updateSetting,
  getCacheSize,
  clearCache,
  exportData,
  resetAndRestartApp,
  getLogEntries,
};

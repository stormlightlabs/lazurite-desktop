import { getDownloadDirectory, setDownloadDirectory } from "$/lib/api/media";
import type { AppSettings } from "$/lib/types";
import { normalizeError } from "$/lib/utils/text";
import { open } from "@tauri-apps/plugin-dialog";
import * as logger from "@tauri-apps/plugin-log";
import { createEffect, createSignal, onCleanup, onMount, Show } from "solid-js";
import { Icon } from "../shared/Icon";
import { SettingsCard } from "./SettingsCard";

type SettingsDownloadsProps = { settings: AppSettings | null };

type DirectoryFeedback = { kind: "error" | "success"; message: string };

export function SettingsDownloads(props: SettingsDownloadsProps) {
  const [directory, setDirectory] = createSignal("");
  const [pending, setPending] = createSignal(false);
  const [feedback, setFeedback] = createSignal<DirectoryFeedback | null>(null);
  let feedbackTimer: ReturnType<typeof setTimeout> | null = null;

  createEffect(() => {
    const currentDirectory = directory();
    const settingsDirectory = props.settings?.downloadDirectory ?? "";
    if (!currentDirectory && settingsDirectory) {
      setDirectory(settingsDirectory);
    }
  });

  onMount(() => {
    void refreshDirectory();
  });

  onCleanup(() => {
    if (feedbackTimer !== null) {
      clearTimeout(feedbackTimer);
    }
  });

  function dismissFeedback() {
    setFeedback(null);
    if (feedbackTimer !== null) {
      clearTimeout(feedbackTimer);
      feedbackTimer = null;
    }
  }

  function queueFeedback(nextFeedback: DirectoryFeedback) {
    dismissFeedback();
    setFeedback(nextFeedback);
    feedbackTimer = setTimeout(() => {
      setFeedback(null);
      feedbackTimer = null;
    }, 5000);
  }

  async function refreshDirectory() {
    try {
      setDirectory(await getDownloadDirectory());
    } catch (error) {
      logger.error("failed to load download directory", { keyValues: { error: normalizeError(error) } });
      queueFeedback({ kind: "error", message: "Couldn't load your download folder." });
    }
  }

  async function browseForDirectory() {
    if (pending()) {
      return;
    }

    setPending(true);
    dismissFeedback();
    try {
      const selected = await open({ defaultPath: directory() || undefined, directory: true, multiple: false });
      const nextDirectory = coerceDirectorySelection(selected);
      if (!nextDirectory) {
        return;
      }

      await setDownloadDirectory(nextDirectory);
      await refreshDirectory();
      queueFeedback({ kind: "success", message: "Download folder updated." });
    } catch (error) {
      logger.error("failed to set download directory", { keyValues: { error: normalizeError(error) } });
      queueFeedback({ kind: "error", message: toDirectoryErrorMessage(error) });
    } finally {
      setPending(false);
    }
  }

  async function resetToDefaultDirectory() {
    if (pending()) {
      return;
    }

    setPending(true);
    dismissFeedback();
    try {
      await setDownloadDirectory("~/Downloads");
      await refreshDirectory();
      queueFeedback({ kind: "success", message: "Download folder reset to default." });
    } catch (error) {
      logger.error("failed to reset download directory", { keyValues: { error: normalizeError(error) } });
      queueFeedback({ kind: "error", message: toDirectoryErrorMessage(error) });
    } finally {
      setPending(false);
    }
  }

  return (
    <SettingsCard icon="download" title="Downloads">
      <div class="grid gap-4">
        <div>
          <p class="text-sm font-medium text-on-surface">Download folder</p>
          <p class="text-xs text-on-surface-variant">Images and videos are saved here.</p>
        </div>

        <div class="grid gap-2">
          <div class="flex flex-wrap items-center gap-2">
            <input
              type="text"
              readOnly
              value={directory()}
              placeholder="Loading download folder..."
              class="min-w-0 flex-1 rounded-lg border border-white/10 bg-black/40 px-3 py-2 text-sm text-on-surface outline-none" />
            <button
              type="button"
              disabled={pending()}
              onClick={() => void browseForDirectory()}
              class="rounded-lg border border-white/20 px-4 py-2 text-sm font-medium text-on-surface transition hover:bg-white/5 disabled:cursor-wait disabled:opacity-60">
              {pending() ? "Saving..." : "Browse"}
            </button>
          </div>

          <button
            type="button"
            disabled={pending()}
            onClick={() => void resetToDefaultDirectory()}
            class="w-fit border-0 bg-transparent p-0 text-xs font-medium text-primary transition hover:text-primary-dim disabled:cursor-wait disabled:opacity-60">
            Reset to default
          </button>
        </div>

        <Show when={feedback()}>
          {(currentFeedback) => (
            <div
              role={currentFeedback().kind === "error" ? "alert" : "status"}
              aria-live={currentFeedback().kind === "error" ? "assertive" : "polite"}
              class="inline-flex w-fit items-center gap-2 rounded-full bg-surface-container-high px-3 py-1.5 text-sm"
              classList={{
                "text-emerald-300": currentFeedback().kind === "success",
                "text-red-300": currentFeedback().kind === "error",
              }}>
              <Icon kind={currentFeedback().kind === "success" ? "complete" : "danger"} aria-hidden="true" />
              <span>{currentFeedback().message}</span>
            </div>
          )}
        </Show>
      </div>
    </SettingsCard>
  );
}

function coerceDirectorySelection(selection: string | string[] | null): string | null {
  if (!selection) {
    return null;
  }

  if (typeof selection === "string") {
    const trimmed = selection.trim();
    return trimmed.length > 0 ? trimmed : null;
  }

  const first = selection[0];
  if (typeof first !== "string") {
    return null;
  }

  const trimmed = first.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function toDirectoryErrorMessage(error: unknown) {
  const message = normalizeError(error);
  if (/download|directory|folder|writable|exists/iu.test(message)) {
    return "Couldn't save — choose an existing writable folder.";
  }

  return "Couldn't update the download folder.";
}

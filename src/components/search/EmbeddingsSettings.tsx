/* eslint react/jsx-max-depth: ["error", { "max": 5 }] */
import { Icon } from "$/components/shared/Icon";
import { useAppPreferences } from "$/contexts/app-preferences";
import type { EmbeddingsConfig } from "$/lib/api/search";
import { formatBytes, formatEtaSeconds, formatProgress } from "$/lib/utils/text";
import { createEffect, createMemo, createSignal, Match, onCleanup, onMount, Show, Switch } from "solid-js";
import { Motion, Presence } from "solid-motionone";

function ModelDescriptor(props: { config: EmbeddingsConfig | null }) {
  return (
    <p class="m-0 text-xs text-on-surface-variant flex items-center gap-2">
      <span>{props.config?.modelName ?? "nomic-embed-text-v1.5"}</span>
      <span>·</span>
      <span>{props.config?.dimensions ?? 768}D</span>
      <Show when={props.config?.modelSizeBytes}>
        {(bytes) => (
          <>
            <span>·</span>
            <span>{formatBytes(bytes())} on disk</span>
          </>
        )}
      </Show>
    </p>
  );
}

function EmbedSettingsHeader(props: { config: EmbeddingsConfig | null; isLoading: boolean; handleToggle: () => void }) {
  return (
    <div class="flex items-center gap-4 justify-between">
      <div class="flex gap-2 items-center">
        <Icon
          kind="search"
          class="text-lg text-primary h-11 w-11 items-center justify-center rounded-full bg-primary/15" />

        <p class="text-lg font-medium text-on-surface">Semantic Search</p>
      </div>

      <Show when={props.config}>
        {(current) => (
          <ToggleSwitch
            checked={current().enabled}
            disabled={props.isLoading || current().downloadActive}
            onChange={() => void props.handleToggle()} />
        )}
      </Show>
    </div>
  );
}

function DownloadButton(props: { config: EmbeddingsConfig | null; prepareModel: () => Promise<void> }) {
  return (
    <button
      type="button"
      onClick={() => void props.prepareModel()}
      class="inline-flex items-center justify-center gap-2 rounded-xl border-0 bg-white/8 px-3 py-2 text-xs font-medium text-on-surface transition hover:bg-white/12">
      <Icon kind="download" />
      <Show when={props.config?.lastError} fallback="Prepare model">Retry download</Show>
    </button>
  );
}

function ToggleSwitch(props: { checked: boolean; disabled?: boolean; onChange: () => void }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={props.checked}
      disabled={props.disabled}
      onClick={() => props.onChange()}
      class="relative inline-flex h-6 w-10 items-center rounded-full transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/50 disabled:cursor-not-allowed disabled:opacity-50"
      classList={{ "bg-primary": props.checked, "bg-white/20": !props.checked }}>
      <Motion.span
        class="inline-block h-4 w-4 rounded-full bg-on-primary-fixed shadow-lg"
        animate={{ x: props.checked ? 20 : 2 }}
        transition={{ duration: 0.15, easing: [0.25, 0.1, 0.25, 1] }} />
    </button>
  );
}

function StatusLabel(props: { config: EmbeddingsConfig | null }) {
  return (
    <span class="font-medium text-sm">
      <Switch fallback={<span class="text-on-surface">Loading...</span>}>
        <Match when={props.config?.downloadActive}>
          <span class="text-primary">Downloading model files...</span>
        </Match>
        <Match when={props.config?.downloaded}>
          <span class="text-emerald-300">Model ready</span>
        </Match>
        <Match when={props.config?.lastError}>
          <span class="text-red-300">Download failed</span>
        </Match>
        <Match when={props.config?.enabled}>
          <span class="text-primary">Preparing model cache...</span>
        </Match>
        <Match when={!props.config?.enabled}>
          <span class="text-on-surface-variant">Semantic search is off</span>
        </Match>
      </Switch>
    </span>
  );
}

function StatusLabelWithIcon(props: { config: EmbeddingsConfig | null }) {
  return (
    <span class="flex items-center gap-2 text-sm text-on-surface">
      <Switch>
        <Match when={props.config?.downloadActive}>
          <Icon kind="download" class="text-primary" />
          <span>Downloading model files...</span>
        </Match>
        <Match when={props.config?.downloaded}>
          <Icon kind="complete" class="text-emerald-300" />
          <span>Model ready</span>
        </Match>
        <Match when={props.config?.lastError}>
          <Icon kind="danger" class="text-red-300" />
          <span>Download failed</span>
        </Match>
        <Match when={props.config?.enabled}>
          <Icon kind="download" class="text-primary" />
          <span>Preparing model cache...</span>
        </Match>
        <Match when={!props.config?.enabled}>
          <Icon kind="close" class="text-on-surface-variant" />
          <span>Semantic search is off</span>
        </Match>
      </Switch>
    </span>
  );
}

export function EmbeddingsSettings() {
  const preferences = useAppPreferences();
  const [autoPrepareStarted, setAutoPrepareStarted] = createSignal(false);
  const config = () => preferences.embeddingsConfig;

  async function prepareModel() {
    await preferences.prepareEmbeddingsModel();
  }

  async function handleToggle() {
    const current = config();
    if (!current) {
      return;
    }

    const nextEnabled = !current.enabled;
    await preferences.setEmbeddingsEnabled(nextEnabled);
    if (!nextEnabled) {
      setAutoPrepareStarted(false);
    }
  }

  const ofProgress = createMemo<[number, number] | null>(() => {
    const index = config()?.downloadFileIndex;
    const total = config()?.downloadFileTotal;

    if (typeof index === "number" && typeof total === "number" && total > 0) {
      return [index, total];
    }

    return null;
  });

  createEffect(() => {
    if (!config() && !preferences.embeddingsLoading) {
      void preferences.loadEmbeddingsConfig();
    }
  });

  createEffect(() => {
    const current = config();
    if (!current) {
      return;
    }

    if (!current.enabled) {
      setAutoPrepareStarted(false);
      return;
    }

    if (current.downloaded || current.downloadActive || autoPrepareStarted()) {
      return;
    }

    setAutoPrepareStarted(true);
    void prepareModel();
  });

  onMount(() => {
    const interval = setInterval(() => {
      if (preferences.embeddingsConfig?.downloadActive) {
        void preferences.loadEmbeddingsConfig();
      }
    }, 1000);

    onCleanup(() => clearInterval(interval));
  });

  return (
    <section class="panel-surface grid gap-4 p-5">
      <EmbedSettingsHeader config={config()} isLoading={preferences.embeddingsLoading} handleToggle={handleToggle} />

      <Presence>
        <Show when={config()?.enabled && (!config()?.downloaded || config()?.downloadActive || config()?.lastError)}>
          <Motion.div
            class="grid gap-3 rounded-2xl bg-white/5 p-4"
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            transition={{ duration: 0.2 }}>
            <div class="flex items-center justify-between gap-3">
              <StatusLabelWithIcon config={config()} />
              <span class="text-xs text-on-surface-variant">{formatProgress(config()?.downloadProgress)}</span>
            </div>

            <div class="h-2 overflow-hidden rounded-full bg-white/8">
              <Motion.div
                class="h-full rounded-full bg-linear-to-r from-primary to-primary-dim"
                animate={{ width: `${Math.max(config()?.downloadProgress ?? 0, 2)}%` }}
                transition={{ duration: 0.25 }} />
            </div>

            <div class="grid gap-1 text-xs text-on-surface-variant">
              <Show when={config()?.downloadFile}>
                {(filename) => <p class="m-0">Current file: {filename().split("/").at(-1) ?? filename()}</p>}
              </Show>

              <Show when={ofProgress()}>
                {(value) => {
                  const [index, total] = value();
                  return <p class="m-0">File {index} of {total}</p>;
                }}
              </Show>

              <Show when={config()?.downloadEtaSeconds}>
                {value => <p class="m-0">ETA: {formatEtaSeconds(value())}</p>}
              </Show>

              <Show when={config()?.lastError}>{(message) => <p class="m-0 text-red-300">{message()}</p>}</Show>
            </div>

            <Show when={!config()?.downloadActive && !config()?.downloaded}>
              <DownloadButton config={config()} prepareModel={prepareModel} />
            </Show>
          </Motion.div>
        </Show>
      </Presence>

      <p class="m-0 text-xs leading-relaxed text-on-surface-variant/80">
        Semantic search can find conceptually similar posts even when they do not contain the exact keywords you typed.
      </p>
      <div class="flex items-center gap-2">
        <StatusLabel config={config()} />
        <ModelDescriptor config={config()} />
      </div>
    </section>
  );
}

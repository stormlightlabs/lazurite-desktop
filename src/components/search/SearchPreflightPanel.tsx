import { Icon } from "$/components/shared/Icon";
import { useAppPreferences } from "$/contexts/app-preferences";
import { normalizeSearchReturnRoute } from "$/lib/search-routes";
import { formatBytes, formatEtaSeconds, formatProgress } from "$/lib/utils/text";
import { useLocation, useNavigate } from "@solidjs/router";
import * as logger from "@tauri-apps/plugin-log";
import { createEffect, createMemo, createSignal, onCleanup, onMount, Show } from "solid-js";
import { Motion, Presence } from "solid-motionone";

const ESTIMATED_MODEL_SIZE_BYTES = 1024 * 1024 * 384;

function SearchCapabilityCard(
  props: { body: string; icon: "search" | "explore" | "download"; title: string; tone?: "default" | "primary" },
) {
  return (
    <div
      class="grid gap-3 rounded-3xl p-4 shadow-[inset_0_0_0_1px_rgba(255,255,255,0.04)]"
      classList={{
        "bg-white/[0.035]": props.tone !== "primary",
        "bg-primary/10": props.tone === "primary",
      }}>
      <div class="flex items-center gap-3">
        <span
          class="flex h-11 w-11 items-center justify-center rounded-2xl"
          classList={{
            "bg-white/7 text-on-surface": props.tone !== "primary",
            "bg-primary/18 text-primary": props.tone === "primary",
          }}>
          <Icon kind={props.icon} class="text-lg" />
        </span>
        <p class="m-0 text-sm font-medium text-on-surface">{props.title}</p>
      </div>
      <p class="m-0 text-sm leading-relaxed text-on-surface-variant">{props.body}</p>
    </div>
  );
}

export function SearchPreflightPanel() {
  const preferences = useAppPreferences();
  const location = useLocation();
  const navigate = useNavigate();
  const [activating, setActivating] = createSignal(false);
  const [prepareRequested, setPrepareRequested] = createSignal(false);

  const config = () => preferences.embeddingsConfig;
  const returnRoute = createMemo(() => normalizeSearchReturnRoute(new URLSearchParams(location.search).get("next")));
  const modelSizeLabel = createMemo(() => formatBytes(config()?.modelSizeBytes ?? ESTIMATED_MODEL_SIZE_BYTES));
  const fileProgress = createMemo<[number, number] | null>(() => {
    const index = config()?.downloadFileIndex;
    const total = config()?.downloadFileTotal;

    if (typeof index === "number" && typeof total === "number" && total > 0) {
      return [index, total];
    }

    return null;
  });

  async function dismissPreflight() {
    await preferences.setEmbeddingsPreflightSeen(true);
    void navigate(returnRoute());
  }

  async function enableSemanticSearch() {
    if (activating()) {
      return;
    }

    setActivating(true);
    setPrepareRequested(true);

    try {
      await preferences.setEmbeddingsEnabled(true);
      await preferences.setEmbeddingsPreflightSeen(true);
      await preferences.prepareEmbeddingsModel();
      void navigate(returnRoute());
    } catch (error) {
      logger.error("failed to enable semantic search", { keyValues: { error: String(error) } });
    } finally {
      setActivating(false);
      setPrepareRequested(false);
    }
  }

  createEffect(() => {
    if (!config() && !preferences.embeddingsLoading) {
      void preferences.loadEmbeddingsConfig();
    }
  });

  onMount(() => {
    const interval = setInterval(() => {
      if (prepareRequested() || preferences.embeddingsConfig?.downloadActive) {
        void preferences.loadEmbeddingsConfig();
      }
    }, 1000);

    onCleanup(() => clearInterval(interval));
  });

  return (
    <article class="grid min-h-0 grid-rows-[auto_1fr] overflow-hidden rounded-4xl bg-surface-container shadow-[inset_0_0_0_1px_rgba(255,255,255,0.035)]">
      <header class="grid gap-4 px-6 pb-4 pt-6">
        <div class="grid gap-2">
          <p class="overline-copy text-xs text-on-surface-variant">Optional Setup</p>
          <div class="flex items-start justify-between gap-4">
            <div class="grid gap-2">
              <h1 class="m-0 text-2xl font-semibold tracking-tight text-on-surface">Semantic search is optional</h1>
              <p class="m-0 max-w-2xl text-sm leading-relaxed text-on-surface-variant">
                Keyword and network search work right away. If you want concept matching across your synced likes and
                bookmarks, you can opt into local embeddings. They stay off by default.
              </p>
            </div>

            <button
              type="button"
              onClick={() => void dismissPreflight()}
              class="inline-flex h-10 w-10 items-center justify-center rounded-full border-0 bg-white/6 text-on-surface-variant transition hover:bg-white/10 hover:text-on-surface"
              title="Skip semantic search setup">
              <Icon kind="close" class="text-lg" />
            </button>
          </div>
        </div>
      </header>

      <div class="min-h-0 overflow-y-auto px-6 pb-6">
        <Motion.div
          class="mx-auto grid max-w-4xl gap-6"
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.28 }}>
          <section class="grid gap-4 lg:grid-cols-[1.25fr_0.95fr]">
            <div class="grid gap-4 rounded-[2rem] bg-black/30 p-5 shadow-[inset_0_0_0_1px_rgba(255,255,255,0.04)]">
              <div class="flex items-center justify-between gap-4">
                <div class="grid gap-1">
                  <p class="m-0 text-sm font-medium text-on-surface">What changes if you enable it</p>
                  <p class="m-0 text-xs text-on-surface-variant">
                    Downloads {modelSizeLabel()} of local model files and unlocks semantic + hybrid modes.
                  </p>
                </div>
                <span class="rounded-full bg-primary/12 px-3 py-1 text-[0.68rem] font-medium uppercase tracking-[0.12em] text-primary">
                  Off by default
                </span>
              </div>

              <div class="grid gap-3 md:grid-cols-2">
                <SearchCapabilityCard
                  icon="search"
                  title="Keyword search stays available"
                  body="Search exact words across the posts you already synced. No model download required." />
                <SearchCapabilityCard
                  icon="explore"
                  title="Semantic search becomes available"
                  body="Find related ideas even when a post does not use the exact phrase you typed."
                  tone="primary" />
              </div>
            </div>

            <div class="grid gap-4 rounded-[2rem] bg-white/[0.035] p-5 shadow-[inset_0_0_0_1px_rgba(255,255,255,0.04)]">
              <div class="grid gap-2">
                <p class="m-0 text-sm font-medium text-on-surface">What happens next</p>
                <div class="grid gap-2 text-sm text-on-surface-variant">
                  <p class="m-0">1. Turn on semantic search.</p>
                  <p class="m-0">2. Download the local model immediately.</p>
                  <p class="m-0">3. Use semantic or hybrid mode from Search once setup completes.</p>
                </div>
              </div>

              <div class="grid gap-2 rounded-2xl bg-black/30 p-4 text-xs text-on-surface-variant">
                <p class="m-0 flex items-center gap-2">
                  <Icon kind="db" class="text-primary" />
                  Existing synced posts stay local and can still be searched by keyword.
                </p>
                <p class="m-0 flex items-center gap-2">
                  <Icon kind="download" class="text-primary" />
                  If the model is already cached, re-enabling reuses it instead of downloading again.
                </p>
              </div>
            </div>
          </section>

          <Presence>
            <Show when={config()?.enabled && (prepareRequested() || config()?.downloadActive || config()?.lastError || !config()?.downloaded)}>
              <Motion.section
                class="grid gap-3 rounded-[2rem] bg-primary/8 p-5 shadow-[inset_0_0_0_1px_rgba(125,175,255,0.12)]"
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: "auto" }}
                exit={{ opacity: 0, height: 0 }}
                transition={{ duration: 0.22 }}>
                <div class="flex items-center justify-between gap-3">
                  <div class="flex items-center gap-3">
                    <span class="flex h-10 w-10 items-center justify-center rounded-2xl bg-primary/14 text-primary">
                      <Icon kind={config()?.lastError ? "danger" : "download"} class="text-lg" />
                    </span>
                    <div class="grid gap-1">
                      <p class="m-0 text-sm font-medium text-on-surface">
                        {config()?.lastError ? "Download needs attention" : "Preparing semantic search"}
                      </p>
                      <p class="m-0 text-xs text-on-surface-variant">
                        {config()?.lastError
                          ? "The download stopped before semantic search became available."
                          : "Model files are downloading in the background so semantic search can turn on."}
                      </p>
                    </div>
                  </div>
                  <span class="text-xs text-on-surface-variant">{formatProgress(config()?.downloadProgress)}</span>
                </div>

                <div class="h-2 overflow-hidden rounded-full bg-black/30">
                  <Motion.div
                    class="h-full rounded-full bg-linear-to-r from-primary to-primary-dim"
                    animate={{ width: `${Math.max(config()?.downloadProgress ?? 2, 2)}%` }}
                    transition={{ duration: 0.25 }} />
                </div>

                <div class="grid gap-1 text-xs text-on-surface-variant">
                  <Show when={config()?.downloadFile}>
                    {(filename) => <p class="m-0">Current file: {filename().split("/").at(-1) ?? filename()}</p>}
                  </Show>
                  <Show when={fileProgress()}>
                    {(value) => {
                      const [index, total] = value();
                      return <p class="m-0">File {index} of {total}</p>;
                    }}
                  </Show>
                  <Show when={config()?.downloadEtaSeconds}>
                    {(seconds) => <p class="m-0">ETA: {formatEtaSeconds(seconds())}</p>}
                  </Show>
                  <Show when={config()?.lastError}>
                    {(message) => <p class="m-0 text-red-200">{message()}</p>}
                  </Show>
                </div>
              </Motion.section>
            </Show>
          </Presence>

          <section class="flex flex-wrap items-center justify-between gap-3 rounded-[2rem] bg-white/[0.025] p-5 shadow-[inset_0_0_0_1px_rgba(255,255,255,0.04)]">
            <div class="grid gap-1">
              <p class="m-0 text-sm font-medium text-on-surface">You can change this later from Search or Settings.</p>
              <p class="m-0 text-xs text-on-surface-variant">
                Continue with regular search now, or opt in and let the download finish before returning.
              </p>
            </div>

            <div class="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={() => void dismissPreflight()}
                disabled={activating()}
                class="inline-flex items-center gap-2 rounded-full border-0 bg-white/7 px-4 py-2 text-sm font-medium text-on-surface transition hover:bg-white/10 disabled:cursor-not-allowed disabled:opacity-50">
                <Icon kind="close" class="text-sm" />
                <span>Continue without semantic search</span>
              </button>
              <button
                type="button"
                onClick={() => void enableSemanticSearch()}
                disabled={activating()}
                class="inline-flex items-center gap-2 rounded-full border-0 bg-primary px-4 py-2 text-sm font-medium text-on-primary-fixed transition hover:bg-primary-dim disabled:cursor-not-allowed disabled:opacity-50">
                <Icon kind={activating() ? "loader" : "download"} iconClass={activating() ? "i-ri-loader-4-line animate-spin" : undefined} class="text-sm" />
                <span>{activating() ? "Downloading model..." : "Enable semantic search"}</span>
              </button>
            </div>
          </section>
        </Motion.div>
      </div>
    </article>
  );
}

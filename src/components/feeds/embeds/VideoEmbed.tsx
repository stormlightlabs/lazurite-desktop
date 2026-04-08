import { type MediaNotice, MediaNoticeToast } from "$/components/feeds/MediaNoticeToast";
import { Icon } from "$/components/shared/Icon";
import { MediaController } from "$/lib/api/media";
import type { DownloadProgress } from "$/lib/api/types/media";
import { normalizeError } from "$/lib/utils/text";
import { listen } from "@tauri-apps/api/event";
import { revealItemInDir } from "@tauri-apps/plugin-opener";
import { createMemo, createSignal, onCleanup, Show } from "solid-js";
import type { JSX } from "solid-js";

type VideoEmbedProps = {
  alt?: string;
  aspectRatio?: { height: number; width: number };
  downloadFilename?: string;
  playlist?: string;
  thumbnail?: string;
};

type HlsLike = {
  attachMedia: (video: HTMLVideoElement) => void;
  destroy: () => void;
  loadSource: (url: string) => void;
  on: (event: string, callback: () => void) => void;
};

export function VideoEmbed(props: VideoEmbedProps) {
  const [started, setStarted] = createSignal(false);
  const [downloadPending, setDownloadPending] = createSignal(false);
  const [downloadProgress, setDownloadProgress] = createSignal<DownloadProgress | null>(null);
  const [notice, setNotice] = createSignal<MediaNotice | null>(null);
  const [hlsLoading, setHlsLoading] = createSignal(false);
  let noticeTimer: ReturnType<typeof setTimeout> | null = null;
  let hls: HlsLike | null = null;
  let videoRef: HTMLVideoElement | undefined;

  const aspectRatio = createMemo(() => {
    const ratio = props.aspectRatio;
    if (!ratio || ratio.width <= 0 || ratio.height <= 0) {
      return "16 / 9";
    }

    return `${ratio.width} / ${ratio.height}`;
  });
  const hasPlaylist = createMemo(() => !!props.playlist?.trim());
  const progressLabel = createMemo(() => {
    const progress = downloadProgress();
    if (!progress || progress.totalSegments <= 0) {
      return null;
    }

    return `${progress.downloadedSegments}/${progress.totalSegments}`;
  });

  function dismissNotice() {
    setNotice(null);
    if (noticeTimer !== null) {
      clearTimeout(noticeTimer);
      noticeTimer = null;
    }
  }

  function queueNotice(next: MediaNotice) {
    dismissNotice();
    setNotice(next);
    noticeTimer = setTimeout(() => {
      setNotice(null);
      noticeTimer = null;
    }, 6000);
  }

  function destroyHlsInstance() {
    hls?.destroy();
    hls = null;
  }

  onCleanup(() => {
    destroyHlsInstance();
    if (noticeTimer !== null) {
      clearTimeout(noticeTimer);
    }
  });

  async function play() {
    const playlist = props.playlist?.trim();
    if (!playlist || !videoRef) {
      return;
    }

    setStarted(true);

    try {
      await attachSource(playlist);
      await videoRef.play();
    } catch (error) {
      queueNotice({ kind: "error", message: toPlaybackMessage(error) });
      setStarted(false);
    } finally {
      setHlsLoading(false);
    }
  }

  async function attachSource(url: string) {
    if (!videoRef) {
      return;
    }

    destroyHlsInstance();
    if (!isM3u8Url(url)) {
      videoRef.src = url;
      return;
    }

    if (videoRef.canPlayType("application/vnd.apple.mpegurl")) {
      videoRef.src = url;
      return;
    }

    setHlsLoading(true);
    const { default: Hls } = await import("hls.js");
    if (!Hls.isSupported()) {
      videoRef.src = url;
      return;
    }

    const instance = new Hls();
    instance.on(Hls.Events.MEDIA_ATTACHED, () => {
      instance.loadSource(url);
    });
    instance.attachMedia(videoRef);
    hls = instance as unknown as HlsLike;
  }

  async function handleDownload(event: MouseEvent) {
    event.stopPropagation();
    const playlist = props.playlist?.trim();
    if (!playlist || downloadPending()) {
      return;
    }

    setDownloadPending(true);
    setDownloadProgress(null);
    let unlistenProgress: (() => void) | undefined;
    try {
      unlistenProgress = await listen<DownloadProgress>("download-progress", ({ payload }) => {
        if (payload.url === playlist) {
          setDownloadProgress(payload);
        }
      });
    } catch {
      unlistenProgress = undefined;
    }

    try {
      const requestedFilename = props.downloadFilename?.trim();
      const result = await MediaController.downloadVideo(playlist, requestedFilename ?? null);
      queueNotice({ kind: "success", message: `Saved ${filenameFromPath(result.path)}.`, path: result.path });
    } catch (error) {
      queueNotice({ kind: "error", message: toDownloadErrorMessage(error, "Couldn't save the video right now.") });
    } finally {
      unlistenProgress?.();
      setDownloadPending(false);
      setTimeout(() => setDownloadProgress(null), 500);
    }
  }

  return (
    <>
      <div class="grid min-w-0 gap-2" onClick={(event) => event.stopPropagation()}>
        <VideoPlayerStage
          aspectRatio={aspectRatio()}
          hasPlaylist={hasPlaylist() && !started()}
          hlsLoading={hlsLoading()}
          poster={props.thumbnail}
          started={started()}
          onPlay={() => void play()}
          onVideoRef={(element) => {
            videoRef = element;
          }} />

        <div class="flex min-h-8 flex-wrap items-center justify-between gap-2">
          <Show when={props.alt}>
            {(alt) => <p class="m-0 text-sm leading-normal text-on-surface-variant">{alt()}</p>}
          </Show>
          <button
            type="button"
            disabled={!hasPlaylist() || downloadPending()}
            class="inline-flex items-center gap-1.5 rounded-full border-0 bg-surface-container-high px-3 py-1.5 text-xs text-on-surface transition duration-150 ease-out hover:bg-surface-bright disabled:cursor-wait disabled:opacity-65"
            aria-label="Download video"
            onClick={(event) => void handleDownload(event)}>
            <Icon
              aria-hidden="true"
              iconClass={downloadPending() ? "i-ri-loader-4-line animate-spin" : "i-ri-download-2-line"} />
            <span>
              {downloadPending() ? (progressLabel() ? `Saving ${progressLabel()}` : "Saving...") : "Download"}
            </span>
          </button>
        </div>
      </div>

      <MediaNoticeToast notice={notice()} onDismiss={dismissNotice} onOpenPath={revealItemInDir} />
    </>
  );
}

function containerStyle(ratio: string): JSX.CSSProperties {
  return { "aspect-ratio": ratio };
}

function filenameFromPath(path: string) {
  const parts = path.split(/[/\\]/u);
  return parts.at(-1) || "downloaded file";
}

function isM3u8Url(value: string) {
  return /\.m3u8($|[?#])/iu.test(value);
}

function toDownloadErrorMessage(error: unknown, fallback: string) {
  const message = normalizeError(error);
  if (/download folder|writable|save|directory|exists/iu.test(message)) {
    return "Couldn't save — check that the download folder exists.";
  }

  return fallback;
}

function toPlaybackMessage(error: unknown) {
  const message = normalizeError(error);
  if (!message || message === "AbortError") {
    return "Couldn't start playback.";
  }

  return "Couldn't start playback right now.";
}

function VideoPlayerStage(
  props: {
    aspectRatio: string;
    hasPlaylist: boolean;
    hlsLoading: boolean;
    poster?: string;
    started: boolean;
    onPlay: () => void;
    onVideoRef: (element: HTMLVideoElement) => void;
  },
) {
  return (
    <div
      class="relative w-full overflow-hidden rounded-[1.2rem] bg-black/40 shadow-[inset_0_0_0_1px_rgba(255,255,255,0.05)]"
      style={containerStyle(props.aspectRatio)}>
      <video
        ref={(element) => props.onVideoRef(element)}
        class="h-full w-full object-cover"
        controls={props.started}
        playsinline
        poster={props.poster} />
      <Show when={props.hasPlaylist}>
        <PlayOverlay onPlay={props.onPlay} />
      </Show>
      <Show when={props.hlsLoading}>
        <LoadingBadge />
      </Show>
    </div>
  );
}

function PlayOverlay(props: { onPlay: () => void }) {
  return (
    <button
      type="button"
      aria-label="Play video"
      class="absolute inset-0 grid place-items-center border-0 bg-black/35 backdrop-blur-[2px] transition hover:bg-black/45"
      onClick={() => props.onPlay()}>
      <span class="grid h-16 w-16 place-items-center rounded-full bg-primary/88 text-on-primary-fixed shadow-[0_16px_30px_rgba(0,0,0,0.32)]">
        <Icon aria-hidden="true" iconClass="i-ri-play-fill text-3xl" />
      </span>
    </button>
  );
}

function LoadingBadge() {
  return (
    <div class="absolute left-3 top-3 inline-flex items-center gap-1.5 rounded-full bg-black/50 px-3 py-1.5 text-xs text-on-surface">
      <Icon aria-hidden="true" iconClass="i-ri-loader-4-line animate-spin" />
      <span>Loading stream</span>
    </div>
  );
}

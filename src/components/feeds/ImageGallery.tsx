import { type MediaNotice, MediaNoticeToast } from "$/components/feeds/MediaNoticeToast";
import { ArrowIcon, Icon, LoadingIcon } from "$/components/shared/Icon";
import { MediaController } from "$/lib/api/media";
import { clamp } from "$/lib/utils/text";
import { revealItemInDir } from "@tauri-apps/plugin-opener";
import { createEffect, createMemo, createSignal, onCleanup, Show } from "solid-js";
import { Portal } from "solid-js/web";
import { Motion, Presence } from "solid-motionone";
import { filenameFromPath, toDownloadErrorMessage } from "./embeds/shared";

type GalleryImage = { alt?: string; fullsize?: string; thumb?: string };

type GalleryOverlayProps = {
  authorHandle?: string;
  authorHref?: string;
  downloadPending: boolean;
  expanded: boolean;
  hasManyImages: boolean;
  imageCount: number;
  index: number;
  postText?: string;
  selectedImage: GalleryImage | null;
  showPostTextToggle: boolean;
  onClose: () => void;
  onDownload: () => void;
  onStep: (offset: -1 | 1) => void;
  onToggleExpand: () => void;
};

function GalleryOverlay(props: GalleryOverlayProps) {
  return (
    <Motion.div
      role="dialog"
      aria-modal
      aria-label="Image gallery"
      class="fixed inset-0 z-60 overflow-hidden bg-surface-container-highest/70 p-4 backdrop-blur-[20px] max-[760px]:p-3"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.18 }}>
      <button
        type="button"
        aria-label="Close gallery"
        class="absolute inset-0 border-0 bg-transparent"
        onClick={() => props.onClose()} />

      <div class="pointer-events-none absolute inset-x-4 top-4 z-2 max-[760px]:inset-x-3 max-[760px]:top-3">
        <div class="pointer-events-auto">
          <Toolbar
            current={props.hasManyImages ? props.index + 1 : 1}
            disabled={props.downloadPending}
            total={props.hasManyImages ? props.imageCount : 1}
            onDownload={props.onDownload}
            onClose={props.onClose}
            pending={props.downloadPending} />
        </div>
      </div>

      <div class="relative z-1 h-full min-h-0 w-full px-14 py-3 max-[760px]:px-11">
        <div class="relative mx-auto flex h-full w-full max-w-[min(96rem,100%)] items-center justify-center">
          <img
            class="max-h-full max-w-full rounded-2xl object-contain shadow-[0_30px_60px_rgba(0,0,0,0.35)]"
            src={props.selectedImage?.fullsize ?? props.selectedImage?.thumb}
            alt={props.selectedImage?.alt ?? ""} />

          {props.hasManyImages ? <ArrowButton direction="left" onClick={() => props.onStep(-1)} /> : null}
          {props.hasManyImages ? <ArrowButton direction="right" onClick={() => props.onStep(1)} /> : null}
        </div>
      </div>

      <div class="pointer-events-none absolute inset-x-4 bottom-4 z-2 max-[760px]:inset-x-3 max-[760px]:bottom-3">
        <div class="pointer-events-auto">
          <CaptionPanel
            alt={props.selectedImage?.alt}
            authorHandle={props.authorHandle}
            authorHref={props.authorHref}
            expanded={props.expanded}
            postText={props.postText}
            showToggle={props.showPostTextToggle}
            onToggleExpand={props.onToggleExpand} />
        </div>
      </div>
    </Motion.div>
  );
}

type ToolbarProps = {
  current: number;
  disabled: boolean;
  total: number;
  pending: boolean;
  onDownload: () => void;
  onClose: () => void;
};

function Toolbar(props: ToolbarProps) {
  return (
    <div class="relative z-1 mx-auto flex min-h-10 w-full max-w-[min(96rem,100%)] items-center justify-between gap-3">
      <p class="m-0 text-xs uppercase tracking-[0.12em] text-on-surface-variant">{props.current} / {props.total}</p>
      <div class="flex items-center gap-2">
        <button
          type="button"
          disabled={props.disabled}
          class="inline-flex items-center gap-1.5 rounded-full border-0 bg-surface-container-high px-3 py-1.5 text-xs text-on-surface transition duration-150 ease-out hover:bg-surface-bright disabled:cursor-wait disabled:opacity-65"
          aria-label="Download image"
          onClick={() => props.onDownload()}>
          <LoadingIcon isLoading={props.pending} class="text-base" fallback={<i class="i-ri-download-2-line" />} />
          <span>{props.pending ? "Saving..." : "Download"}</span>
        </button>
        <button
          type="button"
          class="inline-flex h-9 w-9 items-center justify-center rounded-full border-0 bg-surface-container-high text-on-surface-variant transition hover:bg-surface-bright hover:text-on-surface"
          aria-label="Close gallery"
          onClick={() => props.onClose()}>
          <Icon kind="close" aria-hidden />
        </button>
      </div>
    </div>
  );
}

function ArrowButton(props: { direction: "left" | "right"; onClick: () => void }) {
  return (
    <button
      type="button"
      class="absolute top-1/2 z-2 inline-flex h-11 w-11 -translate-y-1/2 items-center justify-center rounded-full border-0 bg-surface-container-high/88 text-on-surface transition hover:bg-surface-container-highest"
      classList={{ "left-1": props.direction === "left", "right-1": props.direction === "right" }}
      aria-label={props.direction === "left" ? "Previous image" : "Next image"}
      onClick={() => props.onClick()}>
      <Show when={props.direction === "left"} fallback={<ArrowIcon aria-hidden direction="right" />}>
        <ArrowIcon direction="left" aria-hidden />
      </Show>
    </button>
  );
}

type CaptionPanelProps = {
  alt?: string;
  authorHandle?: string;
  authorHref?: string;
  expanded: boolean;
  postText?: string;
  showToggle: boolean;
  onToggleExpand: () => void;
};

function CaptionPanel(props: CaptionPanelProps) {
  const label = () => props.expanded ? "Show less" : "Show more";
  return (
    <div class="relative z-1 mx-auto grid w-full max-w-[min(96rem,100%)] gap-2 rounded-2xl bg-surface-container-high/86 p-4 shadow-[inset_0_0_0_1px_rgba(255,255,255,0.05)]">
      <Show when={props.alt}>{(alt) => <p class="m-0 text-sm leading-normal text-on-surface">{alt()}</p>}</Show>
      <Show when={(props.postText ?? "").trim().length > 0}>
        <div class="grid items-start gap-1">
          <p class="m-0 text-xs leading-normal text-on-surface-variant" classList={{ "line-clamp-2": !props.expanded }}>
            {props.postText}
          </p>
          <Show when={props.showToggle}>
            <button
              type="button"
              class="justify-self-start border-0 bg-transparent p-0 text-xs text-primary transition hover:text-on-surface"
              onClick={() => props.onToggleExpand()}>
              {label()}
            </button>
          </Show>
        </div>
      </Show>
      <Show when={props.authorHandle && props.authorHref}>
        <a
          class="justify-self-start text-xs text-primary no-underline transition hover:text-on-surface"
          href={`#${props.authorHref}`}
          title={props.authorHandle}>
          {props.authorHandle}
        </a>
      </Show>
    </div>
  );
}

type ImageGalleryProps = {
  authorHandle?: string;
  authorHref?: string;
  downloadFilenameForIndex?: (index: number) => string | null | undefined;
  images: GalleryImage[];
  open: boolean;
  postText?: string;
  startIndex: number;
  onClose: () => void;
};

export function ImageGallery(props: ImageGalleryProps) {
  const [index, setIndex] = createSignal(0);
  const [expanded, setExpanded] = createSignal(false);
  const [downloadPending, setDownloadPending] = createSignal(false);
  const [notice, setNotice] = createSignal<MediaNotice | null>(null);

  let noticeTimer: ReturnType<typeof setTimeout> | null = null;
  const imageCount = createMemo(() => props.images.length);
  const hasManyImages = createMemo(() => imageCount() > 1);
  const selectedImage = createMemo(() => props.images[index()] ?? null);
  const currentImageUrl = createMemo(() => selectedImage()?.fullsize ?? selectedImage()?.thumb ?? null);
  const showPostTextToggle = createMemo(() => (props.postText ?? "").trim().length > 140);

  createEffect(() => {
    if (!props.open) {
      return;
    }

    const clamped = clamp(props.startIndex, 0, Math.max(imageCount() - 1, 0));
    setIndex(clamped);
    setExpanded(false);
  });

  createEffect(() => {
    if (!props.open) {
      return;
    }

    const handleKeyDown = (event: KeyboardEvent) => {
      switch (event.key) {
        case "Escape": {
          event.preventDefault();
          props.onClose();
          break;
        }
        case "ArrowLeft": {
          if (!hasManyImages()) {
            break;
          }

          event.preventDefault();
          setIndex((current) => (current - 1 + imageCount()) % imageCount());
          break;
        }
        case "ArrowRight": {
          if (!hasManyImages()) {
            break;
          }

          event.preventDefault();
          setIndex((current) => (current + 1) % imageCount());
          break;
        }
        default: {
          break;
        }
      }
    };

    globalThis.addEventListener("keydown", handleKeyDown);
    onCleanup(() => globalThis.removeEventListener("keydown", handleKeyDown));
  });

  onCleanup(() => {
    if (noticeTimer !== null) {
      clearTimeout(noticeTimer);
    }
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

  async function downloadCurrentImage() {
    const currentImage = currentImageUrl();
    if (!currentImage || downloadPending()) {
      return;
    }

    setDownloadPending(true);
    try {
      const requestedFilename = props.downloadFilenameForIndex?.(index())?.trim();
      const result = requestedFilename
        ? await MediaController.downloadImage(currentImage, requestedFilename)
        : await MediaController.downloadImage(currentImage);
      queueNotice({ kind: "success", message: `Saved ${filenameFromPath(result.path)}.`, path: result.path });
    } catch (error) {
      queueNotice({ kind: "error", message: toDownloadErrorMessage(error, "Couldn't save this image right now.") });
    } finally {
      setDownloadPending(false);
    }
  }

  function step(offset: -1 | 1) {
    if (!hasManyImages()) {
      return;
    }

    setIndex((current) => (current + offset + imageCount()) % imageCount());
  }

  return (
    <Portal>
      <Presence>
        <Show when={props.open}>
          {/* FIXME: this needs to be simplified */}
          <GalleryOverlay
            authorHandle={props.authorHandle}
            authorHref={props.authorHref}
            downloadPending={downloadPending()}
            expanded={expanded()}
            hasManyImages={hasManyImages()}
            imageCount={imageCount()}
            index={index()}
            postText={props.postText}
            selectedImage={selectedImage()}
            showPostTextToggle={showPostTextToggle()}
            onClose={props.onClose}
            onDownload={() => void downloadCurrentImage()}
            onStep={step}
            onToggleExpand={() => setExpanded((current) => !current)} />
        </Show>
      </Presence>

      <MediaNoticeToast notice={notice()} onDismiss={dismissNotice} onOpenPath={revealItemInDir} />
    </Portal>
  );
}

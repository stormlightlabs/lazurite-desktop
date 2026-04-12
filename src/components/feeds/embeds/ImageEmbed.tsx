import { ImageGallery } from "$/components/feeds/ImageGallery";
import { type MediaNotice, MediaNoticeToast } from "$/components/feeds/MediaNoticeToast";
import { ContextMenu, type ContextMenuAnchor, type ContextMenuItem } from "$/components/shared/ContextMenu";
import { MediaController } from "$/lib/api/media";
import { getPostText, postRkeyFromUri } from "$/lib/feeds";
import { buildProfileRoute, getProfileRouteActor } from "$/lib/profile";
import type { ImagesEmbedView, PostView } from "$/lib/types";
import { formatHandle } from "$/lib/utils/text";
import { revealItemInDir } from "@tauri-apps/plugin-opener";
import { createMemo, createSignal, For, onCleanup } from "solid-js";
import { filenameFromPath, toDownloadErrorMessage } from "./shared";

function buildImageFilename(postRkey: string | null, imageCount: number, imageIndex: number | null) {
  if (!postRkey) {
    return null;
  }

  if (imageCount > 1 && imageIndex !== null && imageIndex >= 0) {
    return `${postRkey}_${imageIndex + 1}`;
  }

  return postRkey;
}

export function ImageEmbed(props: { embed: ImagesEmbedView; post: PostView }) {
  const images = createMemo(() => props.embed.images.slice(0, 4));
  const postRkey = createMemo(() => postRkeyFromUri(props.post.uri));
  const [galleryStartIndex, setGalleryStartIndex] = createSignal<number | null>(null);
  const [menuAnchor, setMenuAnchor] = createSignal<ContextMenuAnchor | null>(null);
  const [menuOpen, setMenuOpen] = createSignal(false);
  const [menuImageIndex, setMenuImageIndex] = createSignal<number | null>(null);
  const [menuImageUrl, setMenuImageUrl] = createSignal<string | null>(null);
  const [downloadPending, setDownloadPending] = createSignal(false);
  const [notice, setNotice] = createSignal<MediaNotice | null>(null);
  let noticeTimer: ReturnType<typeof setTimeout> | null = null;

  const postText = createMemo(() => getPostText(props.post));
  const authorHandle = createMemo(() => formatHandle(props.post.author.handle, props.post.author.did));
  const profileHref = createMemo(() => buildProfileRoute(getProfileRouteActor(props.post.author)));
  const menuItems = createMemo<ContextMenuItem[]>(
    () => [{
      disabled: !menuImageUrl() || downloadPending(),
      icon: downloadPending() ? "i-ri-loader-4-line animate-spin" : "i-ri-download-2-line",
      label: downloadPending() ? "Saving..." : "Save image",
      onSelect: () => void downloadFromContextMenu(),
    }]
  );

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

  function closeMenu() {
    setMenuOpen(false);
    setMenuAnchor(null);
    setMenuImageIndex(null);
    setMenuImageUrl(null);
  }

  function openGallery(index: number, event: MouseEvent) {
    event.stopPropagation();
    setGalleryStartIndex(index);
  }

  function openImageMenu(event: MouseEvent, url: string | undefined, imageIndex: number) {
    event.preventDefault();
    event.stopPropagation();

    setMenuImageIndex(imageIndex);
    setMenuImageUrl(url ?? null);
    setMenuAnchor({ kind: "point", x: event.clientX, y: event.clientY });
    setMenuOpen(true);
  }

  async function downloadFromContextMenu() {
    const url = menuImageUrl();
    const imageIndex = menuImageIndex();
    if (!url || downloadPending()) {
      return;
    }

    setDownloadPending(true);
    try {
      const requestedFilename = buildImageFilename(postRkey(), images().length, imageIndex)?.trim();
      const result = await MediaController.downloadImage(url, requestedFilename ?? null);

      queueNotice({ kind: "success", message: `Saved ${filenameFromPath(result.path)}.`, path: result.path });
    } catch (error) {
      queueNotice({ kind: "error", message: toDownloadErrorMessage(error, "Couldn't save this image right now.") });
    } finally {
      setDownloadPending(false);
    }
  }

  return (
    <>
      <div class="grid min-w-0 gap-2" classList={{ "grid-cols-2": props.embed.images.length > 1 }}>
        <For each={images()}>
          {(image, index) => (
            <button
              type="button"
              class="ui-input-strong overflow-hidden rounded-[1.2rem] border-0 p-0 shadow-(--inset-shadow)"
              onClick={(event) => openGallery(index(), event)}
              onContextMenu={(event) => openImageMenu(event, image.fullsize ?? image.thumb, index())}>
              <img class="max-h-88 w-full object-cover" src={image.fullsize ?? image.thumb} alt={image.alt ?? ""} />
            </button>
          )}
        </For>
      </div>

      <ImageGallery
        authorHandle={authorHandle()}
        authorHref={profileHref()}
        images={images()}
        open={galleryStartIndex() !== null}
        postText={postText()}
        startIndex={galleryStartIndex() ?? 0}
        downloadFilenameForIndex={(imageIndex) => buildImageFilename(postRkey(), images().length, imageIndex)}
        onClose={() => setGalleryStartIndex(null)} />

      <ContextMenu
        anchor={menuAnchor()}
        items={menuItems()}
        label="Image actions"
        open={menuOpen()}
        onClose={closeMenu} />

      <MediaNoticeToast notice={notice()} onDismiss={dismissNotice} onOpenPath={revealItemInDir} />
    </>
  );
}

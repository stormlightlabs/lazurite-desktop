# Media Viewer & Downloads

In-app media viewing and downloading for images and videos embedded in posts.

## Video Player

BlueSky videos are HLS streams. The `app.bsky.embed.video#view` embed provides a `playlist` URL (m3u8 manifest) and an optional `thumbnail`.

### Playback

- Use the native `<video>` element with HLS.js for manifest parsing (Safari handles HLS natively; HLS.js covers Chromium/WebKit in Tauri).
- Inline player replaces the current thumbnail-as-external-link treatment in `EmbedContent`.
- Controls: play/pause, progress scrubber, volume, fullscreen. Use browser-native controls (`controls` attribute) initially — custom controls are a future polish item.
- Muted autoplay is **off** by default. Player shows thumbnail with a centered play button overlay; playback starts on click.
- Respect `aspectRatio` from the embed to size the player container and prevent layout shift.
- `alt` text from the embed is rendered below the player as a caption when present.

### Fullscreen

- Clicking a "fullscreen" control (or double-click on the player) enters native fullscreen via the Fullscreen API.
- `Escape` exits fullscreen (browser default).

## Image Gallery

Clicking any image in an `ImageEmbed` opens a full-window overlay gallery.

### Overlay

- Glass overlay: `surface_container_highest` at 70% opacity + `backdrop-blur: 20px`.
- The selected image is displayed at its natural resolution (`fullsize` URL), constrained to viewport with `object-contain`.
- `Presence` fade-in on open, fade-out on close.

### Navigation

- Left/right arrows (keyboard and on-screen chevron buttons) cycle through images in the post.
- Indicators (dots or `1/4` counter) show position in the set.
- Single-image posts show no navigation controls.

### Caption

Below the image, display:
- **Alt text** from the image embed (primary caption, `body-md`).
- **Post text** (secondary, `label-sm`, `on_surface_variant`, truncated to 2 lines with "show more" expansion).
- **Author handle** linking to their profile.

### Keyboard

| Key               | Action              |
| ----------------- | ------------------- |
| `Escape`          | Close gallery       |
| `ArrowLeft`       | Previous image      |
| `ArrowRight`      | Next image          |

### Gestures (future)

Pinch-to-zoom and swipe navigation are deferred to a future milestone.

## Downloads

Users can download images and videos to their local filesystem.

### Download Directory

- Default: `~/Downloads`.
- Configurable via a new `download_directory` setting in `app_settings`.
- Settings UI: a path input with a "Browse" button that opens Tauri's directory picker dialog (`dialog.open` with `directory: true`).
- The backend validates that the chosen path exists and is writable before persisting.

### Setting

| Key                  | Type   | Default        | Description                  |
| -------------------- | ------ | -------------- | ---------------------------- |
| `download_directory` | string | `~/Downloads`  | Target directory for saves   |

### Triggering Downloads

- **Images**: a download button (icon: `i-ri-download-2-line`) appears in the gallery overlay toolbar. Downloads the `fullsize` URL. Also available via right-click context menu on inline images.
- **Videos**: a download button in the video player controls area. Downloads the HLS stream — the backend fetches the m3u8 manifest, resolves the highest-quality variant, downloads all segments, and muxes into a single MP4 file.

### Backend

Video download requires server-side work because HLS streams are segmented:

```rust
// Download a media file (image or video) to the configured download directory.
// For images: direct HTTP fetch of the source URL.
// For videos: fetch m3u8 manifest, download segments, concatenate into MP4.
download_media(url: String, media_type: MediaType, filename: Option<String>) -> DownloadResult
```

- `MediaType`: `Image` or `Video`.
- `DownloadResult`: `{ path: String, bytes: u64 }`.
- Filename: derived from URL path if not provided. Collision handling: append `_1`, `_2`, etc.
- The command should emit progress events (`download-progress`) for large video files so the frontend can show a progress indicator.

### Frontend UX

- Download button shows a brief spinner/progress indicator while active.
- On completion: success toast with the filename and "Open in Finder" action (uses `tauri-plugin-opener`).
- On failure: error toast with a human-readable message ("Couldn't save — check that the download folder exists").

## Tauri Capabilities

The following permissions are needed beyond what `default.json` currently grants:

- `dialog:default` — for the directory picker in settings.
- `fs:default` — for writing downloaded files to disk (scoped to the user's download directory).

## Constraints

- HLS.js is a runtime dependency (~60 KB gzipped). It should be lazy-loaded only when a video embed is in view.
- Video muxing on the backend uses raw segment concatenation for MPEG-TS streams. If the CDN serves fMP4 segments, a lightweight remux step is needed — evaluate `mp4` or `ffmpeg-sidecar` crates at implementation time.
- Downloads are not queued or batched in v1. One download at a time; concurrent downloads are a future enhancement.

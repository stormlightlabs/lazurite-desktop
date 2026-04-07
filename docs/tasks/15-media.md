# Milestone 15: Media Viewer & Downloads

Spec: [media.md](../specs/media.md)

Depends on: Milestone 03 (Feeds — PostCard, EmbedContent), Milestone 06 (Settings)

## Steps

### Backend - `src-tauri/src/media.rs` + `src-tauri/src/commands/media.rs`

- [x] Add `DownloadDirectory` variant to `SettingsKey` enum, default to `~/Downloads` via `dirs::download_dir()`
- [x] `get_download_directory()` — resolve current download path (setting or OS default), validate it exists
- [x] `set_download_directory(path: String)` — validate path is a writable directory, persist to `app_settings`
- [x] `download_image(url: String, filename: Option<String>)` — HTTP fetch → write to download dir, return `{ path, bytes }`
- [x] `download_video(url: String, filename: Option<String>)` — fetch m3u8 manifest, resolve best variant, download TS segments, concatenate to MP4, return `{ path, bytes }`
- [x] Emit `download-progress` events during video download for frontend progress UI
- [x] Filename collision handling: append `_1`, `_2`, etc. if file already exists
- [x] Add `dialog:default` and scoped `fs` permissions to `capabilities/default.json`

### Frontend - Video Player (`src/components/feeds/VideoEmbed.tsx`)

- [ ] `VideoEmbed` component: `<video>` element with poster from `thumbnail`, native controls
- [ ] Lazy-load HLS.js — attach to video element only when `playlist` URL is m3u8
- [ ] Click-to-play: show thumbnail + centered play button overlay, start playback on click
- [ ] Respect `aspectRatio` from embed to prevent layout shift
- [ ] Render `alt` text as caption below player when present
- [ ] Replace `ExternalEmbed` fallback in `EmbedContent` switch for `app.bsky.embed.video#view`
- [ ] Download button in player controls area → invoke `download_video` command

### Frontend - Image Gallery (`src/components/feeds/ImageGallery.tsx`)

- [ ] Gallery overlay: glass background (`surface_container_highest` 70% + backdrop-blur 20px)
- [ ] Display `fullsize` image with `object-contain`, constrained to viewport
- [ ] `Presence` fade-in/fade-out transitions
- [ ] Left/right navigation arrows + position indicator for multi-image posts
- [ ] Keyboard: `Escape` close, `ArrowLeft`/`ArrowRight` navigate
- [ ] Caption panel: alt text (`body-md`), post text truncated to 2 lines with expand, author handle as link
- [ ] Download button in gallery toolbar → invoke `download_image` command
- [ ] Wire `ImageEmbed` click handler to open gallery at the clicked image index

### Frontend - Download UX

- [ ] Download button spinner/progress indicator while active
- [ ] Success toast: filename + "Open in Finder" action (via `tauri-plugin-opener`)
- [ ] Error toast: human-readable failure message
- [ ] Right-click context menu on inline images with "Save image" option

### Frontend - Settings Integration

- [ ] Add "Downloads" section to Settings view between "Data" and "Danger Zone"
- [ ] Path display + "Browse" button using Tauri `dialog.open({ directory: true })`
- [ ] "Reset to default" link to restore `~/Downloads`

### Parking Lot

- [ ] Custom video player controls (scrubber, volume, speed)
- [ ] Pinch-to-zoom and swipe gestures in gallery
- [ ] Download queue with concurrent downloads
- [ ] Batch download (all images in a post)
- [ ] Save to custom album/folder per account

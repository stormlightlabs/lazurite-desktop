# Milestone 13: Release

## Overview

Cross-platform build, signing, packaging, and distribution targeting GitHub Releases, Mac App Store, and Microsoft Store. Content moderation (NSFW blurring, reporting, blocking) is a prerequisite for store submission. See [release spec](../specs/release.md) for full details.

## Steps

### Content Moderation

#### Backend

- [ ] `ModerationService` in Rust - fetch labeler policies, evaluate labels into `ModerationDecision`, cache in `labeler_cache` table
- [ ] Send `atproto-accept-labelers` header with all API requests (built-in Bluesky labeler + user-subscribed labelers)
- [ ] Moderation preferences storage - per-account JSON in `app_settings` keyed by `moderation_preferences::{did}`
- [ ] `create_report` command - calls `com.atproto.moderation.createReport`
- [ ] `get_distribution_channel` command - returns compile-time `DISTRIBUTION_CHANNEL` env var

#### Frontend

- [x] `ModeratedBlurOverlay` component - 14px blur, overlay icon, "Show content" button, label display
- [x] `ModeratedAvatar` component - shield icon fallback for hidden avatars
- [x] `ModerationBadgeRow` component - alert (red) and inform (blue) badges with label source
- [x] `ReportDialog` modal - reason type selector, free-text, submit
- [x] Wire moderation into `PostCard`, image/video embeds, profile views, notifications
- [x] Moderation Settings section - adult content toggle (hidden on MAS, link to web settings instead), labeler management, per-label preferences
- [x] Block user flow via `app.bsky.graph.block`

### App Identity & Branding

- [x] Final app icon set: generate all required sizes from source SVG
- [ ] Update `tauri.conf.json` - `productName: "Lazurite"`, `identifier: "com.owais.lazurite"`, window title, bundle metadata (description, copyright, category)
- [ ] Splash / welcome screen for first-launch flow
- [ ] Conditional support button in About section (visible on `github` channel only)

### macOS - Direct (GitHub Release)

- [ ] Code signing via Developer ID certificate
- [ ] Notarization via `notarytool`
- [ ] DMG packaging
- [ ] Universal binary (`x86_64 + aarch64`) via `--target universal-apple-darwin`
- [ ] Verify Gatekeeper passes on clean install

### macOS - App Store

- [ ] Apple Distribution certificate + provisioning profile
- [ ] Sandbox entitlements file (`com.apple.security.app-sandbox`, `network.client`, `files.downloads.read-write`)
- [ ] Separate Tauri config overlay (`tauri.mac-app-store.conf.json`)
- [ ] `codesign --force --options runtime --entitlements` before `productbuild`
- [ ] Adult content toggle disabled in MAS build (reads preference from Bluesky account prefs only)
- [ ] Age rating: 17+
- [ ] Submit via App Store Connect

### Windows - Direct (GitHub Release)

- [ ] NSIS installer - install path, start menu shortcut, desktop shortcut
- [ ] Code signing via OV certificate
- [ ] Portable `.exe` variant
- [ ] Verify Windows Defender / SmartScreen does not flag installer

### Windows - Microsoft Store

- [ ] MSIX packaging via `winappCli`
- [ ] IARC age rating questionnaire
- [ ] Submit via Partner Center
- [ ] Adult content toggle available in-app (Microsoft allows)

### Linux

- [ ] AppImage (primary portable format)
- [ ] `.deb` for Debian/Ubuntu (dependencies: libwebkit2gtk, libssl)
- [ ] `.rpm` for Fedora/RHEL
- [ ] Desktop entry with icon, categories, `at://` MIME type
- [ ] Verify on Ubuntu 22.04+, Fedora 38+, Arch

### Auto-Update - `tauri-plugin-updater`

- [ ] Add `tauri-plugin-updater` to `Cargo.toml`
- [ ] Configure endpoint pointing to GitHub Releases (`latest.json`)
- [ ] Update check on launch + periodic background check
- [ ] Update notification with changelog, install-on-quit
- [ ] Signing update bundles with Tauri keypair
- [ ] Disabled on MAS and Microsoft Store builds (stores handle updates)

### CI/CD - GitHub Actions

- [ ] **GitHub Release track**: matrix `[macos-latest, windows-latest, ubuntu-latest]`, triggered on `release/*` push or `workflow_dispatch`
  - macOS: universal `.dmg`, signed, notarized
  - Windows: NSIS `.exe`, signed
  - Linux: AppImage, `.deb`, `.rpm`
  - Upload artifacts + checksums to GitHub Release (draft)
  - Generate `latest.json` for updater
- [ ] **Mac App Store track**: manual `workflow_dispatch`, builds with MAS config overlay, signs with Apple Distribution cert, uploads `.pkg`
- [ ] **Microsoft Store track**: manual `workflow_dispatch`, wraps in MSIX via `winappCli`, uploads to Partner Center

### Legal

- [ ] Terms of Service (published, linked in app and store listings)
- [ ] Privacy Policy (published, linked in app and store listings)
- [ ] In-app contact information

### Smoke Test

- [ ] Fresh install flow on each platform
- [ ] OAuth login: loopback flow on macOS, Windows, Linux
- [ ] Timeline load: feed rendering, scroll, keyboard shortcuts
- [ ] NSFW moderation: labeled content blurred by default, reveal works, adult-only gated
- [ ] Report + block flows complete
- [ ] Search sync: FTS5 + embeddings post-login
- [ ] Auto-update: detection + install from prior version (GitHub builds)
- [ ] Deep links: `at://` URI opens app and navigates
- [ ] Multicolumn: column persistence across restart
- [ ] Store-specific: support button on GitHub, hidden on store; adult toggle on GitHub/MS, hidden on MAS

### Parking Lot

- [ ] Flathub / Snap Store submission
- [ ] macOS: separate DMG + App Store builds in single CI run
- [ ] Crash reporting (Sentry or similar)
- [ ] Analytics / telemetry (opt-in, privacy-respecting)
- [ ] Beta / nightly release channel
- [ ] Differential updates (Tauri v2 update mechanism)

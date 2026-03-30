# Milestone 13: Release

## Overview

Cross-platform build, signing, packaging, and auto-update pipeline targeting macOS, Windows, and Linux. All packaging uses `tauri build` with platform-specific configuration. CI/CD runs on GitHub Actions with separate jobs per platform.

## Steps

### App Identity & Branding

- [ ] Final app icon set: generate all required sizes from source SVG
  - macOS: `icon.icns` (16–1024px)
  - Windows: `icon.ico` (16–256px)
  - Linux: `icon.png` at 32, 128, 256, 512px
- [ ] Update `tauri.conf.json` - `productName`, `identifier`, window title, bundle metadata (description, copyright, category)
- [ ] Splash / welcome screen for first-launch flow

### macOS

- [ ] Code signing via Apple Developer certificate (`APPLE_CERTIFICATE`, `APPLE_CERTIFICATE_PASSWORD` secrets)
- [ ] Notarization via `notarytool` (`APPLE_ID`, `APPLE_PASSWORD`, `APPLE_TEAM_ID` secrets)
- [ ] DMG packaging - `tauri build` produces `.dmg` by default on macOS
- [ ] Universal binary (x86_64 + aarch64) via `--target universal-apple-darwin`
- [ ] Verify Gatekeeper passes on clean macOS install

### Windows

- [ ] NSIS installer - `tauri build` default on Windows; configure install path, start menu shortcut, desktop shortcut
- [ ] Optional: MSI installer via `bundle > targets` configuration
- [ ] Code signing via certificate (`WINDOWS_CERTIFICATE`, `WINDOWS_CERTIFICATE_PASSWORD` secrets)
  - Evaluate EV vs OV certificate for SmartScreen reputation
- [ ] Portable `.exe` variant (no install required) via WiX or NSIS portable config
- [ ] Verify Windows Defender / SmartScreen does not flag the installer

### Linux

- [ ] AppImage packaging - portable, no-install binary (primary distribution format)
- [ ] `.deb` package for Debian/Ubuntu - configure dependencies (libwebkit2gtk, libssl)
- [ ] `.rpm` package for Fedora/RHEL
- [ ] Desktop entry file with icon, categories, and MIME type for `at://` deep links
- [ ] Verify launch on Ubuntu 22.04+, Fedora 38+, and Arch (via AppImage)

### Auto-Update - `tauri-plugin-updater`

- [ ] Add `tauri-plugin-updater` to `Cargo.toml` dependencies (currently commented out)
- [ ] Configure update endpoint pointing to GitHub Releases (`latest.json` / release assets)
- [ ] Implement update check on app launch + periodic background check (configurable in Settings)
- [ ] Update available notification with changelog summary, install-on-quit option
- [ ] Differential updates where supported (Tauri v2 update mechanism)
- [ ] Signing update bundles with Tauri's update keypair (`TAURI_SIGNING_PRIVATE_KEY`, `TAURI_SIGNING_PRIVATE_KEY_PASSWORD`)

### CI/CD - GitHub Actions

- [ ] Matrix build workflow: `[macos-latest, windows-latest, ubuntu-latest]`
  - macOS job: build universal binary, sign, notarize, produce `.dmg`
  - Windows job: build NSIS installer, sign, produce `.exe`
  - Linux job: build AppImage, `.deb`, `.rpm`
- [ ] Trigger: push to `release/*` branch or manual `workflow_dispatch`
- [ ] Upload all artifacts to GitHub Release (draft) with checksums
- [ ] Generate `latest.json` manifest for `tauri-plugin-updater`
- [ ] Version bump automation: tag-based versioning synced to `tauri.conf.json` and `Cargo.toml`

### Smoke Test

- [ ] Fresh install flow: download, install, first-launch welcome
- [ ] OAuth login: full loopback flow on each platform
- [ ] Timeline load: verify feed rendering, scroll, keyboard shortcuts
- [ ] Search sync: confirm FTS5 + embedding pipeline runs post-login
- [ ] Auto-update: verify update detection and installation from a prior version
- [ ] Deep links: `at://` URI opens app and navigates to explorer view
- [ ] Multicolumn: verify column persistence across app restart

### Parking Lot

- [ ] Flathub / Snap Store submission for Linux
- [ ] Windows Store (MSIX) submission
- [ ] macOS App Store submission
- [ ] Crash reporting integration (Sentry or similar)
- [ ] Analytics / telemetry (opt-in, privacy-respecting)
- [ ] Beta / nightly release channel

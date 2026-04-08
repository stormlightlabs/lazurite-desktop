# Release & Distribution

Build, sign, package, and distribute Lazurite Desktop across macOS, Windows, and Linux. Covers direct distribution (GitHub Releases), Mac App Store, Microsoft Store, content moderation, and auto-update.

## Distribution Channels

| Channel         | Format                     | Support Button | NSFW Toggle |
| --------------- | -------------------------- | -------------- | ----------- |
| GitHub Release  | DMG, NSIS `.exe`, AppImage | Yes            | In-app      |
| Mac App Store   | `.app` (sandboxed)         | No             | Web-only    |
| Microsoft Store | MSIX                       | No             | In-app      |
| Linux (future)  | Flatpak, Snap              | Yes            | In-app      |

The `DISTRIBUTION_CHANNEL` compile-time env var (`github`, `mac_app_store`, `microsoft_store`) gates channel-specific behavior. The frontend reads it via a Tauri command.

## Content Moderation

Port the moderation system from the Flutter app (`lazurite`). The AT Protocol's label system is the backbone - posts, profiles, and media carry labels applied by labelers (official Bluesky labeler + user-subscribed custom labelers).

### Architecture

```text
┌─ Rust Backend ──────────────────────────────┐
│  ModerationService                          │
│  ├─ Fetch labeler policies (cached in DB)   │
│  ├─ Evaluate labels → ModerationDecision    │
│  ├─ Send atproto-accept-labelers header     │
│  └─ Store preferences per account           │
├─────────────────────────────────────────────┤
│  Tauri Commands                             │
│  ├─ get_moderation_prefs()                  │
│  ├─ set_adult_content_enabled(bool)         │
│  ├─ set_label_preference(labeler, label,    │
│  │   visibility)                            │
│  ├─ subscribe_labeler(did) / unsubscribe    │
│  ├─ create_report(subject, reason_type,     │
│  │   reason)                                │
│  └─ moderate_content(subject, labels,       │
│      context) → ModerationUI                │
├─────────────────────────────────────────────┤
│  SolidJS Frontend                           │
│  ├─ ModeratedBlurOverlay                    │
│  ├─ ModeratedAvatar                         │
│  ├─ ModerationBadgeRow                      │
│  ├─ ReportDialog                            │
│  └─ Moderation Settings section             │
└─────────────────────────────────────────────┘
```

### Label Evaluation

Each piece of content (post, profile, avatar, media embed) is evaluated against the user's moderation preferences to produce a `ModerationDecision`:

- **Context-aware**: `contentList`, `contentView`, `contentMedia`, `avatar`, `profileList`, `profileView` - different contexts can produce different UI outcomes for the same label.
- **Visibility levels**: `ignore` (no action), `warn` (badge + interstitial), `hide` (blur, removable for non-restricted content).
- **Adult content gate**: labels marked `adultOnly: true` require the adult content master toggle to be on. If off, content is hidden with no reveal option.

### Moderation Preferences Storage

```sql
-- Per-account moderation preferences (JSON blob)
-- Key format: moderation_preferences::{accountDid}
-- Stored in app_settings table
```

### Labeler Cache

New table:

```sql
CREATE TABLE IF NOT EXISTS labeler_cache (
  labeler_did TEXT PRIMARY KEY,
  policies_json TEXT NOT NULL,
  fetched_at INTEGER NOT NULL
);
```

Policies are fetched on login and periodically refreshed. The cache enables offline moderation.

### UI Components

**ModeratedBlurOverlay** - wraps any content that may need blurring.

- 14px Gaussian blur + semi-transparent overlay
- `i-ri-eye-off-line` icon + label name
- "Show content" button (only if content is revealable, not restricted)
- Used on: post bodies, image embeds, video embeds, quoted posts

**ModeratedAvatar** - wraps avatar images.

- Shows `i-ri-shield-line` icon when avatar is hidden
- Falls through to normal avatar when no moderation applies

**ModerationBadgeRow** - inline badges on posts/profiles.

- Alert tone (red): content warnings, blocks
- Inform tone (blue): informational labels
- Shows label source (labeler name)

**ReportDialog** - modal for reporting content.

- Subject: post URI or profile DID
- Reason type: spam, violation, misleading, sexual, rude, other
- Optional free-text reason
- Calls `com.atproto.moderation.createReport` via backend

### Store-Specific Behavior

**Mac App Store**: Adult content toggle is NOT available in the app. Users must enable it via Bluesky web settings (`bsky.app/settings/content-moderation`). The app reads the preference from the user's Bluesky account preferences (`app.bsky.actor.getPreferences`). A link to the web settings is shown in the moderation settings section. This satisfies Apple Guideline 1.2.

**GitHub / Microsoft Store**: Adult content toggle is available in-app within the moderation settings section.

### Settings Keys

| Key                      | Type | Default | Description                               |
| ------------------------ | ---- | ------- | ----------------------------------------- |
| `moderation_preferences` | JSON | `{}`    | Per-account labeler + label prefs (keyed) |

The moderation preferences JSON contains: `adultContentEnabled` (bool), `subscribedLabelers` (array of DIDs), and per-labeler label visibility overrides.

### Moderation Settings Section

New section in Settings panel, between "Notifications" and "Search & Embeddings":

- **Adult content**: toggle (hidden on MAS builds; shows link to web settings instead)
- **Subscribed labelers**: list with add/remove. Built-in Bluesky labeler shown but not removable. Max 20 custom labelers.
- **Label preferences**: expandable per labeler, three-way control per label (ignore / warn / hide). Labels marked `adultOnly` are gated behind the adult content toggle.

## Conditional Support Button

A "Support Lazurite" link in the About section of Settings. Gated by distribution channel:

```ts
// Frontend check
const channel = await invoke<string>("get_distribution_channel");
const showSupport = channel === "github";
```

On GitHub builds: shows a heart icon link to the sponsorship/support page.
On store builds: omitted entirely (Apple and Microsoft have their own monetization rules).

## App Identity

| Field        | Value                        |
| ------------ | ---------------------------- |
| Product name | Lazurite                     |
| Identifier   | `com.owais.lazurite`         |
| Category     | Social Networking            |
| Age rating   | 17+ (user-generated content) |
| Copyright    | Copyright 2026 Owais         |

## macOS Distribution

### Direct (GitHub Release)

- Developer ID certificate for signing
- Notarization via `notarytool`
- Universal binary (`x86_64 + aarch64`)
- Output: `.dmg`

### Mac App Store

- Apple Distribution certificate + Mac App Store provisioning profile
- Separate entitlements file (`Entitlements.mac-app-store.plist`):

```xml
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "...">
<plist version="1.0">
<dict>
  <key>com.apple.security.app-sandbox</key>          <true/>
  <key>com.apple.security.network.client</key>       <true/>
  <key>com.apple.security.files.downloads.read-write</key> <true/>
</dict>
</plist>
```

- Separate Tauri config overlay (`tauri.mac-app-store.conf.json`) merged at build time
- `codesign --force --options runtime --entitlements` before `productbuild`
- No notarization needed (Apple handles during review)

## Windows Distribution

### Direct (GitHub Release)

- NSIS installer with start menu + desktop shortcuts
- Optional code signing (OV certificate)
- Output: `.exe`

### Microsoft Store

- MSIX package via `winappCli` wrapping the Tauri build
- No self-signing needed (Microsoft signs on upload)
- IARC age rating questionnaire completed in Partner Center
- Published Terms of Service and Privacy Policy required

## Linux Distribution

- AppImage (primary), `.deb`, `.rpm`
- Desktop entry with `at://` MIME type
- GitHub Release only (store submissions are parking lot)

## Auto-Update (`tauri-plugin-updater`)

- Update endpoint: GitHub Releases (`latest.json`)
- Check on app launch + configurable periodic check
- Update notification with changelog, install-on-quit option
- Update bundles signed with Tauri keypair
- Disabled on Mac App Store and Microsoft Store builds (stores handle updates)

## CI/CD - GitHub Actions

Matrix build with three tracks:

### GitHub Release Track

Trigger: push to `release/*` or `workflow_dispatch`.

| Job     | OS               | Output                               |
| ------- | ---------------- | ------------------------------------ |
| macOS   | `macos-latest`   | Universal `.dmg` (signed, notarized) |
| Windows | `windows-latest` | NSIS `.exe` (signed)                 |
| Linux   | `ubuntu-latest`  | AppImage, `.deb`, `.rpm`             |

Artifacts uploaded to GitHub Release (draft) with SHA256 checksums. Generates `latest.json` for updater.

### Mac App Store Track

Trigger: manual `workflow_dispatch` with `target: mas`.

- Builds with `tauri.mac-app-store.conf.json` overlay
- Signs with Apple Distribution certificate
- Packages with `productbuild`
- Uploads `.pkg` to App Store Connect via `xcrun altool` or Transporter

### Microsoft Store Track

Trigger: manual `workflow_dispatch` with `target: msstore`.

- Builds standard Tauri NSIS output
- Wraps in MSIX via `winappCli`
- Uploads to Partner Center (manual or via Store API)

## Required Secrets

| Secret                               | Used by         |
| ------------------------------------ | --------------- |
| `APPLE_CERTIFICATE`                  | macOS signing   |
| `APPLE_CERTIFICATE_PASSWORD`         | macOS signing   |
| `APPLE_ID`                           | Notarization    |
| `APPLE_PASSWORD`                     | Notarization    |
| `APPLE_TEAM_ID`                      | Notarization    |
| `APPLE_DISTRIBUTION_CERTIFICATE`     | MAS signing     |
| `APPLE_PROVISIONING_PROFILE`         | MAS builds      |
| `WINDOWS_CERTIFICATE`                | Windows signing |
| `WINDOWS_CERTIFICATE_PASSWORD`       | Windows signing |
| `TAURI_SIGNING_PRIVATE_KEY`          | Update signing  |
| `TAURI_SIGNING_PRIVATE_KEY_PASSWORD` | Update signing  |

## Legal Requirements (Both Stores)

- Published Terms of Service
- Published Privacy Policy
- In-app contact information
- Content reporting mechanism (24-hour response for Apple)
- User blocking functionality
- Proactive content moderation via label system

## Smoke Test

- Fresh install: download → install → first-launch welcome
- OAuth login: loopback flow on each platform
- Timeline: feed rendering, scroll, keyboard shortcuts
- NSFW: labeled content is blurred by default, reveal works, adult-only hidden when disabled
- Reporting: submit report flow completes
- Search sync: FTS5 + embedding pipeline post-login
- Auto-update: detection + install from prior version (GitHub builds only)
- Deep links: `at://` URI opens app and navigates
- Multicolumn: column persistence across restart
- Store-specific: support button visible on GitHub, hidden on store builds

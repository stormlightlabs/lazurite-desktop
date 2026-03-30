# Settings

Central configuration surface for the app. Settings are stored in the existing `app_settings` SQLite table (key-value) and take effect immediately — no save/apply button.

## Storage

The `app_settings` table already exists (migration `006_app_settings.sql`):

```sql
CREATE TABLE IF NOT EXISTS app_settings (
  key   TEXT PRIMARY KEY,
  value TEXT NOT NULL
);
```

All settings are stored as text values. The backend exposes typed accessors that parse/serialize as needed (booleans as `"0"`/`"1"`, integers as decimal strings, JSON for structured values).

### Settings Keys

| Key                     | Type    | Default                                    | Description                                |
| ----------------------- | ------- | ------------------------------------------ | ------------------------------------------ |
| `theme`                 | string  | `"auto"`                                   | `"light"`, `"dark"`, or `"auto"` (OS sync) |
| `timeline_refresh_secs` | integer | `60`                                       | Feed auto-refresh interval in seconds      |
| `notifications_desktop` | boolean | `true`                                     | Show OS desktop notifications              |
| `notifications_badge`   | boolean | `true`                                     | Show unread badge on app icon / tray       |
| `notifications_sound`   | boolean | `false`                                    | Play sound on new notification             |
| `embeddings_enabled`    | boolean | `true`                                     | Enable semantic search (already exists)    |
| `constellation_url`     | string  | `"https://constellation.microcosm.blue"`   | Constellation instance base URL            |
| `spacedust_url`         | string  | `"https://spacedust.microcosm.blue"`       | Spacedust instance base URL                |
| `spacedust_instant`     | boolean | `false`                                    | Bypass Spacedust 21-second debounce buffer |
| `spacedust_enabled`     | boolean | `false`                                    | Use Spacedust for real-time notifications  |
| `global_shortcut`       | string  | `"Ctrl+Shift+N"`                           | Global composer shortcut                   |

## Tauri Commands

```rust
// Read all settings as a typed struct
get_settings() -> AppSettings

// Update a single setting (validates key + value before persisting)
update_setting(key: String, value: String) -> ()

// Data management
get_cache_size() -> CacheSize          // { feeds_bytes, embeddings_bytes, fts_bytes, total_bytes }
clear_cache(scope: CacheClearScope) -> ()   // "all" | "feeds" | "embeddings" | "fts"
export_data(format: ExportFormat, path: String) -> ()  // "json" | "csv"
reset_app() -> ()                      // full wipe — requires confirmation on frontend

// Log viewer
get_log_entries(limit: u32, level: Option<String>) -> Vec<LogEntry>
```

## Sections

### 1. Appearance

Theme toggle: light / dark / auto (synced with OS).

- Three-way segmented control, not a dropdown
- `Motion` crossfade on the entire app surface when switching themes
- Auto mode listens to `prefers-color-scheme` media query and Tauri's `Theme::changed` event

### 2. Timeline

Feed auto-refresh interval.

- Segmented control: 30s, 1m, 2m, 5m, manual
- "Manual" disables auto-refresh — user pulls to refresh or uses keyboard shortcut
- Setting applies globally across all feed views and multicolumn feed columns

### 3. Notifications

- **Desktop notifications**: toggle OS-level notifications via `tauri-plugin-notification`
- **Badge count**: toggle unread count on tray icon / dock badge
- **Sound**: toggle notification sound (system default sound, not custom)

### 4. Accounts

Reuses the OAuth flow from the auth module (Task 02).

- List of all linked accounts with avatar, handle, DID, and PDS URL
- Active account indicator
- "Add account" button → triggers OAuth loopback flow
- "Remove account" → confirmation dialog → revoke tokens, delete stored data for that account
- "Switch" action on each account row (also accessible from the sidebar account switcher)

### 5. Search & Embeddings

- **Embeddings toggle**: opt-out of semantic search. When disabled, the embedding model is not downloaded and only keyword search is available. Toggling off does not delete existing embeddings — a separate "Clear embeddings" action handles that.
- **Model status**: shows whether `nomic-embed-text-v1.5` is downloaded, its size on disk, and a "Download now" / "Remove model" action
- **Reindex**: triggers a full re-embed of all synced posts. Shows progress bar during operation.

### 6. Services

External service instance configuration for self-hosters.

- **Constellation URL**: text input with URL validation. Default: `https://constellation.microcosm.blue`
- **Spacedust URL**: text input with URL validation. Default: `https://spacedust.microcosm.blue`
- **Spacedust real-time**: toggle to use Spacedust for push notifications vs. polling `listNotifications`
- **Spacedust instant mode**: toggle to bypass the 21-second debounce buffer
- Each URL field has a "Test connection" button that makes a health-check request and shows success/failure inline

### 7. Data

- **Cache size display**: breakdown by category (feeds, embeddings, FTS index) with total
- **Clear cache**: scoped clearing — all, or by category. Confirmation dialog for "clear all"
- **Export**: export user data (liked posts, bookmarks, settings) as JSON or CSV. Uses Tauri's save dialog to pick destination.
- **Reset app**: full data wipe — drops all user tables, clears auth tokens, re-runs migrations. Behind a two-step confirmation: type "RESET" to confirm. This is the nuclear option.

### 8. Logs

In-app log viewer for debugging.

- Reads log entries from `tauri-plugin-log` log files
- Level filter: segmented control for `info`, `warn`, `error`, `all`
- Scrollable log output in monospace, newest at top
- "Copy all" and "Open log file" actions
- Collapsible by default — expands inline within the settings view

### 9. About

- App version (from `tauri.conf.json`)
- License (MIT)
- Link to source repository
- "Check for updates" button (triggers `tauri-plugin-updater` check)
- Credits / contributors

## Layout

Settings is a single scrollable view, not a sidebar+content split. Each section is a `surface_container` card with `xl` radius, separated by `spacing-8` (2rem). Sections are ordered top-to-bottom as listed above.

On narrow viewports, cards stack full-width. On wider viewports (> 768px), cards have a comfortable max-width (~640px) centered in the content area.

## Keyboard Shortcuts

| Key     | Action                        |
| ------- | ----------------------------- |
| `,`     | Open/focus settings from anywhere |
| `Escape`| Close settings (navigate back)    |

## UX Polish

- `Presence` slide transitions when navigating to/from settings
- Theme switch: `Motion` crossfade on the entire app surface
- Destructive action modals: glass overlay (`surface_container_highest` at 70% + `backdrop-blur: 20px`)
- Toggle switches: `Motion` spring on the thumb element
- Cache size: animated number transitions when values update after clearing
- Export/reindex: progress bars with percentage, cancelable where possible
- Log viewer: smooth scroll, syntax-highlighted log levels

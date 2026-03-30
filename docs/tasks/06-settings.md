# Task 06: Settings

Spec: [settings.md](../specs/settings.md)

## Steps

### Backend - `src-tauri/src/settings.rs`

- [x] `get_settings()` - read user preferences from SQLite `settings` table, return as typed struct
- [x] `update_setting(key: String, value: String)` - upsert a key-value pair in `settings` table
- [x] `clear_cache()` - delete cached feed data, embedded vectors, and FTS5 index; vacuum database
- [x] `reset_app()` - drop all user data tables and re-run migrations; clear auth tokens
- [x] `export_data(format: String, path: String)` - export user data as JSON or CSV to chosen path
- [x] `get_log_entries(limit: u32, level: Option<String>)` - read recent log entries for the in-app log viewer
- [x] SQLite migration: `settings` table (`key TEXT PRIMARY KEY, value TEXT, updated_at TEXT`)

### Frontend - Settings View

- [x] Settings route (`/settings`) accessible from app rail icon (`Icon` with kind `settings`)
- [x] Section-based layout using `surface_container` cards with `lg` radius:
  1. **Appearance** - Theme toggle (light/dark/auto), `Motion` crossfade on theme switch
  2. **Timeline** - Refresh interval selector (30s, 1m, 2m, 5m, manual)
  3. **Notifications** - Toggle desktop notifications, badge count, notification sound
  4. **Data** - Clear cache (with size display), export (JSON/CSV), reset app (with confirmation dialog)
  5. **Accounts** - List active accounts, add/remove account flows (reuses OAuth from Task 02)
  6. **Logs** - Collapsible log viewer with level filtering (`info`, `warn`, `error`)
  7. **Services** - Constellation instance URL, Spacedust instance URL
  8. **About** - Version info, license (MIT), contributors, support links
- [x] `Presence` slide transitions between setting sections
- [x] Keyboard shortcut: `,` to open settings from anywhere
- [x] Confirmation modal for destructive actions (clear cache, reset app, remove account) using glass overlay

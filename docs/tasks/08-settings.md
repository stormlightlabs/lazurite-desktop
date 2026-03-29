# Task 08: Settings

Spec: TBD

## Steps

### Backend — `src-tauri/src/settings.rs`

- [ ] `get_settings()` — read user preferences from SQLite `settings` table, return as typed struct
- [ ] `update_setting(key: String, value: String)` — upsert a key-value pair in `settings` table
- [ ] `clear_cache()` — delete cached feed data, embedded vectors, and FTS5 index; vacuum database
- [ ] `reset_app()` — drop all user data tables and re-run migrations; clear auth tokens
- [ ] `export_data(format: String, path: String)` — export user data as JSON or CSV to chosen path
- [ ] `get_log_entries(limit: u32, level: Option<String>)` — read recent log entries for the in-app log viewer
- [ ] SQLite migration: `settings` table (`key TEXT PRIMARY KEY, value TEXT, updated_at TEXT`)

### Frontend — Settings View

- [ ] Settings route (`/settings`) accessible from app rail icon (`i-ri-settings-3-line`)
- [ ] Section-based layout using `surface_container` cards with `xl` radius:
  1. **Appearance** — Theme toggle (light/dark/auto), `Motion` crossfade on theme switch
  2. **Timeline** — Refresh interval selector (30s, 1m, 2m, 5m, manual)
  3. **Notifications** — Toggle desktop notifications, badge count, notification sound
  4. **Data** — Clear cache (with size display), export (JSON/CSV), reset app (with confirmation dialog)
  5. **Accounts** — List active accounts, add/remove account flows (reuses OAuth from Task 02)
  6. **Logs** — Collapsible log viewer with level filtering (`info`, `warn`, `error`)
  7. **About** — Version info, license (MIT), contributors, support links
- [ ] `Presence` slide transitions between setting sections
- [ ] Keyboard shortcut: `,` to open settings from anywhere
- [ ] Confirmation modal for destructive actions (clear cache, reset app, remove account) using glass overlay

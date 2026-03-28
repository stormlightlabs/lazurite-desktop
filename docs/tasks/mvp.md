# Lazurite Desktop — MVP Task Breakdown

Tasks are grouped by module. Each references the relevant spec. Polish (keyboard shortcuts, animations via `solid-motionone`, loading states, accessibility) is built into each task — not deferred.

## Phase 1: Foundation

- [Rust Backend Setup](./01-backend-setup.md) — Cargo deps, SQLite, Tauri commands scaffold, theme, error toast, `solid-motionone`
- [Auth & Accounts](./02-auth.md) — OAuth loopback, multi-account, session persistence, account switcher animations

## Phase 2: Core Social

- [Feeds](./03-feeds.md) — Pinned feed tabs, post rendering, composer, keyboard shortcuts, scroll animations
- [Notifications](./04-notifications.md) �� Mentions, activity, system notifications, badge animations

## Phase 3: Power Features

- [AT Explorer](./05-explorer.md) — pds.ls-style data browser, at:// deep links, view transitions, keyboard nav
- [Search & Embeddings](./06-search.md) — FTS5, fastembed, sqlite-vec, sync pipeline, result animations

## Phase 4: Long-Form & Release

- [Standard.site](./07-standard-site.md) — Publication/document views, subscriptions, reading view transitions
- [Release](./08-release.md) — macOS code signing, notarization, DMG packaging, auto-update

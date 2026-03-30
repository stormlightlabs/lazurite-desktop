# Lazurite Desktop - MVP Task Breakdown (v0.1.0)

Tasks are grouped by module. Each references the relevant spec. Polish (keyboard shortcuts, animations via `solid-motionone`, loading states, accessibility) is built into each task - not deferred.

## Phase 1: Foundation

- [Rust Backend Setup](./01-backend-setup.md) - Cargo deps, SQLite, Tauri commands scaffold, theme, error toast, `solid-motionone`
- [Auth & Accounts](./02-auth.md) - OAuth loopback, multi-account, session persistence, account switcher animations

## Phase 2: Core Social

- [Feeds](./03-feeds.md) - Pinned feed tabs, post rendering, composer, keyboard shortcuts, scroll animations
- [Notifications](./04-notifications.md) - Mentions, activity, system notifications, badge animations

## Phase 3: Core Features

- [AT Explorer](./05-explorer.md) - pds.ls-style data browser, at:// deep links, view transitions, keyboard nav
- [Settings](./06-settings.md) - Theme, notifications, data export, cache management, account management, Constellation/Spacedust instance, logs

## Phase 4: Power Features

- [Search & Embeddings](./07-search.md) - FTS5, fastembed, sqlite-vec, sync pipeline, result animations
- [Social Diagnostics](./08-social-diagnostics.md) - Constellation-powered lists, labels, blocks, starter packs, backlinks

## Phase 5: Live Data

- [Jetstream](./09-jetstream.md) - WebSocket live-tail of AT Protocol firehose, filtered record streaming
- [Spacedust](./10-spacedust.md) - Real-time backlink notifications via microcosm Spacedust

## Phase 6: Polish & Release

- [Multicolumn Views](./11-multicolumn.md) - TweetDeck-style side-by-side feeds, explorer, and diagnostics panels
- [Release](./12-release.md) - Cross-platform build (macOS, Windows, Linux), code signing, auto-update, CI/CD

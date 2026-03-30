# Lazurite Desktop - MVP Milestone Breakdown (v0.1.0)

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
- [Multicolumn Views](./08-multicolumn.md) - TweetDeck-style side-by-side feeds, explorer, and diagnostics panels
- [Profile](./09-profile.md) - Profile hero, follow/unfollow, follower/following lists, scroll-driven condensation

## Phase 5: Live Data & Diagnostics

- [Jetstream](./10-jetstream.md) - WebSocket live-tail of AT Protocol firehose, filtered record streaming
- [Spacedust](./11-spacedust.md) - Real-time backlink notifications via microcosm Spacedust
- [Social Diagnostics](./12-social-diagnostics.md) - Constellation-powered lists, labels, blocks, starter packs, backlinks (depends on Spacedust for live engagement)

## Phase 6: Release

- [Release](./13-release.md) - Cross-platform build (macOS, Windows, Linux), code signing, auto-update, CI/CD

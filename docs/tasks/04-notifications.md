# Task 04: Notifications

Spec: [feeds.md](../specs/feeds.md)

## Tasks

### Tauri

- [x] Create `src-tauri/src/notifications.rs`
  - `src-tauri/src/commands/notifications.rs` for Tauri commands
- [x] `list_notifications(cursor: Option<String>)` — `app.bsky.notification.listNotifications`
- [x] `update_seen()` — `app.bsky.notification.updateSeen`
- [x] `get_unread_count()` — `app.bsky.notification.getUnreadCount`
- [x] Background polling: spawn async task on login, poll every 30s, emit Tauri event on new notifications
- [x] System notifications via `tauri-plugin-notification` for mentions when app is in background

## Frontend

- [x] notifications panel with two tabs — Mentions / Activity (Aeronaut pattern)
- [x] unread badge on sidebar notification icon with `Motion` scale-in pop
- [x] new notification items `Motion` slide-in from top
- [x] tab switch `Presence` crossfade between Mentions/Activity

## Tests

- [x] Frontend tests for notification payload parsing, rail unread badge, route wiring, and notifications panel behavior
- [x] Rust unit tests for mention-notification formatting and dedupe helpers

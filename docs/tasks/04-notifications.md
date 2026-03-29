# Task 04: Notifications

Spec: [feeds.md](../specs/feeds.md)

## Tasks

### Tauri

- [ ] Create `src-tauri/src/notifications.rs`
  - `src-tauri/src/commands/notifications.rs` for Tauri commands
- [ ] `list_notifications(cursor: Option<String>)` — `app.bsky.notification.listNotifications`
- [ ] `update_seen()` — `app.bsky.notification.updateSeen`
- [ ] `get_unread_count()` — `app.bsky.notification.getUnreadCount`
- [ ] Background polling: spawn async task on login, poll every 30s, emit Tauri event on new notifications
- [ ] System notifications via `tauri-plugin-notification` for mentions when app is in background

## Frontend

- [ ] notifications panel with two tabs — Mentions / Activity (Aeronaut pattern)
- [ ] unread badge on sidebar notification icon with `Motion` scale-in pop
- [ ] new notification items `Motion` slide-in from top
- [ ] tab switch `Presence` crossfade between Mentions/Activity

# Task 04: Notifications

Spec: [timeline.md](../specs/timeline.md)

## Steps

- [ ] Create `src-tauri/src/notifications.rs`
- [ ] `list_notifications(cursor: Option<String>)` — `app.bsky.notification.listNotifications`
- [ ] `update_seen()` — `app.bsky.notification.updateSeen`
- [ ] `get_unread_count()` — `app.bsky.notification.getUnreadCount`
- [ ] Background polling: spawn async task on login, poll every 30s, emit Tauri event on new notifications
- [ ] **Frontend**: notifications panel with two tabs — Mentions / Activity (Aeronaut pattern)
- [ ] **Frontend**: unread badge on sidebar notification icon with `Motion` scale-in pop
- [ ] **Frontend**: new notification items `Motion` slide-in from top
- [ ] **Frontend**: tab switch `Presence` crossfade between Mentions/Activity
- [ ] System notifications via `tauri-plugin-notification` for mentions when app is in background

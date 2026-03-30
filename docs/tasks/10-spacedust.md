# Task 10: Spacedust

Spec: TBD (see [Spacedust API docs](../../.sandbox/spacedust.md))

## Overview

[Spacedust](https://spacedust.microcosm.blue/) is a configurable ATProto notifications firehose by microcosm.blue. It streams real-time backlink events (likes, reposts, follows, replies, etc.) for specific subjects, with a built-in 21-second debounce buffer to filter out quickly-undone interactions.

Where Jetstream (Task 09) streams raw firehose records, Spacedust streams *resolved backlinks* - making it ideal for live notification feeds and real-time engagement counters.

## Tasks

### Backend - Spacedust Client (`src-tauri/src/spacedust.rs`)

- [ ] Spacedust WebSocket client struct with configurable base URL (default: `https://spacedust.microcosm.blue`)
- [ ] `spacedust_subscribe(config: SpacedustConfig)` - open WebSocket to `/subscribe` with query params:
  - `wantedSources`: link sources to receive (e.g., `app.bsky.feed.like:subject.uri`)
  - `wantedSubjectDids`: DIDs to receive links about
  - `wantedSubjects`: AT-URIs to receive links about (URL-encoded)
  - `instant`: optional boolean to bypass the 21-second delay buffer
- [ ] `spacedust_unsubscribe()` - close WebSocket, clean up
- [ ] Tauri event emission: `spacedust:link` with payload (source collection+path, subject, linking DID, operation)
- [ ] Connection lifecycle events: `spacedust:connected`, `spacedust:disconnected`, `spacedust:error`
- [ ] Reconnection with backoff on disconnect

### Backend - Notification Integration

- [ ] On login, auto-subscribe to Spacedust for the authenticated user's DID with common social sources:
  - `app.bsky.feed.like:subject.uri` (likes on your posts)
  - `app.bsky.feed.repost:subject.uri` (reposts)
  - `app.bsky.feed.post:reply.parent.uri` (replies)
  - `app.bsky.graph.follow:subject` (new followers)
- [ ] Map incoming Spacedust events to notification records in SQLite
- [ ] Deduplicate with existing notifications from `app.bsky.notification.listNotifications`

### Frontend - Live Engagement (Explorer Integration)

- [ ] When viewing a record in AT Explorer, optionally subscribe to Spacedust for that record's URI
- [ ] Real-time counter updates (likes, reposts, replies ticking up) via `Motion` number transition
- [ ] Toggle: "Watch live" button to start/stop per-record subscription
- [ ] Visual pulse on counter increment

### Frontend - Settings

- [ ] Spacedust instance URL configuration (alongside Constellation URL in settings)
- [ ] Toggle: use Spacedust for real-time notifications (vs. polling `listNotifications`)
- [ ] Toggle: `instant` mode (bypass 21-second buffer - faster but noisier)

### Parking Lot

- [ ] Spacedust as a column type in multicolumn view (live notification stream)
- [ ] Aggregate Spacedust events into a "live activity" dashboard
- [ ] Spacedust for real-time search result updates

# Milestone 16: Follow Hygiene

Spec: [follow-hygiene.md](../specs/follow-hygiene.md)

## Dependencies

- Milestone 02 (Auth) — active OAuth session required
- Milestone 09 (Profile) — profile panel hosts the primary entry point

## Tasks

### Backend

- [ ] **Add `FlaggedFollow` type** to `src-tauri/src/feed.rs` (or a new `graph.rs` module if feed.rs is getting large).
  Bitflag status field matching the spec's status table.
- [ ] **Implement `audit_follows` command.** Paginate `com.atproto.repo.listRecords` for the follow collection, batch-resolve via `getProfiles` (25/batch, bounded concurrency via semaphore), individually resolve missing DIDs via `getProfile` + DID document handle resolution.
  Emit `follow-hygiene:progress` events per batch. Return only accounts with non-zero status.
- [ ] **Implement `batch_unfollow` command.** Accept a `Vec<String>` of follow AT-URIs.
  Extract rkeys, build `Delete` operations, chunk into groups of 200, send via `applyWrites`. Return `BatchResult` with deleted count and any failed URIs.
- [ ] **Rate-limit handling.** Add inter-batch delays and respect `429` / `Retry-After` headers in the audit scan.
  Log warnings on rate-limit hits.

### Frontend

- [ ] **Create `FollowHygienePanel` component** (`src/components/profile/FollowHygienePanel.tsx`). Local state via `createStore<FollowHygieneState>`. Phases: idle → scanning → ready → unfollowing → done.
- [ ] **Progress bar.** Listen to `follow-hygiene:progress` Tauri events during scan. Determinate bar with animated fill.
- [ ] **Flagged account list.** Scrollable list with per-row checkbox, handle, DID, status label chip. Selected rows get background tint. Use `For` (not map).
- [ ] **Category filter sidebar.** Sticky sidebar with visibility toggles and select-all checkboxes per status category. Selection counter.
- [ ] **Unfollow flow.** Confirmation dialog before destructive action. Invoke `batch_unfollow`, remove completed rows with exit animation, show result summary.
- [ ] **Entry points.** Add "Audit follows" button to the authenticated user's own profile panel. Add secondary entry in Settings > Account section.

### Polish

- [ ] Keyboard shortcuts: `Space` toggle, `Ctrl+A` select all, `Escape` close
- [ ] `Motion` staggered fade-in on scan results, exit animation on unfollow
- [ ] `Presence` fade-in on confirmation dialog
- [ ] Skeleton/spinner states during scan
- [ ] Empty state message when no flagged accounts found
- [ ] Error handling: toast on scan failure, inline retry for batch unfollow failures

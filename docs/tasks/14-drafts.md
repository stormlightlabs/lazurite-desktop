# Milestone 14: Draft Posts

Spec: [drafts.md](../specs/drafts.md)

Depends on: Milestone 03 (Feeds — composer, `create_post`)

## Steps

### Backend - `src-tauri/src/drafts.rs` + `src-tauri/src/commands/drafts.rs`

- [ ] SQLite migration: `drafts` table (`id TEXT PRIMARY KEY, account_did TEXT NOT NULL, text TEXT NOT NULL, reply_parent_uri TEXT, reply_parent_cid TEXT, reply_root_uri TEXT, reply_root_cid TEXT, quote_uri TEXT, quote_cid TEXT, title TEXT, created_at TEXT NOT NULL, updated_at TEXT NOT NULL`)
- [ ] `Draft` and `DraftInput` structs mirroring the schema
- [ ] `list_drafts(account_did: String)` — return all drafts for the account, ordered by `updated_at` desc
- [ ] `get_draft(id: String)` — single draft by ID
- [ ] `save_draft(input: DraftInput)` — upsert: if `id` is present and exists, update; otherwise insert with new UUID
- [ ] `delete_draft(id: String)` — hard delete
- [ ] `submit_draft(id: String)` — load draft, call `create_post`, delete draft on success, return `CreateRecordResult`

### Frontend - Drafts List Panel

- [ ] Drafts list panel component with `Presence` slide-up from composer
- [ ] Draft cards: title or text preview, reply/quote context indicator, relative timestamp, delete button
- [ ] Tap draft to load into composer (confirmation if composer has content)
- [ ] Delete with confirmation
- [ ] Empty state: *"No drafts yet. Saved posts will appear here."*
- [ ] `Ctrl/Cmd+D` keyboard shortcut to open drafts list

### Frontend - Composer Integration

- [ ] Autosave: debounced (3s inactivity) save to draft while composing, tracked by draft `id` in composer state
- [ ] Autosave indicator in composer footer: "Saved" / "Saving..." text
- [ ] "Save as draft" button in composer header — explicit save + close composer
- [ ] Draft count badge on drafts list button
- [ ] `Ctrl/Cmd+S` keyboard shortcut to save current composer as draft
- [ ] On app launch, detect unsaved autosave draft → toast: *"You have an unsaved post. Restore?"* with Restore / Discard

### Frontend - Draft Lifecycle

- [ ] Loading a draft into the composer tracks the draft `id` so subsequent autosaves update (not duplicate)
- [ ] Successful post submission deletes the associated draft
- [ ] Explicit discard from composer deletes the autosave draft
- [ ] Account switch clears composer state; autosave draft persists for the original account

### Parking Lot

- [ ] Media attachments in drafts (requires local blob caching + re-upload on submit)
- [ ] Thread builder (compose multi-post threads as a single draft)
- Cross-device sync via AT Protocol Permissioned Data (blocked on protocol — expected summer 2026)

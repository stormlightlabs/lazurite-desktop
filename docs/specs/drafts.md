# Drafts

## Overview

Draft posts are composed locally and persisted to SQLite, allowing users to save work-in-progress posts and resume them later. Drafts survive app restarts and account switches.

AT Protocol has no concept of private or unpublished records today — all repo data is public and broadcast on the firehose. A "Permissioned Data" initiative is the protocol team's top priority for summer 2026, which may eventually enable server-side drafts. Until then, drafts are local-only. The schema mirrors `app.bsky.feed.post` fields to make future migration straightforward.

Every other BlueSky client with drafts (Skeets, deck.blue) also uses client-local storage.

## Data Model

Drafts live in a `drafts` SQLite table, scoped per account:

| Column             | Type               | Notes                                                 |
| ------------------ | ------------------ | ----------------------------------------------------- |
| `id`               | `TEXT PRIMARY KEY` | UUID                                                  |
| `account_did`      | `TEXT NOT NULL`    | Owning account                                        |
| `text`             | `TEXT NOT NULL`    | Post body (may be empty string for embed-only drafts) |
| `reply_parent_uri` | `TEXT`             | Parent post URI if replying                           |
| `reply_parent_cid` | `TEXT`             | Parent post CID                                       |
| `reply_root_uri`   | `TEXT`             | Root post URI if replying                             |
| `reply_root_cid`   | `TEXT`             | Root post CID                                         |
| `quote_uri`        | `TEXT`             | Quoted post URI if quote-posting                      |
| `quote_cid`        | `TEXT`             | Quoted post CID                                       |
| `title`            | `TEXT`             | Optional user label for organizing drafts             |
| `created_at`       | `TEXT NOT NULL`    | ISO 8601 creation timestamp                           |
| `updated_at`       | `TEXT NOT NULL`    | ISO 8601 last-modified timestamp                      |

Media/blob references are excluded from v1 — they require `uploadBlob` which returns ephemeral blob refs that expire. Drafts with intended media should note this in the UI.

## Commands

| Command        | Args          | Returns              | Notes                                                |
| -------------- | ------------- | -------------------- | ---------------------------------------------------- |
| `list_drafts`  | `account_did` | `Vec<Draft>`         | Ordered by `updated_at` desc                         |
| `get_draft`    | `id`          | `Draft`              | Single draft by ID                                   |
| `save_draft`   | `DraftInput`  | `Draft`              | Upsert — creates or updates based on `id` presence   |
| `delete_draft` | `id`          | `()`                 | Hard delete                                          |
| `submit_draft` | `id`          | `CreateRecordResult` | Load draft → `create_post` → delete draft on success |

`DraftInput` contains all writable fields (text, reply refs, quote ref, title). If `id` is provided, it updates; otherwise it creates with a new UUID.

## Autosave

The composer autosaves to a draft after 3 seconds of inactivity (debounced). An active autosave draft is marked by storing its `id` in the composer state. When the user submits or explicitly discards, the autosave draft is deleted.

On app launch, if an autosave draft exists for the active account, the composer offers to restore it via a non-blocking toast: _"You have an unsaved post. Restore?"_ with Restore / Discard actions.

## UI

### Drafts List

Accessible from a button in the composer header or toolbar. Opens a `Presence` slide-up panel listing all drafts for the active account.

Each draft card shows:

- Title (or text preview if no title)
- Reply/quote context indicator (icon + truncated parent)
- Relative timestamp ("2 hours ago")
- Delete action (with confirmation)

Tap a draft to load it into the composer, replacing current content (with confirmation if composer is non-empty).

### Composer Integration

- Autosave indicator in composer footer: subtle "Saved" / "Saving..." text
- "Save as draft" button in composer header (explicit save + close)
- Draft count badge on the drafts list button when drafts exist
- When loading a draft into the composer, the draft ID is tracked so subsequent saves update the same draft rather than creating duplicates

### Keyboard Shortcuts

| Key          | Action                                          |
| ------------ | ----------------------------------------------- |
| `Ctrl/Cmd+S` | Explicit save current composer content as draft |
| `Ctrl/Cmd+D` | Open drafts list                                |

## Constraints

- **No cross-device sync**: Drafts are local SQLite. If Permissioned Data ships, drafts could migrate to private repo records.

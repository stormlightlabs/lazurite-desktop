# Task 09: Multicolumn Views

Spec: TBD

## Overview

TweetDeck-style multicolumn layout allowing users to view multiple feeds and/or AT Explorer panels side by side. Each column is an independent, scrollable pane that can display any feed (timeline, custom feed, list feed) or an explorer view (PDS browser, repo browser, collection/record views).

## Steps

### Backend — `src-tauri/src/columns.rs`

- [ ] SQLite migration: `columns` table (`id TEXT PRIMARY KEY, account_did TEXT, kind TEXT, config TEXT, position INTEGER, width TEXT, created_at TEXT`)
  - `kind`: `feed` | `explorer` — determines the column type
  - `config`: JSON blob — for feeds: `{ feed_uri, feed_type }`, for explorer: `{ target_uri }`
  - `width`: `narrow` | `standard` | `wide`
- [ ] `get_columns(account_did: String)` — return ordered column list for the active account
- [ ] `add_column(account_did: String, kind: String, config: String, position: Option<u32>)` — insert at position or append
- [ ] `remove_column(id: String)` — delete column by ID
- [ ] `reorder_columns(ids: Vec<String>)` — bulk update positions
- [ ] `update_column(id: String, config: Option<String>, width: Option<String>)` — modify column settings

### Frontend — Column Layout

- [ ] Multicolumn route (`/deck`) accessible from app rail icon (`i-ri-layout-column-line`)
- [ ] Horizontal scrolling container with snap points per column
- [ ] Three column width presets: narrow (320px), standard (420px), wide (560px)
- [ ] Column header bar: feed/explorer name, width toggle, close button, drag handle
- [ ] Drag-and-drop column reordering with `Motion` position animation
- [ ] `Presence` scale-in animation when adding a column, scale-out on removal
- [ ] Responsive: collapse to single-column on narrow windows with horizontal swipe navigation

### Frontend — Column Types

#### Feed Column

- [ ] Reuse existing feed content loader and post card components from Task 03
- [ ] Independent scroll position and cursor pagination per column
- [ ] Column-specific feed preferences (hide reposts/replies/quotes)
- [ ] Inline thread expansion (click post to expand thread within the column)

#### Explorer Column

- [ ] Reuse existing explorer views from Task 05 (PDS, repo, collection, record)
- [ ] Independent navigation stack per column (breadcrumbs, back/forward)
- [ ] Compact record rendering mode for narrower column widths

### Frontend — Column Management

- [ ] "Add column" button (`i-ri-add-line`) opens a picker panel:
  - Feed picker: lists pinned feeds, saved feeds, list feeds
  - Explorer picker: input field for at:// URI, handle, DID, or PDS URL
- [ ] Right-click column header for context menu (resize, duplicate, close)
- [ ] Keyboard shortcuts: `Ctrl+Shift+N` add column, `Ctrl+Shift+W` close focused column, `Ctrl+[/]` focus prev/next column
- [ ] Persist column layout to SQLite per account — restore on app launch

### Parking Lot

- [ ] Column templates / saved layouts (e.g., "Research", "Timeline + Notifications")
- [ ] Notification column type
- [ ] Search results column type
- [ ] Column-level auto-refresh interval override
- [ ] Shared scroll sync between related columns

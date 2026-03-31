# Milestone 08: Multicolumn Views

Spec: [multicolumn.md](../specs/multicolumn.md)

## Overview

TweetDeck-style multicolumn layout allowing users to view multiple feeds and/or AT Explorer panels side by side. Each column is an independent, scrollable pane that can display any feed (timeline, custom feed, list feed) or an explorer view (PDS browser, repo browser, collection/record views).

## Steps

### Backend - `src-tauri/src/columns.rs` + `src-tauri/src/commands/columns.rs`

- [x] SQLite migration: `columns` table (`id TEXT PRIMARY KEY, account_did TEXT, kind TEXT, config TEXT, position INTEGER, width TEXT, created_at TEXT`)
  - `kind`: `feed` | `explorer` | `diagnostics` | `messages` | `search` | `profile` - determines the column type
  - `config`: JSON blob - for feeds: `{ feed_uri, feed_type }`, for explorer: `{ target_uri }`, for diagnostics: `{ did }`, for messages: `{}`, for search: `{ query, mode }`, for profile: `{ actor, handle?, did?, displayName? }`
  - `width`: `narrow` | `standard` | `wide`
- [x] `get_columns(account_did: String)` - return ordered column list for the active account
- [x] `add_column(account_did: String, kind: String, config: String, position: Option<u32>)` - insert at position or append
- [x] `remove_column(id: String)` - delete column by ID
- [x] `reorder_columns(ids: Vec<String>)` - bulk update positions
- [x] `update_column(id: String, config: Option<String>, width: Option<String>)` - modify column settings

### Frontend - Column Layout

- [x] Multicolumn route (`/deck`) accessible from app rail icon (`i-ri-layout-column-line`)
- [x] Horizontal scrolling container with snap points per column
- [x] Three column width presets: narrow (320px), standard (420px), wide (560px)
- [x] Column header bar: feed/explorer name, width toggle, close button, drag handle
- [ ] Drag-and-drop column reordering with `Motion` position animation (move left/right via header buttons works; true DnD is parking lot)
- [x] `Motion` scale-in animation when adding a column
- [ ] Responsive: collapse to single-column on narrow windows with horizontal swipe navigation

### Frontend - Column Types

#### Feed Column

- [x] Reuse existing feed content loader and post card components from Milestone 03
- [x] Independent scroll position and cursor pagination per column
- [ ] Column-specific feed preferences (hide reposts/replies/quotes)
- [ ] Inline thread expansion (click post to expand thread within the column)

#### Explorer Column

- [x] Reuse existing explorer views from Milestone 05 (PDS, repo, collection, record)
- [x] Independent navigation stack per column (breadcrumbs, back/forward)
- [ ] Compact record rendering mode for narrower column widths

#### Diagnostics Column

- [ ] Reuse social diagnostics panel from Milestone 12 (stub in place — updates when Milestone 12 lands)
- [ ] Tab navigation within column for lists/labels/blocks/starter packs/backlinks
- [ ] Compact card layout adapted to column width

#### Messages Column

- [x] Reuse the existing messages panel inside deck columns
- [x] Blur DM content until hovered or focused

#### Search Column

- [x] Reuse the existing search panel inside deck columns
- [x] Persist search query + mode in column config

#### Profile Column

- [x] Reuse the existing profile panel inside deck columns
- [x] Add profile column creation via actor typeahead

### Frontend - Column Management

- [x] "Add column" button (`i-ri-add-line`) opens a picker panel:
  - Feed picker: lists pinned feeds, saved feeds, list feeds
  - Explorer picker: input field for at:// URI, handle, DID, or PDS URL
  - Diagnostics picker: input field for handle or DID
  - Messages picker: opens DM inbox
  - Search picker: accepts query + mode
  - Profile picker: typeahead-first actor selection
- [ ] Right-click column header for context menu (resize, duplicate, close)
- [x] Keyboard shortcuts: `Ctrl+Shift+N` add column, `Ctrl+Shift+W` close focused column
- [x] Persist column layout to SQLite per account - restore on app launch

### Parking Lot

- [ ] Column templates / saved layouts (e.g., "Research", "Timeline + Notifications")
- [ ] Notification column type
- [x] Search results column type
- [ ] Column-level auto-refresh interval override
- [ ] Shared scroll sync between related columns

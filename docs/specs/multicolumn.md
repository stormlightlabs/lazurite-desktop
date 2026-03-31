# Multicolumn Views

TweetDeck-style layout allowing users to view multiple feeds, AT Explorer panels, social diagnostics panels, DMs, search views, and profiles side by side. Each column is an independent, scrollable pane with its own state.

## Layout Model

A horizontally scrolling container of columns. Each column has a fixed width class and independent scroll position.

### Column Widths

| Width      | Pixels | Use Case                          |
| ---------- | ------ | --------------------------------- |
| `narrow`   | 320px  | Notification-style, compact feeds |
| `standard` | 420px  | Default for feeds and diagnostics |
| `wide`     | 560px  | AT Explorer, thread views         |

Columns snap to their width boundaries. The container scrolls horizontally when total column width exceeds the viewport. On narrow windows (< 768px), collapse to single-column with horizontal swipe navigation.

### Column Anatomy

```text
┌───────────────────────────┐
│ [≡] Column Title    [-][×]│  ← header: drag handle, title, width toggle, close
├───────────────────────────┤
│                           │
│    Column Content         │  ← independent scrollable content area
│    (feed / explorer /     │
│     diagnostics)          │
│                           │
└───────────────────────────┘
```

- **Drag handle** (`i-ri-draggable`): reorder columns via drag-and-drop
- **Title**: feed name, explorer path, or diagnostics target
- **Width toggle**: cycle narrow → standard → wide
- **Close** (`i-ri-close-line`): remove column with confirmation if it has unsaved state

## Column Types

### Feed Column

Reuses feed content loader and post card components from the feeds module.

- Independent cursor pagination and scroll position
- Column-specific feed preferences (hide reposts/replies/quotes)
- Inline thread expansion (click post → expand thread within column)
- Supports: timeline, custom feed generators, list feeds

### Explorer Column

Reuses AT Explorer views (PDS, repo, collection, record).

- Independent navigation stack per column (breadcrumbs, back/forward)
- Compact record rendering mode when column width is `narrow`
- Full JSON view available in `standard` and `wide`

### Diagnostics Column

Displays a social diagnostics panel for a target DID.

- Shows all diagnostics tabs (lists, labels, blocks, starter packs, backlinks)
- Tab navigation within the column
- Compact card layout adapted to column width

### Messages Column

Displays the authenticated user's DM inbox and active conversation.

- Reuses the existing messages panel
- Sensitive content is blurred by default until the column is hovered or focused
- Width should remain user-adjustable because compact layouts can still be useful for list-first triage

### Search Column

Displays a saved search query inside the deck.

- Reuses the search panel in an embedded mode
- Persists the initial query and search mode in column config
- Supports network and local search modes

### Profile Column

Displays a profile view for a selected actor.

- Reuses the existing profile panel
- Column picker should prefer actor typeahead to reduce handle/DID entry errors
- Persist actor selection in column config so the column can be restored on launch

## Column Management

### Adding Columns

"Add column" button (`i-ri-add-line`) in the deck toolbar opens a picker:

- **Feed picker**: pinned feeds, saved feeds, list feeds
- **Explorer picker**: input field accepting at:// URI, handle, DID, or PDS URL
- **Diagnostics picker**: input field accepting handle or DID
- **Messages picker**: opens the authenticated user's DM inbox
- **Search picker**: query + search mode
- **Profile picker**: actor lookup with typeahead

New columns append to the right by default. Optional position insertion via drag during add.

### Persistence

Column layout is stored per account in SQLite:

```sql
CREATE TABLE columns (
  id TEXT PRIMARY KEY,
  account_did TEXT NOT NULL,
  kind TEXT NOT NULL,          -- 'feed' | 'explorer' | 'diagnostics' | 'messages' | 'search' | 'profile'
  config TEXT NOT NULL,        -- JSON: feed → { feed_uri, feed_type }, explorer → { target_uri }, diagnostics → { did }, messages → {}, search → { query, mode }, profile → { actor, handle?, did?, display_name? }
  position INTEGER NOT NULL,
  width TEXT NOT NULL DEFAULT 'standard',
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
```

Layout restored on app launch per active account. Account switch swaps the full column set.

### Context Menu

Right-click column header:

- Resize (narrow / standard / wide)
- Duplicate column
- Move left / Move right
- Close

## Keyboard Shortcuts

| Key              | Action                 |
| ---------------- | ---------------------- |
| `Ctrl+Shift+N`   | Add column             |
| `Ctrl+Shift+W`   | Close focused column   |
| `Ctrl+[` / `]`   | Focus prev/next column |
| `Ctrl+Shift+[/]` | Move column left/right |

Focus is indicated by a subtle `primary` glow on the column header (ambient glow, per design spec).

## UX Polish

- Drag-and-drop reorder: `Motion` position animation with spring easing
- Add column: `Presence` scale-in from center
- Remove column: `Presence` scale-out with adjacent columns sliding to fill gap via `Motion`
- Column focus transition: `Motion` glow fade on header
- Horizontal scroll: smooth scroll-snap with momentum
- Responsive collapse: `Presence` crossfade when switching between multicolumn and single-column modes
- Skeleton screens per column while content loads

## Responsive Behavior

- On narrow windows (< 768px), collapse to single-column view with horizontal swipe navigation
- On smaller widths, multiple columns should collapse into vertical, labeled panes within the single-column layout
- Columns containing sensitive content (e.g., DMs) should support an autoblur option — allow marking any column as blurrable so content is obscured until hovered or clicked

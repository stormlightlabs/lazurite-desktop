# Milestone 12: Social Diagnostics

Spec: [social-diagnostics.md](../specs/social-diagnostics.md)

## Steps

### Backend - Constellation Client (`src-tauri/src/constellation.rs`)

- [x] Constellation HTTP client struct with configurable base URL (default: `https://constellation.microcosm.blue`)
- [x] `get_backlinks_count(subject: String, source: String)` - `blue.microcosm.links.getBacklinksCount`
- [x] `get_backlinks(subject: String, source: String, limit: Option<u32>)` - `blue.microcosm.links.getBacklinks`
- [x] `get_distinct_dids(subject: String, source: String, limit: Option<u32>, cursor: Option<String>)` - `blue.microcosm.links.getDistinct`
- [x] `get_many_to_many_counts(subject: String, source: String, path_to_other: String)` - `blue.microcosm.links.getManyToManyCounts`
- [x] `get_many_to_many(subject: String, source: String, path_to_other: String, limit: Option<u32>)` - `blue.microcosm.links.getManyToMany`

### Backend - Diagnostics Commands (`src-tauri/src/commands/diagnostics.rs`)

- [x] `get_account_lists(did: String)` - query Constellation for `app.bsky.graph.listitem:subject` backlinks, extract list URIs, hydrate via `app.bsky.graph.getList`
- [x] `get_account_labels(did: String)` - query `com.atproto.label.queryLabels` (Bluesky API)
- [x] `get_account_blocked_by(did: String, limit: Option<u32>, cursor: Option<String>)` - Constellation `getDistinct` for `app.bsky.graph.block:subject`
- [x] `get_account_blocking(did: String, cursor: Option<String>)` - `com.atproto.repo.listRecords` on target's `app.bsky.graph.block` collection
- [x] `get_account_starter_packs(did: String)` - Constellation backlinks from starter pack collections
- [x] `get_record_backlinks(uri: String)` - Constellation backlinks grouped by interaction type (likes, reposts, replies, quotes)

### Backend - Settings

- [x] `constellation_url` field in settings table (default: `https://constellation.microcosm.blue`)
- [x] `set_constellation_url(url: String)` / `get_constellation_url()` commands

### Frontend - Diagnostics Panel

- [x] Tabbed panel component with 5 tabs: Lists, Labels, Blocks, Starter Packs, Backlinks
- [x] Tab switching with `Motion` sliding indicator underline
- [x] Number key shortcuts (`1`–`5`) for tab switching
- [x] `Escape` to close panel

### Frontend - Lists Tab

- [x] List cards: name, owner, description, purpose badge, member count
- [x] Grouped by purpose (curation / moderation / reference)
- [x] Skeleton loading matching card dimensions
- [x] Neutral framing - no aggregate risk scoring or warning badges

### Frontend - Labels Tab

- [x] Label chips with source attribution (labeling service name)
- [x] Uniform muted styling - no severity color-coding
- [x] Tooltip with label definition, source, and visibility effect
- [x] Explanatory empty state (what labels are, not "no labels found")
- [x] `Motion` scale-in on load

### Frontend - Blocks Tab

- [x] Counts-only default view (no names or profile cards on first load)
- [x] "Show details" expand with contextualizing copy (*"Blocks are a normal part of social media..."*)
- [x] `Presence` height animation on expand with staggered card fade-in
- [x] No warning banners, color-coding, or language implying abnormality
- [x] Self-view framing: "Your boundaries" (not "Who blocked you")

### Frontend - Starter Packs Tab

- [x] Compact starter pack cards: title, creator, description, member count
- [x] Link to view in AT Explorer

### Frontend - Backlinks Tab (Record Context)

- [x] Grouped by type: likes, reposts, replies, quote posts
- [x] Count per type with expandable sections
- [x] Individual actor/record cards within sections

### Frontend - Integration Points

- [x] Profile view: "Context" tab (alongside Posts/Replies/Media/Likes) - not the default tab
- [x] AT Explorer record view: backlinks supplementary panel (engagement data only, no moderation data)
- [x] AT Explorer repo view: follower/following counts from Constellation (no block counts in summaries)

# Milestone 12: Social Diagnostics

Spec: [social-diagnostics.md](../specs/social-diagnostics.md)

## Steps

### Backend - Constellation Client (`src-tauri/src/constellation.rs`)

- [ ] Constellation HTTP client struct with configurable base URL (default: `https://constellation.microcosm.blue`)
- [ ] `get_backlinks_count(subject: String, source: String)` - `blue.microcosm.links.getBacklinksCount`
- [ ] `get_backlinks(subject: String, source: String, limit: Option<u32>)` - `blue.microcosm.links.getBacklinks`
- [ ] `get_distinct_dids(subject: String, source: String, limit: Option<u32>, cursor: Option<String>)` - `blue.microcosm.links.getDistinct`
- [ ] `get_many_to_many_counts(subject: String, source: String, path_to_other: String)` - `blue.microcosm.links.getManyToManyCounts`
- [ ] `get_many_to_many(subject: String, source: String, path_to_other: String, limit: Option<u32>)` - `blue.microcosm.links.getManyToMany`

### Backend - Diagnostics Commands (`src-tauri/src/commands/diagnostics.rs`)

- [ ] `get_account_lists(did: String)` - query Constellation for `app.bsky.graph.listitem:subject` backlinks, extract list URIs, hydrate via `app.bsky.graph.getList`
- [ ] `get_account_labels(did: String)` - query `com.atproto.label.queryLabels` (Bluesky API)
- [ ] `get_account_blocked_by(did: String, limit: Option<u32>, cursor: Option<String>)` - Constellation `getDistinct` for `app.bsky.graph.block:subject`
- [ ] `get_account_blocking(did: String, cursor: Option<String>)` - `com.atproto.repo.listRecords` on target's `app.bsky.graph.block` collection
- [ ] `get_account_starter_packs(did: String)` - Constellation backlinks from starter pack collections
- [ ] `get_record_backlinks(uri: String)` - Constellation backlinks grouped by interaction type (likes, reposts, replies, quotes)

### Backend - Settings

- [ ] `constellation_url` field in settings table (default: `https://constellation.microcosm.blue`)
- [ ] `set_constellation_url(url: String)` / `get_constellation_url()` commands

### Frontend - Diagnostics Panel

- [ ] Tabbed panel component with 5 tabs: Lists, Labels, Blocks, Starter Packs, Backlinks
- [ ] Tab switching with `Motion` sliding indicator underline
- [ ] Number key shortcuts (`1`–`5`) for tab switching
- [ ] `Escape` to close panel

### Frontend - Lists Tab

- [ ] List cards: name, owner, description, purpose badge, member count
- [ ] Grouped by purpose (curation / moderation / reference)
- [ ] Skeleton loading matching card dimensions
- [ ] Neutral framing - no aggregate risk scoring or warning badges

### Frontend - Labels Tab

- [ ] Label chips with source attribution (labeling service name)
- [ ] Uniform muted styling - no severity color-coding
- [ ] Tooltip with label definition, source, and visibility effect
- [ ] Explanatory empty state (what labels are, not "no labels found")
- [ ] `Motion` scale-in on load

### Frontend - Blocks Tab

- [ ] Counts-only default view (no names or profile cards on first load)
- [ ] "Show details" expand with contextualizing copy (*"Blocks are a normal part of social media..."*)
- [ ] `Presence` height animation on expand with staggered card fade-in
- [ ] No warning banners, color-coding, or language implying abnormality
- [ ] Self-view framing: "Your boundaries" (not "Who blocked you")

### Frontend - Starter Packs Tab

- [ ] Compact starter pack cards: title, creator, description, member count
- [ ] Link to view in AT Explorer

### Frontend - Backlinks Tab (Record Context)

- [ ] Grouped by type: likes, reposts, replies, quote posts
- [ ] Count per type with expandable sections
- [ ] Individual actor/record cards within sections

### Frontend - Integration Points

- [ ] Profile view: "Context" tab (alongside Posts/Replies/Media/Likes) - not the default tab
- [ ] AT Explorer record view: backlinks supplementary panel (engagement data only, no moderation data)
- [ ] AT Explorer repo view: follower/following counts from Constellation (no block counts in summaries)

### UX Tone Review

- [ ] Audit all copy for neutral language - no "risk", "warning", "suspicious", "flagged"
- [ ] Ensure all sensitive sections use progressive disclosure (summary → details on click)
- [ ] Verify self-view ("my account") uses empowering framing, not anxiety-inducing

### Parking Lot

- [ ] Network relationship diff over time (requires historical snapshots)
- [ ] Profile/identity history timeline (handle/DID/PDS changes)

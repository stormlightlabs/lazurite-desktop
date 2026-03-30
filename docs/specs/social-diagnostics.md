# Social Diagnostics (Constellation-Powered)

A tabbed panel surfacing social context and network-side artifacts for any account or record. Powered by [Constellation](https://constellation.microcosm.blue/) - a global ATProto backlink index.

## Design Philosophy

This feature exists to give users **context**, the goal being informed decision-making, understanding who someone is in the network before you follow, reply, or trust.

**Guiding principles:**

- **Inform, don't alarm.**
  - Present data neutrally. Avoid language or visual treatments that frame normal social dynamics as threats (e.g., being on lists or being blocked is routine, not inherently suspicious).
- **No composite risk scores.**
  - Do not reduce a person's social standing to a number or traffic-light rating. Show the data; let the user interpret it.
- **Context over counts.**
  - A raw block count is meaningless without knowing the account's visibility. Prefer showing _what kind_ of lists/labels over _how many_.
- **Discoverable, not pushed.**
  - Diagnostics are available when sought, but the app should not proactively surface "warnings" about accounts in feeds or profiles. No unsolicited badges, banners, or alerts based on diagnostics data.
- **Respect the viewed account.**
  - This panel shows public protocol data, but the presentation should not feel like a dossier. Avoid dense tables of blockers/blocked. Default to aggregate summaries; expand to specifics only on request.
- **Self-diagnostics first.**
  - The most natural entry point is "what does the network say about _me_?" - help users understand their own footprint before inspecting others.

## Constellation Integration

Constellation indexes all references between AT Protocol records across the entire network. Lazurite queries it to answer "who/what points at this thing?" without running its own relay.

### XRPC Endpoints Used

| Endpoint                                   | Purpose                                              |
| ------------------------------------------ | ---------------------------------------------------- |
| `blue.microcosm.links.getBacklinksCount`   | Count backlinks from a specific collection+path      |
| `blue.microcosm.links.getBacklinks`        | List backlink records (with pagination)              |
| `blue.microcosm.links.getDistinct`         | Distinct DIDs linking to a target (with pagination)  |
| `blue.microcosm.links.getManyToManyCounts` | Counts for join records (e.g., list items → lists)   |
| `blue.microcosm.links.getManyToMany`       | List join records linking target to secondary target |

All endpoints accept a `subject` (DID, AT-URI, or URL) and a `source` in `collection:path` format (e.g., `app.bsky.graph.listitem:subject`).

### Constellation Client

A thin HTTP client in `src-tauri/src/constellation.rs` targeting a configurable Constellation instance (default: `https://constellation.microcosm.blue`). User-configurable in settings to support self-hosted instances.

## Tabs

### 1. Lists

What lists is this account on? Lists are how the network organizes and curates accounts - being on lists is normal and often positive (curation, topical grouping, community membership).

**Query:** `getBacklinks` with `subject={DID}`, `source=app.bsky.graph.listitem:subject`
→ extract list URIs from backlink records → hydrate via `app.bsky.graph.getList`

**Display:**

- List card: name, owner handle, description, purpose (curate/modlist/reference), member count
- Sort by member count or recency
- Grouped by purpose (curation lists vs. moderation lists vs. reference)
- No aggregate "risk" scoring - show the lists and let the user read them

### 2. Labels

Labels are moderation metadata applied by labeling services. They affect content visibility and carry context about how the network's moderation infrastructure sees an account. Present them factually - a label is a data point, not a verdict.

**Query:** `com.atproto.label.queryLabels` with subject DID (Bluesky API, not Constellation)

**Display:**

- Label chips with source attribution (which labeling service applied it)
- Muted, uniform styling - avoid color-coding that implies judgment (no red/amber/green severity scale)
- Tooltip with label definition, the labeling service that applied it, and what effect it has on visibility
- If no labels: brief explanatory text about what labels are, not an empty state that implies "clean"

### 3. Blocks & Boundaries

Blocking is a normal, healthy social boundary. This tab helps users understand interaction boundaries - especially useful when replies or follows silently fail. The framing should be matter-of-fact, never voyeuristic.

**Blocked-by (incoming):**
Constellation indexes backlinks. A block record created by DID-A targeting DID-B has `subject: DID-B`. Querying backlinks to DID-B from `app.bsky.graph.block:subject` returns the blocking accounts.

`getBacklinksCount` with `subject={DID}`, `source=app.bsky.graph.block:subject` → count
`getDistinct` with same params → paginated list of DIDs

**Blocking (outgoing):**
Not available via Constellation backlinks (the account's own block records point away from them). Use `com.atproto.repo.listRecords` on the account's `app.bsky.graph.block` collection.

**Display:**

- Show counts only by default - no names, no profile cards on first load
- "Show details" expands to a profile card list, with a brief note: _"Blocks are a normal part of social media. This data is public on the AT Protocol."_
- No color-coding, warning banners, or language implying that high counts are abnormal
- When viewing your own account: frame as "your boundaries" rather than "who blocked you"

### 4. Starter Packs

How are people discovering this account?

**Query:** `getBacklinks` with `subject={DID}`, `source=app.bsky.graph.starterpack:listItemsSample[].subject`
(Starter packs reference DIDs in their `listItemsSample` array.)

Alternatively, check list memberships - starter packs are backed by lists, so list membership from tab 1 can be cross-referenced.

**Display:**

- Compact starter pack cards: title, creator, description, member count
- Link to view full starter pack in AT Explorer

### 5. Backlinks (Record Context)

When viewing a specific record (post, profile, etc.), show all references to it.

**Query:** `getBacklinks` with `subject={AT-URI}`, various sources:

- `app.bsky.feed.like:subject.uri` - likes
- `app.bsky.feed.repost:subject.uri` - reposts
- `app.bsky.feed.post:reply.parent.uri` - direct replies
- `app.bsky.feed.post:embed.record.uri` - quote posts

**Display:**

- Grouped by interaction type with counts
- Expandable sections showing individual records/actors
- Useful in AT Explorer record view as a supplementary panel

## Integration Points

- **Profile view**: "Context" tab alongside Posts/Replies/Media/Likes - available but not the default tab
- **AT Explorer record view**: backlinks panel showing references to current record (engagement data, not moderation data)
- **AT Explorer repo view**: follower/following counts from Constellation (no block counts in summary views - those belong in the dedicated diagnostics panel only)
- **No feed-level enrichment**: diagnostics data should never appear inline on posts in feeds. Users navigate to it intentionally.

## Keyboard Shortcuts

| Key                  | Action                          |
| -------------------- | ------------------------------- |
| `CMD/CTRL` + `1`–`5` | Switch between diagnostics tabs |
| `Escape`             | Close diagnostics panel         |

## UX Polish

- Tab switch: `Motion` sliding indicator underline
- List/card loading: skeleton screens matching card dimensions
- Detail expansion: `Presence` height animation with staggered card fade-in
- Label chips: `Motion` scale-in on load
- Counts: animated number transition (`Motion` on value change)
- Error states: inline retry per section, not full-panel error
- **Tone**: use neutral, descriptive copy throughout. Avoid words like "risk", "warning", "suspicious", "flagged". Prefer "context", "details", "public data"
- **Progressive disclosure**: all sensitive sections (blocks, moderation labels) default to summary/count view. Expanding to specifics requires a deliberate click, with a brief contextualizing note

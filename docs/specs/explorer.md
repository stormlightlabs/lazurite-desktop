# AT Explorer (pds.ls-style)

A built-in browser for AT Protocol data, inspired by [pds.ls](https://pds.ls/).
This is the view that opens when handling `at://` URIs.

## Navigation Model

URL-bar style input accepting:

- `at://` URIs → route directly to record/collection/repo
- Handles (`@user.bsky.social`) → resolve DID → show repo
- DIDs (`did:plc:...`) → show repo
- PDS URLs (`https://pds.example.com`) → list hosted repos

## Views

### PDS View

- List accounts hosted on a PDS
- Show PDS metadata (version, invite codes status)
- Endpoint: `com.atproto.server.describeServer`

### Repository View

- List all collections in a repo (e.g., `app.bsky.feed.post`, `app.bsky.feed.like`)
- Show repo metadata: DID, handle, PDS URL
- Endpoint: `com.atproto.repo.describeRepo`, `com.atproto.sync.getRepo`

### Collection View

- Paginated list of records in a collection
- Endpoint: `com.atproto.repo.listRecords`

### Record View

- Full JSON display of a single record
- Render known types nicely (posts → rich text, likes → linked post, follows → profile card)
- Show CID, rkey, timestamps
- Endpoint: `com.atproto.repo.getRecord`

## Additional Features

- **Backlinks** (via Constellation): show records that reference the current record, grouped by interaction type (likes, reposts, replies, quotes) with counts and expandable actor lists. Uses `blue.microcosm.links.getBacklinks` and `getBacklinksCount` endpoints.
- **Jetstream live view**: stream new records in real-time via `jacquard::jetstream`
- **CAR export**: download repo as CAR archive via `com.atproto.sync.getRepo`
- **Moderation labels**: query and display labels via `com.atproto.label.queryLabels`
- **Breadcrumb navigation**: `PDS > Repo > Collection > Record` with back/forward

## Keyboard Shortcuts

| Key               | Action                              |
| ----------------- | ----------------------------------- |
| `Cmd+L`           | Focus explorer URL bar              |
| `Backspace`       | Navigate up one level in breadcrumb |
| `Cmd+[` / `Cmd+]` | Back / forward                      |

## UX Polish

- View transitions: `Presence` crossfade when navigating between PDS → repo → collection → record
- Jetstream live-tail: new records `Motion` slide-in from top with fade
- JSON record view: syntax-highlighted with collapsible sections
- Breadcrumb segments animate width via `Motion` on navigation
- Skeleton screens for each view level while loading
- Error inline with retry, not a blocking modal

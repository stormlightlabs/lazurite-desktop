# Task 05: AT Explorer

Spec: [explorer.md](../specs/explorer.md)

## Steps

- [ ] Create `src-tauri/src/explorer.rs` — Tauri commands for AT data browsing
- [ ] `resolve_input(input: String)` — detect if input is at:// URI, handle, DID, or PDS URL; resolve accordingly
- [ ] `describe_server(pds_url: String)` — `com.atproto.server.describeServer`
- [ ] `describe_repo(did: String)` — `com.atproto.repo.describeRepo`
- [ ] `list_records(did: String, collection: String, cursor: Option<String>)` — `com.atproto.repo.listRecords`
- [ ] `get_record(did: String, collection: String, rkey: String)` — `com.atproto.repo.getRecord`
- [ ] `export_repo_car(did: String)` — `com.atproto.sync.getRepo`, save to file
- [ ] `query_labels(uri: String)` — `com.atproto.label.queryLabels`
- [ ] Wire deep-link handler: `at://` URI → parse → call `resolve_input` → emit navigation event
- [ ] **Frontend**: explorer URL bar with input parsing, `Cmd+L` to focus
- [ ] **Frontend**: PDS view — server info + hosted account list, skeleton loading
- [ ] **Frontend**: repo view — collection list with record counts
- [ ] **Frontend**: collection view — paginated record list
- [ ] **Frontend**: record view — syntax-highlighted JSON with collapsible sections, type-specific rendering
- [ ] **Frontend**: breadcrumb navigation bar with `Motion` width animation on segment changes
- [ ] **Frontend**: `Presence` crossfade transitions between explorer view levels
- [ ] **Frontend**: keyboard shortcuts — `Backspace` up a level, `Cmd+[/]` back/forward
- [ ] **Frontend**: Jetstream live-tail view with `Motion` slide-in for new records

### Parking Lot

These require update to the spec & more research before implementation.

- [ ] **Frontend**: Firehose Viewer
- [ ] **Frontend**: [Spacedust](https://spacedust.microcosm.blue/) Viewer

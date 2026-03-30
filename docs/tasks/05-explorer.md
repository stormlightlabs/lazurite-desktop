# Milestone 05: AT Explorer

Spec: [explorer.md](../specs/explorer.md)

## Tasks

- [x] Create `src-tauri/src/explorer.rs` for business logic
  - `src-tauri/src/commands/explorer.rs` - Tauri commands for AT data browsing
- [x] `resolve_input(input: String)` - detect if input is at:// URI, handle, DID, or PDS URL; resolve accordingly
- [x] `describe_server(pds_url: String)` - `com.atproto.server.describeServer`
- [x] `describe_repo(did: String)` - `com.atproto.repo.describeRepo`
- [x] `list_records(did: String, collection: String, cursor: Option<String>)` - `com.atproto.repo.listRecords`
- [x] `get_record(did: String, collection: String, rkey: String)` - `com.atproto.repo.getRecord`
- [x] `export_repo_car(did: String)` - `com.atproto.sync.getRepo`, save to file
- [x] `query_labels(uri: String)` - `com.atproto.label.queryLabels`
- [x] Wire deep-link handler: `at://` URI → parse → call `resolve_input` → emit navigation event
- [x] **Frontend**: explorer URL bar with input parsing, `Cmd+L` to focus
- [x] **Frontend**: PDS view - server info + hosted account list, skeleton loading
- [ ] **Frontend**: repo view - collection list with record counts
- [x] **Frontend**: collection view - paginated record list
- [x] **Frontend**: record view - syntax-highlighted JSON with collapsible sections, type-specific rendering
- [x] **Frontend**: breadcrumb navigation bar with `Motion` width animation on segment changes
- [x] **Frontend**: `Presence` crossfade transitions between explorer view levels
- [x] **Frontend**: keyboard shortcuts - `Backspace` up a level, `Cmd+[/]` back/forward

# Milestone 10: Jetstream

Spec: [explorer.md](../specs/explorer.md)

## Tasks

### Backend - Jetstream (`src-tauri/src/jetstream.rs`)

- [ ] `jetstream_subscribe(config: JetstreamConfig)` - open a WebSocket connection to a Jetstream instance via `jacquard::jetstream`, emit Tauri events for each incoming record
  - `JetstreamConfig`: `{ url: String, collections: Option<Vec<String>>, dids: Option<Vec<String>> }` - filter by collection NSIDs and/or DIDs
- [ ] `jetstream_unsubscribe()` - close the active WebSocket connection, clean up
- [ ] Tauri event emission: `jetstream:record` with serialized record payload (collection, rkey, DID, operation, record JSON)
- [ ] Connection lifecycle events: `jetstream:connected`, `jetstream:disconnected`, `jetstream:error`
- [ ] Reconnection with backoff on disconnect (reuse `jacquard::jetstream` reconnect behavior if available)

### Frontend - Jetstream Live-Tail

- [ ] Jetstream live-tail view with `Motion` slide-in for new records
- [ ] Filter controls: collection NSID filter, DID filter, operation type (create/update/delete)
- [ ] Pause/resume button to freeze the stream without disconnecting
- [ ] Record count and events-per-second indicator
- [ ] Click record to navigate to its full record view in the explorer

### Parking Lot

These require update to the spec & more research before implementation.

- [ ] **Frontend**: Firehose Viewer
- [ ] **Frontend**: Spacedust integration (see [Task 11](./11-spacedust.md))

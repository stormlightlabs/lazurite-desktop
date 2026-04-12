# Follow Hygiene

Surfaces inactive, blocked, or otherwise unreachable accounts in the user's following list and provides batch unfollow. Inspired by [cleanfollow-bsky](https://github.com/notjuliet/cleanfollow-bsky).

## Motivation

Following lists accumulate dead weight over time: deleted accounts, deactivated users, mutual blocks, suspended accounts. These inflate follow counts, pollute feed algorithms, and create a false sense of network size. Follow Hygiene gives users a tool to audit and prune their following list without manually checking each account.

## Account Statuses

Each followed account is classified by querying the appview. Statuses are bitflags to support compound states (e.g., mutual block).

| Status      | Detection Method                                                                 |
| ----------- | -------------------------------------------------------------------------------- |
| Deleted     | `getProfiles` omits DID; fallback `getProfile` returns `"not found"`             |
| Deactivated | Fallback `getProfile` returns `"deactivated"`                                    |
| Suspended   | Fallback `getProfile` returns `"suspended"`                                      |
| Blocked By  | `viewer.blockedBy` is `true`                                                     |
| Blocking    | `viewer.blocking` or `viewer.blockingByList` is set                              |
| Hidden      | Account has a `!hide` label from a moderation service                            |
| Self-Follow | Followed DID matches the authenticated user's DID                                |

Compound: **Mutual Block** = `BlockedBy | Blocking`.

Accounts that are reachable and have no issues are not surfaced — only problematic follows appear.

## Backend (Rust)

### Follow Enumeration

New function in the feed/graph module:

1. Paginate `com.atproto.repo.listRecords` for `app.bsky.graph.follow` (page size 100)
2. Batch-resolve profiles via `app.bsky.actor.getProfiles` (max 25 per call)
3. For DIDs missing from the batch response, individually query `app.bsky.actor.getProfile` to distinguish deleted/deactivated/suspended
4. Resolve handles for missing DIDs via DID document (`plc.directory` or `did:web`)
5. Return only accounts with a non-zero status — healthy follows are filtered out

Concurrency: process profile batches with bounded concurrency (2-3 concurrent requests) and inter-batch delays to respect rate limits. Use `tokio::sync::Semaphore` or similar.

**Tauri command:** `audit_follows() -> Vec<FlaggedFollow>`

```rust
struct FlaggedFollow {
    did: String,
    handle: String,
    follow_uri: String,     // at:// URI of the follow record
    status: u8,             // bitflag
    status_label: String,   // human-readable
}
```

Progress reporting via Tauri events: emit `follow-hygiene:progress` with `{ current: usize, total: usize }` as each batch completes so the frontend can render a progress bar without polling.

### Batch Unfollow

Use `com.atproto.repo.applyWrites` to delete multiple follow records in a single transaction. The PDS enforces a max of 200 writes per call — chunk accordingly.

**Tauri command:** `batch_unfollow(follow_uris: Vec<String>) -> BatchResult`

```rust
struct BatchResult {
    deleted: usize,
    failed: Vec<String>,  // URIs that failed
}
```

Each write is a `Delete` operation on `app.bsky.graph.follow` with the rkey extracted from the follow URI.

## Frontend (SolidJS)

### Entry Point

Accessible from two locations:

1. **Profile panel** — button in the user's own profile (not visible on other users' profiles). Naturally fits as a self-diagnostic action alongside follower/following lists.
2. **Settings > Account** — secondary entry point for users who think of this as account maintenance.

Both open the same `FollowHygienePanel` component, rendered as a slide-over panel or routed view (consistent with how Social Diagnostics panels work).

### State

```ts
type FollowHygieneState = {
  phase: "idle" | "scanning" | "ready" | "unfollowing" | "done";
  progress: { current: number; total: number };
  flagged: FlaggedFollow[];
  selectedUris: Set<string>;
  filters: Record<StatusCategory, { visible: boolean; selected: boolean }>;
  result: { deleted: number; failed: string[] } | null;
};
```

Use `createStore` for local component state — this is a self-contained tool, not shared state that needs context.

### Scan Flow

1. User clicks "Scan follows"
2. Frontend invokes `audit_follows`, transitions to `scanning` phase
3. Progress bar updates via Tauri event listener (`follow-hygiene:progress`)
4. On completion, `flagged` array populates, phase becomes `ready`
5. If no flagged accounts found: show a brief "All clear" message

### Selection & Filtering

- **Category toggles**: visibility toggles per status category (show/hide deleted, deactivated, etc.)
- **Category select-all**: checkbox per category to batch-select/deselect all accounts of that type
- **Individual selection**: per-account checkbox
- **Selection counter**: `{selected} / {total}` in the action bar

### Unfollow Flow

1. User reviews selection, clicks "Unfollow selected"
2. Confirmation step: "Unfollow {n} account(s)?" — destructive action, requires deliberate confirmation
3. Frontend invokes `batch_unfollow` with selected URIs
4. On completion, remove unfollowed accounts from the list, show result summary
5. If any failures, show count with option to retry failed

### Layout

Left sidebar (sticky): category filters with toggles and select-all checkboxes, selection counter.
Main area: scrollable list of flagged accounts.

Each account row:

- Checkbox for selection
- Handle (if resolvable) with external link to Bluesky profile
- DID with external link to AT Explorer
- Status label chip

Selected rows get a subtle background tint to indicate pending deletion.

## UX Polish

- Scan button: disabled with spinner while scanning
- Progress bar: determinate bar based on `current/total` with animated fill
- Account list: `Motion` staggered fade-in on scan completion
- Row selection: immediate background tint transition
- Unfollow completion: `Motion` exit animation on removed rows, counter animates down
- Confirmation dialog: `Presence` fade-in overlay
- Empty state (no flagged accounts): brief, positive message — not a dramatic "all clear" celebration

## Keyboard Shortcuts

| Key       | Action                              |
| --------- | ----------------------------------- |
| `Space`   | Toggle selection on focused account |
| `Ctrl+A`  | Select all visible accounts         |
| `Escape`  | Close panel / cancel confirmation   |

## Relationship to Social Diagnostics

Follow Hygiene is complementary to Social Diagnostics but distinct in purpose:

- **Social Diagnostics** answers "what does the network say about this account?" (read-only inspection)
- **Follow Hygiene** answers "which of my follows are dead weight?" (actionable cleanup)

The Blocks & Boundaries tab in Social Diagnostics surfaces block relationships for any account. Follow Hygiene uses similar detection but is scoped to the authenticated user's following list and provides write actions (unfollow).

Data from `audit_follows` could inform the Social Diagnostics self-view in the future, but the two features should remain separate panels with separate entry points.

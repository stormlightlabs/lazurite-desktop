# Task 02: Auth & Accounts

Spec: [auth.md](../specs/auth.md)

## Steps

- [x] Implement `PersistentAuthStore` backed by SQLite (impl `jacquard::oauth::authstore` trait)
- [x] Create Tauri command `login(handle: String)`:
  - Resolve handle → authorization server
  - Build `AtprotoClientMetadata` for Lazurite
  - Start loopback OAuth via `LoopbackConfig`
  - Store session tokens, insert into `accounts` table
  - Return account info to frontend
- [x] Create Tauri command `logout(did: String)` - revoke tokens, remove from DB
- [x] Create Tauri command `switch_account(did: String)` - swap active `OAuthSession` in state
- [x] Create Tauri command `list_accounts()` → `Vec<Account>`
- [x] On app launch: restore sessions from DB, auto-refresh tokens for active account
- [x] Register `at://` scheme via deep-link plugin in `tauri.conf.json`
- [x] Handle deep-link events: parse `at://` URI, emit Tauri event to frontend for navigation

### Frontend

- [x] login form with `Motion` spring shake on invalid handle
- [x] account switcher dropdown in sidebar with `Presence` avatar enter/exit
- [x] skeleton shimmer on profile card during session restore
- [x] inline re-auth prompt with pulse animation on session expiry

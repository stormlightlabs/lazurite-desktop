# Task 02: Auth & Accounts

Spec: [auth.md](../specs/auth.md)

## Steps

- [ ] Implement `PersistentAuthStore` backed by SQLite (impl `jacquard_oauth::authstore` trait)
- [ ] Create Tauri command `login(handle: String)`:
  - Resolve handle → authorization server
  - Build `AtprotoClientMetadata` for Lazurite
  - Start loopback OAuth via `LoopbackConfig`
  - Store session tokens, insert into `accounts` table
  - Return account info to frontend
- [ ] Create Tauri command `logout(did: String)` — revoke tokens, remove from DB
- [ ] Create Tauri command `switch_account(did: String)` — swap active `OAuthSession` in state
- [ ] Create Tauri command `list_accounts()` → `Vec<Account>`
- [ ] On app launch: restore sessions from DB, auto-refresh tokens for active account
- [ ] Register `at://` scheme via deep-link plugin in `tauri.conf.json`
- [ ] Handle deep-link events: parse `at://` URI, emit Tauri event to frontend for navigation
- [ ] **Frontend**: login form with `Motion` spring shake on invalid handle
- [ ] **Frontend**: account switcher dropdown in sidebar with `Presence` avatar enter/exit
- [ ] **Frontend**: skeleton shimmer on profile card during session restore
- [ ] **Frontend**: inline re-auth prompt with pulse animation on session expiry

# Auth & Account Management

## OAuth 2.1 Loopback Flow

Uses `jacquard::oauth` with `LoopbackConfig` to authenticate:

1. User enters handle or DID
2. Resolve authorization server via `jacquard::oauth::resolver`
3. Build `AtprotoClientMetadata` with app identity
4. `OAuthClient` initiates PAR + DPoP flow
5. Loopback server captures redirect on `127.0.0.1:<port>`
6. Exchange code for tokens; `OAuthSession` manages refresh automatically

No app passwords needed — full OAuth 2.1 with DPoP proof-of-possession but app passwords
should be supported in dev environments.

## Multi-Account

- SQLite table `accounts`: `did TEXT PK, handle TEXT, pds_url TEXT, active INTEGER`
- Encrypted token storage via `jacquard::oauth::authstore` trait with a persistent implementation backed by SQLite + OS keychain (Tauri's `tauri-plugin-keychain` or raw `security-framework`)
- Account switcher in sidebar — click to swap active session
- Each account gets its own `OAuthSession` instance
- Active account DID stored in app state; Tauri events notify frontend on switch

## UX Polish

- Login form: `Motion` spring animation on the handle input shake for invalid input
- Account switcher: `Presence` exit/enter animation when swapping active account avatar
- Session expiry: inline re-auth prompt with gentle pulse animation, not a modal wall
- Loading: skeleton shimmer on profile card while session restores

## Session Lifecycle

- On launch: load stored sessions, attempt token refresh for active account
- On token expiry: `jacquard::oauth` auto-refreshes via DPoP-bound refresh token
- On refresh failure: prompt re-auth, mark account as expired in UI
- Logout: revoke tokens, clear stored auth data

## at:// Deep Link Registration

- Register `at` scheme via `tauri-plugin-deep-link`
- On `at://` link open: parse URI, route to AT Explorer view
- If app not running: launch, then navigate after session restore

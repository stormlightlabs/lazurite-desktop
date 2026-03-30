# Task 01: Rust Backend Setup

Spec: [mvp.md](../specs/mvp.md)

## Steps

- [x] Add Cargo dependencies: `jacquard`, `rusqlite` (bundled), `sqlite-vec`, `fastembed`, `tokio`
- [x] Add Tauri plugins: `tauri-plugin-deep-link`, `tauri-plugin-notification`,  `tauri-plugin-log`
- [x] Add frontend deps: `solid-motionone` (animation), install via npm
- [x] Create `src-tauri/src/db.rs` - initialize SQLite, run migrations, load `sqlite-vec` extension
- [x] Create migration system: `accounts`, `posts`, `posts_fts`, `posts_vec` tables
  - Embedded files via `include_str!` for SQL schema
- [x] Create `src-tauri/src/state.rs` - `AppState` struct holding DB pool, active session, account list
- [x] Register `AppState` as Tauri managed state
- [x] Create Tauri command scaffold with error handling pattern using `thiserror` crate
- [x] Set up dark/light theme: CSS custom properties, OS preference detection via `prefers-color-scheme`
  - Follow the design spec
- [x] Create global error toast component using `Presence` for enter/exit animations
- [x] Verify build compiles on macOS with `pnpm tauri dev`

- Note: `tauri-plugin-updater` will come after the first release

# Task 01: Rust Backend Setup

Spec: [mvp.md](../specs/mvp.md)

## Steps

- [ ] Add Cargo dependencies: `jacquard`, `rusqlite` (bundled), `sqlite-vec`, `fastembed`, `tokio`
- [ ] Add Tauri plugins: `tauri-plugin-deep-link`, `tauri-plugin-notification`, `tauri-plugin-updater`
- [ ] Add frontend deps: `solid-motionone` (animation), install via npm
- [ ] Create `src-tauri/src/db.rs` — initialize SQLite, run migrations, load `sqlite-vec` extension
- [ ] Create migration system: `accounts`, `posts`, `posts_fts`, `posts_vec` tables
- [ ] Create `src-tauri/src/state.rs` — `AppState` struct holding DB pool, active session, account list
- [ ] Register `AppState` as Tauri managed state
- [ ] Create Tauri command scaffold with error handling pattern (`Result<T, String>` or custom error type)
- [ ] Set up dark/light theme: CSS custom properties, OS preference detection via `prefers-color-scheme`
- [ ] Create global error toast component using `Presence` for enter/exit animations
- [ ] Verify build compiles on macOS with `cargo tauri dev`

# Lazurite Desktop - MVP Spec

A native desktop BlueSky/AT Protocol client built with **Tauri v2** (Rust) + **SolidJS**, focused on power-user features: multi-account, local semantic search, AT Protocol data exploration, and Constellation-powered social diagnostics.

## Architecture

```text
┌─────────────────────────────────────────────┐
│  SolidJS Frontend (WebView)                 │
│  ├─ Timeline / Feed views                   │
│  ├─ AT Explorer (pds.ls-style)              │
│  ├─ Social Diagnostics panel                │
│  ├─ Search UI (FTS + semantic)              │
│  ├─ Multicolumn deck view                   │
│  └─ Account switcher                        │
├─────────────────────────────────────────────┤
│  Tauri IPC (Commands + Events)              │
├─────────────────────────────────────────────┤
│  Rust Backend                               │
│  ├─ jacquard         - XRPC client + types  │
│  ├─ jacquard::oauth   - OAuth 2.1 loopback  │
│  ├─ rusqlite + sqlite-vec - local storage   │
│  ├─ fastembed         - nomic-embed-text    │
│  ├─ constellation     - backlink index API  │
│  └─ tauri plugins     - deep-link, log,     │
│                         updater             │
└─────────────────────────────────────────────┘
```

## Key Dependencies

| Crate / Lib              | Purpose                                                                |
| ------------------------ | ---------------------------------------------------------------------- |
| `jacquard`               | AT Protocol XRPC client, zero-copy types, session management           |
| `jacquard::oauth`        | OAuth 2.1 with DPoP, PKCE, PAR; loopback flow via `LoopbackConfig`     |
| `rusqlite` (bundled)     | Local SQLite database                                                  |
| `sqlite-vec`             | Vector similarity search extension for SQLite                          |
| `fastembed`              | Local ONNX inference for `nomic-embed-text-v1.5` embeddings            |
| `tauri-plugin-deep-link` | Register `at://` URI scheme handler                                    |
| `constellation`          | Constellation HTTP client for global ATProto backlink queries          |
| `solid-motionone`        | Animation primitives (`Motion`, `Presence`) for SolidJS via Motion One |

## Cross-Cutting Concerns

- **Theme**: dark/light mode synced with OS, applied globally
- **Keyboard shortcuts**: Aeronaut-inspired, registered per-view (see individual specs)
- **Error UX**: toast notifications for transient errors, inline retry for network failures
- **Loading states**: skeleton screens for feeds/lists, spinners for actions
- **Accessibility**: ARIA labels, keyboard focus management, screen reader support
- **Animations** (`solid-motionone`): used throughout for transitions and micro-interactions (see individual specs for specifics)
- **Auto-update**: `tauri-plugin-updater` checking GitHub Releases
- **Packaging**: macOS code signing, notarization, DMG distribution

## Feature Modules

Details in sub-specs:

- [Authentication & Accounts](./auth.md)
- [Feeds & Social](./feeds.md)
- [AT Explorer](./explorer.md)
- [Settings](./settings.md)
- [Search & Embeddings](./search.md)
- [Social Diagnostics](./social-diagnostics.md)
- [Multicolumn Views](./multicolumn.md)
- [Follow Hygiene](./follow-hygiene.md)

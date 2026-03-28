# Lazurite (for Desktop)

## Features

- Account switching
- Read standard.site posts for a handle
- View all of your feeds, starter packs, and lists
- Search all your saved and liked posts
- PDS browser

## Stack

Rust/Tauri
    - `rustqlite`/`tokio-rustqlite` & `tokio` for sqlite (FTS and vector search)
    - `jacquard` for atproto client
    - `fastembed` and `nomic-embed-text` for embeddings

## Inspiration

- [Aeronaut for BlueSky](https://apps.apple.com/us/app/aeronaut-for-bluesky/id6670275450) (Mac Only)
- [pds.ls](https://pds.ls)

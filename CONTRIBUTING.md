# Contributing to Lazurite Desktop

Thanks for helping improve Lazurite.

## Setup

1. Install prerequisites:
   - Node.js 20+
   - pnpm
   - Rust stable toolchain (for Tauri/backend work)
1. Install dependencies:

```bash
pnpm install
```

For Rust/Tauri development:

```sh
cd src-tauri
cargo check && cargo build
```

1. Run the app:

```bash
# Frontend only
pnpm dev

# Full desktop app (Tauri + frontend)
pnpm tauri dev
```

## Before Opening a Pull Request

Run the following from the repository root:

```bash
pnpm typecheck
pnpm test
pnpm lint
pnpm format
```

If your changes touch Rust code, also run:

```bash
cd src-tauri
cargo fmt --check
cargo clippy --all-targets --all-features -- -D warnings
```

## Project Conventions

- Use pnpm for frontend workflows.
- Keep Tauri commands in `src-tauri/src/commands.rs` and keep command handlers thin.
- Put business logic in focused Rust modules, then call those from commands.
- Follow Solid patterns used in this repo (for example, `Show`/`For`/`Index` where appropriate).
- Follow the design system in `docs/design.md` for UI work.
- Do not ignore lint rules.
- Frontend errors should be human-readable; logs should be detailed and technical.

## Pull Request Expectations

- Keep changes focused and scoped.
- Link related issues (for example, `Closes #123`).
- Include screenshots or short recordings for visible UI changes.
- Update docs/specs when behavior or architecture changes.
- Add or update tests when practical.

## Security

Please do not open public issues for security vulnerabilities.
Contact the [maintainers privately](mailto:info@stormlightlabs.org).

## License

By contributing, you agree that your contributions are licensed under the MIT License.

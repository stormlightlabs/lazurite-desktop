# Pull Request

## Summary

Describe what changed and why.

## Related Issues

Closes #

## Type of Change

- [ ] Fix
- [ ] Feature
- [ ] Refactor
- [ ] Docs
- [ ] Chore

## Validation

List what you ran and the result.

```bash
pnpm typecheck
pnpm test
pnpm lint
pnpm format
```

If Rust code changed:

```bash
cd src-tauri
cargo fmt --check
cargo clippy --all-targets --all-features -- -D warnings

# OR
cargo clippy --fix --allow-dirty && cargo fmt
```

## Screenshots (If UI Changed)

Attach screenshots or a short recording.

## Checklist

- [ ] I have read CONTRIBUTING.md
- [ ] I kept this PR focused and reasonably small
- [ ] I updated docs/tests where relevant

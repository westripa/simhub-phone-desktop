# SimHub Phone Desktop · Agent Rules

## Release Versioning (Sequential Only)

- **Strictly increment patch version sequentially**: every new release MUST advance the patch version one step at a time (`v0.2.0` -> `v0.2.1` -> `v0.2.2` -> `v0.2.3`).
- **Never skip version numbers**: do not jump patch versions or bump minor/major versions on your own unless the user explicitly instructs a minor or major release.
- **Sync version files before tagging `vX.Y.Z`**:
  - Update `"version"` in `package.json`
  - Update `version` in `src-tauri/Cargo.toml`
  - Update `"version"` in `src-tauri/tauri.conf.json`
  - Ensure all three match the release tag `vX.Y.Z` exactly before creating and pushing the annotated tag.

## Verification Before Push / Release

- Frontend unit tests & build:
  - `bun test src/phone`
  - `bun run build`
- Desktop Rust check (required when `src-tauri/` or `tauri.conf.json` changes):
  - `cargo check --manifest-path src-tauri/Cargo.toml`

## Security & Repository Hygiene

- Never commit updater signing keys, passphrases, SIP credentials, HA1 hashes, TURN secrets, real phone numbers, or private server addresses into Git, commit messages, logs, or responses.
- Keep updater artifacts and `latest.json` aligned with [README.md](README.md) and `.github/workflows/release.yml`.

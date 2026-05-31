# Contributing to vimcode

## Development setup

```bash
just install     # install deps
just dev         # launch OpenCode with the plugin loaded
just check       # run lint + tests
```

Running `opencode` directly in this directory won't load the plugin. You need `just dev`, which sets `OPENCODE_TUI_CONFIG=dev-tui.json`.

## Adding a keybinding

1. Add the key check in the right section of `src/vim.ts` (`handleNormalKey()` for normal mode keys).
2. Return appropriate actions: `{ consume: true, actions: [{ type: "cmd", cmd: "input.some.command" }] }`
3. Add a test in `test/vim.test.ts`.
4. Run `just check`, then `just dev` to verify.

See `AGENTS.md` for operator+motion combos and other patterns.

## Pull requests

All changes go through pull requests — direct pushes to `main` are blocked.

### Branch naming

Use `type/description` with lowercase, hyphen-separated words:

- `feat/replace-char`
- `fix/escape-handling`
- `chore/update-deps`

Types match commit prefixes: `feat`, `fix`, `refactor`, `chore`, `test`, `docs`.

### Workflow

1. Create a branch: `git checkout -b feat/your-feature`
2. Make changes, run `just check` locally. It must pass with zero errors and zero warnings.
3. Push and open a PR against `main`.
4. CI runs `just check`. Warnings are treated as errors — the PR will be blocked until the check is fully clean.
5. PRs are squash-merged. The PR title becomes the commit message on `main`.

## Commit messages

Conventional-ish prefixes: `feat:`, `fix:`, `refactor:`, `chore:`, `test:`, `docs:`.

## Changelog

Follow [Keep a Changelog](https://keepachangelog.com/en/1.1.0/). Add your change to `[Unreleased]` in `CHANGELOG.md` in the same PR. Past tense, reader's perspective, one bullet per change.

## Versioning

[SemVer](https://semver.org/spec/v2.0.0.html). 0.x.y until the plugin API stabilizes:

- **PATCH**: Bug fixes, docs
- **MINOR**: New keybindings, new features (backward compatible)
- **MAJOR**: Breaking changes, removed keybindings

## Release process

Releases are manual.

1. Check that `[Unreleased]` in CHANGELOG.md is complete.
2. Decide the version bump (SemVer rules above).
3. Move `[Unreleased]` entries into a new `## [X.Y.Z] — YYYY-MM-DD` section.
4. Update link references at the bottom of CHANGELOG.md.
5. Bump version in `package.json` (`npm version X.Y.Z --no-git-tag-version`).
6. Bump `VERSION` in `src/version.ts` to match.
7. Update the version tag in `README.md`'s install snippet.
8. Run `just check`.
9. Open a PR with the release changes. Title: `Release vX.Y.Z: <one-line summary>`.
10. After CI passes, squash-merge the PR.
11. Tag and push: `git tag vX.Y.Z && git push origin vX.Y.Z`
12. Create a GitHub release: `gh release create vX.Y.Z --title "vX.Y.Z" --latest --notes "<changelog section for this version>"`

## Distribution

vimcode is installed via git URL in OpenCode's `tui.json`:

```json
{ "plugin": ["vimcode@git+https://github.com/oribarilan/vimcode.git"] }
```

Bare names (like `"vimcode"`) trigger npm resolution, which won't work since the package isn't published. The `@git+` prefix tells OpenCode to clone from GitHub.

## Architecture

`src/vim.ts` owns all key handling (pure functions). `src/index.ts` owns all OpenCode API interaction. See `AGENTS.md` for the full architecture guide.

# Contributing to vimcode

## Development setup

```bash
just install     # install deps
just dev         # launch OpenCode v1 with the plugin loaded
just dev2        # launch pinned v2 with local source and separate .dev2/ state
just check       # run lint + tests
```

Running `opencode` directly in this directory won't load the plugin. `just dev` sets `OPENCODE_TUI_CONFIG=dev-tui.json`. `just dev2` uses npm's package runner (`npx`) for OpenCode 2.0.15 and keeps its on-disk settings/history separate under `.dev2/`. To use an existing v2 binary, run `just dev2 /absolute/path/to/opencode-v2` or set `OPENCODE_V2_BIN`. See [the v2 POC notes](docs/opencode-v2-poc.md#local-development).

## Adding a keybinding

1. Add the key check in the matching mode handler under `src/vim/` (`src/vim/normal.ts` for normal mode keys).
2. Return appropriate actions: `{ consume: true, actions: [{ type: "cmd", cmd: "input.some.command" }] }`
3. Add a test in the matching file under `test/vim/` (`test/vim/normal.test.ts` for normal mode keys).
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
4. CI runs `just check` and `just compat-unit`. Warnings are treated as errors; both checks must pass. Live-host compatibility checks remain manual.
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

## Host support policy

OpenCode v2 support is rolling out gradually and remains experimental in vimcode v0.19.1. Future maintenance will move to v2 only; v1 compatibility remains in this release. The recommended v1 pin stays at `v0.18.1`. Do not automatically advance that legacy recommendation when preparing a v2-focused release.

## Release process

Releases are manual.

1. Check that `[Unreleased]` in CHANGELOG.md is complete.
2. Decide the version bump (SemVer rules above).
3. Move `[Unreleased]` entries into a new `## [X.Y.Z] — YYYY-MM-DD` section.
4. Update link references at the bottom of CHANGELOG.md.
5. Bump version in `package.json` (`npm version X.Y.Z --no-git-tag-version`).
6. Bump `VERSION` in `src/version.ts` to match.
7. Update the current v2 package refs and release wording in `README.md` and this guide, including options and leader examples. Keep the recommended v1 pin unchanged unless a v1 upgrade is deliberately recommended and verified.
8. Run `just check`.
9. Open a PR with the release changes. Title: `Release vX.Y.Z: <one-line summary>`.
10. After CI passes, squash-merge the PR.
11. Tag and push: `git tag vX.Y.Z && git push origin vX.Y.Z`
12. Create a GitHub release: `gh release create vX.Y.Z --title "vX.Y.Z" --latest --notes "<changelog section for this version>"`

## Distribution

Both host versions load the same `./tui` package entry via a Git URL. Pin a tag or commit so upgrades use a new cache entry.

On OpenCode **v1**, use `tui.json`. The recommended legacy pin is `v0.18.1`; `v0.19.1` includes v1 compatibility and the subagent-navigation fix for users who opt in:

```json
{ "plugin": ["vimcode@git+https://github.com/oribarilan/vimcode.git#v0.18.1"] }
```

On OpenCode **v2**, use `cli.json` and pin `v0.19.1`. v2 support is experimental; the v1-only `v0.18.1` release does not work on v2:

```json
{
  "plugins": [
    {
      "package": "vimcode@git+https://github.com/oribarilan/vimcode.git#v0.19.1"
    }
  ]
}
```

Bare names (like `"vimcode"`) trigger npm resolution, which won't work since the package isn't published. The `@git+` prefix tells OpenCode to clone from GitHub. See [the README](README.md#install) for options and v2 compatibility limits; [the POC notes](docs/opencode-v2-poc.md#package-configuration) also cover tarball installs.

## Architecture

`src/vim/` owns pure key handling. `src/index.ts` applies actions and registers the shared controller; `src/v2.ts` adapts the v2 host API. See `AGENTS.md` for the full architecture guide.

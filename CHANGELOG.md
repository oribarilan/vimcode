# Changelog

All notable changes to this project will be documented in this file.

Format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/). Versioning follows [SemVer](https://semver.org/spec/v2.0.0.html).

> Add your changes to `[Unreleased]`. They get moved into a version heading at release time.

## [Unreleased]

## [0.4.0] — 2026-05-24

### Added

- `/` in normal mode opens the session timeline (jump-to-message picker).
- `[`/`]` scroll the conversation view half a page up/down.
- `{`/`}` jump to the previous/next message in the conversation.
- `translateKey` now maps shift+`[` → `{` and shift+`]` → `}`.

## [0.3.3] — 2026-05-21

### Fixed

- Update check now uses GitHub API instead of raw.githubusercontent.com, which caches content for up to 5 minutes.

## [0.3.2] — 2026-05-21

_No user-facing changes. Version bump to test the update notification._

## [0.3.1] — 2026-05-21

### Added

- Update check on launch. Shows a toast when a newer version is available on GitHub.

### Changed

- Install instructions now pin a version tag (`#v0.3.1`). Changing the tag in `tui.json` invalidates the cache and pulls the new version on next launch.

### Fixed

- Cursor shape now works for git-installed plugins, not just `just dev`. Switched from `addPostProcessFn` (unavailable in the cache context) to a direct DECSCUSR interval.

## [0.3.0] — 2026-05-20

### Added

- Cursor shape changes with mode: block in normal mode, bar in insert mode. Uses DECSCUSR escape sequences via a post-render hook, bypassing the Textarea's hardcoded block cursor.

## [0.2.2] — 2026-05-20

### Fixed

- Vimcode now passes through all keys when any overlay is active (command palette, session list, question prompts, permission prompts). Previously vim consumed j/k/Enter/Escape before these UIs could handle them.

## [0.2.1] — 2026-05-20

### Fixed

- Vim keybindings no longer interfere with the question tool. When the AI asks a question with selectable options, vimcode passes through all keys.

## [0.2.0] — 2026-05-20

### Added

- `Ctrl+Enter` submits the prompt from insert mode. Previously there was no way to submit without switching to normal first.
- `j`/`k` in normal mode cycle through prompt history when the input is empty, matching up/down arrow behavior.

### Fixed

- File picker and autocomplete work in insert mode. Enter picks the selected item and Escape closes the picker without leaving insert. Previously the vim intercept consumed both keys before the autocomplete layer saw them.

## [0.1.4] — 2026-05-20

### Added

- Colored mode indicator in the prompt bar when running from source (`just dev`). Falls back to toast for git/npm installs where the host runtime modules can't be imported.

## [0.1.3] — 2026-05-20

### Fixed

- Git URL installation works. Removed all external runtime imports (`solid-js`, `@opentui/solid`) since OpenCode's runtime module plugin doesn't resolve host packages for cache-installed plugins.

### Changed

- Mode indicator replaced with toast notifications. Toast shows "NORMAL" or "INSERT" briefly on each switch.

### Removed

- `indicator.ts` (no longer needed without the slot-based indicator).

## [0.1.2] — 2026-05-19

### Fixed

- Git URL installation works. Replaced JSX with programmatic rendering to avoid `jsx-dev-runtime` resolution failure from the package cache path.

## [0.1.1] — 2026-05-19

### Fixed

- Git URL installation (`vimcode@git+https://...` in `tui.json`) no longer fails with `jsxDEV not found`. Peer deps moved to devDependencies so type stubs don't shadow the host runtime.

### Changed

- Removed unnecessary `"."` export from package.json. Only `"./tui"` is needed by the plugin loader.

## [0.1.0] — 2026-05-18

First release. Modal editing for the OpenCode prompt.

### Added

- Normal and insert modes, toggled by `Escape` and insert-entry keys.
- Mode indicator in the prompt bar (NORMAL/INSERT).
- Normal mode motions: `h`, `j`, `k`, `l`, `w`, `b`, `e`, `0`, `^`, `$`, `g`, `G`.
- Numeric counts for all motions (`3j`, `5w`, etc.).
- Operators `d` (delete), `c` (change), `y` (yank) with motion combinations (`dw`, `c$`, `yb`).
- Doubled operators for line-wise action: `dd`, `cc`, `yy`.
- Counts on both operator and motion (`2d3w`).
- `D` and `C` shortcuts for delete/change to end of line.
- Insert entries: `i`, `a`, `A`, `o`, `O`.
- `x`, `X`, `u`, `Ctrl+r`, `p`, `J`, `:`, `Enter`.
- Insert mode `Enter` inserts a newline; `Tab` inserts a tab via clipboard workaround.
- Yank copies to system clipboard via `pbcopy`.

> `g` fires immediately as buffer-home instead of waiting for `gg`. The `yy` line tracker drifts on clicks and arrow keys. Visual mode and text objects aren't feasible without cursor position access.

[Unreleased]: https://github.com/oribarilan/vimcode/compare/v0.4.0...HEAD
[0.4.0]: https://github.com/oribarilan/vimcode/compare/v0.3.3...v0.4.0
[0.3.3]: https://github.com/oribarilan/vimcode/compare/v0.3.2...v0.3.3
[0.3.2]: https://github.com/oribarilan/vimcode/compare/v0.3.1...v0.3.2
[0.3.1]: https://github.com/oribarilan/vimcode/compare/v0.3.0...v0.3.1
[0.3.0]: https://github.com/oribarilan/vimcode/compare/v0.2.2...v0.3.0
[0.2.2]: https://github.com/oribarilan/vimcode/compare/v0.2.1...v0.2.2
[0.2.1]: https://github.com/oribarilan/vimcode/compare/v0.2.0...v0.2.1
[0.2.0]: https://github.com/oribarilan/vimcode/compare/v0.1.4...v0.2.0
[0.1.4]: https://github.com/oribarilan/vimcode/compare/v0.1.3...v0.1.4
[0.1.3]: https://github.com/oribarilan/vimcode/compare/v0.1.2...v0.1.3
[0.1.2]: https://github.com/oribarilan/vimcode/compare/v0.1.1...v0.1.2
[0.1.1]: https://github.com/oribarilan/vimcode/compare/v0.1.0...v0.1.1
[0.1.0]: https://github.com/oribarilan/vimcode/releases/tag/v0.1.0

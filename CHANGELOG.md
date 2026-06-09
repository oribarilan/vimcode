# Changelog

All notable changes to this project will be documented in this file.

Format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/). Versioning follows [SemVer](https://semver.org/spec/v2.0.0.html).

> Add your changes to `[Unreleased]`. They get moved into a version heading at release time.

## [0.13.0] — 2026-06-09

### Changed

- Leader key is now auto-detected from OpenCode's `keybinds.leader` config. The `leader` plugin option has been removed.

### Fixed

- Leader key (e.g. space) no longer enters pending-sequence state when typing in question or permission prompt overlays.

## [0.12.2] — 2026-06-08

### Reverted

- Persistent mode indicator removed. The SolidJS slot approach doesn't work from git-installed plugins — the host's JSX runtime can't be resolved from the package cache. Back to toast-only for now ([#3](https://github.com/oribarilan/vimcode/issues/3)).

### Changed

- `modeIndicator` option now accepts `"toast"` (default) or `"none"`. The `"status"` value from v0.12.0 is gone until the host resolves JSX for external plugins.
- `Ctrl+O` one-shot normal now emits a proper `mode` action instead of a toast side-channel. The toast shows `(insert)` in lowercase, matching Vim convention.

## [0.12.0] — 2026-06-08

### Added

- Persistent mode indicator next to the prompt ([#3](https://github.com/oribarilan/vimcode/issues/3)). Shows NORMAL, INSERT, VISUAL, or (insert) for one-shot normal. Replaces the old toast, which disappeared after a second.
- `modeIndicator` option: `"status"` (default, persistent label), `"toast"` (old behavior), or `"none"` (disabled). The old `modeToast` option still works as a fallback.

### Changed

- Plugin entry point is now `.tsx` (was `.ts`) to support SolidJS slot rendering.

## [0.11.0] — 2026-06-08

### Added

- `:q`, `:quit`, and `:wq` quit OpenCode from the command palette ([#19](https://github.com/oribarilan/vimcode/issues/19)). Since `:` already opens the palette, typing `:q` and pressing Enter exits the app.
- `Ctrl+O` in insert mode — run one normal-mode command, then return to insert. Motions, operators, counts, and `r{char}` all work.
- `leader` plugin option — lets you use space (or any key) as leader without breaking insert mode. Spaces type normally while editing, and leader sequences like `space l` still work in normal mode ([#21](https://github.com/oribarilan/vimcode/issues/21)).

## [0.10.0] — 2026-05-31

### Added

- `dG` and `cG` — delete/change from cursor to end of buffer. `yG` already worked, now all three operators work with `G`.

### Changed

- Cursor shape is set via the editor widget's `cursorStyle` property instead of writing DECSCUSR escape sequences to stdout. Fixes terminals that don't support DECSCUSR (e.g. macOS Terminal.app).

### Fixed

- `dG`, `cG`, `de`, `ce` undo in a single `u` press. The host editor's undo system splits multi-line deletions into per-line entries, so these operations now go through `editBuffer.deleteRange()` with a pre-operation snapshot that `u` restores from directly.
- `yy` reads the cursor position from the editor widget instead of a line counter. The counter drifted on clicks, arrow keys, and word motions, causing `yy` to yank the wrong line.
- `e` moves to end of word instead of behaving like `w`. `de`, `ce`, and `ye` operate on the correct range too.
- `g` waits for a second keypress instead of jumping to buffer start on its own. `gg` now works as a proper two-key command.

## [0.9.0] — 2026-05-29

### Added

- `r{char}` replaces the character under the cursor. Supports counts: `3ra` replaces 3 characters with `a`.

## [0.8.0] — 2026-05-26

### Added

- Yank with motions: `yw`, `yb`, `ye`, `y$`, `y0`, `y^`, `yh`, `yl`, `yj`, `yk`, `yG`. Previously only `yy` worked.
- Plugin init sanity test that catches crashes from hostile API shapes before release.
- Biome for linting and formatting, enforced in CI.
- `just test`, `just lint`, `just lint-fix`, `just check` recipes.

### Fixed

- Plugin failed to load when `api.kv` didn't match the expected interface (e.g. object with no `.get` method). Broke installs on some OpenCode versions.

### Changed

- README operators section rewritten to show `d`, `c`, and `y` side by side for each motion.
- Noted that `e` and `w` behave identically (the host has no separate end-of-word command).

## [0.7.0] — 2026-05-26

### Added

- Cross-platform clipboard. Yank/paste now works on macOS (`pbcopy`), Windows (`clip.exe`), and Linux (`xclip`). Previously macOS-only.
- Plugin configuration via `tui.json` tuple syntax. Three options available:
  - `updateCheck` — disable the daily GitHub version check.
  - `modeToast` — disable the mode-switch toast, relying on cursor shape alone.
  - `startMode` — start in normal mode instead of insert.
- Daily caching for the update checker via `api.kv`. Previously checked GitHub on every launch.
- GitHub Actions CI — runs `bun test` on push and PR to main.
- Issue templates for bug reports and missing keybinding requests.
- Version sync test — catches drift between `VERSION` and `package.json` at test time.
- `typecheck` script (`tsc --noEmit`) in `package.json`.
- MIT LICENSE file.

### Changed

- Removed unused devDependencies (`@opentui/core`, `@opentui/keymap`, `@opentui/solid`, `solid-js`). Pinned `@opencode-ai/plugin` to `^1.15.4`.
- Removed `private: true` from `package.json`.
- Dropped lockfiles from git. Plugin consumers resolve their own deps.
- Replaced local paths in AGENTS.md with public GitHub URLs.
- Fixed `g`/`gg` contradiction in README — `g` removed from keybinding tables.
- Added platform notes and configuration sections to README.

## [0.6.1] — 2026-05-25

### Changed

- Updated AGENTS.md with current line counts and visual mode status in known limitations.

### Removed

- Dead `readClipboard()` export from clipboard module.
- Stale implementation plan (`docs/plan.md`) from initial prototype.

## [0.6.0] — 2026-05-24

### Added

- Character-wise visual mode (`v`). Select text with motions, then `d`/`x` to delete, `c` to change, `y` to yank. All normal-mode motions work for extending the selection, with counts.
- Tab inserts a tab character in insert mode. Previously fell through to OpenCode's default handler because the plugin had no way to insert text at the cursor. Now uses `insertText` on the focused editor directly.

### Fixed

- `j`/`k` now move the cursor up/down in multi-line text. Previously they always dispatched prompt history commands because the plugin read prompt text from `api.prompt` which doesn't exist. Now reads from `api.renderer.currentFocusedEditor.plainText`.
- `d` in visual mode deletes the full selection instead of just the last character. The `clearSelection` action was racing the deferred `input.backspace` command.
- Block cursor now shows in visual mode (not just normal mode).

## [0.5.0] — 2026-05-24

### Removed

- Tab insertion in insert mode. The clipboard-based workaround (write tab to clipboard, paste, restore) clobbered the user's clipboard and raced with async I/O. Tab now falls through to OpenCode's default handler.

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
- Insert mode `Enter` inserts a newline.
- Yank copies to system clipboard via `pbcopy`.

> `g` fires immediately as buffer-home instead of waiting for `gg`. The `yy` line tracker drifts on clicks and arrow keys. Visual mode and text objects aren't feasible without cursor position access.

[Unreleased]: https://github.com/oribarilan/vimcode/compare/v0.12.2...HEAD
[0.12.2]: https://github.com/oribarilan/vimcode/compare/v0.12.1...v0.12.2
[0.12.1]: https://github.com/oribarilan/vimcode/compare/v0.12.0...v0.12.1
[0.12.0]: https://github.com/oribarilan/vimcode/compare/v0.11.0...v0.12.0
[0.11.0]: https://github.com/oribarilan/vimcode/compare/v0.10.0...v0.11.0
[0.10.0]: https://github.com/oribarilan/vimcode/compare/v0.9.0...v0.10.0
[0.9.0]: https://github.com/oribarilan/vimcode/compare/v0.8.0...v0.9.0
[0.8.0]: https://github.com/oribarilan/vimcode/compare/v0.7.0...v0.8.0
[0.7.0]: https://github.com/oribarilan/vimcode/compare/v0.6.1...v0.7.0
[0.6.1]: https://github.com/oribarilan/vimcode/compare/v0.6.0...v0.6.1
[0.6.0]: https://github.com/oribarilan/vimcode/compare/v0.5.0...v0.6.0
[0.5.0]: https://github.com/oribarilan/vimcode/compare/v0.4.0...v0.5.0
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

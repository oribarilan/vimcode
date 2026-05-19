# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

> **Contributors:** add your changes to the `[Unreleased]` section. They get moved into a version heading at release time.

## [Unreleased]

## [0.1.1] — 2026-05-19

### Fixed

- Git URL installation (`vimcode@git+https://...` in `tui.json`) no longer fails with `jsxDEV not found`. Peer dependencies moved to devDependencies so type-only stubs don't shadow the host runtime.

### Changed

- Removed unnecessary `"."` export from package.json — only `"./tui"` is needed by the plugin loader.

## [0.1.0] — 2026-05-18

First release. Brings modal editing to the OpenCode prompt — normal mode, insert mode, and a mode indicator in the prompt bar.

### Added

- Modal editing with normal and insert modes, toggled by `Escape` and insert-entry keys.
- Mode indicator in the prompt bar showing NORMAL/INSERT.
- Normal mode motions: `h`, `j`, `k`, `l` (cursor movement), `w`, `b`, `e` (word movement), `0`, `^`, `$` (line boundaries), `g` (buffer start), `G` (buffer end).
- Numeric counts for all motions (`3j`, `5w`, etc.).
- Operators `d` (delete), `c` (change), `y` (yank) with motion combinations (`dw`, `c$`, `yb`).
- Doubled operators for line-wise action: `dd`, `cc`, `yy`.
- Counts on both operator and motion (`2d3w`).
- `D` and `C` shortcuts for delete/change to end of line.
- Insert mode entries: `i` (at cursor), `a` (after cursor), `A` (end of line), `o` (open below), `O` (open above).
- Additional normal mode keys: `x` (delete char), `X` (backspace), `u` (undo), `Ctrl+r` (redo), `p` (paste from yank register), `J` (join lines), `:` (command palette), `Enter` (submit prompt).
- Insert mode `Enter` inserts a newline; `Tab` inserts a tab character via a clipboard workaround.
- Yank operations copy to system clipboard via `pbcopy`.

> **Known limitations:** this is a v0 release. `g` fires immediately as buffer-home instead of waiting for `gg`. The line tracker used by `yy` drifts when the cursor moves via clicks or arrow keys. Visual mode and text objects aren't feasible without cursor position access from the plugin API.

[Unreleased]: https://github.com/oribarilan/vimcode/compare/v0.1.1...HEAD
[0.1.1]: https://github.com/oribarilan/vimcode/compare/v0.1.0...v0.1.1
[0.1.0]: https://github.com/oribarilan/vimcode/releases/tag/v0.1.0

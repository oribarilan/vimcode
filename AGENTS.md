# AGENTS.md

## OpenCode Plugin Development

vimcode is a TUI plugin for [OpenCode](https://opencode.ai). Before working on it, understand the plugin system:

**References (read these, don't guess):**
- Official plugin docs: https://opencode.ai/docs/plugins/
- TUI plugin spec: https://github.com/sst/opencode/blob/dev/packages/opencode/specs/tui-plugins.md
- Plugin types: `@opencode-ai/plugin/tui` exports `TuiPluginModule`, `TuiPluginApi`
- A good reference TUI plugin with slots/keymap/routes: [opencode-workspaces](https://github.com/stephengolub/opencode-workspaces)

**Plugin API surface** (`api: TuiPluginApi`):
`keymap` (register layers, intercepts, dispatch commands), `slots` (register UI into named slots), `ui` (toasts, dialogs), `theme` (colors), `prompt` (read/write prompt text), `state` (session, config), `client` (SDK), `lifecycle` (disposal), `kv` (persistent storage), `route` (custom screens).

**Gotchas we hit during development:**
- TUI plugins go in `tui.json`, not `opencode.json`. The config field is `"plugin"`.
- The plugin `package.json` needs `exports: { "./tui": "./src/index.ts" }` — the loader checks `./tui`, not `.`.
- `dispatchCommand()` from inside a `key:before` intercept doesn't work for cursor movement. Wrap in `setTimeout(..., 0)` to break out of the intercept stack.
- `registerLayer` with `activeWhen` using SolidJS signals requires `reactiveMatcherFromSignal` from `@opentui/keymap/solid`. Plain `() => signal()` doesn't trigger re-evaluation. We chose intercepts instead of layers to avoid this.
- **No external runtime imports in distributed plugins.** OpenCode's Bun runtime module plugin (`onResolve` hooks for `solid-js`, `@opentui/solid`, etc.) doesn't intercept imports from files loaded from `~/.cache/opencode/packages/`. Any import from `solid-js` or `@opentui/solid` fails with `Cannot find module`. Use only the `api` parameter and local modules. Mode feedback uses `api.ui.toast()` instead of a slot indicator. This limitation affects all git/npm-installed TUI plugins, not just vimcode.

### Editor widget API

`api.renderer.currentFocusedEditor` (same object as `currentFocusedRenderable`) exposes the underlying Textarea widget. Not part of the documented plugin API, but stable and available at runtime. The codebase currently uses `plainText`, `cursorOffset`, `visualCursor`, `cursorStyle`, `insertText()`, and `editorView`. The rest of the surface below is available but unused.

**Top-level properties (read/write):**
- `cursorOffset: number` — absolute cursor position, readable and writable
- `visualCursor: { visualRow, visualCol, logicalRow, logicalCol, offset }` — full cursor coordinates (read-only in practice)
- `cursorStyle: { style: "block" | "line" | "underline" | "default", blinking: boolean }` — set directly, no DECSCUSR escape needed
- `plainText: string` — buffer content
- `selectionBg: RGBA`, `selectionFg: RGBA` — custom selection highlight colors

**Top-level methods:**
- `moveCursorLeft/Right/Up/Down()` — direct cursor movement
- `setSelection(start, end)`, `setSelectionInclusive(start, end)`, `clearSelection()` — selection control
- `gotoVisualLineEnd()`, `gotoLineEnd()` — line boundary jumps
- `insertText(text)` — insert at cursor

**editorView methods (lower-level):**
- `setCursorByOffset(n)` — position cursor by offset
- `getNextWordBoundary()`, `getPrevWordBoundary()` — word boundary detection (enables proper `e` vs `w`)
- `getEOL()`, `getVisualSOL()`, `getVisualEOL()` — line boundary info
- `getLineInfo()`, `getLogicalLineInfo()` — line metadata
- `getCursor()`, `getVisualCursor()`, `getText()` — read state
- `getSelectedText()`, `deleteSelectedText()` — selection operations
- `moveUpVisual()`, `moveDownVisual()` — visual line movement
- `setSelection()`, `resetSelection()`, `hasSelection()` — selection management

This API surface makes text objects (`ciw`, `di"`), direct cursor manipulation, and accurate line operations feasible. The current `setTimeout` + `dispatchCommand` approach can be replaced with direct widget manipulation for most operations.

## Architecture

```
src/
  index.ts       (202 lines)  Plugin entry: intercept registration, action application
  vim.ts         (631 lines)  Pure vim engine: state, handlers, command tables, types
  clipboard.ts   (19 lines)   writeClipboard() — cross-platform (pbcopy/xclip/xsel/wl-copy/clip.exe)
  version.ts     (46 lines)   Version constant, GitHub update check (cached daily)
test/
  vim.test.ts    (1271 lines)  Characterization tests for all key handling branches
```

**Data flow:**
```
KeyEvent → translateKey() → handleInsertKey/handleNormalKey/handleVisualKey() → HandlerResult { consume, actions[] }
                                    ↓                                                         ↓
                             mutates VimState                                       applyActions() in index.ts
                          (count, pendingOp, pendingChar, mode)                                  dispatches commands via setTimeout
```

Handlers in `vim.ts` are pure — they take state + key + event, mutate state, return actions. They never touch `api`. The only file that calls `api.keymap.dispatchCommand` is `index.ts`.

**Action types:**
- `{ type: "cmd", cmd: string }` — dispatched via `setTimeout(() => api.keymap.dispatchCommand(cmd), 0)`
- `{ type: "mode", mode: Mode }` — updates the SolidJS signal for the indicator
- `{ type: "toast", message: string }` — shows a notification
- `{ type: "yank", text: string }` — writes text to system clipboard via `writeClipboard()`
- `{ type: "insertText", text: string }` — inserts text at cursor via `editor.insertText()`
- `{ type: "yankSelection" }` — reads selected text from the focused editor, stores in yank register and clipboard
- `{ type: "clearSelection" }` — clears the textarea's selection via `editorView.resetSelection()`
- `{ type: "cursorTo", offset: number }` — sets `editor.cursorOffset` directly
- `{ type: "selectRange", start: number, end: number }` — calls `editor.setSelectionInclusive(start, end)`
- `{ type: "deleteRange", start: number, end: number }` — deletes text between inclusive offsets via `editBuffer.deleteRange()`. Saves a snapshot for single-step undo (see below).
- `{ type: "undo" }` — if an undo snapshot exists (from a `deleteRange`), restores the full buffer from it. Otherwise falls back to `dispatchCommand("input.undo")`.

### Adding a keybinding

1. In `vim.ts`, find the right section in `handleNormalKey()` (motions, operators, special keys, insert entries)
2. Add the key check and return appropriate actions:
   ```ts
   if (key === "yourkey") {
     return { consume: true, actions: [{ type: "cmd", cmd: "input.some.command" }] }
   }
   ```
3. Add a test in `test/vim.test.ts`:
   ```ts
   it("yourkey dispatches some.command", () => {
     const result = handleNormalKey(state, "yourkey", ev("yourkey"), mockPrompt)
     expect(cmds(result.actions)).toEqual(["input.some.command"])
   })
   ```
4. Run `bun test`, then `just dev` to verify in OpenCode.

### Adding an operator+motion combo

Operators (d/c/y) use two tables: `MOTIONS` maps key → standalone cursor command, `DELETE_MOTION` maps key → destructive command. When `pendingOp` is set and a motion key arrives, `handleNormalKey` looks up `DELETE_MOTION[key]` and dispatches it.

To add a new motion that works with operators:
1. Add the standalone motion to `MOTIONS`: `{ "yourkey": "input.move.whatever" }`
2. Add the destructive version to `DELETE_MOTION`: `{ "yourkey": "input.delete.whatever" }`
3. If the motion needs special handling with operators (like j/k which delete multiple lines), add an explicit branch in the `pendingOp && key in MOTIONS` section.

### Known limitations

- **`setTimeout` dispatch** — commands are deferred to avoid re-entrancy. Multi-command sequences (like `O` = home + newline + up) rely on ordered setTimeout execution, which works in practice but isn't guaranteed by spec. Many of these can now be replaced with direct widget manipulation (e.g., setting `cursorOffset`, calling `insertText`).
- **editBuffer undo granularity** — the host editor's undo system splits multi-line deletions into per-line entries. Operations that use `deleteRange` (like `dG`, `de`) work around this by saving a pre-operation snapshot and restoring from it on `u`. The snapshot is invalidated when any other buffer-modifying action runs (`cmd` or `insertText`).

## Development

```bash
just dev       # Launch OpenCode with the plugin (uses OPENCODE_TUI_CONFIG=dev-tui.json)
bun test       # Run characterization tests
just check     # Lint + tests (used in GitHub Actions)
```

The `dev-tui.json` config is picked up only by `just dev`. Running `opencode` normally in this directory does not load the plugin.

## Git Workflow

**Never commit, push, or create PRs unless explicitly asked.** Present the changes and wait for the human to decide when to commit.

All changes go through pull requests. Direct pushes to `main` are blocked. CI (`just check`) must pass before merge. PRs are squash-merged — the PR title becomes the commit on `main`.

Branch naming: `type/description` — e.g. `feat/replace-char`, `fix/escape-handling`. Types match commit prefixes (`feat`, `fix`, `refactor`, `chore`, `test`, `docs`).

## Code Conventions

**Pure functions over side effects.** Handlers return data (actions), callers apply effects. This makes the core logic testable without mocking.

**No classes.** Use plain objects for state (`VimState`), plain functions for behavior. Pass state by reference, mutate it directly. Return results as data.

**Single responsibility per file.** `vim.ts` owns all key handling logic and state transitions. `index.ts` owns all OpenCode API interaction. `clipboard.ts` owns platform I/O. Don't mix these concerns.

**Comments explain why, not what.** The code should read clearly without narration. Reserve comments for non-obvious decisions (like why `setTimeout` is needed for dispatch, or why `g` doesn't wait for a second keypress).

**Test every handler branch.** When you add a keybinding, add a test. The test should verify what actions are returned and how state changes — not what those actions do when applied.

**Prefer discriminated unions.** The `Action` type uses `{ type: "cmd" } | { type: "mode" } | ...` so consumers can exhaustively switch on `action.type`. Add new action types when handlers need new kinds of side effects.

**Keep `vim.ts` under 500 lines.** If it grows past that, split by concern (motions, operators, insert entries). The handlers are already structured with clear sections — those become natural file boundaries.

**Shifted key translation** happens in `translateKey()` before the handler sees the key. Handlers work with normalized keys (`$` not `shift+4`, `G` not `shift+g`). Add new shift mappings in `translateKey`, not in handlers.

**TypeScript strictness.** `strict: true` in tsconfig. No `any` in `vim.ts` or `test/`. The `api` parameter in `index.ts` is typed as `any` because the plugin types come from peer deps that may not be installed locally — that's the one acceptable use.

**Cross-platform.** All code must work on macOS, Linux, and Windows. No platform-specific assumptions without a runtime `process.platform` check and fallbacks for other platforms.

## Task Completion Checklist

After finishing any task, check whether these need updating:

- **README.md** — New keybinding? Add it to the tables. Fixed a known gap? Remove it from "Known gaps".
- **CHANGELOG.md** — Add the change under `[Unreleased]`. Follow Keep a Changelog format.
- **AGENTS.md** — Line counts in Architecture section, known limitations, or new patterns worth documenting.

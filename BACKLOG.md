# Backlog

Prioritized list of improvements for vimcode. Items within each category are ordered by priority.

## Stability / Bug fixes

1. **Replace `lineTracker` with direct cursor reads.** `lineTracker` drifts whenever the cursor moves by means other than j/k/G/g/o (clicks, arrow keys, word motions). This causes `yy` to yank the wrong line. `visualCursor.logicalRow` gives the real line — read it directly.

2. **Fix `gg` requiring two keypresses.** Single `g` fires `input.buffer.home` immediately. Real vim waits for a second `g`. Add pending-key state for `g` with a timeout or second-key check, similar to how `r` already works with `pendingChar`.

3. **Fix `e` behaving identically to `w`.** `editorView.getNextWordBoundary()` is available. Use it to implement proper end-of-word motion that stops at the last character of the current word rather than the first character of the next.

4. **Eliminate `setTimeout` command dispatch for operations that can use direct manipulation.** Multi-command sequences like `O` (home + newline + up) depend on setTimeout ordering. Replace with direct buffer manipulation (`cursorOffset` writes, `insertText()`) where possible. Keep setTimeout only for commands that genuinely need `dispatchCommand` (submit, undo/redo, history navigation).

## Cleaner implementations

1. ~~**Set cursor style via `cursorStyle` property instead of DECSCUSR escapes.**~~ Done.

2. **Replace `dispatchCommand`-based motions with direct cursor manipulation.** Motions like h/l/j/k/w/b can use `moveCursorLeft/Right/Up/Down()` or write `cursorOffset` directly instead of dispatching `input.move.*` commands through setTimeout. Reduces latency and eliminates re-entrancy concerns.

3. **Replace selection commands with `setSelection`/`setSelectionInclusive`.** Visual mode currently dispatches `input.select.*` commands. The widget exposes `setSelection(start, end)` and `setSelectionInclusive(start, end)` — use these for immediate, accurate selections.

4. **Replace `yankSelection` setTimeout with synchronous read.** The current `yankSelection` action defers to let select commands finish. With direct `setSelection` + `getSelectedText()`, the yank can happen synchronously.

5. **Remove `PromptAccess` abstraction.** `getLine(n)` and `getLineCount()` split `plainText` on every call. With `cursorOffset` and `visualCursor` available, most callers don't need line-based access. Where they do, read `plainText` once and split.

## New features

1. **Text objects (`ciw`, `diw`, `yiw`, `ci"`, `di"`, `da(`, etc.).** Now feasible with cursor position access. Read `plainText` + `cursorOffset`, compute the object range in pure logic, apply the edit via `setSelection` + `deleteSelectedText` or direct text manipulation. Start with word and quote objects, then add bracket/paren.

2. **Visual-line mode (`V`).** The widget's `getLineInfo()` and `setSelection()` make line-wise selection straightforward. Extend the existing visual mode with a `visual-line` variant.

3. **`dG`/`cG` — delete/change to buffer end.** `yG` already works. Delete and change variants need the same range calculation plus a content write.

4. **Proper `gg` as go-to-line.** Once `g` waits for a second keypress, `gg` goes to buffer start and `{n}G` goes to line n.

5. **`/vim` toggle command.** Register a slash command via `api.keymap.registerLayer({ commands: [...] })` that toggles vim mode on/off. Persist the setting with `api.kv`. Lets users disable vim without editing config.

6. **Custom keymaps.** User-configurable key remapping per mode via `tui.json` options. Common requests: `jk`/`kj` to exit insert mode, `Y` mapped to `y$`. Needs multi-key sequence support with a configurable timeout.

7. **Pending key display.** Show partial key sequences (like `d` waiting for a motion, or the count accumulator) somewhere visible. Currently these are invisible — the user doesn't know vimcode is waiting for more input.

8. **Yank flash.** Brief highlight on yanked text using `selectionBg`/`selectionFg` with a short timer (200-300ms). Gives visual confirmation like Neovim's `vim.highlight.on_yank()`.

9. **Completion-aware j/k.** When the cursor follows `@` or `/` (autocomplete triggers), normal-mode j/k should navigate the completion popup rather than move the cursor.

10. **Persistent mode indicator.** Replace the fading toast with a persistent visual. Blocked by the no-external-imports limitation for slot-based UI, but could potentially use `api.renderer.keyInput.processParsedKey()` or find another approach.

## Polish

1. **Normal-mode cursor clamping.** In vim, normal-mode cursor can't sit past the last character on a line. Currently the cursor can land on the newline position after motions like `$` or `A` followed by Escape.

2. **`i` should not advance cursor on Escape.** Entering and exiting insert mode without typing should leave the cursor where it was (or move left one from `a`/`A`). Currently inconsistent.

3. **`p` paste positioning.** Vim's `p` pastes after the cursor for character-wise yanks and below the current line for line-wise yanks. Current implementation always pastes at cursor via `prompt.paste`.

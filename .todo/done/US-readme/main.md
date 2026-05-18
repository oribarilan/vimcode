# US-readme

## Goal

Write a proper README for vimcode that explains what it is, how to install it, what keybindings are supported, and known limitations. This is the first thing a potential user sees.

## Definition of Done
- [x] `README.md` rewritten with real content (replaces the current one-liner)
- [x] Explains what vimcode is (vim-style modal editing for OpenCode's prompt)
- [x] Installation instructions (add to tui.json plugin array)
- [x] Supported keybindings table (motions, operators, insert entries, special keys)
- [x] Documents insert vs normal mode behavior (Enter = newline in insert, submit in normal; Escape flow; Tab blocked)
- [x] Lists what's NOT supported (visual mode, text objects, r, yw/y$, cursor shape)
- [x] Development section (just dev, bun test)
- [x] No badges, no filler, no "features" marketing copy
- [x] Subtle beta framing ("Still early -- things may break or change")
- [x] Humanized tone, no AI writing patterns

## Cross-Cutting Concerns
- Write for vim users who want to try this in OpenCode, not for people who don't know vim.
- Keep it factual. Tables over prose for keybinding reference.

# US-readme

## Goal

Write a proper README for vimcode that explains what it is, how to install it, what keybindings are supported, and known limitations. This is the first thing a potential user sees.

## Definition of Done
- [ ] `README.md` rewritten with real content (replaces the current one-liner)
- [ ] Explains what vimcode is (vim-style modal editing for OpenCode's prompt)
- [ ] Installation instructions (add to tui.json plugin array)
- [ ] Supported keybindings table (motions, operators, insert entries, special keys)
- [ ] Documents insert vs normal mode behavior (Enter = newline in insert, submit in normal; Escape flow; Tab blocked)
- [ ] Lists what's NOT supported (visual mode, text objects, r, yw/y$, cursor shape)
- [ ] Development section (just dev, bun test)
- [ ] No badges, no filler, no "features" marketing copy

## Cross-Cutting Concerns
- Write for vim users who want to try this in OpenCode, not for people who don't know vim.
- Keep it factual. Tables over prose for keybinding reference.

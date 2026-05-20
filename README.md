# vimcode

Vim keybindings for the [OpenCode](https://opencode.ai) prompt. Early beta, things will break.

## What it does

Adds normal/insert mode to OpenCode's prompt input. Escape goes to normal mode, `i` goes back to insert. Mode switches show a brief toast notification.

In insert mode, typing works as usual. Enter inserts a newline (Ctrl+Enter submits), Tab inserts a tab character, and Escape switches to normal. File picker and autocomplete work naturally: Enter picks the selected item and Escape closes the picker without leaving insert mode.

Tab is a hack: the plugin API can't insert text at the cursor, so vimcode saves your clipboard, writes a tab to it, pastes, then restores your clipboard about 50ms later. Works fine but your clipboard briefly contains a tab character.

In normal mode, keys are vim commands. Unrecognized keys get swallowed so you don't type into the prompt by accident.

## Install

Add to your `tui.json` (or `.opencode/tui.json`):

```json
{
  "plugin": ["vimcode@git+https://github.com/oribarilan/vimcode.git"]
}
```

## What works

### Motions

| Key | Action |
|-----|--------|
| `h` `j` `k` `l` | Left, down, up, right |
| `w` `b` `e` | Word forward, backward, forward |
| `0` `^` | Line start |
| `$` | Line end |
| `g` | Buffer start (should be `gg`, see below) |
| `G` | Buffer end |

All motions take counts: `3j` moves down 3 lines.

When the input is empty, `j`/`k` scroll through prompt history instead of moving the cursor (same as the up/down arrows).

### Operators

| Combo | Action |
|-------|--------|
| `dd` | Delete line |
| `dw` `db` `d$` `d0` | Delete to word/line boundary |
| `dj` `dk` | Delete current + lines below/above |
| `D` | Delete to end of line |
| `cc` `cw` `cb` `c$` `c0` `C` | Same as d-equivalents, then insert mode |
| `yy` | Yank (copy) current line |

Counts work here too: `2dd` deletes 2 lines, `d3w` deletes 3 words.

### Insert entries

| Key | Action |
|-----|--------|
| `i` | Insert at cursor |
| `a` | Insert after cursor |
| `A` | Insert at end of line |
| `o` | Open line below |
| `O` | Open line above |

### Other

| Key | Action |
|-----|--------|
| `x` | Delete character |
| `u` | Undo |
| `Ctrl+r` | Redo |
| `p` | Paste from yank register |
| `:` | Open command palette |
| `X` | Backspace |
| `J` | Join current line with next |
| `j` `k` | Cycle prompt history (when input is empty) |
| `Enter` | Submit prompt |
| `Escape` | Pass through for double-escape interrupt |

## What doesn't work (yet?)

- `v`, `V`, `Ctrl+v` (visual mode) -- the plugin system has no selection API
- `ciw`, `di"`, etc. (text objects) -- plugins can't read cursor position
- `gg` -- single `g` jumps to buffer start right away, doesn't wait for a second keypress
- `r` (replace char) -- no way to insert a specific character through the command API
- `yw`, `y$`, etc. -- only `yy` works; the rest need cursor position tracking
- Cursor shape -- no way to show a block cursor in normal mode
- `yy` accuracy -- line position is tracked with a shadow counter that drifts on clicks and arrow keys

## Known limitation: mode indicator in distributed installs

OpenCode's TUI plugin system doesn't resolve host packages (`solid-js`, `@opentui/solid`) for externally installed plugins. vimcode uses dynamic `import()` with a fallback: when running from source (`just dev`), the colored mode indicator appears in the prompt bar. When installed via git or npm, imports fail silently and mode switches show a brief toast instead. This is an upstream limitation that affects all TUI plugins distributed via git or npm.

## Escape behavior

First Escape in insert mode switches to normal. It doesn't trigger the double-escape interrupt. From insert mode you need 3 escapes to cancel a running response: one to enter normal, two more for the interrupt.

## How it works

vimcode is a [TUI plugin](https://opencode.ai/docs/plugins/) built on OpenCode's `@opentui` stack. It registers a key intercept that captures every keypress in the prompt. A pure handler in `src/vim.ts` decides what to do based on the current mode and key — it returns a list of actions (move cursor, delete word, switch mode, etc.) without touching the API directly. The plugin entry in `src/index.ts` dispatches those actions through `@opentui/keymap` commands and shows mode changes via toast notifications.

## Contributing

1. Try it
2. Star it
3. Open issues for bugs or missing keybindings
4. PRs are welcome. See [CONTRIBUTING.md](./CONTRIBUTING.md) for dev setup, how to add keybindings, and the release process.

## License

MIT

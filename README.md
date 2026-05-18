# vimcode

Vim-style modal editing for the [OpenCode](https://opencode.ai) prompt. Still early -- things may break or change.

## What it does

Adds normal/insert mode to OpenCode's prompt textarea. Escape switches to normal mode, `i` goes back to insert. The mode shows in the prompt bar.

In insert mode, typing works normally except: Enter inserts a newline (Ctrl+Enter submits), Tab is blocked (no accidental agent cycling), and Escape switches to normal.

In normal mode, keys are vim commands. Unrecognized keys are swallowed so you don't accidentally type into the prompt.

## Install

Add to your `tui.json` (or `.opencode/tui.json`):

```json
{
  "plugin": ["vimcode"]
}
```

Or from a local clone:

```json
{
  "plugin": ["../path/to/vimcode"]
}
```

## What works

### Motions

| Key | What it does |
|-----|-------------|
| `h` `j` `k` `l` | Left, down, up, right |
| `w` `b` `e` | Word forward, backward, forward |
| `0` `^` | Line start |
| `$` | Line end |
| `g` | Buffer start (should be `gg`, see below) |
| `G` | Buffer end |

All motions accept counts: `3j` moves down 3 lines.

### Operators

| Combo | What it does |
|-------|-------------|
| `dd` | Delete line |
| `dw` `db` `d$` `d0` | Delete to word/line boundary |
| `dj` `dk` | Delete current + lines below/above |
| `D` | Delete to end of line |
| `cc` `cw` `cb` `c$` `c0` `C` | Same as d-equivalents, then insert mode |
| `yy` | Yank (copy) current line |

Operators take counts too: `2dd` deletes 2 lines, `d3w` deletes 3 words.

### Insert entries

| Key | What it does |
|-----|-------------|
| `i` | Insert at cursor |
| `a` | Insert after cursor |
| `A` | Insert at end of line |
| `o` | Open line below |
| `O` | Open line above |

### Other

| Key | What it does |
|-----|-------------|
| `x` | Delete character |
| `u` | Undo |
| `Ctrl+r` | Redo |
| `p` | Paste from yank register |
| `:` | Open command palette |
| `X` | Backspace |
| `J` | Join current line with next |
| `Enter` | Submit prompt (normal mode) |
| `Escape` | Pass through for double-escape interrupt |

## What doesn't work (yet)

- **Visual mode** (v, V, Ctrl+v) -- no selection API in the plugin system
- **Text objects** (ciw, di", etc.) -- needs cursor position, which plugins can't read
- **`gg`** -- single `g` jumps to buffer start immediately instead of waiting for a second `g`
- **`r` (replace char)** -- can't insert a specific character through the command API
- **`yw`, `y$`, etc.** -- only `yy` works; word/line yank needs cursor position tracking
- **Cursor shape** -- no way to show a block cursor in normal mode
- **`yy` accuracy** -- the plugin tracks line position with a shadow counter that can drift if you click or use arrow keys

## Escape behavior

First Escape in insert mode switches to normal -- it does NOT start the double-escape-to-cancel sequence. You need 3 escapes from insert mode to cancel a running response: one for normal mode, two more for the interrupt.

## Development

```bash
npm install          # install deps
just dev             # launch OpenCode with the plugin loaded
bun test             # run tests
```

`just dev` uses `OPENCODE_TUI_CONFIG=dev-tui.json` to load the plugin. Running `opencode` normally in this directory doesn't load it.

## License

MIT

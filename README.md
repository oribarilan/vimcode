# vimcode

Vim keybindings for the [OpenCode](https://opencode.ai) prompt. Early beta, things will break.

## What it does

Adds normal/insert mode to OpenCode's prompt input. Escape switches to normal mode, `i` goes back to insert. You get a brief toast on each switch.

In insert mode, typing works normally. Enter adds a newline, Ctrl+Enter submits, Escape switches to normal. The file picker and autocomplete aren't affected: Enter picks the selected item and Escape closes the picker without leaving insert.

In normal mode, keys are vim commands. Unrecognized keys get swallowed so you don't accidentally type into the prompt. `:` opens the command palette.

## Current gaps

**No persistent mode indicator.** You see a toast ("NORMAL" / "INSERT" / "VISUAL") on each switch, but it fades after about a second. A permanent indicator would need the host's SolidJS runtime, which isn't available to externally installed plugins.

**No tab insertion.** Tab in insert mode falls through to OpenCode's default handler. The plugin API has no "insert text at cursor" command, and the only workaround (hijacking the system clipboard) is too fragile.

## Install

Add to your `tui.json` (or `.opencode/tui.json`):

```json
{
  "plugin": ["vimcode@git+https://github.com/oribarilan/vimcode.git#v0.5.0"]
}
```

To upgrade, change the version tag and restart OpenCode. The plugin will show a toast when a newer version is available.

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

When the input is empty, `j`/`k` scroll through prompt history instead of moving the cursor.

### Operators

| Combo | Action |
|-------|--------|
| `dd` | Delete line |
| `dw` `db` `d$` `d0` | Delete to word/line boundary |
| `dj` `dk` | Delete current + lines below/above |
| `D` | Delete to end of line |
| `cc` `cw` `cb` `c$` `c0` `C` | Same as d-equivalents, then insert mode |
| `yy` | Yank (copy) current line |

Counts work too: `2dd` deletes 2 lines, `d3w` deletes 3 words.

### Insert entries

| Key | Action |
|-----|--------|
| `i` | Insert at cursor |
| `a` | Insert after cursor |
| `A` | Insert at end of line |
| `o` | Open line below |
| `O` | Open line above |

### Visual mode

Press `v` in normal mode to enter character-wise visual mode. Motions extend the selection, operators act on it:

| Key | Action |
|-----|--------|
| `d` `x` | Delete selection |
| `c` | Delete selection, enter insert mode |
| `y` | Yank (copy) selection |
| `Escape` `v` | Exit visual mode |

All normal-mode motions work for extending the selection: `h` `j` `k` `l` `w` `b` `e` `0` `$` `G` `g`, with counts.

### Other

| Key | Action |
|-----|--------|
| `x` | Delete character |
| `u` | Undo |
| `Ctrl+r` | Redo |
| `p` | Paste from yank register |
| `:` | Command palette |
| `/` | Jump to message (session timeline) |
| `[` `]` | Scroll conversation half-page up/down |
| `{` `}` | Jump to previous/next message |
| `X` | Backspace |
| `J` | Join current line with next |
| `j` `k` | Cycle prompt history (when input is empty) |
| `Enter` | Submit prompt |
| `Escape` | Pass through for double-escape interrupt |

## What doesn't work yet

- `V`, `Ctrl+v` -- only character-wise visual mode (`v`) is supported, no line-wise or block
- `ciw`, `di"`, etc. (text objects) -- not yet implemented
- `gg` -- single `g` goes to buffer start immediately, doesn't wait for a second keypress
- `r` (replace char) -- not yet implemented
- `yw`, `y$`, etc. -- only `yy` works, the rest need cursor tracking
- `yy` accuracy -- line position is tracked with a counter that drifts on clicks and arrow keys

## Overlay passthrough

When OpenCode shows its own UI -- command palette, `/sessions`, the `@` file/agent picker, question prompts, permission prompts -- vimcode gets out of the way. All keys pass through to the overlay until it closes.

## Escape behavior

First Escape in insert mode switches to normal. It won't trigger the double-escape interrupt. So from insert mode you need 3 escapes to cancel a running response: one for normal mode, two more for the interrupt.

## How it works

vimcode is a [TUI plugin](https://opencode.ai/docs/plugins/) that registers a key intercept on every prompt keypress. A pure handler in `src/vim.ts` takes the current mode and key, returns a list of actions (move cursor, delete word, switch mode, etc.) without calling the API. `src/index.ts` dispatches those actions through `@opentui/keymap` commands.

## Contributing

1. Try it
2. Star it
3. Open issues for bugs or missing keybindings
4. PRs welcome. See [CONTRIBUTING.md](./CONTRIBUTING.md) for dev setup and the release process.

## License

MIT

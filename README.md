# vimcode

Vim keybindings for the [OpenCode](https://opencode.ai) prompt. Early beta, things will break.

## What it does

Adds normal/insert mode to OpenCode's prompt input. Escape enters normal mode, `i` goes back to insert. A brief toast shows the current mode on each switch (configurable).

In insert mode, typing works normally. Enter adds a newline, Ctrl+Enter submits. The file picker and autocomplete keep working: Enter picks the selected item, Escape closes the picker without leaving insert.

In normal mode, keys are vim commands. Unrecognized keys get swallowed so you don't accidentally type into the prompt. `:` opens the command palette.

## Current gaps

**No persistent mode indicator.** The toast fades after about a second. Cursor shape (block vs bar) is the persistent signal, but a proper status bar indicator would need the host's SolidJS runtime, which external plugins can't access.

## Platform notes

Clipboard (`y`, `yy`, `p`) uses the system clipboard: `pbcopy` on macOS, `clip.exe` on Windows, `xclip` on Linux. Linux users need `xclip` installed (`apt install xclip` or equivalent). If the clipboard tool is missing, yank/paste still works within the session via an internal register.

Cursor shape (block in normal, bar in insert) needs a terminal that supports DECSCUSR escape sequences. Most modern terminals do — iTerm2, Ghostty, Alacritty, Windows Terminal, Kitty. Older macOS Terminal.app may not respond.

The plugin checks GitHub for new versions once per day on startup. No other network requests, no telemetry.

## Install

Add to your `tui.json` (or `.opencode/tui.json`):

```json
{
  "plugin": ["vimcode@git+https://github.com/oribarilan/vimcode.git#v0.7.0"]
}
```

To upgrade, change the version tag and restart OpenCode. You'll see a toast when a newer version is available.

## Configuration

To pass options, use the tuple form in `tui.json`:

```json
{
  "plugin": [["vimcode@git+https://github.com/oribarilan/vimcode.git#v0.7.0", { "updateCheck": false }]]
}
```

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `updateCheck` | `boolean` | `true` | On startup, check GitHub for new versions (at most once per day). This is the only network request vimcode makes. Set to `false` to disable. |
| `modeToast` | `boolean` | `true` | Show a brief toast ("NORMAL" / "INSERT" / "VISUAL") on mode switches. Set to `false` to rely on cursor shape alone. |
| `startMode` | `"insert"` \| `"normal"` | `"insert"` | Which mode to start in when OpenCode launches. |

## What works

### Motions

| Key | Action |
|-----|--------|
| `h` `j` `k` `l` | Left, down, up, right |
| `w` `b` `e` | Word forward, backward, forward |
| `0` `^` | Line start |
| `$` | Line end |
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

All normal-mode motions work for extending the selection: `h` `j` `k` `l` `w` `b` `e` `0` `$` `G`, with counts.

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

## Roadmap

Configurable key bindings are next once the core vim coverage stabilizes.

## Overlay passthrough

When OpenCode shows its own UI (command palette, `/sessions`, the `@` file picker, question prompts, permission prompts) vimcode steps aside. All keys pass through to the overlay until it closes.

## Escape behavior

First Escape in insert mode switches to normal — it won't trigger OpenCode's double-escape interrupt. So canceling a running response from insert mode takes 3 escapes: one for normal, two more for the interrupt.

## How it works

vimcode registers a key intercept on every prompt keypress. A pure handler in `src/vim.ts` takes the current mode and key, returns a list of actions (move cursor, delete word, switch mode, etc.) without touching the plugin API. `src/index.ts` applies those actions through `@opentui/keymap` commands.

## Contributing

1. Try it
2. If it's useful, a star helps others find it
3. Open issues for bugs or missing keybindings
4. PRs welcome. See [CONTRIBUTING.md](./CONTRIBUTING.md) for dev setup and the release process.

## License

MIT

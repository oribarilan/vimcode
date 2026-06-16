<h1 align="center">vimcode</h1>

<p align="center"><strong>Vim keybindings for the <a href="https://opencode.ai">OpenCode</a> prompt.</strong></p>

<p align="center"><em>Experimental. Things will break.</em></p>

<p align="center">
  <video src="https://github.com/user-attachments/assets/d0afa749-96c2-4f1c-adcb-5ab388d5798e" width="800" controls></video>
</p>

<p align="center">
  <a href="#install">Install</a> ·
  <a href="#configuration">Configuration</a> ·
  <a href="#what-it-does">What it does</a> ·
  <a href="#keybindings">Keybindings</a> ·
  <a href="#known-gaps">Known gaps</a> ·
  <a href="#how-it-works">How it works</a> ·
  <a href="#contributing">Contributing</a>
</p>

---

## Install

Add to your `tui.json` (or `.opencode/tui.json`):

```json
{
  "plugin": ["vimcode@git+https://github.com/oribarilan/vimcode.git#v0.14.0"]
}
```

> **Why a versioned ref?** OpenCode resolves `@latest` once and caches it forever. Bumping the version in your config is the only reliable way to get updates.

You'll see a toast when a newer version is available (can be turned off).

## Configuration

To pass options, use the tuple form in `tui.json`:

```json
{
  "plugin": [["vimcode@git+https://github.com/oribarilan/vimcode.git#v0.14.0", { "updateCheck": false }]]
}
```

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `updateCheck` | `boolean` | `true` | On startup, check GitHub for new versions (at most once per day). This is the only network request vimcode makes. Set to `false` to disable. |
| `modeIndicator` | `"toast"` \| `"none"` | `"toast"` | How to show the current mode. `"toast"` flashes a brief notification on each switch. `"none"` disables it, relying on cursor shape alone. |
| `startMode` | `"insert"` \| `"normal"` | `"insert"` | Which mode to start in when OpenCode launches. |

## What it does

Adds normal/insert mode to OpenCode's prompt input. Escape enters normal mode, `i` goes back to insert. A brief toast shows the current mode on each switch (configurable).

In insert mode, typing works normally. Enter adds a newline, Ctrl+Enter submits. The file picker and autocomplete keep working: Enter picks the selected item, Escape closes the picker without leaving insert.

In normal mode, keys are vim commands. Unrecognized keys get swallowed so you don't accidentally type into the prompt. `:` opens the command palette.

### Overlay passthrough

When OpenCode shows its own UI (command palette, `/sessions`, the `@` file picker, question prompts, permission prompts) vimcode steps aside. All keys pass through to the overlay until it closes.

### Escape behavior

First Escape in insert mode switches to normal - it won't trigger OpenCode's double-escape interrupt. So canceling a running response from insert mode takes 3 escapes: one for normal, two more for the interrupt.

### Leader key

vimcode reads OpenCode's leader key from your `tui.json` keybinds and handles it automatically, no plugin-side config needed.

In **normal and visual mode**, the leader key and the follow-up key pass straight through to OpenCode, so leader shortcuts (`<leader>c` for copy, etc.) work as expected.

In **insert mode**, printable leaders (like space) insert their character. Non-printable leaders (like `ctrl+x`) pass through to OpenCode, so leader shortcuts work from any mode.

This allows, for example, to use the popular vim-style `space` leader, set it in your `tui.json`:

```json
{
  "keybinds": {
    "leader": "space"
  }
}
```

Note that OpenCode defaults the leader to `ctrl+x`.

### Platform notes

Clipboard (`y`, `yy`, `p`) uses the system clipboard: `pbcopy` on macOS, `clip.exe` on Windows, `xclip` on Linux. Linux users need `xclip` installed (`apt install xclip` or equivalent). If the clipboard tool is missing, yank/paste still works within the session via an internal register.

Cursor shape (block in normal, bar in insert) works across all terminals. No special terminal support required.

The plugin checks GitHub for new versions once per day on startup. No other network requests, no telemetry.

## Keybindings

### Motions

| Key | Action |
|-----|--------|
| `h` `j` `k` `l` | Left, down, up, right |
| `w` `b` `e` | Word forward, backward, end of word |
| `0` `^` | Line start |
| `$` | Line end |
| `gg` | Buffer start |
| `G` | Buffer end |

All motions take counts: `3j` moves down 3 lines.

When the input is empty, `j`/`k` scroll through prompt history instead of moving the cursor.

### Operators

`d` (delete), `c` (change), and `y` (yank) combine with motions:

| Combo | Action |
|-------|--------|
| `dd` `cc` `yy` | Operate on whole line |
| `D` `C` | Delete/change to end of line |
| `dw` `cw` `yw` | To next word |
| `db` `cb` `yb` | To previous word |
| `de` `ce` `ye` | To end of word |
| `d$` `c$` `y$` | To end of line |
| `d0` `c0` `y0` | To start of line |
| `d^` `c^` `y^` | To start of line |
| `dh` `ch` `yh` | Character left |
| `dl` `cl` `yl` | Character right |
| `dj` `cj` `yj` | Current + line below |
| `dk` `ck` `yk` | Current + line above |
| `dG` `cG` `yG` | To end of buffer |

Counts work on both operator and motion: `2dd` deletes 2 lines, `d3w` deletes 3 words.

### Insert entries

| Key | Action |
|-----|--------|
| `i` | Insert at cursor |
| `a` | Insert after cursor |
| `A` | Insert at end of line |
| `o` | Open line below |
| `O` | Open line above |

`Ctrl+O` runs one normal-mode command and returns to insert. Motions, operators, counts, and `r{char}` all work.

### Visual mode

Press `v` in normal mode to enter character-wise visual mode. Press `V` to select the current line. Motions extend the selection, operators act on it:

| Key | Action |
|-----|--------|
| `d` `x` | Delete selection |
| `c` | Delete selection, enter insert mode |
| `y` | Yank (copy) selection |
| `V` | Select current line |
| `Escape` `v` | Exit visual mode |

All normal-mode motions work for extending the selection: `h` `j` `k` `l` `w` `b` `e` `0` `$` `G`, with counts.

### Other

| Key | Action |
|-----|--------|
| `Ctrl+O` | One-shot normal mode (execute one command, return to insert) |
| `r{char}` | Replace character under cursor with `{char}` |
| `x` | Delete character |
| `u` | Undo |
| `Ctrl+r` | Redo |
| `p` | Paste from yank register |
| `:` | Command palette |
| `:q` `:quit` `:wq` | Quit OpenCode (via command palette) |
| `:vim` | Toggle vim mode on/off (persisted across restarts) |
| `/` | Jump to message (session timeline) |
| `[` `]` | Scroll conversation half-page up/down |
| `{` `}` | Jump to previous/next message |
| `X` | Backspace |
| `J` | Join current line with next |
| `j` `k` | Cycle prompt history (when input is empty) |
| `Enter` | Submit prompt |
| `Escape` | Pass through for double-escape interrupt |

## Known gaps

- `Ctrl+v` - block visual mode is not supported
- `ciw`, `di"`, etc. (text objects) - not yet implemented
- No persistent mode indicator - the toast fades after about a second. A slot-based indicator needs the host's JSX runtime, which doesn't resolve reliably from git-installed plugins ([#3](https://github.com/oribarilan/vimcode/issues/3)).

Configurable key bindings are next once the core vim coverage stabilizes.

## How it works

vimcode registers a key intercept on every prompt keypress. A pure handler in `src/vim.ts` takes the current mode and key, returns a list of actions (move cursor, delete word, switch mode, etc.) without touching the plugin API. `src/index.ts` applies those actions through `@opentui/keymap` commands.

## Contributing

1. Try it
2. If it's useful, a star helps others find it
3. Open issues for bugs or missing keybindings
4. PRs welcome. See [CONTRIBUTING.md](./CONTRIBUTING.md) for dev setup and the release process.

## License

MIT

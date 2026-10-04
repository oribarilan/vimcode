# Experimental OpenCode v2 POC

This branch is a **proof of concept**, not a supported vimcode release. The same `./tui` entry has v1 `tui(api, options)` and v2 `setup(context)` callbacks. v1 still uses its existing API; v2 adapts the host UI, storage, commands and events to the same Vim controller and engine.

## Local development

Run `just dev2` from this worktree. It uses npm's package runner (`npx`) to download/cache the tested `@opencode/cli@2.0.15` release, then launches a standalone v2 instance with the local plugin. It does not replace your installed `opencode` or change `just dev`.

Both `just dev` (v1) and `just dev2` (v2) include subagent-navigation aliases for manual checks, alongside the native arrow bindings. `ctrl+x j` opens the child view/picker. On v1, `h`/`l` cycles children and `k` returns to the parent. On v2, `h`/`k` moves up, `j`/`l` moves down, Enter selects a child, and Escape closes the Composer. At the first picker row, `h`/`k` also closes it. No config editing or separate test launcher is needed.

Settings, credentials, cache and history are stored separately under the ignored `.dev2/` directory. Existing provider environment variables and project config still apply; otherwise connect a provider inside the dev instance. The launcher clears inherited OpenCode config overrides and fixes the dev leader to `ctrl+x`.

To use an existing v2 binary instead:

```sh
just dev2 /absolute/path/to/opencode-v2
# Or set OPENCODE_V2_BIN for repeated runs.
```

The root `tui.ts` re-exports `src/index.ts` for v2's local-directory loader. This shim and the dev launcher are not shipped in the package. Local development does not replace the installed-package checks below.

## Package configuration

The v2 public `keymap` has no key intercept or configured-leader lookup. The POC uses `context.renderer.keyInput.prependListener("keypress", ...)` to intercept prompt keys **before** the host keymap. It calls both `preventDefault()` and `stopPropagation()` on consumed keys. This raw OpenTUI ordering is not a documented OpenCode plugin guarantee; do not rely on it as production compatibility without testing against installed packages and future host releases.

The [README](../README.md#opencode-v2-experimental) shows the tested Git install pinned to commit `d8050f765b6c2c4e7fdc700d8345c1c5752644cb`. Use the global `cli.json` on v2, not v1's `tui.json`.

To test local changes instead, create a fresh artifact directory and build a tarball with `npm pack --ignore-scripts --pack-destination /absolute/path/to/artifacts`. Configure that artifact in `cli.json`:

```json
{
  "plugins": [
    {
      "package": "vimcode@file:/absolute/path/to/artifacts/vimcode-0.18.1.tgz",
      "options": { "updateCheck": false, "experimentalV2Leader": "ctrl+x" }
    }
  ]
}
```

Use a new artifact directory when repacking so the host does not reuse an older cache entry. The plugin's `package.json` already exports `./tui`; there is no v2-only package or runtime dependency. For local source, `just dev2` uses the root `tui.ts` shim required by v2's directory discovery. Use the tarball path for testing distributed-package behavior.

`experimentalV2Leader` defaults to `"ctrl+x"`, accepts a string or an array of strings, and can be set to `false` or `"none"` if the host leader is disabled. If the host leader is `space`, set **both** the host keybind and `experimentalV2Leader: "space"`. The v2 plugin cannot detect the host leader setting, so mismatches can swallow shortcuts or swallow printable input. The v2 disabled state/update-check timestamp live in the new plugin-scoped `settings` store and do not migrate v1 KV values. Disabled state is **per activation**: another TUI's saved toggle takes effect on reload, not mid-activation. Local `/vim` toggles immediately update both the controller and the textual-form leader guard, then persist the setting.

## POC results (2026-09-30)

The same tarball was exercised in real macOS tmux sessions on OpenCode **2.0.15** and **1.18.33**, using isolated HOME/XDG directories and synthetic prompt text. No model requests were sent. Test clipboard writes were redirected to a temporary file.

- The initial screen-text smoke suite reported 13 passes per host for core editing, autocomplete and palette integration. Follow-up exact-buffer tests found that the visual-delete assertion was too weak: the expected suffix also matched a buffer with an extra character. Visual selection differs between the hosts; the first smoke suite does not establish parity. See [the follow-up investigation](opencode-v2-strategy.md).
- v2 loaded through its package cache on the first launch. Stock vimcode v0.18.1 was rejected by the same host with `Invalid V2 TUI plugin module`.
- Initial v1 first-launch failures used a symlink-spelled XDG cache (`/tmp` on macOS). With only `XDG_CACHE_HOME` changed to canonical `/private/tmp`, a fresh v1.18.33 tarball and the README Git spec loaded on the first launch. The `./tui`-only manifest is retained; do not add a root export, which redirects v2 plugin installation to the server target. See [the installer findings](opencode-v2-strategy.md#5-cold-installation-and-canonical-cache-paths).
- With both v2 leader settings set to `space`, spaces inserted normally, and `<leader>p` opened the host palette using `"command.palette.show": ["ctrl+p", "<leader>p"]`.
- v2 `/vim` disable persisted across restart. Re-enabling restored consumption. Removing/re-adding the plugin through live config removed the listener and restored a single `x` deletion, with no duplicate deletion observed.
- The maintainer also reported successful manual smoke checks through both `just dev` and `just dev2`.
- A repeatable installed-package exact-state harness now verifies visual selection both directions, physical-key setup, Unicode replacement, custom leader, autocomplete, v2 forms/permission rejection, disable/reload, and full tarball/cache identity. After review fixes, independent parent receipts on v1.18.33/v2.0.15 report 26/33 passing checks respectively, two explicitly named inherited known gaps each, zero failures; cold and warm loads both passed. Visual checkpoints assert offsets, ranges, selected text and focus, including mixed horizontal/word/line/vertical motions. Each checkpoint requires a fresh observer acknowledgement. Typecheck still reports the same eight pre-existing errors.

- Subsequent checked-review regression runs on the same pinned hosts passed 39 v1 / 48 v2 exact-state checks, cold and warm installation, with only the unchanged tab-offset and snapshot-redo known gaps. Independent parent runs confirmed those results at `/private/tmp/vimcode-pr82-fixes/parent-v1/receipt.json` and `parent-v2/receipt.json`, using artifact SHA-256 `5158aae9c59ee27bb6476d357618ea59a58e0603ca7c199facd389bb88e49530`. New cases cover empty buffers, EOF, EOL and backward EOL, read-only wide-character/tab endpoint controls, and a real v2 home-to-session editor switch. Horizontal endpoints now use host-coordinate range probes rather than JavaScript string lengths; visual ownership is captured on entry and re-anchored at the new editor's cursor on the next eligible key. Mixed word/line/vertical endpoint differences remain explicit.

- Pinned Git installs at `d8050f765b6c2c4e7fdc700d8345c1c5752644cb` also passed cold and warm loading on v1.18.33/v2.0.15, with 39/48 exact-state checks and the same two known gaps. Both verified the installed source and manifest byte-for-byte against a local package reference. The existing harness was reused through a temporary configure wrapper that replaced only the install spec; the reference tarball was not the installed package. Receipts are `/private/tmp/vimcode-pr82-git-d8050f7-v1/receipt.json` and `/private/tmp/vimcode-pr82-git-d8050f7-v2/receipt.json`; the wrapper is `/private/tmp/vimcode-pr82-git-install-check.py`.

Earlier parent receipts are `/private/tmp/vimcode-v2-hardening/review-fixed-v1/receipt.json` and `review-fixed-v2/receipt.json`. Both verify artifact SHA-256 `8e43ee3812ecf2baf325fcc97b4e73d6e49ea116ed719fb2e7e12dbab218f7f0`. Earlier exploratory evidence remains under `/tmp/vimcode-v2-poc-runtime/` and `/tmp/vimcode-v2-alternatives/`.

## Issue #79 follow-up (2026-10-04)

The child-session passthrough guard now lives once in the shared controller. The v2 facade distinguishes root sessions from children before supplying `parentID`; otherwise the shared guard would incorrectly bypass root editing. The Vim engine is unchanged. Composer passthrough already existed and is now covered explicitly for normal, visual and insert modes.

Fresh installed-artifact runs passed cold and warm loading on v1.18.33 (39 checks) and v2.0.15 (48 checks), with the same inherited tab-offset and snapshot-redo known gaps and no failures. Receipts: `/private/tmp/vimcode-79-dual-v1-live/receipt.json` and `/private/tmp/vimcode-79-dual-v2-live/receipt.json`.

A separate real v2 navigation smoke passed nine checks using synthetic child sessions, remapped Composer keys, and exact route/editor snapshots. It verified `h`/`l` picker movement, `k` returning to the parent without `i`, and normal editing afterward. This used v2's `composer.subagent.up` (`h`, `k`), `composer.subagent.down` (`l`) and `composer.subagent.select` (`return`), not v1's sibling-cycle config names. The temporary fixture/driver is outside the checkout; receipt: `/private/tmp/vimcode-79-dual-v2-navigation-corrected/receipt.json`.

## Before claiming support

Follow-up live tests covered root/child forms and permission rejection. They reproduced a host space-leader bug inside textual forms, including without vimcode installed. The v2 adapter now protects printable leader characters in focused forms, and the tested multiword root/child answers submitted correctly. The guard does not interpret other form keys as Vim commands and stays inactive when vimcode is disabled.

Earlier exact-buffer tests on v1.15.4, v1.18.33 and v2.0.15 found shared tab/CJK/combining-character deletion bugs and missing redo after snapshot undo. The v1/v2 character-wise visual `h`/`l` difference was subsequently normalized and exact-state checked on v1.18.33/v2.0.15, including backwards motions. Tab offset and snapshot redo remain explicit `known-gap` probes; the harness does not silently count them as passing. Other native selection motions, broader grapheme handling, non-macOS terminals and other releases still need validation. The shared controller retains its existing deferred-yank teardown limitation. See [the strategy and evidence](opencode-v2-strategy.md).

## Repeatable host check

The optional runner needs Python 3.9+, npm, tmux and an explicit OpenCode binary. Use a **new empty output directory outside any checkout**, preferably a canonical OS-temp path (for example `/private/tmp` on macOS, not its `/tmp` symlink spelling). It refuses project OpenCode config ancestors, pins the binary version and runs the host with `env -i`, an isolated HOME/XDG set, a dedicated tmux socket with an explicit empty config, synthetic sessions, and clipboard stubs. It does not contact a model, approve a permission or read the system clipboard. It requires macOS, Linux or WSL; native Windows has not been tested.

```sh
just compat v1 /absolute/path/to/opencode-1.18.33 1.18.33 /private/tmp/vimcode-v1-fresh-run
just compat v2 /absolute/path/to/opencode-2.0.15 2.0.15 /private/tmp/vimcode-v2-fresh-run
just compat-unit
```

Each invocation packs the current worktree, tests cold and warm plugin loading independently, and checks the installed source/manifest byte-for-byte against the tarball. The output `receipt.json` records environment, artifact/version, exact editor text/cursor/selection traces and each check as `pass`, `known-gap` or `fail`. A nonce handshake prevents stale observer output from counting as a checkpoint. Form-answer and permission-clear checks separately poll server state with a bounded deadline, retaining the last response in the receipt even on timeout. A cold failure makes the command fail even if the warm replay succeeds. Cleanup timeouts are recorded as failures without losing the final receipt; only the run's private tmux socket/session is targeted. The test-only fixture lives in `test/compat/fixture` and is excluded from the published package (`package.json` ships only `src/`). The live-host runner is manual, not part of fast `just check` CI. CI also runs `just compat-unit` for lightweight harness regressions; its real private-tmux config check is skipped when tmux is unavailable, while command-isolation checks always run.

The POC demonstrates dual-host core editing, not complete v2 feature parity or a production-safe input API.

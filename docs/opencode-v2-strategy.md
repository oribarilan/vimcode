# OpenCode v2 implementation decision

Investigation date: 2026-09-30. This is a POC assessment, not a supported-version declaration.

## Recommendation

Keep one package and one Vim engine. Use a small v2 renderer-input adapter for an experimental release while asking upstream to expose supported interception and leader matching. Do not replace the engine with an enumerated public-keymap implementation, and do not split v1/v2 release lines yet.

The renderer route is the only complete key-capture route demonstrated here. Public layers work for named keys but fail arbitrary character handling. An upstream API would remove the input-hook workaround, but would not resolve our existing editor offset, selection and undo issues.

## Experiments

All runtime tests used macOS ARM64, isolated HOME/XDG directories, synthetic text and separate tmux sessions. No model prompts were sent. Clipboard writes were redirected to a test file; system clipboard paste was not exercised. The real v1/v2 binaries and installed tarballs were tested, not just mocked APIs.

### 1. Dual entrypoint and renderer interception

One default `{ id, tui, setup }` export loaded on v1.15.4, v1.18.33 and v2.0.15. The pure `src/vim/` engine remained unchanged. The current v2 facade is 239 lines, including structural types, storage/events/UI adaptation and input routing. That is the total v2 adapter size, not a measurement of the incremental cost of keeping v1.

Working core cases included ASCII motions/counts, text objects, replacement with an emoji, unknown-character consumption, multiline undo, palette/autocomplete routing and matching space-leader shortcuts. v2 disable persisted across restart; unloading removed interception and reloading did not duplicate an `x` deletion.

v2.0.20 source retains the relevant input/context APIs, but its binary was not tested. The configured registry had 2.0.15; direct npm access failed and an Unpkg binary download returned HTTP 500. Do not infer a v2.0.20 runtime pass from source similarity.

### 2. Public-keymap-only prototype

A separate copy implemented normal/visual and insert input using public `context.keymap.layer`, without a renderer listener or private host import on that route. It registered 74 normal/visual bindings and 6 insert bindings for the tested space-leader configuration.

| Case | Actual result |
| --- | --- |
| `ggwdw` and ASCII `rX` | Worked |
| Bound normal-mode `z` | Consumed |
| Unbound normal/visual `é` or emoji | Inserted into the prompt |
| `r` followed by `é` | Inserted `éalpha...`, instead of replacing to `élpha...`; operator remained pending |
| `r` followed by emoji | Same insertion-versus-replacement failure |
| Matching space leader then `p` | Opened host palette |
| Space in insert mode | Worked with an explicit leader mirror |

OpenTUI 0.5.10 parses `*` as a literal key. Named sequence patterns require registration, which the public v2 plugin context does not expose. An invented `{any}` binding is not a catch-all. `shortcuts("leader")` returned `[]`; `pending()` exposed the leader only after it was pressed. Parsing display strings from another command's shortcuts is not a reliable replacement for leader metadata.

Compared with the first renderer POC, this prototype added 81 net lines to the facade and 8 to the controller, plus a test. The shared Vim engine still needed no changes. The measured code counts include the opt-in experimental route beside the raw route; they are not a standalone production implementation estimate.

Conclusion: public layers are viable for a reduced, explicitly bounded mode, not full vimcode behavior. Enumerating more characters does not provide arbitrary grapheme capture. The prototype's passing characterization tests include expected failures of parity; they are not a compatibility pass.

### 3. Live forms and permissions

A temporary TUI fixture used the public client to create a session, form and permission request without executing a tool or calling a model. An empty session export/import established a child relationship for testing child-owned prompts while the root session remained open.

- With the default ctrl+x leader, a textual form accepted `hello world`, submitted that exact answer, and returned control to Vim.
- With a confirmed active space leader, the initial POC lost the space inside a form. Following letters could invoke host leader shortcuts and leave the form.
- Removing vimcode reproduced the problem: typing `hello ` left `hello` in the form and `pending()` contained `{ key: "space", token: "leader" }`. This is host behavior, not a bug introduced by the POC.
- A narrow guard now inserts printable leader characters in focused form editors without invoking the Vim engine. The guarded cache-installed variant submitted exact root and child answers (`hello world`, `child words`).
- Root permission rejection and a child permission rejection with the multiword message `no thanks` worked. Pending requests cleared, and normal key consumption resumed. No permission was approved.

The guard was integrated into `src/v2.ts`, with tests for ordinary form-key passthrough, focus and disabled-state behavior. Other forms, arbitrary nesting, simultaneous requests, and non-text controls still need coverage before claiming parity.

### 4. Exact editor-state checks

The initial screen-text smoke test was not sufficient to establish editing parity. In particular, its substring assertion for `ha beta gamma` also accepted `pha beta gamma`. A temporary observer now captures the exact synthetic buffer, cursor, selection, focused editor and host mode; it does not modify product source or consume keyboard events.

| Exact-state case | v1.15.4 | v1.18.33 | v2.0.15 |
| --- | --- | --- | --- |
| ASCII `dw`, `diw`/`ciw` and undo | Worked | Worked | Worked |
| Replace first character with emoji | Worked | Worked | Worked |
| Swallow unknown non-ASCII normal keys | Worked | Worked | Worked |
| Redo after snapshot-backed undo | No redo | No redo | No redo |
| End-of-word after tab | Wrong display offset | Same | Same |
| Delete `beta` from `a\tbeta gamma` | Corrupted range | Same | Same |
| Delete word after CJK/combining prefix | Corrupted range | Same | Same |
| Before normalization: `vllx` | Deleted 2 chars | Deleted 2 chars | Deleted 3 chars |
| After normalization: physical `vllx`, seeded forward/backward/cross-anchor | Not retested | Exact text and selection pass | Exact text and selection pass |

The first group of defects exists in the shared controller/editor boundary, including on the unchanged v1 callback. Dropping v1 does not fix it. Selection behavior was a genuine host difference: v1's native `input.select.right` excluded the character at the cursor; v2 included it. The compatibility boundary now restores an inclusive range after successful deferred visual `h`/`l` motion, only when the original editor, visual anchor and mode still match. It updates `editorView.setSelection` without clearing the renderer's native anchor. Review caught a regression in an earlier version that called the top-level `setSelection`: `vl$x` left the first character behind. Before/after controls confirmed it, and mixed horizontal/word/line/vertical checks now verify that the original anchor survives. Pure engine actions remain unchanged. It does not establish parity for all other native selection motions or fix tab/wide-character offsets. The original PR #58 checkout contains separate cursor work and was not changed or merged into this POC.

### 5. Cold installation and canonical cache paths

The early v1 cold-install failures used a symlink-spelled cache path (`/tmp` on macOS, which resolves to `/private/tmp`). A controlled v1.18.33 experiment changed **only** `XDG_CACHE_HOME` from `/tmp/...` to canonical `/private/tmp/...` with an otherwise identical empty cache and package: the former extracted vimcode but omitted `:vim` on first launch, while the latter loaded `:vim` cold. A fresh install of the actual README Git tag also succeeded with the canonical cache path. The harness resolves `--output` before constructing XDG paths; its independent v1.18.33 and v2.0.15 runs both passed cold and warm installation of the same `./tui`-only tarball.

This is a symlink-cache installer edge case, **not** evidence that all v1 cold Git or tarball installs fail, or that `exports["."]` is required. The v1 Arborist lockfile for `/tmp` used a malformed relative path whereas `/private/tmp` used `node_modules/vimcode`; warm startup bypassed the failed cold resolution. The bundled Arborist in-memory tree was not captured. Adding a generic root export did work around the symlinked v1 case, but real v2 `plugin add` then chose the **server** target and wrote `opencode.json` rather than CLI-only `cli.json`. Keep the package `./tui`-only. An upstream v1 installer fix should canonicalize the install root and accept a materialized package directory when an edge is absent. The isolated install controls are in `/tmp/vimcode-v2-hardening/install/`; the corrected upstream report is preserved as an [unposted draft](opencode-v2-upstream-drafts.md#v1-cold-installation-with-symlink-spelled-xdg-cache).

## Route trade-offs and incremental v1 cost

These cost assessments are engineering judgments, not measured time estimates. Only the prototype sizes and observed behavior above are measured.

| Route | Main implementation/maintenance cost | Extra cost of retaining v1 |
| --- | --- | --- |
| Renderer input adapter | Complete capture works now; own ordering, focus, mode, lifecycle and custom-leader compatibility; re-test host updates | Small adapter/entrypoint code cost, moderate test/support cost. Keep the existing v1 registration path and share engine/editor fixes. Add v1 installed-artifact tests and separate config documentation. |
| Public layers only | More input-registration machinery but incomplete arbitrary-key behavior; still needs leader mirroring | Existing v1 interceptor can stay, but two different input dispatch designs must be tested. No engine fork is necessary. Retaining v1 is not what makes this route unsuitable. |
| Upstream-supported interceptor/leader API | Best input contract; requires upstream review/release and a minimum v2 version, or an interim fallback | Lowest long-term input-adapter divergence: v1 already exposes interception. Still need editor conformance tests and the v1 installer solution. |
| Private OpenCode imports | Bind directly to host internals/Solid context and runtime module resolution; no public compatibility guarantee | Does not simplify v1. More host-version coupling than the renderer route; not prototyped or recommended. |
| Separate v1/v2 packages or branches | Cleaner dependency/type separation, but duplicate releases, docs, update checking, triage and backports | Highest recurring v1 release overhead. It does not solve v2's input or editor problems. |

Supporting v1 is not a second Vim implementation. New pure motions/text objects can remain shared. Most added work is verification: test v1 and v2 dispatch, overlays, native selection semantics, package installation and lifecycle. Existing shared bugs should be charged to core correctness, not to v1 compatibility.

Keep the version promise bounded. A reasonable initial support target is the latest v1.18.x release plus a specifically validated v2 release. v1.15.4 is a useful proven-loading regression probe, but these experiments do not justify promising every v1 release or full parity at that floor. Testing both a minimum and latest v1 version costs more than supporting latest v1 only; neither implies maintaining a second engine.

## Next implementation steps

1. Keep the renderer route experimental, with the tested form guard and explicit leader mirror.
2. Extract only the small vimcode-owned host/editor contract actually needed. Avoid a general compatibility framework or separate engines. The v1-shaped facade was useful for the POC; keep or replace it based on whether it stays narrow.
3. Continue fixing shared tab/wide-character offset conversion and define undo/redo guarantees. Use the new exact-state harness on supported host versions; visual character selection was normalized on v1.18.33/v2.0.15, but other motions remain to be checked.
4. Keep the `./tui`-only manifest, validate cold installs with a canonical cache path, and report the symlink-cache edge case upstream rather than adding a root export.
5. Ask upstream for `context.keymap.intercept("key", handler, { priority })` with owned cleanup, and `context.keymap.isLeader(event)` or equivalent trigger metadata. These capabilities already exist in the internal keymap. Also report the textual-form leader issue and subpath-only installer behavior separately.
6. If upstream supplies the API, switch that one adapter boundary. Decide later whether older v2 releases retain a raw fallback or require upgrading. Neither choice requires dropping v1.

The upstream report drafts remain unposted. This investigation is not a release or a declaration of complete host parity.

## Evidence and sources

Local experiment artifacts are temporary; the decision and findings are retained here.

- Renderer exact-state driver: `/tmp/vimcode-v2-alternatives/extended-smoke.py`; receipts under `renderer/artifacts/`, `v115/artifacts/`, `v118/artifacts/` in that directory. Ignore its exploratory `ctrl-o-normal-pass` text assertion: v2 correctly opened a host modal, so that assertion was not a valid editing invariant.
- Root/child form fixture: `renderer/form-fixture/tui.ts`; exact answered states in `guarded-form-space-result.json` and `child-form-space-result.json`; no-plugin pending-leader evidence in `no-plugin-form-space-pending.json`.
- Public-layer prototype and receipts: `/tmp/vimcode-v2-alternatives/layers/.lab/`; final artifact `build-009/vimcode-0.18.1.tgz`, SHA-256 `15a24d74250974f4bb97bbe2f9deac371dfe6826fa6d8e76ef83364cd5202843`.
- Guarded renderer artifact: `/tmp/vimcode-v2-alternatives/formguard/artifact/`; root-export experiment: `/tmp/vimcode-v2-alternatives/root-export/`.
- Durable optional harness: `just compat v1 /absolute/opencode 1.18.33 /canonical/empty/output` or `just compat v2 /absolute/opencode 2.0.15 /canonical/empty/output`; see [POC instructions](opencode-v2-poc.md#repeatable-host-check). Its cold/warm receipts verify the complete installed source and manifest, exact synthetic editor state, physical-key visual setup, root/child forms, permission rejection and reload. Latest independent parent receipts: `/private/tmp/vimcode-v2-hardening/review-fixed-v1/receipt.json` (26 pass, 2 named known gaps) and `/private/tmp/vimcode-v2-hardening/review-fixed-v2/receipt.json` (33 pass, 2 named known gaps), both cold/warm pass and all-source identity verified. Visual checkpoints assert cursor, range, selected text and focused ownership, and require a fresh observer nonce. Eleven Python tests cover comparison failures, stale observations and durable failure receipts on cleanup timeouts. `just check` passed in parent validation; the eight pre-existing type errors remain outside this POC's scope.
- [v2 public plugin context](https://github.com/anomalyco/opencode/blob/v2.0.20/packages/plugin/src/tui/context.ts), [internal keymap](https://github.com/anomalyco/opencode/blob/v2.0.20/packages/tui/src/context/keymap.tsx), [public context construction](https://github.com/anomalyco/opencode/blob/v2.0.20/packages/tui/src/plugin/api.tsx).
- [OpenTUI keymap contract](https://opentui.com/docs/keymap/core), [0.5.10 key-event dispatch](https://github.com/anomalyco/opentui/blob/v0.5.10/packages/core/src/lib/KeyHandler.ts).
- [v1 installer](https://github.com/anomalyco/opencode/blob/v1.18.33/packages/core/src/npm.ts), [v1 plugin resolution](https://github.com/anomalyco/opencode/blob/v1.18.33/packages/opencode/src/plugin/shared.ts).
- [v2 entrypoint resolution](https://github.com/anomalyco/opencode/blob/v2.0.15/packages/plugin/src/host.ts), [v2 plugin-add target selection](https://github.com/anomalyco/opencode/blob/v2.0.15/packages/cli/src/commands/handlers/plugin/add.ts).

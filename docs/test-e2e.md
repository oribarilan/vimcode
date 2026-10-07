# Terminal Control CI guards

Terminal Control checks run automatically on pull requests against `main` and through Actions `workflow_dispatch`. Local runs are on demand only. They use Bun 1.3.2 and pinned `@kitlangton/terminal-control` 1.2.1, with its matching native PTY driver. No Vitest, tmux, observer plugin, or model is needed.

## Suites and commands

`bun test`, `npm test`, `just test`, and `just check` retain the existing fast suite, including the existing mocked plugin integration tests. They do not discover the new Terminal Control suites. The guard entry files use `.unit.ts`, `.integration.ts`, and `.e2e.ts` suffixes instead of Bun's automatic `.test.ts` discovery; the commands below pass their filenames explicitly. An explicitly requested guard fails on missing setup rather than silently skipping.

```sh
just test                          # existing fast suite; no CLI/network startup
just test-int                      # harness integration, launcher, and parser checks
just test-e2e                      # BOTH pinned hosts: v1@1.18.34 then v2@2.0.15
just test-e2e v1                   # optionally select just one host (or v2)

# Advanced CI/troubleshooting: absolute binary, exact PIN, NEW output directory:
just test-e2e v1 /absolute/opencode-v1 1.18.34 /private/tmp/vimcode-v1-new
just test-e2e v2 /absolute/opencode-v2 2.0.15 /private/tmp/vimcode-v2-new

# Optional no-plugin control: expected exit 1, literal 0 at word-home:
VIMCODE_E2E_NO_PLUGIN=1 just test-e2e v1
```

### Defaults and optional paths

`scripts/test-e2e.ts` uses a fresh, canonical `os.tmpdir()` directory outside checkout/config ancestry, prints the run directory and each `receipt.json` path **before execution**, and preserves evidence on failure. Selected hosts run sequentially; any failure makes the final exit nonzero without hiding the other host. The v2 host uses `--standalone` and `cli.json`; v1 uses `tui.json`.

A binary override is checked first; otherwise an `opencode` on PATH is reused only if its bounded `--version` probe exactly matches the pin. If not, the launcher provisions privately in that run directory, never globally or from `latest`. Provisioning needs network access: v1 downloads the official GitHub release and verifies SHA-256; v2 installs the exact native npm package with scripts disabled and checks manifest name/version. Both verify the resulting binary version. Downloads/installers/probes are bounded, use isolated HOME/XDG/cwd and no inherited credentials or npm configuration, and are not a network sandbox. Per-run installs avoid shared partial-cache/concurrency ownership; delete the printed run directory when evidence is no longer needed.

Automatic bootstrap is verified for macOS arm64 and GNU/Linux x64 native shapes only (Linux uses baseline builds). Other macOS/Linux architectures require a matching native binary override rather than guessed downloads. Windows is unsupported by this guard.

Optional, ignored repository `.env` settings are **paths only**:

```dotenv
VIMCODE_E2E_V1_BIN=/absolute/path/to/opencode-v1
VIMCODE_E2E_V2_BIN=/absolute/path/to/opencode-v2
```

Only these two keys are recognized. Relative paths resolve against the repository root, then canonicalize; there is no shell expansion, version customization, output/cache-root setting, or dotenv dependency. Process environment settings take precedence. Invalid/empty overrides fail only for the selected host, without falling back or preventing another selected host from running; unused host settings are not validated. `CI` set to a nonempty value and fully explicit advanced invocations ignore the local file. Unknown keys/credentials never become runner settings or child environment; never store secrets for this runner. `.env.*` files are ignored by Git but are not read by the launcher. Missing paths/wrong versions fail actionably, never silently switch binaries.

The equivalent package commands are `bun --env-file=/dev/null run test:int` and `bun --env-file=/dev/null run test:e2e [v1|v2]` (or `npm run test:e2e -- v1`). Bun **1.3.2 accepts but does not actually suppress autoload with `--no-env-file`**; synthetic fixtures verify that `--env-file=/dev/null` does. The guard recipes/scripts and product-test child use the latter, without enabling just-wide dotenv autoload. Use the flagged Bun command so its outer package runner cannot autoload a local file before the launcher enforces precedence/CI exclusion.

Advanced output parents must exist and outputs must be empty and outside checkout/OpenCode config ancestry. Existing CI arguments and artifact paths are unchanged; the explicit version must still equal the selected host's pin.

The suites test different boundaries:

| Checks | Classification | Entry file |
| --- | --- | --- |
| Prompt parsing, borders, provider metadata, and cursor diagnostics | Unit tests of the harness: pure functions and fixed snapshots | `test/e2e/prompt.unit.ts` |
| SDK requests, timeouts, and owned-process cleanup | Harness integration tests: real SDK and OS processes with a synthetic driver | `test/e2e/driver.integration.ts` |
| Launcher selection, pins, paths, dotenv isolation, bounded probes, and aggregate/negative exits | Harness integration tests: synthetic settings and OS child processes, no host downloads | `test/e2e/launcher.integration.ts` |
| Installed plugin behavior in real OpenCode | Product E2E tests: real host, PTY, packaged vimcode, and keyboard input | `test/e2e/opencode.e2e.ts` |

`just test-int` groups the SDK/process integration checks and supporting parser units under the **Harness integration tests** CI job. The parser units stay outside ordinary product-test discovery as part of the on-demand harness suite. Lifecycle checks cover stalled readiness, launch/shutdown responses, SDK abort, keyboard type/press requests through the real failure/finally path, unresolved cleanup retries, and driver-override rejection. They do not exercise vimcode or OpenCode.

The four product E2E scenarios run against both host generations:

- Cold package-cache installation and exact insertion of `cold package loaded`.
- `Escape`, `0`, `w`, `i`, `X` produces exactly `one Xtwo three`.
- `Escape`, `0`, `w`, `ci"`, `new` produces exactly `say "new" now`, including an intermediate empty-quote check.
- Multiline `dG` leaves exactly `alpha` plus an empty line; one `u` restores exactly `alpha`, `bravo`, `charlie`.

## PR checks and host pins

`.github/workflows/test.yml` keeps the existing `check` job and adds:

- **Harness integration tests**, running `just test-int` on Ubuntu 24.04.
- **E2E tests (v1)**, running `just test-e2e` on pinned OpenCode **1.18.34**.
- **E2E tests (v2)**, running `just test-e2e` on pinned OpenCode **2.0.15**.

The matrix has `fail-fast: false`, so one host failure does not hide the other. Failures remain failing checks; there is no `continue-on-error`. The workflow has read-only repository permissions, no `pull_request_target`, and no provider secrets. Jobs install tools independently and have bounded timeouts. PR updates cancel superseded workflow runs.

The v1 job downloads the official Linux x64 baseline release asset and verifies its pinned SHA-256 before extraction. The v2 job installs the official `@opencode/cli-linux-x64-baseline@2.0.15` native package with scripts disabled and verifies its manifest. Both find exactly one executable and check its reported version. Hosts install into separate `RUNNER_TEMP` directories, never globally or from `latest`. The baseline x64 builds avoid relying on optional newer CPU instructions.

Each E2E matrix job also runs a no-plugin negative control. It accepts only exit 1 with the exact recorded `word-home` failure (`one two three0`), the expected scenario failure, matching host/version, observed provider-disabled home state, and no cleanup errors. A missing binary, setup failure, or unrelated failure cannot count as a successful control. This case never sends Enter. The positive multiline case guards Enter with observed Vim cursor transitions.

After the first successful GitHub run, an owner must make these check names required in branch protection if they should block merge. Workflow configuration alone does not change repository protection. No actual GitHub run or required-status configuration has been performed by this change.

## Isolation and failure evidence

Each E2E invocation packs the current source with `npm pack --ignore-scripts`, installs an npm-source tarball spec through the real host cache, and verifies the cached manifest and all source files byte-for-byte against the unpacked artifact. Tests and launchers are not packaged. `receipt.json` records host/binary/version, platform, packaged driver path, tarball SHA-256, per-file hashes, checkpoints, observed provider-disabled state per scenario, and cleanup errors.

Driver and host receive isolated HOME, all XDG config/data/cache/state directories, a sandbox cwd, and no inherited provider credentials or config overrides. PATH contains only selected Bun/npm/Node tool directories, system directories, and first-priority clipboard stubs. Update checks are disabled. The isolated `opencode.json` sets `enabled_providers: []`, explicitly excluding even free OpenCode Zen models. Before any scenario inputs, the actual TUI must show the strict bordered home prompt with `Build · No provider selected Connect a provider`; only then does the receipt claim `providersDisabled: true` and record that scenario's observation. Provider-free empty prompts support `Ask` or the host's `Ask anything` placeholder. If the observed v1 connection dialog overlays startup, a bounded Escape dismisses it; no Enter or approval is sent to that dialog. No `models` CLI probe is run: v2 can start an unowned service daemon through that route. Clipboard writes are discarded and reads return nothing. Inputs are synthetic; no model submission, permission approval, or real clipboard access is tested. This is environment/config isolation, not an OS/network sandbox: package/cache startup may access the network.

On failure, Actions uploads only the guard logs, synthetic receipts, scenario checkpoint `.txt` files, and available `failure.txt`, `failure.json`, and `failure.termctrl` evidence, named per host and retained for seven days. Cache, config, home, history, and package trees are not uploaded. Local artifacts stay in the requested output directory. Recordings may contain typed data: do not adapt these guards to real credentials or private prompts and upload the result.

A nonempty inherited `TERMCTRL_BINARY` is rejected and recorded during setup. The SDK resolves that override in the Bun parent before applying the isolated driver environment; the guard supports only the pinned packaged driver.

## Pinned private lifecycle boundary

`test/e2e/driver.ts` uses the SDK 1.2.1 private constructor, `ready`, `child`, and `abort`, because public `make()` hides ownership until readiness and `close()` has no forced-reap fallback. Manifest version, installed JS SHA-256, source shape, and runtime guards fail fast if that boundary changes. Upgrade it only with explicit review and renewed lifecycle probes; do not patch the installed dependency.

Ownership is retained before waiting for hello. Cooperative stop/shutdown failures remain reported even when forced cleanup succeeds. Unresolved handles survive cleanup retries, block later launches, and never become a claimed successful reap.

For forced cleanup on macOS/Linux, the adapter freezes the exact owned driver PID before reading `ps` parent/group identities. Each direct PTY child must lead its own process group. It kills those groups before killing the driver, waits for the driver's `close` event, and verifies the groups disappear, including zombies. SDK abort is intercepted before it can lose group identities. There is no process-name matching. This follows pinned native [`Session::terminate`/`Drop`](https://github.com/anomalyco/terminal-control/blob/v1.2.1/src/session.rs) and [`ManagedSession::stop_worker`/`Drop`](https://github.com/anomalyco/terminal-control/blob/v1.2.1/src/driver.rs): killing the driver alone bypasses its destructors. Unexpected ownership or unavailable process inspection is a cleanup failure. External driver SIGKILL/OS failure and descendants escaping their PTY group are outside this test-only guarantee.

## Oracle and validation limits

Both pinned hosts expose the same bordered home prompt. Assertions compare every rendered prompt line exactly, including empty lines and internal whitespace, not a substring anywhere on screen. Cases use short ASCII, unwrapped lines without trailing spaces. Terminal padding cannot distinguish trailing buffer spaces; these tests do not establish hidden-buffer state, Unicode/display-cell behavior, selection, other routes, full v2 parity, or all-version compatibility.

Cursor-only SDK captures may be stale. Word/quote placement is proven by exact editing effects; cursor metadata is diagnostic there. The multiline Enter safety guard requires observed cursor transitions. Captures must be settled and remain unchanged for a 250 ms stability window after each checkpoint starts, with bounded 5-second keyboard sends/editing captures, a 30-second startup observation deadline, and a 10 ms polling cadence. The 240-second outer scenario timeout leaves room for the longest sequence's bounded operations, failure evidence, and finally cleanup; Bun's timeout alone cannot reject a stalled SDK request. This avoids Escape/printable-key coalescing without unconditional per-key sleeps.

Both pinned hosts (including the provider-free four-scenario run and no-plugin negative controls) and the harness checks (including stalled-send failure/finally/reap probes) were validated on macOS arm64 with Bun 1.3.2. The default no-argument run passed v1 via PATH but v2 automatic npm provisioning was blocked by registry `ENOTCONN` in this environment, so bare/no-override eight-case success is not claimed. A no-argument run with the optional v2 binary path override passed all eight cases; selectors, advanced paths, failure propagation, and the official v1 macOS bootstrap were also checked. Ubuntu workflow syntax and the official Linux package/archive identities were checked, but Linux execution remains pending: the available Docker daemon was not running. The first Actions run must establish that environment. Windows is not supported by this PTY guard; the existing fast suite remains unchanged.

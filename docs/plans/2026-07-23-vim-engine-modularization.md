# Vim Engine Modularization Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Split the 656-line `src/vim.ts` into a focused `src/vim/` module tree with single-responsibility files, without changing any runtime behavior (Tasks 0–12). A trailing **Phase 4 (Task 13)** then consolidates the two pending fields into one `Pending` union — that step is a *deliberate, separately-committed behavioral change* (it removes untested dangling-operator states), explicitly outside the "no behavior change" guarantee. It lives here because it is a pure state-representation refactor of the just-extracted `state.ts`/handlers, and it is the prerequisite for the text-object feature plan.

**Architecture:** `src/vim.ts` becomes a `src/vim/` directory. Pure concerns separate into leaf modules (`types`, `text`, `tables`, `util`), state lifecycle into `state`, and each key handler into its own file (`insert`, `normal`, `visual`). `src/vim/index.ts` is a thin barrel that re-exports only the public surface, so `./vim` keeps resolving and no consumer import changes. The existing 184-test suite is the safety net; every step keeps it green.

**Tech Stack:** TypeScript (strict), Bun test runner, OpenCode TUI plugin API.

## Global Constraints

- Every step ends with `bun test` green. Baseline is 184 tests; Task 0 raises it.
- **Pure engine.** Nothing under `src/vim/` may touch the plugin `api`. Side effects stay in `src/index.ts`.
- **Import discipline.** Sibling modules import directly from each other (`./types`, `./state`, `./text`, `./tables`, `./util`). They must NEVER import from the barrel `./index`. (Barrel-import + barrel-re-export is the circular-import trap; Bun can hand back `undefined` at runtime.)
- **Barrel is a strict firewall.** `src/vim/index.ts` uses explicit named re-exports of the public surface only. No `export *`. Never re-export internal helpers (`resetPending`, `consumeCount`, `enterInsert`, `PASS`, `pushN`, `MOTIONS`, `SELECT_MOTIONS`, `DELETE_MOTION`).
- **Structural only.** Tasks 1-11 move code verbatim; they do not change behavior. The only content changes are Task 0 (new tests) and Task 10 (delete dead `_CONSUME`).
- **One module per commit.** Any bug found while hardening (Task 0) is fixed in its own commit, never mixed with an extraction.
- No `any` in `src/vim/` or `test/`. Keep every file under 500 lines. Cross-platform (macOS/Linux/Windows).

## Public surface (what the barrel must re-export)

Confirmed by grep — the only external consumers are `src/index.ts`, `src/leader.ts`, and the tests.

- **Values:** `createVimState`, `toggleVimMode`, `translateKey`, `handleInsertKey`, `handleNormalKey`, `handleVisualKey`, `finishOneShotIfComplete`, `endOfWord`
- **Types:** `Action`, `VimState`, `KeyEvent`, `PromptAccess`

`MOTIONS` and `SELECT_MOTIONS` are currently exported but used only inside `vim.ts`. They become internal to `tables.ts` and are NOT re-exported.

## Target module structure

`src/vim/` (all files pure, no `api` access):

| File | Responsibility | Imports from |
|---|---|---|
| `types.ts` | `Action` union, `VimState`, `Mode`, `Operator`, `KeyEvent`, `HandlerResult`, `PromptAccess`. No logic. | (none) |
| `text.ts` | Pure string algorithms: `isWhitespace`, `charKind`, `endOfWord`, `currentLineRange`. Input string+offset → offset/range. (Landing zone for the future `wordRangeAt`.) | (none) |
| `tables.ts` | Static keybinding maps: `MOTIONS`, `SELECT_MOTIONS`, `DELETE_MOTION`. Pure data. | (none) |
| `util.ts` | Shared state-agnostic primitives: `translateKey`, `PASS`, `pushN`. | `types` |
| `state.ts` | VimState lifecycle + transitions only: `createVimState`, `toggleVimMode`, `finishOneShotIfComplete`, `resetPending`, `consumeCount`, `enterInsert`, `enterNormal`, `exitVisual`. | `types` |
| `insert.ts` | `handleInsertKey`. | `types`, `util` |
| `normal.ts` | `handleNormalKey`. Owns the (inlined) single-use helpers `finishUndoableChange` and `isInputEmpty`. | `types`, `util`, `state`, `text`, `tables` |
| `visual.ts` | `handleVisualKey`. | `types`, `util`, `state`, `text`, `tables` |
| `index.ts` | Barrel. Explicit named re-exports of the public surface. | all |

Dependency graph is acyclic: `types` / `text` / `tables` are leaves; `util` and `state` depend only on `types`; handlers depend on `types` + `util` + `state` (+ `text` + `tables` for normal/visual); the barrel re-exports.

### Where the council review changed the original proposal

1. `state.ts` is scoped to VimState-only. The state-agnostic helpers move to `util.ts` (`translateKey`, `PASS`, `pushN`); the single-use helpers `finishUndoableChange` and `isInputEmpty` are inlined into `normal.ts`.
2. Import discipline + strict barrel firewall are now hard constraints (see Global Constraints).
3. Dead `_CONSUME` is deleted (Task 10).
4. `text.ts` is extracted first (Task 3) as the feature's landing zone; `currentLineRange` lives there and `charKind` is exported for the upcoming text-object work.
5. Test split gives the integration/undo tests their own file rather than forcing them under a handler (Task 11).

## Out of scope

The text-object feature (issue #57: `diw`/`ciw`/`yiw`/`viw`/`daw`) is a **separate plan** that runs after this refactor. This plan only restructures and hardens.

## Extraction convention (Tasks 2-9)

"Move symbol X" means: cut X verbatim from `src/vim/index.ts` into the target file, add the import header shown, then in the barrel add the named re-export shown and import anything the barrel still needs internally. After each task, `src/vim/index.ts` shrinks and the new module is self-contained. Run `bun test` and commit.

**Per-task barrel invariant.** Each extraction must add the barrel re-export in the *same commit* it removes the definition. Between commits the barrel must always re-export the full public surface, or `src/index.ts` / `src/leader.ts` / the tests break mid-sequence and the "every step ends green" guarantee fails.

---

### Task 0: Harden the remaining coverage gaps

Pin every branch that later moves. Source is untouched here except where a gap reveals a real bug (fix that in a separate commit).

**Files:**
- Modify: `test/vim.test.ts` (add tests to existing describe blocks)

**Interfaces:**
- Consumes: `handleNormalKey`, `finishOneShotIfComplete`, `ev`, `cmds`, `mockPrompt`, `state` (all already in the test file).
- Produces: nothing new; raises `src/vim.ts` line coverage toward 100%.

- [ ] **Step 1: Add the missing-branch tests**

First verify what is actually uncovered — do not add duplicates. The current suite **already tests** `Ctrl+R` → `input.redo` and `O` opens-a-line-above; skip those two below. Confirm the rest are genuinely missing (run `bun test --coverage` and read the `vim.ts` gaps) before appending. Append only the real gaps to `test/vim.test.ts` in the matching describe blocks:

```ts
// in: handleNormalKey — special keys
it("Ctrl+R dispatches input.redo", () => {
  const result = handleNormalKey(state, "r", ev("r", { ctrl: true }), mockPrompt);
  expect(result.consume).toBe(true);
  expect(cmds(result.actions)).toEqual(["input.redo"]);
});

it("Enter in normal mode submits the prompt", () => {
  const result = handleNormalKey(state, "return", ev("return"), mockPrompt);
  expect(cmds(result.actions)).toEqual(["input.submit"]);
});

it("x deletes the character under the cursor", () => {
  const result = handleNormalKey(state, "x", ev("x"), mockPrompt);
  expect(cmds(result.actions)).toEqual(["input.delete"]);
});

it("3x deletes three characters", () => {
  handleNormalKey(state, "3", ev("3"), mockPrompt);
  const result = handleNormalKey(state, "x", ev("x"), mockPrompt);
  expect(cmds(result.actions)).toEqual(["input.delete", "input.delete", "input.delete"]);
});

// in: handleNormalKey — insert entries
it("O opens a line above and enters insert", () => {
  const result = handleNormalKey(state, "O", ev("O"), mockPrompt);
  expect(cmds(result.actions)).toEqual(["input.line.home", "input.newline", "input.move.up"]);
  expect(result.actions.some((a) => a.type === "mode" && a.mode === "insert")).toBe(true);
});

// in: Ctrl+O one-shot normal mode
it("finishOneShotIfComplete does not double-append insert when the result already enters insert", () => {
  state.oneShotNormal = true;
  const result = { consume: true, actions: [{ type: "mode", mode: "insert" } as const] };
  finishOneShotIfComplete(state, result);
  expect(state.oneShotNormal).toBe(false);
  expect(result.actions.filter((a) => a.type === "mode" && a.mode === "insert").length).toBe(1);
});
```

- [ ] **Step 2: Run the suite**

Run: `bun test`
Expected: PASS. Count rises from the current baseline by however many of the proposed tests are genuinely new (fewer than six, since `Ctrl+R` and `O` are already covered). Don't treat an exact target number as a gate — the coverage delta in Step 3 is the real signal.

- [ ] **Step 3: Confirm coverage closed**

Run: `bun test --coverage`
Expected: `src/vim.ts` line coverage at/near 100%. The only permitted remaining gap is the operator+motion fallthrough (`vim.ts:411-412`): it is defensive code, unreachable because `j`/`k`/`G` are handled by earlier branches and every remaining `MOTIONS` key has a `DELETE_MOTION` entry. Leave it, with a one-line `// unreachable: every MOTIONS key reaching here has a DELETE_MOTION entry (j/k/G handled above)` comment. Do not contort a test to reach it.

- [ ] **Step 4: Commit**

```bash
git add test/vim.test.ts src/vim.ts
git commit -m "test: pin uncovered normal-mode branches before refactor"
```

---

### Task 1: Turn `vim.ts` into the directory barrel

**Files:**
- Rename: `src/vim.ts` → `src/vim/index.ts`

- [ ] **Step 1: Move the file, preserving history**

```bash
git mv src/vim.ts src/vim/index.ts
```

- [ ] **Step 2: Verify resolution is unchanged**

`src/index.ts` (`from "./vim"`), `src/leader.ts` (`from "./vim"`), and `test/vim.test.ts` (`from "../src/vim"`) all resolve to the new `src/vim/index.ts` automatically.

Run: `bun test`
Expected: PASS (~190), no import edits needed.

- [ ] **Step 3: Commit**

```bash
git add -A
git commit -m "refactor: move vim.ts into src/vim/ directory barrel"
```

---

### Task 2: Extract `types.ts`

**Files:**
- Create: `src/vim/types.ts`
- Modify: `src/vim/index.ts`

**Interfaces:**
- Produces: `Action`, `VimState`, `Mode`, `Operator`, `KeyEvent`, `HandlerResult`, `PromptAccess`.

- [ ] **Step 1: Move the type declarations**

Cut `Mode`, `Operator`, `Action`, `HandlerResult`, `VimState`, `KeyEvent`, `PromptAccess` (currently `index.ts` lines 1-49) into `src/vim/types.ts`. No imports needed — they are self-contained.

- [ ] **Step 2: Re-wire the barrel**

At the top of `src/vim/index.ts`:

```ts
import type { Action, HandlerResult, KeyEvent, Mode, Operator, PromptAccess, VimState } from "./types";

export type { Action, KeyEvent, PromptAccess, VimState } from "./types";
```

(Import `Mode`/`Operator`/`HandlerResult` only because the code still living in the barrel references them; they are not re-exported.)

- [ ] **Step 3: Verify + commit**

```bash
bun test        # PASS
git add -A
git commit -m "refactor: extract vim types into types.ts"
```

---

### Task 3: Extract `text.ts` (feature landing zone)

**Files:**
- Create: `src/vim/text.ts`
- Modify: `src/vim/index.ts`

**Interfaces:**
- Produces: `endOfWord` (public), `charKind`, `isWhitespace`, `currentLineRange` (internal to the engine; consumed by handlers and, later, `wordRangeAt`).

- [ ] **Step 1: Move the pure string functions**

Cut `endOfWord`, `isWhitespace`, `charKind` (index.ts ~lines 123-150) and `currentLineRange` (~lines 617-623) into `src/vim/text.ts`. Export all four (`charKind` is exported now because the text-object work will classify boundary characters). No imports needed.

- [ ] **Step 2: Re-wire the barrel**

```ts
import { currentLineRange, endOfWord } from "./text";

export { endOfWord } from "./text";
```

(Only `endOfWord` is public. `currentLineRange` is imported because the `V` handler still living in the barrel uses it.)

- [ ] **Step 3: Verify + commit**

```bash
bun test        # PASS
git add -A
git commit -m "refactor: extract pure text algorithms into text.ts"
```

---

### Task 4: Extract `tables.ts`

**Files:**
- Create: `src/vim/tables.ts`
- Modify: `src/vim/index.ts`

**Interfaces:**
- Produces: `MOTIONS`, `SELECT_MOTIONS`, `DELETE_MOTION` (all engine-internal).

- [ ] **Step 1: Move the maps**

Cut `MOTIONS`, `SELECT_MOTIONS` (index.ts lines 51-75) and `DELETE_MOTION` (lines 77-85) into `src/vim/tables.ts`. Export all three. No imports needed.

- [ ] **Step 2: Re-wire the barrel**

```ts
import { DELETE_MOTION, MOTIONS, SELECT_MOTIONS } from "./tables";
```

Not re-exported (internal). The handlers still in the barrel use them via this import for now.

- [ ] **Step 3: Verify + commit**

```bash
bun test        # PASS
git add -A
git commit -m "refactor: extract keybinding tables into tables.ts"
```

---

### Task 5: Extract `util.ts`

**Files:**
- Create: `src/vim/util.ts`
- Modify: `src/vim/index.ts`

**Interfaces:**
- Produces: `translateKey` (public), `PASS`, `pushN` (engine-internal).

- [ ] **Step 1: Move the shared primitives**

Cut `translateKey` (index.ts ~lines 152-162) and `pushN` (~lines 650-652) into `src/vim/util.ts`. Add `PASS` there too (currently defined ~line 87). Header:

```ts
import type { Action, HandlerResult, KeyEvent } from "./types";

export const PASS: HandlerResult = { consume: false, actions: [] };

export function translateKey(ev: KeyEvent): string { /* moved verbatim */ }

export function pushN(actions: Action[], cmd: string, n: number): void { /* moved verbatim */ }
```

- [ ] **Step 2: Re-wire the barrel**

```ts
import { PASS, pushN, translateKey } from "./util";

export { translateKey } from "./util";
```

Delete the old inline `PASS`/`pushN`/`translateKey` definitions from the barrel.

- [ ] **Step 3: Verify + commit**

```bash
bun test        # PASS
git add -A
git commit -m "refactor: extract translateKey/PASS/pushN into util.ts"
```

---

### Task 6: Extract `state.ts`

**Files:**
- Create: `src/vim/state.ts`
- Modify: `src/vim/index.ts`

**Interfaces:**
- Produces: `createVimState`, `toggleVimMode`, `finishOneShotIfComplete` (public); `resetPending`, `consumeCount`, `enterInsert`, `enterNormal`, `exitVisual` (engine-internal).

- [ ] **Step 1: Move state lifecycle + transitions**

Cut `createVimState`, `toggleVimMode`, `finishOneShotIfComplete`, `resetPending`, `consumeCount`, `enterInsert`, `enterNormal`, `exitVisual` into `src/vim/state.ts`. Header:

```ts
import type { Action, HandlerResult, Mode, Operator, VimState } from "./types";
```

Do NOT move `finishUndoableChange` or `isInputEmpty` here — they go into `normal.ts` in Task 8.

- [ ] **Step 2: Re-wire the barrel**

```ts
import { consumeCount, createVimState, enterInsert, enterNormal, exitVisual, resetPending } from "./state";

export { createVimState, finishOneShotIfComplete, toggleVimMode } from "./state";
```

- [ ] **Step 3: Verify + commit**

```bash
bun test        # PASS
git add -A
git commit -m "refactor: extract VimState lifecycle into state.ts"
```

---

### Task 7: Extract `insert.ts`

**Files:**
- Create: `src/vim/insert.ts`
- Modify: `src/vim/index.ts`

**Interfaces:**
- Consumes: `PASS` from `./util`; types from `./types`.
- Produces: `handleInsertKey`.

- [ ] **Step 1: Move the handler**

Cut `handleInsertKey` into `src/vim/insert.ts`. Header:

```ts
import type { Action, HandlerResult, KeyEvent, PromptAccess, VimState } from "./types";
import { PASS } from "./util";
```

- [ ] **Step 2: Re-wire the barrel**

```ts
export { handleInsertKey } from "./insert";
```

Remove the now-unused `PASS` import from the barrel if nothing else there references it.

- [ ] **Step 3: Verify + commit**

```bash
bun test        # PASS
git add -A
git commit -m "refactor: extract handleInsertKey into insert.ts"
```

---

### Task 8: Extract `normal.ts` (with inlined single-use helpers)

**Files:**
- Create: `src/vim/normal.ts`
- Modify: `src/vim/index.ts`

**Interfaces:**
- Consumes: `MOTIONS`, `DELETE_MOTION` from `./tables`; `endOfWord`, `currentLineRange` from `./text`; `PASS`, `pushN` from `./util`; `resetPending`, `consumeCount`, `enterInsert` from `./state`; types from `./types`.
- Produces: `handleNormalKey`.

- [ ] **Step 1: Move the handler and inline its private helpers**

Cut `handleNormalKey` into `src/vim/normal.ts`. Move `finishUndoableChange` and `isInputEmpty` here too (they are used only by this handler) as file-local functions. Header:

```ts
import type { Action, HandlerResult, KeyEvent, PromptAccess, VimState } from "./types";
import { DELETE_MOTION, MOTIONS } from "./tables";
import { currentLineRange, endOfWord } from "./text";
import { PASS, pushN } from "./util";
import { consumeCount, enterInsert, resetPending } from "./state";

function finishUndoableChange(actions: Action[]): HandlerResult { /* moved verbatim */ }
function isInputEmpty(prompt: PromptAccess): boolean { /* moved verbatim */ }
```

- [ ] **Step 2: Re-wire the barrel**

```ts
export { handleNormalKey } from "./normal";
```

- [ ] **Step 3: Verify + commit**

```bash
bun test        # PASS
git add -A
git commit -m "refactor: extract handleNormalKey into normal.ts"
```

---

### Task 9: Extract `visual.ts`

**Files:**
- Create: `src/vim/visual.ts`
- Modify: `src/vim/index.ts`

**Interfaces:**
- Consumes: `SELECT_MOTIONS` from `./tables`; `endOfWord` from `./text`; `pushN` from `./util`; `consumeCount`, `enterInsert`, `enterNormal`, `exitVisual` from `./state`; types from `./types`.
- Produces: `handleVisualKey`.

- [ ] **Step 1: Move the handler**

Cut `handleVisualKey` into `src/vim/visual.ts`. Header:

```ts
import type { Action, HandlerResult, KeyEvent, PromptAccess, VimState } from "./types";
import { SELECT_MOTIONS } from "./tables";
import { endOfWord } from "./text";
import { PASS, pushN } from "./util";
import { consumeCount, enterInsert, enterNormal, exitVisual } from "./state";
```

- [ ] **Step 2: Re-wire the barrel**

```ts
export { handleVisualKey } from "./visual";
```

- [ ] **Step 3: Verify + commit**

```bash
bun test        # PASS
git add -A
git commit -m "refactor: extract handleVisualKey into visual.ts"
```

---

### Task 10: Finalize the barrel + drop dead code

**Files:**
- Modify: `src/vim/index.ts`

- [ ] **Step 1: Reduce the barrel to re-exports only**

After Tasks 2-9, `src/vim/index.ts` should contain nothing but the public re-exports:

```ts
export type { Action, KeyEvent, PromptAccess, VimState } from "./types";
export { endOfWord } from "./text";
export { translateKey } from "./util";
export { createVimState, finishOneShotIfComplete, toggleVimMode } from "./state";
export { handleInsertKey } from "./insert";
export { handleNormalKey } from "./normal";
export { handleVisualKey } from "./visual";
```

Delete any leftover internal imports. Confirm `_CONSUME` is gone (it was dead code; it must not have been carried into any module).

- [ ] **Step 2: Verify the firewall**

Two checks. First, the external shell must not reach any internal (anchor the fragile short names with `\b` so `PASS` doesn't match `bypass`/`compass`):

Run: `grep -rnE "\b(MOTIONS|SELECT_MOTIONS|DELETE_MOTION|resetPending|consumeCount|PASS|pushN)\b" src/index.ts src/leader.ts`
Expected: no matches. The shell depends only on the public surface.

Second, verify import discipline inside the engine — no sibling module imports the barrel (the circular-import trap):

Run: `grep -rnE "from \"\.\/index\"|from \"\.\.\/vim\"" src/vim/`
Expected: no matches. Siblings import each other directly (`./types`, `./state`, …); only external consumers go through the barrel.

- [ ] **Step 3: Verify + commit**

```bash
bun test        # PASS
git add -A
git commit -m "refactor: reduce vim barrel to public surface, drop dead _CONSUME"
```

---

### Task 11: Split the test suite to mirror the modules

**Files:**
- Create: `test/support.ts` (assertion helpers), `test/fixtures.ts` (prompt fixtures)
- Create: `test/vim/text.test.ts`, `test/vim/state.test.ts`, `test/vim/util.test.ts`, `test/vim/insert.test.ts`, `test/vim/normal.test.ts`, `test/vim/visual.test.ts`, `test/integration.test.ts`
- Delete: `test/vim.test.ts`

**Interfaces:**
- `test/support.ts` produces: `cmds`, `cursorTos`, `deleteRanges`, `saveUndoSnapshots`, `selectRanges`, `ev`.
- `test/fixtures.ts` produces: `mockPrompt`, `emptyPrompt`.

- [ ] **Step 1: Extract shared test helpers**

Move `cmds`/`cursorTos`/`deleteRanges`/`saveUndoSnapshots`/`selectRanges`/`ev` (current `vim.test.ts` lines 16-46) into `test/support.ts`, and `mockPrompt`/`emptyPrompt` (lines 48-62) into `test/fixtures.ts`. Export each.

- [ ] **Step 2: Split describe blocks into per-module files (one at a time)**

Do this **incrementally**, never as a big-bang rewrite: a dropped or duplicated test passes CI silently (a missing test doesn't fail — it just vanishes), so a green suite alone does NOT prove conservation. Record the exact test count at the end of Task 0 first (`bun test` prints it). Then, for each target file below: cut its describe block(s) out of `vim.test.ts`, paste into the new file, run `bun test`, and confirm the **total count is unchanged**. The original file shrinks toward empty as you go; delete it last (Step 3).

Move each describe block to the file that matches the module under test, importing from `../../src/vim` (barrel) and helpers from `../support` / `../fixtures`:

- `text.test.ts` ← `endOfWord`; add direct unit tests for `charKind`, `isWhitespace`, `currentLineRange` (now exported from `text.ts`, importable via the barrel or directly from `../../src/vim/text`).
- `state.test.ts` ← `createVimState`, `toggleVimMode`.
- `util.test.ts` ← `translateKey`.
- `insert.test.ts` ← `handleInsertKey`.
- `normal.test.ts` ← the `handleNormalKey` blocks (motions, g prefix, e motion, operators, dG/cG, shortcuts, special keys, replace, insert entries, yy, history, visual-mode entry).
- `visual.test.ts` ← `handleVisualKey` blocks (motions, operators, exit/passthrough).
- `integration.test.ts` ← `Ctrl+O one-shot`, `plugin init`, and `undo snapshot` blocks (these drive the full pipeline / `applyActions`). Keep the `version sync` block here or in a small `test/version.test.ts`.

Each split file re-declares the shared setup it needs — `let state; beforeEach(() => { state = createVimState(); state.mode = "normal"; })` and a `createVimState` import — since only the pure assertion helpers and prompt fixtures are centralized in `test/support.ts` / `test/fixtures.ts`.

Consider doing Task 11 as its own PR, separate from the code-move commits, so a mis-split is easy to bisect.

- [ ] **Step 3: Delete the old file, verify counts**

Only after every block has moved and `vim.test.ts` holds no live tests:

```bash
rm test/vim.test.ts
bun test
```
Expected: the **exact** total from the end of Task 0 (the split moves tests, it does not add or drop them), plus only the new `text.ts` unit tests you deliberately added in Step 2. Completion criterion is count parity, not merely "green" — if the number dropped, a test was lost in the split.

- [ ] **Step 4: Commit**

```bash
git add -A
git commit -m "test: split vim tests to mirror the module layout"
```

---

### Task 12: Update docs

**Files:**
- Modify: `AGENTS.md` (Architecture section, line counts, conventions)
- Modify: `CHANGELOG.md` (`[Unreleased]`)

- [ ] **Step 1: Update AGENTS.md**

Replace the `src/vim.ts (645 lines)` architecture block with the new `src/vim/` tree and per-file responsibilities. Update the data-flow diagram to reference the handler modules. Note the import-discipline and barrel-firewall rules under Code Conventions. Adjust the "Keep vim.ts under 500 lines" note to reflect the split. (AGENTS.md's current counts are stale — `src/vim.ts` is actually 656 lines, not 645, and the test-file line count is likewise off; re-measure with `wc -l` rather than trusting the old numbers.)

- [ ] **Step 2: Update CHANGELOG.md**

Under `[Unreleased]`, add: `### Changed — Split the vim engine into a modular src/vim/ tree (no behavior change).`

- [ ] **Step 3: Run the full gate + commit**

```bash
just check      # lint + tests
git add AGENTS.md CHANGELOG.md
git commit -m "docs: document the modular vim engine layout"
```

---

## Phase 4 — Consolidate pending state (deliberate behavioral change)

This phase is a state-representation refactor, distinct from the file moves in Tasks 1-12. It replaces the two orthogonal pending fields (`pendingOp` + `pendingChar`) with a single discriminated `Pending` union, so the two-fields-must-stay-consistent burden disappears and text objects get a correct home (Phase 4 is a prerequisite for the text-object feature plan). Do it after Task 12, on the already-extracted `types.ts` / `state.ts` / handler modules, **as its own commit (ideally its own PR)** so the behavior-preserving refactor (Tasks 1-12) stays independently bisectable.

**This is NOT covered by the plan's "no runtime behavior change" banner.** It preserves every currently-*tested* behavior (the tests from Task 0 stay green), but it is a real behavior change: it removes untested *dangling-state* sequences the two-field model permits. `dgg` and `drx` today leave a stale operator set after the `g`/`r` branch runs, because the fields are independent — so `dgg` then `w` currently *deletes a word*. Collapsing to one field makes the `g`/`r` branch overwrite the operator, so the dangle is impossible by construction. Treat this as a bug fix, and pin both the cleared pending state and the corrected next-key behavior with new tests in Step 4. Real `dgg`-deletes-to-top support is out of scope (a later feature); this phase keeps `gg`'s current user-visible result (move to top, no delete).

### Task 13: Replace `pendingOp` + `pendingChar` with a `Pending` union

**Files:**
- Modify: `src/vim/types.ts`, `src/vim/state.ts`, `src/vim/normal.ts`, `src/vim/visual.ts`
- Modify: `test/vim/normal.test.ts`, `test/vim/visual.test.ts`, `test/vim/state.test.ts`, `test/integration.test.ts`

**Interfaces:**
- Produces: the `Pending` union; `Operator` narrowed to non-null `"d" | "c" | "y"`.

- [ ] **Step 1: Define the union in `types.ts`**

```ts
export type Operator = "d" | "c" | "y";   // nullability moves into Pending

export type Pending =
  | { kind: "none" }
  | { kind: "operator"; op: Operator }   // replaces pendingOp
  | { kind: "goto" }                     // replaces pendingChar === "g"
  | { kind: "replace" };                 // replaces pendingChar === "r"
```

In `VimState`, replace `pendingOp: Operator` and `pendingChar: "r" | "g" | null` with a single `pending: Pending`.

- [ ] **Step 2: Update `state.ts`**

- `createVimState`: initialize `pending: { kind: "none" }`.
- `resetPending`: `state.pending = { kind: "none" }; state.count = 0;`.
- `toggleVimMode`: reset to `{ kind: "none" }` where it currently clears the two fields.
- `finishOneShotIfComplete`: change the guard `state.pendingOp !== null || state.pendingChar !== null || state.count > 0` to `state.pending.kind !== "none" || state.count > 0`.

- [ ] **Step 3: Translate the handler read/write sites (behavior identical)**

| Old | New |
|---|---|
| `state.pendingOp = key` (d/c/y) | `state.pending = { kind: "operator", op: key }` |
| `state.pendingOp === "d"` / truthy | `state.pending.kind === "operator"` (op via `state.pending.op`) |
| `state.pendingOp === key` (dd/cc/yy) | `state.pending.kind === "operator" && state.pending.op === key` |
| `state.pendingChar = "g"` | `state.pending = { kind: "goto" }` |
| `state.pendingChar === "g"` | `state.pending.kind === "goto"` |
| `state.pendingChar = "r"` | `state.pending = { kind: "replace" }` |
| `state.pendingChar === "r"` | `state.pending.kind === "replace"` |

The `g`/`r` branches now set `{ kind: "goto" }` / `{ kind: "replace" }`, which also clears any pending operator — that is the dangling-state cleanup (previously the operator leaked).

**Narrowing gotcha.** After narrowing on `state.pending.kind === "operator"`, capture the operator into a local (`const op = state.pending.op`) at the top of the branch. `enterInsert`/`resetPending` reassign `state.pending`, which de-narrows the union — a later `state.pending.op` read in the same branch will not type-check. Read `op` once, then use the local.

- [ ] **Step 4: Update field-asserting tests + pin the cleanup**

Update the ~25-30 assertions that read `state.pendingOp` / `state.pendingChar` directly (the operators, g-prefix, and replace blocks). Add tests pinning the removed dangling state — both the cleared `pending` AND the corrected next keystroke (the latter is what actually regressed the two-field bug):

```ts
it("dgg does not leave a dangling operator", () => {
  handleNormalKey(state, "d", ev("d"), mockPrompt);
  handleNormalKey(state, "g", ev("g"), mockPrompt);
  handleNormalKey(state, "g", ev("g"), mockPrompt);
  expect(state.pending).toEqual({ kind: "none" });
});

it("dgg then w moves by word (the old dangling 'd' would have deleted it)", () => {
  handleNormalKey(state, "d", ev("d"), mockPrompt);
  handleNormalKey(state, "g", ev("g"), mockPrompt);
  handleNormalKey(state, "g", ev("g"), mockPrompt);
  const result = handleNormalKey(state, "w", ev("w"), mockPrompt);
  expect(cmds(result.actions)).toEqual(["input.word.forward"]); // NOT input.delete.word.forward
});

it("drx replaces the char and clears pending", () => {
  handleNormalKey(state, "d", ev("d"), mockPrompt);
  handleNormalKey(state, "r", ev("r"), mockPrompt);
  const result = handleNormalKey(state, "x", ev("x"), mockPrompt);
  expect(state.pending).toEqual({ kind: "none" });
  expect(result.actions.some((a) => a.type === "insertText")).toBe(true);
});

it("drx then w moves by word (no dangling delete-operator)", () => {
  handleNormalKey(state, "d", ev("d"), mockPrompt);
  handleNormalKey(state, "r", ev("r"), mockPrompt);
  handleNormalKey(state, "x", ev("x"), mockPrompt);
  const result = handleNormalKey(state, "w", ev("w"), mockPrompt);
  expect(cmds(result.actions)).toEqual(["input.word.forward"]);
});
```

Also add a test for the `finishOneShotIfComplete` guard rewrite from Step 2 (a Ctrl+O one-shot with an operator pending must stay in normal mode, not auto-return to insert):

```ts
it("Ctrl+O one-shot stays in normal mode while an operator is pending", () => {
  state.oneShotNormal = true;
  const result = handleNormalKey(state, "d", ev("d"), mockPrompt);
  finishOneShotIfComplete(state, result);
  expect(state.mode).toBe("normal");
});
```

- [ ] **Step 5: Verify + commit**

```bash
bun test        # PASS — all previously-green tests plus the new pins
git add -A
git commit -m "refactor: consolidate pending state into a discriminated union"
```

---

## Self-Review

- **Coverage of the goal.** Tasks 2-9 relocate every symbol in the current `vim.ts`; Task 10 leaves the barrel as pure re-exports; Task 11 mirrors the tests; Task 12 syncs docs. No symbol is orphaned.
- **Firewall + import discipline.** Enforced as Global Constraints and checked mechanically in Task 10 Step 2. Handlers import siblings directly; the barrel never feeds back into the engine.
- **Type/name consistency.** The public surface (8 values + 4 types) is fixed in the "Public surface" section and reproduced identically in every barrel re-export step. `MOTIONS`/`SELECT_MOTIONS`/`DELETE_MOTION` stay internal to `tables.ts`. `finishUndoableChange`/`isInputEmpty` land only in `normal.ts`.
- **Behavior preservation.** Tasks 1-12 are verbatim moves; only Task 0 (tests) and Task 10 (dead-code deletion) change content. Task 13 (Phase 4) is a state-representation change that preserves all tested behavior and deliberately removes untested dangling-state sequences — gated by `bun test` plus new pins.
- **Sequencing.** Tasks 1-12 (file split) → Task 13 (pending union) → then the separate text-object feature. `text.ts` (Task 3), the extracted `VimState`/handler seams, and the `Pending` union (Task 13) are all in place so the feature lands as a clean diff whose only new pending node is `{ kind: "textObject" }`.

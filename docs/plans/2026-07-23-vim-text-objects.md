# Vim Text Objects Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement word text objects — `diw ciw yiw daw caw yaw` in normal mode and `viw vaw` in visual mode (issue #57).

**Architecture:** A text object is a pure noun that resolves to a `Range`; operators are verbs that already consume ranges. Add one pure `resolveTextObject` to `text.ts`, one `textObject` node to the `Pending` union, one charwise `applyOperatorToRange` helper (also adopted by the existing `e`/`G` operator branches), and the `i`/`a` dispatch branches to the normal and visual handlers.

**Tech Stack:** TypeScript (strict), Bun test runner, OpenCode TUI plugin API.

## Dependencies

This plan assumes the modularization plan (`2026-07-23-vim-engine-modularization.md`) is **fully applied, including Phase 4**. It relies on:
- `src/vim/text.ts` (home of `charKind`, `isWhitespace`, `endOfWord`, `currentLineRange`).
- `src/vim/types.ts` with the `Pending` discriminated union and non-null `Operator`.
- `src/vim/normal.ts` / `src/vim/visual.ts` and the split `test/vim/*.test.ts` layout.

Do not start this plan until `bun test` is green on the post-refactor tree.

## Global Constraints

- Every step ends with `bun test` green. TDD: write the failing test, watch it fail, implement, watch it pass, commit.
- **Purity.** `resolveTextObject` and the word rules stay pure in `text.ts` and reuse the *same* `charKind`/`isWhitespace` classifier as `w`/`e`. No second word definition.
- **Range convention.** `Range { start, end }` is inclusive; invariant `0 <= start <= end < text.length`. "No object under the cursor" is `null`, never a zero-width sentinel.
- **Scope of `applyOperatorToRange`.** Charwise, offset-based ranges only (`e`, `G`, text objects). Never route linewise (`dd`/`dj`) or host-command motions (`dw`) through it.
- **`i`/`a` stay insert/append** when no operator is pending and not in visual mode. The text-object meaning only applies when `pending.kind === "operator"` (normal) or in visual mode.
- No `any`. Keep each file under 500 lines. Cross-platform.

## Design decisions (from the council review)

- `resolveTextObject` takes `count` from the start (mirrors `endOfWord`); omitting it is a later signature break.
- `TextObjectKind` is a plain string union (`"word"`) for now — no roadmap comment in the type. When the first delimiter-carrying kind (quote/bracket) lands, migrate to a tagged union then.
- No lookup table for a single kind; use an inline `key === "w"` check until a second kind exists.
- The `textObject` pending node carries `op: Operator | null` (`null` = visual). This is why Phase 4's union matters: one node serves both contexts.
- Visual `viw` **replaces** the selection with the resolved range (it does not extend from `visualAnchor` like the visual `e` motion).
- `applyOperatorToRange` is cursor-agnostic; text-object callers append `cursorTo(range.start)` (a no-op for forward motions, which is why `e`/`G` don't).
- Word classification reuses `charKind` (JS `\w`), so most non-ASCII letters classify as punctuation — the same behavior `w`/`e` already have. Text objects inherit it deliberately; revisit only if Unicode word support becomes a goal.

---

### Task 1: `Range` + `resolveTextObject` for `iw` (inner word)

**Files:**
- Modify: `src/vim/types.ts` (add `Range`, `TextObjectVariant`, `TextObjectKind`)
- Modify: `src/vim/text.ts` (add `resolveTextObject`)
- Modify: `test/vim/text.test.ts`

**Interfaces:**
- Produces: `type Range = { start: number; end: number }`, `type TextObjectVariant = "inner" | "around"`, `type TextObjectKind = "word"`; `resolveTextObject(text, offset, kind, variant, count): Range | null` (this task handles `kind === "word"`, `variant === "inner"`, `count === 1`).

- [ ] **Step 1: Write the failing tests**

```ts
import { resolveTextObject } from "../../src/vim/text";

describe("resolveTextObject — inner word", () => {
  it("word under cursor (start)", () => {
    expect(resolveTextObject("hello world", 0, "word", "inner", 1)).toEqual({ start: 0, end: 4 });
  });
  it("word under cursor (mid-word)", () => {
    expect(resolveTextObject("hello world", 2, "word", "inner", 1)).toEqual({ start: 0, end: 4 });
  });
  it("second word", () => {
    expect(resolveTextObject("hello world", 6, "word", "inner", 1)).toEqual({ start: 6, end: 10 });
  });
  it("cursor on whitespace selects the whitespace run", () => {
    expect(resolveTextObject("a   b", 1, "word", "inner", 1)).toEqual({ start: 1, end: 3 });
  });
  it("punctuation run is its own object", () => {
    expect(resolveTextObject("foo.bar", 3, "word", "inner", 1)).toEqual({ start: 3, end: 3 });
    expect(resolveTextObject("a...b", 1, "word", "inner", 1)).toEqual({ start: 1, end: 3 });
  });
  it("single-char word", () => {
    expect(resolveTextObject("a b", 0, "word", "inner", 1)).toEqual({ start: 0, end: 0 });
  });
  it("empty buffer returns null", () => {
    expect(resolveTextObject("", 0, "word", "inner", 1)).toBeNull();
  });
  it("word stops at newline", () => {
    expect(resolveTextObject("ab\ncd", 0, "word", "inner", 1)).toEqual({ start: 0, end: 1 });
  });
});
```

- [ ] **Step 2: Run tests, verify they fail**

Run: `bun test test/vim/text.test.ts`
Expected: FAIL (`resolveTextObject` not exported).

- [ ] **Step 3: Implement inner-word resolution**

Add to `src/vim/text.ts`, reusing `charKind`:

```ts
import type { Range, TextObjectKind, TextObjectVariant } from "./types";

export function resolveTextObject(
  text: string,
  offset: number,
  kind: TextObjectKind,
  variant: TextObjectVariant,
  count = 1,
): Range | null {
  if (text.length === 0) return null;
  const pos = Math.min(Math.max(offset, 0), text.length - 1);
  // kind === "word" only for now
  const kindAt = charKind(text[pos]);
  let start = pos;
  let end = pos;
  while (start > 0 && charKind(text[start - 1]) === kindAt) start--;
  while (end < text.length - 1 && charKind(text[end + 1]) === kindAt) end++;
  if (variant === "inner") return { start, end };
  return { start, end }; // "around" — replaced by aroundWord in Task 2
}
```

(`Range`, `TextObjectVariant`, and `TextObjectKind` all land in `types.ts` in this task — pure, dependency-free aliases. Task 2 swaps the `"around"` placeholder for the real `aroundWord`.)

- [ ] **Step 4: Run tests, verify pass**

Run: `bun test test/vim/text.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/vim/types.ts src/vim/text.ts test/vim/text.test.ts
git commit -m "feat: resolveTextObject for inner word"
```

---

### Task 2: `aw` (around word) with trailing-else-leading whitespace

**Files:**
- Modify: `src/vim/text.ts` (add `aroundWord`)
- Modify: `test/vim/text.test.ts`

- [ ] **Step 1: Write the failing tests**

```ts
describe("resolveTextObject — a word", () => {
  it("word plus trailing whitespace", () => {
    expect(resolveTextObject("hello world", 0, "word", "around", 1)).toEqual({ start: 0, end: 5 });
  });
  it("last word takes leading whitespace when no trailing", () => {
    expect(resolveTextObject("hello world", 6, "word", "around", 1)).toEqual({ start: 5, end: 10 });
  });
  it("lone word with neither side falls back to the word", () => {
    expect(resolveTextObject("hello", 0, "word", "around", 1)).toEqual({ start: 0, end: 4 });
  });
  it("multiple trailing spaces are all included", () => {
    expect(resolveTextObject("a   b", 0, "word", "around", 1)).toEqual({ start: 0, end: 3 });
  });
});
```

- [ ] **Step 2: Run tests, verify they fail**

Run: `bun test test/vim/text.test.ts`
Expected: FAIL.

- [ ] **Step 3: Implement `aroundWord`**

```ts
function aroundWord(text: string, start: number, end: number): Range {
  // trailing whitespace first
  let e = end;
  while (e < text.length - 1 && isWhitespace(text[e + 1]) && text[e + 1] !== "\n") e++;
  if (e > end) return { start, end: e };
  // no trailing → take leading whitespace
  let s = start;
  while (s > 0 && isWhitespace(text[s - 1]) && text[s - 1] !== "\n") s--;
  return { start: s, end };
}
```

Then wire it into `resolveTextObject`, replacing the Task 1 `"around"` placeholder (`return { start, end };`) with the explicit branch:

```ts
if (variant === "inner") return { start, end };
return aroundWord(text, start, end);
```

(Do not leave this implicit. A subagent executor that reads "swaps the placeholder" without the concrete line may leave the placeholder in place; the `daw` test in Task 6 would then silently collapse to `diw`.)

- [ ] **Step 4: Run tests, verify pass** — `bun test test/vim/text.test.ts` → PASS.

- [ ] **Step 5: Commit**

```bash
git add src/vim/text.ts test/vim/text.test.ts
git commit -m "feat: resolveTextObject for a-word (trailing/leading whitespace)"
```

---

### Task 3: `count` support

**Files:**
- Modify: `src/vim/text.ts`
- Modify: `test/vim/text.test.ts`

`2iw` extends across alternating word/whitespace runs (vim semantics: each run — word, punct, or whitespace — is one object).

- [ ] **Step 1: Write the failing tests**

```ts
describe("resolveTextObject — count", () => {
  it("2iw spans word + following whitespace", () => {
    expect(resolveTextObject("one two", 0, "word", "inner", 2)).toEqual({ start: 0, end: 3 });
  });
  it("3iw spans word + whitespace + word", () => {
    expect(resolveTextObject("one two", 0, "word", "inner", 3)).toEqual({ start: 0, end: 6 });
  });
  it("2iw spans a word then a punctuation run (kinds are re-read, not toggled)", () => {
    expect(resolveTextObject("foo.bar", 0, "word", "inner", 2)).toEqual({ start: 0, end: 3 });
  });
});
```

- [ ] **Step 2: Run, verify fail.** `bun test test/vim/text.test.ts` → FAIL.

- [ ] **Step 3: Implement count** — after finding the first run's `end`, extend `end` forward `count - 1` more runs. At each new boundary **re-read `charKind(text[end + 1])` and extend while the kind stays equal** — do NOT flip a two-state word/space toggle. There are three kinds (`word`/`punct`/`space`), so runs do not simply alternate: `2iw` on `"foo.bar"` is `foo` then the `.` punct run → `{0,3}`, which a boolean flip gets wrong. `count === 1` keeps Task 1/2 behavior.

  **count + `around` ordering:** compute the counted *inner* range first (extend `end` across `count - 1` runs), THEN apply `aroundWord` to the final `[start, end]`. State this explicitly so `d2aw` is deterministic. Note: `count === 1` already satisfies issue #57; `count > 1` for `around` is polish and is left untested, but the ordering must still be pinned in code so the behavior is defined rather than accidental.

- [ ] **Step 4: Run, verify pass.** `bun test test/vim/text.test.ts` → PASS.

- [ ] **Step 5: Commit**

```bash
git add src/vim/text.ts test/vim/text.test.ts
git commit -m "feat: count support for word text objects"
```

---

### Task 4: Text-object types + the `textObject` pending node

**Files:**
- Modify: `src/vim/types.ts`
- Modify: `test/vim/state.test.ts` (createVimState still `{ kind: "none" }`)

**Interfaces:**
- Produces: the new `Pending` member `{ kind: "textObject"; op: Operator | null; variant: TextObjectVariant }`. (`TextObjectVariant`/`TextObjectKind` were added in Task 1.)

- [ ] **Step 1: Extend the types**

```ts
// TextObjectVariant / TextObjectKind already exist from Task 1.
export type Pending =
  | { kind: "none" }
  | { kind: "operator"; op: Operator }
  | { kind: "textObject"; op: Operator | null; variant: TextObjectVariant } // op:null = visual
  | { kind: "goto" }
  | { kind: "replace" };
```

- [ ] **Step 2: Verify + commit**

```bash
bun test        # PASS (no behavior yet; type only)
git add src/vim/types.ts
git commit -m "feat: add textObject node to the Pending union"
```

---

### Task 5: Extract `applyOperatorToRange` (adopt in `e`/`G` first)

**Files:**
- Modify: `src/vim/normal.ts`
- Modify: `test/vim/normal.test.ts`

Behavior-preserving refactor: fold the duplicated operator-on-range logic from the `e` and `G` branches into one helper. Existing tests must stay green with no output change.

**Interfaces:**
- Produces: `applyOperatorToRange(state, op, range, text, actions): HandlerResult` (file-local to `normal.ts`).

- [ ] **Step 1: Write the helper**

```ts
function applyOperatorToRange(
  state: VimState, op: Operator, range: Range, text: string, actions: Action[],
): HandlerResult {
  if (op === "y") {
    const slice = text.slice(range.start, range.end + 1);
    state.yankRegister = slice;
    actions.push({ type: "yank", text: slice });
    resetPending(state);
    return { consume: true, actions };
  }
  actions.push({ type: "deleteRange", start: range.start, end: range.end });
  if (op === "c") enterInsert(state, actions);
  else resetPending(state);
  return finishUndoableChange(actions);
}
```

- [ ] **Step 2: Rewrite the `e` and `G` operator branches to call it**

Capture the operator locally (`const op = state.pending.op`, after the `kind === "operator"` narrowing) and add `Range` to `normal.ts`'s `import type … from "./types"`. Replace the **entire** inline body of each branch — including its `y` special-case, which the helper now owns — with:
```ts
const target = endOfWord(prompt.getPlainText(), offset, n); // (e)  — G uses Math.max(0, text.length - 1)
return applyOperatorToRange(state, op, { start: offset, end: target }, prompt.getPlainText(), actions);
```
`range.start === offset === cursor` here, so no `cursorTo` and the emitted actions are byte-identical to today.

**`yG` caveat.** `yG` never reaches the `G` sub-branch — it is caught earlier by the generic `pendingOp === "y" && key in MOTIONS` select path (`SELECT_MOTIONS[G]` + `yankSelection`, no snapshot). So the `G` branch you are rewriting only ever runs for `d`/`c`, and `applyOperatorToRange`'s `y`-branch is dead for `G`. Keep that earlier `y`-select branch intact and above the `G` rewrite; do NOT route `yG` through `applyOperatorToRange` (that would swap a selection-yank for a slice-yank and drop the toast). For `e`, by contrast, the helper's `y`-branch legitimately replaces the current `ye` slice-yank (byte-identical).

- [ ] **Step 3: Run tests, verify no change**

Run: `bun test test/vim/normal.test.ts`
Expected: PASS, identical assertions (the `de`, `dG`, `ye`, `cG` tests).

- [ ] **Step 4: Commit**

```bash
git add src/vim/normal.ts
git commit -m "refactor: extract applyOperatorToRange, adopt in e/G branches"
```

---

### Task 6: Normal-mode text objects

**Files:**
- Modify: `src/vim/normal.ts`
- Modify: `test/vim/normal.test.ts`

**Interfaces:**
- Consumes: `resolveTextObject`, `Range` from `./text`/`./types`; `applyOperatorToRange` (Task 5); `Pending` (Task 4).

- [ ] **Step 1: Write the failing tests**

```ts
describe("handleNormalKey — text objects", () => {
  const on = (text: string, cur: number) => ({ ...mockPrompt, getPlainText: () => text, getCursorOffset: () => cur });

  it("diw deletes the inner word as one range", () => {
    const p = on("hello world", 2);
    handleNormalKey(state, "d", ev("d"), p);
    handleNormalKey(state, "i", ev("i"), p);
    const r = handleNormalKey(state, "w", ev("w"), p);
    expect(deleteRanges(r.actions)).toEqual([{ start: 0, end: 4 }]);
    expect(state.pending).toEqual({ kind: "none" });
  });

  it("ciw deletes the inner word, enters insert, cursor at word start", () => {
    const p = on("hello world", 2);
    handleNormalKey(state, "c", ev("c"), p);
    handleNormalKey(state, "i", ev("i"), p);
    const r = handleNormalKey(state, "w", ev("w"), p);
    expect(deleteRanges(r.actions)).toEqual([{ start: 0, end: 4 }]);
    expect(cursorTos(r.actions)).toEqual([0]);
    expect(r.actions.some((a) => a.type === "mode" && a.mode === "insert")).toBe(true);
  });

  it("yiw yanks the inner word and moves the cursor to word start", () => {
    const p = on("hello world", 2);
    handleNormalKey(state, "y", ev("y"), p);
    handleNormalKey(state, "i", ev("i"), p);
    const r = handleNormalKey(state, "w", ev("w"), p);
    expect(state.yankRegister).toBe("hello");
    expect(cursorTos(r.actions)).toEqual([0]);
  });

  it("daw deletes word plus trailing whitespace", () => {
    const p = on("hello world", 0);
    handleNormalKey(state, "d", ev("d"), p);
    handleNormalKey(state, "a", ev("a"), p);
    const r = handleNormalKey(state, "w", ev("w"), p);
    expect(deleteRanges(r.actions)).toEqual([{ start: 0, end: 5 }]);
  });

  it("d2iw deletes across two objects (word + whitespace)", () => {
    const p = on("one two", 0);
    handleNormalKey(state, "d", ev("d"), p);
    handleNormalKey(state, "2", ev("2"), p);
    handleNormalKey(state, "i", ev("i"), p);
    const r = handleNormalKey(state, "w", ev("w"), p);
    expect(deleteRanges(r.actions)).toEqual([{ start: 0, end: 3 }]);
    expect(state.pending).toEqual({ kind: "none" });
  });

  it("di on empty buffer no-ops and clears pending", () => {
    const p = on("", 0);
    handleNormalKey(state, "d", ev("d"), p);
    handleNormalKey(state, "i", ev("i"), p);
    const r = handleNormalKey(state, "w", ev("w"), p);
    expect(deleteRanges(r.actions)).toEqual([]);
    expect(state.pending).toEqual({ kind: "none" });
  });

  it("i with no operator still enters insert", () => {
    const r = handleNormalKey(state, "i", ev("i"), mockPrompt);
    expect(r.actions.some((a) => a.type === "mode" && a.mode === "insert")).toBe(true);
  });
});
```

- [ ] **Step 2: Run tests, verify they fail** — `bun test test/vim/normal.test.ts` → FAIL.

- [ ] **Step 3: Implement the branches**

**Placement (critical).** The resolve branch must run BEFORE the standalone `key in MOTIONS` branch and (after Phase 4) the `pending.kind === "operator" && key in MOTIONS` branch — otherwise `w` is consumed as a motion before it can resolve as a text object. Put it immediately AFTER the `const actions: Action[] = []` declaration (so `actions` is in scope) and before the count-accumulation / motion branches. It reuses that `actions`; it does not declare a new one.

Resolve a pending text object:
```ts
if (state.pending.kind === "textObject") {
  const { op, variant } = state.pending;
  const text = prompt.getPlainText();
  const n = consumeCount(state);
  const range = key === "w" ? resolveTextObject(text, prompt.getCursorOffset(), "word", variant, n) : null;
  if (!range) { resetPending(state); return { consume: true, actions }; }
  if (op === null) { resetPending(state); return { consume: true, actions }; } // load-bearing narrow (see note); visual op:null never reaches here
  const res = applyOperatorToRange(state, op, range, text, actions);
  res.actions.push({ type: "cursorTo", offset: range.start });
  return res;
}
```

Notes:
- **`actions` scope.** `const actions: Action[] = []` is declared partway down `handleNormalKey`, after the tab / `replace` / `goto` pending checks (which each use their own local `actions`). This branch references `actions`, so it MUST sit after that declaration. Do not place it "beside goto/replace" — those run above the declaration, so referencing `actions` there is a temporal-dead-zone error and will not compile.
- **`op === null` is not dead code.** After `const { op } = state.pending`, `op` is `Operator | null` (the `textObject` node carries `op: Operator | null` so one node serves both normal and visual). The early return narrows `op` to non-null `Operator` for the `applyOperatorToRange` call; removing it is a type error. (Alternative if you dislike the runtime-dead guard: split the union into `{kind:"operatorTextObject"; op: Operator}` + `{kind:"visualTextObject"}` and drop the null case — more honest typing at the cost of one extra member and a second dispatch branch.)
- **`cursorTo(range.start)` is intentional for all three operators, including `y`.** Vim leaves the cursor at the start of the yanked/changed region, so `yiw` with a mid-word cursor moves to the word start; for `ye`/`yG` it is a no-op (`range.start === cursor`). Keep it unconditional.

Then, inside the operator-pending section (before the standalone `i`/`a` insert entries), intercept the variant prefix:
```ts
if (state.pending.kind === "operator" && (key === "i" || key === "a")) {
  state.pending = { kind: "textObject", op: state.pending.op, variant: key === "i" ? "inner" : "around" };
  return { consume: true, actions };
}
```
Leave the standalone `i`/`a` insert-entry branches unchanged — they now only run when `pending.kind !== "operator"`.

- [ ] **Step 4: Run tests, verify pass** — `bun test test/vim/normal.test.ts` → PASS.

- [ ] **Step 5: Commit**

```bash
git add src/vim/normal.ts test/vim/normal.test.ts
git commit -m "feat: normal-mode word text objects (diw/ciw/yiw/daw...)"
```

---

### Task 7: Visual-mode text objects

**Files:**
- Modify: `src/vim/visual.ts`
- Modify: `test/vim/visual.test.ts`

- [ ] **Step 1: Write the failing tests**

```ts
describe("handleVisualKey — text objects", () => {
  const on = (text: string, cur: number) => ({ ...mockPrompt, getPlainText: () => text, getCursorOffset: () => cur });
  beforeEach(() => { state.mode = "visual"; state.visualAnchor = 2; });

  it("viw selects the inner word range (replaces selection)", () => {
    const p = on("hello world", 2);
    handleVisualKey(state, "i", ev("i"), p);
    const r = handleVisualKey(state, "w", ev("w"), p);
    expect(selectRanges(r.actions)).toEqual([{ start: 0, end: 4 }]);
    expect(state.visualAnchor).toBe(0);
    expect(cursorTos(r.actions)).toEqual([4]);
    expect(state.mode).toBe("visual");
  });

  it("vaw selects word plus trailing whitespace", () => {
    const p = on("hello world", 0);
    state.visualAnchor = 0;
    handleVisualKey(state, "a", ev("a"), p);
    const r = handleVisualKey(state, "w", ev("w"), p);
    expect(selectRanges(r.actions)).toEqual([{ start: 0, end: 5 }]);
  });
});
```

- [ ] **Step 2: Run, verify fail** — `bun test test/vim/visual.test.ts` → FAIL.

- [ ] **Step 3: Implement the visual branches**

```ts
if (state.pending.kind === "textObject") {
  const { variant } = state.pending;
  const range = key === "w"
    ? resolveTextObject(prompt.getPlainText(), prompt.getCursorOffset(), "word", variant, consumeCount(state))
    : null;
  resetPending(state);
  if (!range) return { consume: true, actions };
  state.visualAnchor = range.start;
  actions.push({ type: "selectRange", start: range.start, end: range.end });
  actions.push({ type: "cursorTo", offset: range.end });
  return { consume: true, actions };
}
if (key === "i" || key === "a") {
  state.pending = { kind: "textObject", op: null, variant: key === "i" ? "inner" : "around" };
  return { consume: true, actions };
}
```
**Placement (critical).** `w` is a key in `SELECT_MOTIONS` (`input.select.word.forward`), so both branches must go BEFORE the `if (key in SELECT_MOTIONS)` check — otherwise `viw`'s `w` is swallowed by the select-motion dispatch and never resolves. Put them AFTER the `escape` / `v` exit check (so `vi` then `<Esc>` still exits visual) but BEFORE the `key in SELECT_MOTIONS` branch. "Before the catch-all consume" is too loose — do not rely on it. (`i`/`a` were previously swallowed by the catch-all in visual, so nothing regresses.) Add a `viw` test asserting `selectRange` (not `input.select.word.forward`) to pin the ordering in the suite.

- [ ] **Step 4: Run, verify pass** — `bun test test/vim/visual.test.ts` → PASS.

- [ ] **Step 5: Commit**

```bash
git add src/vim/visual.ts test/vim/visual.test.ts
git commit -m "feat: visual-mode word text objects (viw/vaw)"
```

---

### Task 8: Interaction hardening

**Files:**
- Modify: `test/vim/normal.test.ts`, `test/integration.test.ts`
- Modify: `src/vim/*` only if a test surfaces a gap

- [ ] **Step 1: Write interaction tests**

```ts
it("escape after 'di' cancels the pending text object", () => {
  const p = { ...mockPrompt, getPlainText: () => "hello", getCursorOffset: () => 0 };
  handleNormalKey(state, "d", ev("d"), p);
  handleNormalKey(state, "i", ev("i"), p);
  handleNormalKey(state, "escape", ev("escape"), p);
  expect(state.pending).toEqual({ kind: "none" });
});

it("Ctrl+O one-shot does not auto-return to insert mid text-object (d then i)", () => {
  // pending.kind === "textObject" must count as 'still pending' in finishOneShotIfComplete
  state.oneShotNormal = true;
  const p = { ...mockPrompt, getPlainText: () => "hello world", getCursorOffset: () => 0 };
  let r = handleNormalKey(state, "d", ev("d"), p); finishOneShotIfComplete(state, r);
  r = handleNormalKey(state, "i", ev("i"), p); finishOneShotIfComplete(state, r);
  expect(state.mode).toBe("normal"); // not yet returned to insert
});
```

- [ ] **Step 2: Run** — `bun test` → confirm behavior. If the one-shot test fails, verify `finishOneShotIfComplete`'s guard reads `state.pending.kind !== "none"` (it should, after Phase 4). Escape handling: the normal-mode `escape` branch already calls `resetPending`, which clears the `textObject` node.

- [ ] **Step 3: Full suite** — `bun test` → PASS.

- [ ] **Step 4: Commit**

```bash
git add test/
git commit -m "test: text-object interactions with escape and one-shot mode"
```

---

### Task 9: Docs + issue

**Files:**
- Modify: `README.md` (keybinding tables; remove any text-object entry from "Known gaps")
- Modify: `CHANGELOG.md` (`[Unreleased]`)
- Modify: `AGENTS.md` if the resolver/helper is worth a note

- [ ] **Step 1: README** — add `iw`/`aw` with `d`/`c`/`y`/`v` to the tables.
- [ ] **Step 2: CHANGELOG** — `### Added — Word text objects: diw, ciw, yiw, daw, viw, vaw (#57).`
- [ ] **Step 3: Gate + commit**

```bash
just check
git add README.md CHANGELOG.md AGENTS.md
git commit -m "docs: document word text objects (#57)"
```

---

## Self-Review

- **Spec coverage.** `iw`/`aw` resolution (Tasks 1-3), types + pending node (Task 4), operator helper (Task 5), normal `d/c/y` (Task 6), visual `v` (Task 7), interactions (Task 8), docs (Task 9). The issue's `diw ciw viw daw` are covered by Tasks 6-7.
- **Type/name consistency.** `resolveTextObject(text, offset, kind, variant, count)` is defined once (Task 1) and every call site passes `count` (Tasks 6-7). `Range` is defined in Task 1 and reused by the helper and both handlers. The `textObject` pending node's `op: Operator | null` is set with the operator in normal (Task 6) and `null` in visual (Task 7), and read in exactly those two resolve branches.
- **Reused word definition.** The resolver calls the same `charKind`/`isWhitespace` as `w`/`e`; no divergent classifier.
- **`applyOperatorToRange` scope.** Charwise only; adopted by `e`/`G` behavior-preservingly (Task 5) before text objects use it (Task 6). Visual selection is a separate branch (Task 7), not routed through the helper.
- **`i`/`a` safety.** Intercepted only when `pending.kind === "operator"` (normal) or in visual mode; the standalone insert/append entries are otherwise untouched (Task 6 Step 3, verified by the "i with no operator still enters insert" test).
- **Cursor + undo.** `c`/text-object callers append `cursorTo(range.start)`; `d`/`c` flow through `finishUndoableChange` (via the helper); `y` skips the snapshot. Empty-buffer and escape paths clear pending and emit no destructive actions.

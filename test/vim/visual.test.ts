import { beforeEach, describe, expect, it } from "bun:test";
import { createVimState, handleVisualKey, type PromptAccess, type VimState } from "../../src/vim";
import { mockPrompt } from "../fixtures";
import { cmds, cursorTos, ev, selectRanges } from "../support";

let state: VimState;

beforeEach(() => {
  state = createVimState();
  state.mode = "normal";
});

// ── handleVisualKey — motions ──────────────────────────────

describe("handleVisualKey — motions", () => {
  beforeEach(() => {
    state.mode = "visual";
  });

  it("h dispatches input.select.left", () => {
    const r = handleVisualKey(state, "h", ev("h"));
    expect(cmds(r.actions)).toEqual(["input.select.left"]);
  });

  it("l dispatches input.select.right", () => {
    const r = handleVisualKey(state, "l", ev("l"));
    expect(cmds(r.actions)).toEqual(["input.select.right"]);
  });

  it("j dispatches input.select.down", () => {
    const r = handleVisualKey(state, "j", ev("j"));
    expect(cmds(r.actions)).toEqual(["input.select.down"]);
  });

  it("k dispatches input.select.up", () => {
    const r = handleVisualKey(state, "k", ev("k"));
    expect(cmds(r.actions)).toEqual(["input.select.up"]);
  });

  it("w dispatches input.select.word.forward", () => {
    const r = handleVisualKey(state, "w", ev("w"));
    expect(cmds(r.actions)).toEqual(["input.select.word.forward"]);
  });

  it("$ dispatches input.select.line.end", () => {
    const r = handleVisualKey(state, "$", ev("4", { shift: true }));
    expect(cmds(r.actions)).toEqual(["input.select.line.end"]);
  });

  it("3l dispatches input.select.right 3 times", () => {
    handleVisualKey(state, "3", ev("3"));
    const r = handleVisualKey(state, "l", ev("l"));
    expect(cmds(r.actions)).toEqual(["input.select.right", "input.select.right", "input.select.right"]);
  });

  it("G dispatches input.select.buffer.end", () => {
    const r = handleVisualKey(state, "G", ev("g", { shift: true }), mockPrompt);
    expect(cmds(r.actions)).toEqual(["input.select.buffer.end"]);
  });

  it("e selects from visual anchor to end of word", () => {
    // "hello world" with cursor at 0, anchor at 0 → end of "hello" is offset 4
    state.visualAnchor = 0;
    const r = handleVisualKey(state, "e", ev("e"), mockPrompt);
    expect(selectRanges(r.actions)).toEqual([{ start: 0, end: 4 }]);
  });

  it("2e selects from visual anchor to end of 2nd word", () => {
    // "hello world" with cursor at 0, anchor at 0 → end of "world" is offset 10
    state.visualAnchor = 0;
    handleVisualKey(state, "2", ev("2"), mockPrompt);
    const r = handleVisualKey(state, "e", ev("e"), mockPrompt);
    expect(selectRanges(r.actions)).toEqual([{ start: 0, end: 10 }]);
  });

  it("e pressed twice extends selection to successive word ends", () => {
    // "hello world" cursor at 0, anchor at 0
    // First e → end of "hello" (offset 4), must also emit cursorTo
    // Second e (cursor now at 4) → end of "world" (offset 10)
    state.visualAnchor = 0;
    let cursorPos = 0;
    const prompt: PromptAccess = { ...mockPrompt, getCursorOffset: () => cursorPos };

    const r1 = handleVisualKey(state, "e", ev("e"), prompt);
    expect(selectRanges(r1.actions)).toEqual([{ start: 0, end: 4 }]);
    expect(cursorTos(r1.actions)).toEqual([4]);

    // Simulate effect layer applying the cursorTo action
    cursorPos = cursorTos(r1.actions)[0];

    const r2 = handleVisualKey(state, "e", ev("e"), prompt);
    expect(selectRanges(r2.actions)).toEqual([{ start: 0, end: 10 }]);
    expect(cursorTos(r2.actions)).toEqual([10]);
  });

  it("g sets pending goto, no actions", () => {
    const r = handleVisualKey(state, "g", ev("g"));
    expect(r.consume).toBe(true);
    expect(r.actions).toEqual([]);
    expect(state.pending).toEqual({ kind: "goto" });
  });

  it("gg selects to buffer home", () => {
    handleVisualKey(state, "g", ev("g"));
    const r = handleVisualKey(state, "g", ev("g"));
    expect(r.consume).toBe(true);
    expect(cmds(r.actions)).toEqual(["input.select.buffer.home"]);
    expect(state.pending).toEqual({ kind: "none" });
  });

  it("g then Escape in visual cancels pending, stays visual", () => {
    handleVisualKey(state, "g", ev("g"));
    handleVisualKey(state, "escape", ev("escape"));
    expect(state.pending).toEqual({ kind: "none" });
    // escape also exits visual mode
    expect(state.mode).toBe("normal");
  });
});

// ── handleVisualKey — operators ────────────────────────────

describe("handleVisualKey — operators", () => {
  beforeEach(() => {
    state.mode = "visual";
  });

  it("d deletes selection and enters normal mode", () => {
    const r = handleVisualKey(state, "d", ev("d"));
    expect(r.consume).toBe(true);
    expect(cmds(r.actions)).toContain("input.backspace");
    expect(state.mode).toBe("normal");
    expect(r.actions).toContainEqual({ type: "mode", mode: "normal" });
  });

  it("c deletes selection and enters insert mode", () => {
    const r = handleVisualKey(state, "c", ev("c"));
    expect(r.consume).toBe(true);
    expect(cmds(r.actions)).toContain("input.backspace");
    expect(state.mode).toBe("insert");
    expect(r.actions).toContainEqual({ type: "mode", mode: "insert" });
  });

  it("y yanks selection and enters normal mode", () => {
    const r = handleVisualKey(state, "y", ev("y"));
    expect(r.consume).toBe(true);
    expect(r.actions).toContainEqual({ type: "yankSelection" });
    expect(state.mode).toBe("normal");
    expect(r.actions).toContainEqual({ type: "mode", mode: "normal" });
  });

  it("x deletes selection (alias for d)", () => {
    const r = handleVisualKey(state, "x", ev("x"));
    expect(cmds(r.actions)).toContain("input.backspace");
    expect(state.mode).toBe("normal");
  });
});

// ── handleVisualKey — exit and passthrough ─────────────────

describe("handleVisualKey — exit and passthrough", () => {
  beforeEach(() => {
    state.mode = "visual";
  });

  it("Escape exits visual mode and clears selection", () => {
    const r = handleVisualKey(state, "escape", ev("escape"));
    expect(r.consume).toBe(true);
    expect(state.mode).toBe("normal");
    expect(r.actions).toContainEqual({ type: "clearSelection" });
    expect(r.actions).toContainEqual({ type: "mode", mode: "normal" });
  });

  it("v exits visual mode and clears selection", () => {
    const r = handleVisualKey(state, "v", ev("v"));
    expect(r.consume).toBe(true);
    expect(state.mode).toBe("normal");
    expect(r.actions).toContainEqual({ type: "clearSelection" });
  });

  it("meta combo passes through", () => {
    const r = handleVisualKey(state, "c", ev("c", { meta: true }));
    expect(r.consume).toBe(false);
  });

  it("ctrl combo passes through", () => {
    const r = handleVisualKey(state, "x", ev("x", { ctrl: true }));
    expect(r.consume).toBe(false);
  });

  it("unrecognized key is consumed (no typing in visual)", () => {
    const r = handleVisualKey(state, "z", ev("z"));
    expect(r.consume).toBe(true);
    expect(r.actions).toEqual([]);
  });
});

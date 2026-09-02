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

  it("^ extends to the first non-blank character", () => {
    const prompt: PromptAccess = {
      ...mockPrompt,
      getLine: () => "\t  hello",
      getPlainText: () => "\t  hello",
    };
    const r = handleVisualKey(state, "^", ev("6", { shift: true }), prompt);
    expect(selectRanges(r.actions)).toEqual([{ start: 0, end: 3 }]);
    expect(cursorTos(r.actions)).toEqual([3]);
  });

  it("_ extends to the first non-blank character", () => {
    const prompt: PromptAccess = {
      ...mockPrompt,
      getLine: () => "\t  hello",
      getPlainText: () => "\t  hello",
    };
    const r = handleVisualKey(state, "_", ev("_"), prompt);
    expect(selectRanges(r.actions)).toEqual([{ start: 0, end: 3 }]);
    expect(cursorTos(r.actions)).toEqual([3]);
  });

  it("4_ extends to the first non-blank character three lines down", () => {
    const text = "first\n  second\n\t third\n    fourth";
    const prompt: PromptAccess = {
      ...mockPrompt,
      getCursorOffset: () => 2,
      getPlainText: () => text,
      getLineCount: () => 4,
    };
    state.visualAnchor = 2;
    handleVisualKey(state, "4", ev("4"), prompt);
    const r = handleVisualKey(state, "_", ev("_"), prompt);
    expect(selectRanges(r.actions)).toEqual([{ start: 2, end: text.indexOf("fourth") }]);
    expect(cursorTos(r.actions)).toEqual([text.indexOf("fourth")]);
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

// ── handleVisualKey — arrow keys pass through (issue #63) ──

describe("handleVisualKey — arrow keys pass through", () => {
  beforeEach(() => {
    state.mode = "visual";
  });

  // Arrows are host navigation, not selection motions. Consuming them would
  // trap the user the same way normal mode did before issue #63.
  for (const arrow of ["up", "down", "left", "right"] as const) {
    it(`${arrow} passes through to the host without consuming`, () => {
      const r = handleVisualKey(state, arrow, ev(arrow), mockPrompt);
      expect(r.consume).toBe(false);
      expect(r.actions).toEqual([]);
    });
  }
});

// ── handleVisualKey — text objects ─────────────────────────

describe("handleVisualKey — text objects", () => {
  // cursor sits inside "hello" of "hello world\n..."
  const wordPrompt: PromptAccess = { ...mockPrompt, getCursorOffset: () => 2 };

  beforeEach(() => {
    state.mode = "visual";
    state.visualAnchor = 2;
  });

  it("i sets a pending inner text object, no op", () => {
    const r = handleVisualKey(state, "i", ev("i"), wordPrompt);
    expect(r.consume).toBe(true);
    expect(r.actions).toEqual([]);
    expect(state.pending).toEqual({ kind: "textobject", around: false });
  });

  it("viw selects the inner word and anchors to its start", () => {
    handleVisualKey(state, "i", ev("i"), wordPrompt);
    const r = handleVisualKey(state, "w", ev("w"), wordPrompt);
    expect(selectRanges(r.actions)).toEqual([{ start: 0, end: 4 }]);
    expect(cursorTos(r.actions)).toEqual([4]);
    expect(state.visualAnchor).toBe(0);
  });

  it("vaw selects the word and its trailing whitespace", () => {
    handleVisualKey(state, "a", ev("a"), wordPrompt);
    const r = handleVisualKey(state, "w", ev("w"), wordPrompt);
    expect(selectRanges(r.actions)).toEqual([{ start: 0, end: 5 }]);
    expect(cursorTos(r.actions)).toEqual([5]);
  });

  it("an unresolved object char cancels without selecting", () => {
    handleVisualKey(state, "i", ev("i"), wordPrompt);
    const r = handleVisualKey(state, "z", ev("z"), wordPrompt);
    expect(selectRanges(r.actions)).toEqual([]);
    expect(state.pending).toEqual({ kind: "none" });
  });
});

// ── handleVisualKey — pair text objects ────────────────────

describe("handleVisualKey — pair text objects", () => {
  const prompt = (text: string, offset: number): PromptAccess => ({
    ...mockPrompt,
    getCursorOffset: () => offset,
    getPlainText: () => text,
  });

  beforeEach(() => {
    state.mode = "visual";
  });

  it('vi" selects inside double quotes', () => {
    const p = prompt('say "hi"', 6);
    state.visualAnchor = 6;
    handleVisualKey(state, "i", ev("i"), p);
    const r = handleVisualKey(state, '"', ev('"'), p);
    expect(selectRanges(r.actions)).toEqual([{ start: 5, end: 6 }]);
    expect(cursorTos(r.actions)).toEqual([6]);
    expect(state.visualAnchor).toBe(5);
  });

  it("vib selects inside the nearest bracket", () => {
    const p = prompt("(abc)", 2);
    state.visualAnchor = 2;
    handleVisualKey(state, "i", ev("i"), p);
    const r = handleVisualKey(state, "b", ev("b"), p);
    expect(selectRanges(r.actions)).toEqual([{ start: 1, end: 3 }]);
    expect(cursorTos(r.actions)).toEqual([3]);
  });
});

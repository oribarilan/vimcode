import { beforeEach, describe, expect, it } from "bun:test";
import { createVimState, handleNormalKey, type PromptAccess, type VimState } from "../../src/vim";
import { emptyPrompt, mockPrompt } from "../fixtures";
import { cmds, cursorTos, deleteRanges, ev, saveUndoSnapshots, selectRanges } from "../support";

let state: VimState;

beforeEach(() => {
  state = createVimState();
  state.mode = "normal";
});

// ── handleNormalKey — motions ───────────────────────────────

describe("handleNormalKey — motions", () => {
  it("h dispatches input.move.left", () => {
    const r = handleNormalKey(state, "h", ev("h"), mockPrompt);
    expect(cmds(r.actions)).toEqual(["input.move.left"]);
  });

  it("j dispatches input.move.down", () => {
    const r = handleNormalKey(state, "j", ev("j"), mockPrompt);
    expect(cmds(r.actions)).toEqual(["input.move.down"]);
  });

  it("k dispatches input.move.up", () => {
    const r = handleNormalKey(state, "k", ev("k"), mockPrompt);
    expect(cmds(r.actions)).toEqual(["input.move.up"]);
  });

  it("l dispatches input.move.right", () => {
    const r = handleNormalKey(state, "l", ev("l"), mockPrompt);
    expect(cmds(r.actions)).toEqual(["input.move.right"]);
  });

  it("3j dispatches input.move.down 3 times", () => {
    handleNormalKey(state, "3", ev("3"), mockPrompt);
    const r = handleNormalKey(state, "j", ev("j"), mockPrompt);
    expect(cmds(r.actions)).toEqual(["input.move.down", "input.move.down", "input.move.down"]);
  });

  it("G dispatches input.buffer.end", () => {
    const r = handleNormalKey(state, "G", ev("g", { shift: true }), mockPrompt);
    expect(cmds(r.actions)).toEqual(["input.buffer.end"]);
  });

  it("0 dispatches input.line.home", () => {
    const r = handleNormalKey(state, "0", ev("0"), mockPrompt);
    expect(cmds(r.actions)).toEqual(["input.line.home"]);
  });

  it("0 after count > 0 accumulates as digit", () => {
    handleNormalKey(state, "1", ev("1"), mockPrompt);
    handleNormalKey(state, "0", ev("0"), mockPrompt);
    expect(state.count).toBe(10);
  });

  it("g sets pending goto, no actions", () => {
    const r = handleNormalKey(state, "g", ev("g"), mockPrompt);
    expect(r.consume).toBe(true);
    expect(r.actions).toEqual([]);
    expect(state.pending).toEqual({ kind: "goto" });
  });
});

// ── handleNormalKey — g prefix ─────────────────────────────

describe("handleNormalKey — g prefix", () => {
  it("gg moves cursor to buffer start", () => {
    handleNormalKey(state, "g", ev("g"), mockPrompt);
    const r = handleNormalKey(state, "g", ev("g"), mockPrompt);
    expect(r.consume).toBe(true);
    expect(cursorTos(r.actions)).toEqual([0]);
    expect(state.pending).toEqual({ kind: "none" });
  });

  it("g then Escape cancels pending, no movement", () => {
    handleNormalKey(state, "g", ev("g"), mockPrompt);
    const r = handleNormalKey(state, "escape", ev("escape"), mockPrompt);
    expect(state.pending).toEqual({ kind: "none" });
    expect(r.actions).toEqual([]);
  });

  it("g then unknown key cancels pending, no movement", () => {
    handleNormalKey(state, "g", ev("g"), mockPrompt);
    const r = handleNormalKey(state, "z", ev("z"), mockPrompt);
    expect(r.consume).toBe(true);
    expect(state.pending).toEqual({ kind: "none" });
    expect(cursorTos(r.actions)).toEqual([]);
    expect(cmds(r.actions)).toEqual([]);
  });

  it("5gg consumes count without crash", () => {
    handleNormalKey(state, "5", ev("5"), mockPrompt);
    handleNormalKey(state, "g", ev("g"), mockPrompt);
    const r = handleNormalKey(state, "g", ev("g"), mockPrompt);
    expect(r.consume).toBe(true);
    expect(state.count).toBe(0);
  });
});

// ── handleNormalKey — e motion ─────────────────────────────

describe("handleNormalKey — e motion", () => {
  const ePrompt: PromptAccess = {
    getLine: (n) => ["hello world", "second line"][n] ?? "",
    getLineCount: () => 2,
    getCursorLine: () => 0,
    getCursorOffset: () => 0,
    getPlainText: () => "hello world\nsecond line",
  };

  it("e returns cursorTo at end of current word", () => {
    const r = handleNormalKey(state, "e", ev("e"), ePrompt);
    expect(r.consume).toBe(true);
    expect(cursorTos(r.actions)).toEqual([4]);
  });

  it("2e returns cursorTo at end of second word", () => {
    handleNormalKey(state, "2", ev("2"), ePrompt);
    const r = handleNormalKey(state, "e", ev("e"), ePrompt);
    expect(cursorTos(r.actions)).toEqual([10]);
  });

  it("de deletes from cursor to end of word", () => {
    handleNormalKey(state, "d", ev("d"), ePrompt);
    const r = handleNormalKey(state, "e", ev("e"), ePrompt);
    expect(deleteRanges(r.actions)).toEqual([{ start: 0, end: 4 }]);
    expect(state.mode).toBe("normal");
    // The deleteRange goes through finishUndoableChange, so the snapshot
    // comes from a single source (the saveUndoSnapshot action), not index.ts.
    expect(saveUndoSnapshots(r.actions)).toHaveLength(1);
  });

  it("ce deletes from cursor to end of word and enters insert", () => {
    handleNormalKey(state, "c", ev("c"), ePrompt);
    const r = handleNormalKey(state, "e", ev("e"), ePrompt);
    expect(deleteRanges(r.actions)).toEqual([{ start: 0, end: 4 }]);
    expect(state.mode).toBe("insert");
  });

  it("ye yanks from cursor to end of word", () => {
    handleNormalKey(state, "y", ev("y"), ePrompt);
    const r = handleNormalKey(state, "e", ev("e"), ePrompt);
    expect(state.yankRegister).toBe("hello");
    expect(r.actions.some((a) => a.type === "yank" && a.text === "hello")).toBe(true);
  });
});

// ── handleNormalKey — text objects ─────────────────────────

describe("handleNormalKey — text objects", () => {
  // cursor sits inside "hello"
  const wordPrompt: PromptAccess = {
    getLine: (n) => ["hello world"][n] ?? "",
    getLineCount: () => 1,
    getCursorLine: () => 0,
    getCursorOffset: () => 2,
    getPlainText: () => "hello world",
  };

  it("d then i sets a pending inner text object, does not enter insert (#57)", () => {
    handleNormalKey(state, "d", ev("d"), wordPrompt);
    const r = handleNormalKey(state, "i", ev("i"), wordPrompt);
    expect(r.consume).toBe(true);
    expect(r.actions).toEqual([]);
    expect(state.pending).toEqual({ kind: "textobject", op: "d", around: false });
    expect(state.mode).toBe("normal");
  });

  it("d then a sets a pending around text object", () => {
    handleNormalKey(state, "d", ev("d"), wordPrompt);
    handleNormalKey(state, "a", ev("a"), wordPrompt);
    expect(state.pending).toEqual({ kind: "textobject", op: "d", around: true });
  });

  it("diw deletes the inner word", () => {
    handleNormalKey(state, "d", ev("d"), wordPrompt);
    handleNormalKey(state, "i", ev("i"), wordPrompt);
    const r = handleNormalKey(state, "w", ev("w"), wordPrompt);
    expect(deleteRanges(r.actions)).toEqual([{ start: 0, end: 4 }]);
    expect(state.mode).toBe("normal");
    expect(saveUndoSnapshots(r.actions)).toHaveLength(1);
  });

  it("ciw deletes the inner word and enters insert", () => {
    handleNormalKey(state, "c", ev("c"), wordPrompt);
    handleNormalKey(state, "i", ev("i"), wordPrompt);
    const r = handleNormalKey(state, "w", ev("w"), wordPrompt);
    expect(deleteRanges(r.actions)).toEqual([{ start: 0, end: 4 }]);
    expect(state.mode).toBe("insert");
  });

  it("yiw yanks the inner word", () => {
    handleNormalKey(state, "y", ev("y"), wordPrompt);
    handleNormalKey(state, "i", ev("i"), wordPrompt);
    const r = handleNormalKey(state, "w", ev("w"), wordPrompt);
    expect(state.yankRegister).toBe("hello");
    expect(r.actions.some((a) => a.type === "yank" && a.text === "hello")).toBe(true);
    expect(state.mode).toBe("normal");
  });

  it("daw deletes the word and its trailing whitespace", () => {
    handleNormalKey(state, "d", ev("d"), wordPrompt);
    handleNormalKey(state, "a", ev("a"), wordPrompt);
    const r = handleNormalKey(state, "w", ev("w"), wordPrompt);
    expect(deleteRanges(r.actions)).toEqual([{ start: 0, end: 5 }]);
    expect(state.mode).toBe("normal");
  });

  it("caw deletes a word and enters insert", () => {
    handleNormalKey(state, "c", ev("c"), wordPrompt);
    handleNormalKey(state, "a", ev("a"), wordPrompt);
    const r = handleNormalKey(state, "w", ev("w"), wordPrompt);
    expect(deleteRanges(r.actions)).toEqual([{ start: 0, end: 5 }]);
    expect(state.mode).toBe("insert");
  });

  it("yaw yanks a word with trailing whitespace", () => {
    handleNormalKey(state, "y", ev("y"), wordPrompt);
    handleNormalKey(state, "a", ev("a"), wordPrompt);
    handleNormalKey(state, "w", ev("w"), wordPrompt);
    expect(state.yankRegister).toBe("hello ");
    expect(state.mode).toBe("normal");
  });

  it("an unresolved object char cancels the operator without editing", () => {
    handleNormalKey(state, "d", ev("d"), wordPrompt);
    handleNormalKey(state, "i", ev("i"), wordPrompt);
    const r = handleNormalKey(state, "z", ev("z"), wordPrompt);
    expect(deleteRanges(r.actions)).toEqual([]);
    expect(state.pending).toEqual({ kind: "none" });
    expect(state.mode).toBe("normal");
  });

  it("standalone i still enters insert when no operator is pending", () => {
    const r = handleNormalKey(state, "i", ev("i"), wordPrompt);
    expect(state.mode).toBe("insert");
    expect(r.actions.some((a) => a.type === "mode" && a.mode === "insert")).toBe(true);
  });
});

// ── handleNormalKey — operators ─────────────────────────────

describe("handleNormalKey — operators", () => {
  it("dd dispatches input.delete.line", () => {
    handleNormalKey(state, "d", ev("d"), mockPrompt);
    expect(state.pending).toEqual({ kind: "operator", op: "d" });
    const r = handleNormalKey(state, "d", ev("d"), mockPrompt);
    expect(cmds(r.actions)).toEqual(["input.delete.line"]);
  });

  it("2dd dispatches input.delete.line twice", () => {
    handleNormalKey(state, "2", ev("2"), mockPrompt);
    handleNormalKey(state, "d", ev("d"), mockPrompt);
    const r = handleNormalKey(state, "d", ev("d"), mockPrompt);
    expect(cmds(r.actions)).toEqual(["input.delete.line", "input.delete.line"]);
  });

  it("dw dispatches input.delete.word.forward", () => {
    handleNormalKey(state, "d", ev("d"), mockPrompt);
    const r = handleNormalKey(state, "w", ev("w"), mockPrompt);
    expect(cmds(r.actions)).toEqual(["input.delete.word.forward"]);
  });

  it("3dw saves one undo snapshot around the repeated deletes", () => {
    handleNormalKey(state, "3", ev("3"), mockPrompt);
    handleNormalKey(state, "d", ev("d"), mockPrompt);
    const r = handleNormalKey(state, "w", ev("w"), mockPrompt);
    expect(saveUndoSnapshots(r.actions)).toHaveLength(1);
    expect(cmds(r.actions)).toEqual([
      "input.delete.word.forward",
      "input.delete.word.forward",
      "input.delete.word.forward",
    ]);
  });

  it("d$ dispatches input.delete.to.line.end", () => {
    handleNormalKey(state, "d", ev("d"), mockPrompt);
    const r = handleNormalKey(state, "$", ev("4", { shift: true }), mockPrompt);
    expect(cmds(r.actions)).toEqual(["input.delete.to.line.end"]);
  });

  it("d0 dispatches input.delete.to.line.start", () => {
    handleNormalKey(state, "d", ev("d"), mockPrompt);
    const r = handleNormalKey(state, "0", ev("0"), mockPrompt);
    expect(cmds(r.actions)).toEqual(["input.delete.to.line.start"]);
  });

  it("dj dispatches input.delete.line twice", () => {
    handleNormalKey(state, "d", ev("d"), mockPrompt);
    const r = handleNormalKey(state, "j", ev("j"), mockPrompt);
    expect(cmds(r.actions)).toEqual(["input.delete.line", "input.delete.line"]);
  });

  it("dk dispatches input.move.up + input.delete.line twice", () => {
    handleNormalKey(state, "d", ev("d"), mockPrompt);
    const r = handleNormalKey(state, "k", ev("k"), mockPrompt);
    expect(cmds(r.actions)).toEqual(["input.move.up", "input.delete.line", "input.delete.line"]);
  });

  it("cc dispatches input.delete.line, enters insert", () => {
    handleNormalKey(state, "c", ev("c"), mockPrompt);
    const r = handleNormalKey(state, "c", ev("c"), mockPrompt);
    expect(cmds(r.actions)).toEqual(["input.delete.line"]);
    expect(state.mode).toBe("insert");
  });

  it("cw dispatches input.delete.word.forward, enters insert", () => {
    handleNormalKey(state, "c", ev("c"), mockPrompt);
    const r = handleNormalKey(state, "w", ev("w"), mockPrompt);
    expect(cmds(r.actions)).toEqual(["input.delete.word.forward"]);
    expect(state.mode).toBe("insert");
  });

  it("yy sets yankRegister and toasts", () => {
    handleNormalKey(state, "y", ev("y"), mockPrompt);
    const r = handleNormalKey(state, "y", ev("y"), mockPrompt);
    expect(state.yankRegister).toBe("hello world\n");
    expect(r.actions.some((a) => a.type === "yank")).toBe(true);
    expect(r.actions.some((a) => a.type === "toast")).toBe(true);
  });

  it("yw selects word forward and yanks", () => {
    handleNormalKey(state, "y", ev("y"), mockPrompt);
    const r = handleNormalKey(state, "w", ev("w"), mockPrompt);
    expect(cmds(r.actions)).toEqual(["input.select.word.forward"]);
    expect(r.actions.some((a) => a.type === "yankSelection")).toBe(true);
  });

  it("y$ selects to line end and yanks", () => {
    handleNormalKey(state, "y", ev("y"), mockPrompt);
    const r = handleNormalKey(state, "$", ev("4", { shift: true }), mockPrompt);
    expect(cmds(r.actions)).toEqual(["input.select.line.end"]);
    expect(r.actions.some((a) => a.type === "yankSelection")).toBe(true);
  });

  it("y3w selects 3 words and yanks", () => {
    handleNormalKey(state, "y", ev("y"), mockPrompt);
    handleNormalKey(state, "3", ev("3"), mockPrompt);
    const r = handleNormalKey(state, "w", ev("w"), mockPrompt);
    expect(cmds(r.actions)).toEqual([
      "input.select.word.forward",
      "input.select.word.forward",
      "input.select.word.forward",
    ]);
    expect(r.actions.some((a) => a.type === "yankSelection")).toBe(true);
  });
});

// ── handleNormalKey — dG and cG ─────────────────────────────

describe("handleNormalKey — dG and cG", () => {
  const midPrompt: PromptAccess = {
    getLine: (n) => ["hello world", "second line", "third line"][n] ?? "",
    getLineCount: () => 3,
    getCursorLine: () => 1,
    getCursorOffset: () => 12,
    getPlainText: () => "hello world\nsecond line\nthird line",
  };

  it("dG deletes from cursor to buffer end", () => {
    handleNormalKey(state, "d", ev("d"), midPrompt);
    const r = handleNormalKey(state, "G", ev("g", { shift: true }), midPrompt);
    expect(deleteRanges(r.actions)).toEqual([{ start: 12, end: 33 }]);
    expect(state.mode).toBe("normal");
    // Single snapshot source: the saveUndoSnapshot action, not a second
    // push inside the deleteRange handler.
    expect(saveUndoSnapshots(r.actions)).toHaveLength(1);
  });

  it("cG deletes from cursor to buffer end, enters insert", () => {
    handleNormalKey(state, "c", ev("c"), midPrompt);
    const r = handleNormalKey(state, "G", ev("g", { shift: true }), midPrompt);
    expect(deleteRanges(r.actions)).toEqual([{ start: 12, end: 33 }]);
    expect(state.mode).toBe("insert");
  });

  it("yG still works (no regression)", () => {
    handleNormalKey(state, "y", ev("y"), midPrompt);
    const r = handleNormalKey(state, "G", ev("g", { shift: true }), midPrompt);
    expect(cmds(r.actions)).toContain("input.select.buffer.end");
    expect(r.actions.some((a) => a.type === "yankSelection")).toBe(true);
  });

  it("dG on empty buffer doesn't crash", () => {
    handleNormalKey(state, "d", ev("d"), emptyPrompt);
    const r = handleNormalKey(state, "G", ev("g", { shift: true }), emptyPrompt);
    expect(r.consume).toBe(true);
    expect(deleteRanges(r.actions)).toEqual([{ start: 0, end: 0 }]);
  });

  it("dG with cursor at end of buffer", () => {
    const endPrompt: PromptAccess = {
      getLine: (n) => ["hello"][n] ?? "",
      getLineCount: () => 1,
      getCursorLine: () => 0,
      getCursorOffset: () => 4,
      getPlainText: () => "hello",
    };
    handleNormalKey(state, "d", ev("d"), endPrompt);
    const r = handleNormalKey(state, "G", ev("g", { shift: true }), endPrompt);
    expect(deleteRanges(r.actions)).toEqual([{ start: 4, end: 4 }]);
  });
});

// ── handleNormalKey — shortcuts ─────────────────────────────

describe("handleNormalKey — shortcuts", () => {
  it("D dispatches input.delete.to.line.end", () => {
    const r = handleNormalKey(state, "D", ev("d", { shift: true }), mockPrompt);
    expect(cmds(r.actions)).toEqual(["input.delete.to.line.end"]);
  });

  it("C dispatches input.delete.to.line.end and enters insert", () => {
    const r = handleNormalKey(state, "C", ev("c", { shift: true }), mockPrompt);
    expect(cmds(r.actions)).toEqual(["input.delete.to.line.end"]);
    expect(state.mode).toBe("insert");
  });
});

// ── handleNormalKey — special keys ──────────────────────────

describe("handleNormalKey — special keys", () => {
  it(": dispatches command.palette.show", () => {
    const r = handleNormalKey(state, ":", ev(":"), mockPrompt);
    expect(cmds(r.actions)).toEqual(["command.palette.show"]);
  });

  it("/ dispatches session.timeline", () => {
    const r = handleNormalKey(state, "/", ev("/"), mockPrompt);
    expect(cmds(r.actions)).toEqual(["session.timeline"]);
  });

  it("[ dispatches session.half.page.up", () => {
    const r = handleNormalKey(state, "[", ev("["), mockPrompt);
    expect(cmds(r.actions)).toEqual(["session.half.page.up"]);
  });

  it("] dispatches session.half.page.down", () => {
    const r = handleNormalKey(state, "]", ev("]"), mockPrompt);
    expect(cmds(r.actions)).toEqual(["session.half.page.down"]);
  });

  it("{ dispatches session.message.previous", () => {
    const r = handleNormalKey(state, "{", ev("[", { shift: true }), mockPrompt);
    expect(cmds(r.actions)).toEqual(["session.message.previous"]);
  });

  it("} dispatches session.message.next", () => {
    const r = handleNormalKey(state, "}", ev("]", { shift: true }), mockPrompt);
    expect(cmds(r.actions)).toEqual(["session.message.next"]);
  });

  it("X dispatches input.backspace", () => {
    const r = handleNormalKey(state, "X", ev("x", { shift: true }), mockPrompt);
    expect(cmds(r.actions)).toEqual(["input.backspace"]);
  });

  it("J dispatches input.line.end + input.delete", () => {
    const r = handleNormalKey(state, "J", ev("j", { shift: true }), mockPrompt);
    expect(cmds(r.actions)).toEqual(["input.line.end", "input.delete"]);
  });

  it("u triggers undo", () => {
    const r = handleNormalKey(state, "u", ev("u"), mockPrompt);
    expect(r.actions.some((a) => a.type === "undo")).toBe(true);
  });

  it("ctrl+r dispatches input.redo", () => {
    const r = handleNormalKey(state, "r", ev("r", { ctrl: true }), mockPrompt);
    expect(r.consume).toBe(true);
    expect(cmds(r.actions)).toEqual(["input.redo"]);
  });

  it("Enter in normal mode submits the prompt", () => {
    const r = handleNormalKey(state, "return", ev("return"), mockPrompt);
    expect(cmds(r.actions)).toEqual(["input.submit"]);
  });

  it("x deletes the character under the cursor", () => {
    const r = handleNormalKey(state, "x", ev("x"), mockPrompt);
    expect(cmds(r.actions)).toEqual(["input.delete"]);
  });

  it("3x deletes three characters", () => {
    handleNormalKey(state, "3", ev("3"), mockPrompt);
    const r = handleNormalKey(state, "x", ev("x"), mockPrompt);
    expect(cmds(r.actions)).toEqual(["input.delete", "input.delete", "input.delete"]);
  });

  it("p with yankRegister set pastes", () => {
    state.yankRegister = "yanked text\n";
    const r = handleNormalKey(state, "p", ev("p"), mockPrompt);
    expect(r.actions.some((a) => a.type === "yank")).toBe(true);
    expect(cmds(r.actions)).toContain("prompt.paste");
  });

  it("meta combo → passthrough", () => {
    const r = handleNormalKey(state, "c", ev("c", { meta: true }), mockPrompt);
    expect(r.consume).toBe(false);
  });

  it("escape → passthrough, resets pending operator", () => {
    state.pending = { kind: "operator", op: "d" };
    const r = handleNormalKey(state, "escape", ev("escape"), mockPrompt);
    expect(r.consume).toBe(false);
    expect(state.pending).toEqual({ kind: "none" });
  });
});

// ── handleNormalKey — replace (r) ──────────────────────────

describe("handleNormalKey — replace (r)", () => {
  it("r sets pending replace, consumes key, no commands", () => {
    const r = handleNormalKey(state, "r", ev("r"), mockPrompt);
    expect(r.consume).toBe(true);
    expect(r.actions).toEqual([]);
    expect(state.pending).toEqual({ kind: "replace" });
  });

  it("r then a → input.delete + insertText('a'), stays normal", () => {
    handleNormalKey(state, "r", ev("r"), mockPrompt);
    const r = handleNormalKey(state, "a", ev("a"), mockPrompt);
    expect(r.consume).toBe(true);
    expect(cmds(r.actions)).toEqual(["input.delete"]);
    expect(r.actions).toContainEqual({ type: "insertText", text: "a" });
    expect(state.mode).toBe("normal");
    expect(state.pending).toEqual({ kind: "none" });
  });

  it("3ra → 3x input.delete + insertText('aaa')", () => {
    handleNormalKey(state, "3", ev("3"), mockPrompt);
    handleNormalKey(state, "r", ev("r"), mockPrompt);
    const r = handleNormalKey(state, "a", ev("a"), mockPrompt);
    expect(cmds(r.actions)).toEqual(["input.delete", "input.delete", "input.delete"]);
    expect(r.actions).toContainEqual({ type: "insertText", text: "aaa" });
  });

  it("r then escape → cancels, no commands", () => {
    handleNormalKey(state, "r", ev("r"), mockPrompt);
    const r = handleNormalKey(state, "escape", ev("escape"), mockPrompt);
    expect(state.pending).toEqual({ kind: "none" });
    expect(cmds(r.actions)).toEqual([]);
  });

  it("r then digit → replaces with digit, not count", () => {
    handleNormalKey(state, "r", ev("r"), mockPrompt);
    const r = handleNormalKey(state, "5", ev("5"), mockPrompt);
    expect(cmds(r.actions)).toEqual(["input.delete"]);
    expect(r.actions).toContainEqual({ type: "insertText", text: "5" });
    expect(state.count).toBe(0);
  });
});

// ── handleNormalKey — insert entries ────────────────────────

describe("handleNormalKey — insert entries", () => {
  it("i enters insert", () => {
    const r = handleNormalKey(state, "i", ev("i"), mockPrompt);
    expect(state.mode).toBe("insert");
    expect(r.actions).toContainEqual({ type: "mode", mode: "insert" });
  });

  it("a dispatches input.move.right, enters insert", () => {
    const r = handleNormalKey(state, "a", ev("a"), mockPrompt);
    expect(cmds(r.actions)).toContain("input.move.right");
    expect(state.mode).toBe("insert");
  });

  it("A dispatches input.line.end, enters insert", () => {
    const r = handleNormalKey(state, "A", ev("a", { shift: true }), mockPrompt);
    expect(cmds(r.actions)).toContain("input.line.end");
    expect(state.mode).toBe("insert");
  });

  it("o dispatches input.line.end + input.newline, enters insert", () => {
    const r = handleNormalKey(state, "o", ev("o"), mockPrompt);
    expect(cmds(r.actions)).toEqual(["input.line.end", "input.newline"]);
    expect(state.mode).toBe("insert");
  });

  it("O dispatches input.line.home + input.newline + input.move.up, enters insert", () => {
    const r = handleNormalKey(state, "O", ev("o", { shift: true }), mockPrompt);
    expect(cmds(r.actions)).toEqual(["input.line.home", "input.newline", "input.move.up"]);
    expect(state.mode).toBe("insert");
  });
});

// ── handleNormalKey — yy uses cursor position ─────────────

describe("handleNormalKey — yy uses cursor position", () => {
  it("yy yanks the line at getCursorLine, not a tracked counter", () => {
    const prompt: PromptAccess = {
      getLine: (n) => ["first", "second", "third"][n] ?? "",
      getLineCount: () => 3,
      getCursorLine: () => 1,
    };
    handleNormalKey(state, "y", ev("y"), prompt);
    const r = handleNormalKey(state, "y", ev("y"), prompt);
    expect(state.yankRegister).toBe("second\n");
    expect(r.actions.some((a) => a.type === "yank" && a.text === "second\n")).toBe(true);
  });

  it("2yy from cursor line 1 yanks lines 1 and 2", () => {
    const prompt: PromptAccess = {
      getLine: (n) => ["first", "second", "third"][n] ?? "",
      getLineCount: () => 3,
      getCursorLine: () => 1,
    };
    handleNormalKey(state, "2", ev("2"), prompt);
    handleNormalKey(state, "y", ev("y"), prompt);
    handleNormalKey(state, "y", ev("y"), prompt);
    expect(state.yankRegister).toBe("second\nthird\n");
  });

  it("yy on last line yanks that line", () => {
    const prompt: PromptAccess = {
      getLine: (n) => ["first", "second", "third"][n] ?? "",
      getLineCount: () => 3,
      getCursorLine: () => 2,
    };
    handleNormalKey(state, "y", ev("y"), prompt);
    handleNormalKey(state, "y", ev("y"), prompt);
    expect(state.yankRegister).toBe("third\n");
  });
});

// ── handleNormalKey — history scrolling ─────────────────────

describe("handleNormalKey — history scrolling", () => {
  it("j dispatches prompt.history.next when input is empty", () => {
    const r = handleNormalKey(state, "j", ev("j"), emptyPrompt);
    expect(cmds(r.actions)).toEqual(["prompt.history.next"]);
  });

  it("k dispatches prompt.history.previous when input is empty", () => {
    const r = handleNormalKey(state, "k", ev("k"), emptyPrompt);
    expect(cmds(r.actions)).toEqual(["prompt.history.previous"]);
  });

  it("j dispatches input.move.down when input is non-empty", () => {
    const r = handleNormalKey(state, "j", ev("j"), mockPrompt);
    expect(cmds(r.actions)).toEqual(["input.move.down"]);
  });

  it("3k dispatches prompt.history.previous 3 times when empty", () => {
    handleNormalKey(state, "3", ev("3"), emptyPrompt);
    const r = handleNormalKey(state, "k", ev("k"), emptyPrompt);
    expect(cmds(r.actions)).toEqual(["prompt.history.previous", "prompt.history.previous", "prompt.history.previous"]);
  });

  it("dj still deletes lines when input is empty", () => {
    handleNormalKey(state, "d", ev("d"), emptyPrompt);
    const r = handleNormalKey(state, "j", ev("j"), emptyPrompt);
    expect(cmds(r.actions)).toEqual(["input.delete.line", "input.delete.line"]);
  });
});

// ── handleNormalKey — visual mode entry ────────────────────

describe("handleNormalKey — visual mode entry", () => {
  it("v enters visual mode", () => {
    const r = handleNormalKey(state, "v", ev("v"), mockPrompt);
    expect(r.consume).toBe(true);
    expect(state.mode).toBe("visual");
    expect(r.actions).toContainEqual({ type: "mode", mode: "visual" });
  });

  it("v clears pending operator", () => {
    state.pending = { kind: "operator", op: "d" };
    handleNormalKey(state, "v", ev("v"), mockPrompt);
    expect(state.pending).toEqual({ kind: "none" });
    expect(state.mode).toBe("visual");
  });

  it("V selects the current line and enters visual mode", () => {
    const prompt: PromptAccess = {
      getLine: (n) => ["first", "second", "third"][n] ?? "",
      getLineCount: () => 3,
      getCursorLine: () => 1,
      getCursorOffset: () => 8,
      getPlainText: () => "first\nsecond\nthird",
    };

    const r = handleNormalKey(state, "V", ev("v", { shift: true }), prompt);

    expect(r.consume).toBe(true);
    expect(state.mode).toBe("visual");
    expect(selectRanges(r.actions)).toEqual([{ start: 6, end: 12 }]);
    expect(r.actions).toContainEqual({ type: "mode", mode: "visual" });
  });

  it("V selects the first line including its newline", () => {
    const r = handleNormalKey(state, "V", ev("v", { shift: true }), mockPrompt);

    expect(selectRanges(r.actions)).toEqual([{ start: 0, end: 11 }]);
  });

  it("V selects the last line without requiring a trailing newline", () => {
    const prompt: PromptAccess = {
      getLine: (n) => ["first", "second", "third"][n] ?? "",
      getLineCount: () => 3,
      getCursorLine: () => 2,
      getCursorOffset: () => 15,
      getPlainText: () => "first\nsecond\nthird",
    };

    const r = handleNormalKey(state, "V", ev("v", { shift: true }), prompt);

    expect(selectRanges(r.actions)).toEqual([{ start: 13, end: 17 }]);
  });
});

// ── handleNormalKey — pending cleanup ──────────────────────

describe("handleNormalKey — pending cleanup", () => {
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
    const r = handleNormalKey(state, "w", ev("w"), mockPrompt);
    expect(cmds(r.actions)).toEqual(["input.word.forward"]); // NOT input.delete.word.forward
  });

  it("drx replaces the char and clears pending", () => {
    handleNormalKey(state, "d", ev("d"), mockPrompt);
    handleNormalKey(state, "r", ev("r"), mockPrompt);
    const r = handleNormalKey(state, "x", ev("x"), mockPrompt);
    expect(state.pending).toEqual({ kind: "none" });
    expect(r.actions.some((a) => a.type === "insertText")).toBe(true);
  });

  it("drx then w moves by word (no dangling delete-operator)", () => {
    handleNormalKey(state, "d", ev("d"), mockPrompt);
    handleNormalKey(state, "r", ev("r"), mockPrompt);
    handleNormalKey(state, "x", ev("x"), mockPrompt);
    const r = handleNormalKey(state, "w", ev("w"), mockPrompt);
    expect(cmds(r.actions)).toEqual(["input.word.forward"]);
  });
});

// ── handleNormalKey — arrow keys pass through (issue #63) ──

describe("handleNormalKey — arrow keys pass through", () => {
  // Arrows are host navigation, not vim motions. If vimcode consumes them,
  // OpenCode can't exit the subagent view from normal mode (issue #63).
  for (const arrow of ["up", "down", "left", "right"] as const) {
    it(`${arrow} passes through to the host without consuming`, () => {
      const r = handleNormalKey(state, arrow, ev(arrow), mockPrompt);
      expect(r.consume).toBe(false);
      expect(r.actions).toEqual([]);
    });
  }
});

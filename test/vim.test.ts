import { beforeEach, describe, expect, it } from "bun:test";
import {
  type Action,
  createVimState,
  endOfWord,
  finishOneShotIfComplete,
  handleInsertKey,
  handleNormalKey,
  handleVisualKey,
  type PromptAccess,
  parseLeaderKey,
  toggleVimMode,
  translateKey,
  type VimState,
} from "../src/vim";

function cmds(actions: Action[]): string[] {
  return actions.filter((a): a is Extract<Action, { type: "cmd" }> => a.type === "cmd").map((a) => a.cmd);
}

function cursorTos(actions: Action[]): number[] {
  return actions.filter((a): a is Extract<Action, { type: "cursorTo" }> => a.type === "cursorTo").map((a) => a.offset);
}

function deleteRanges(actions: Action[]): Array<{ start: number; end: number }> {
  return actions
    .filter((a): a is Extract<Action, { type: "deleteRange" }> => a.type === "deleteRange")
    .map((a) => ({ start: a.start, end: a.end }));
}

const ev = (name: string, opts?: { shift?: boolean; ctrl?: boolean; meta?: boolean; super?: boolean }) => ({
  name,
  shift: opts?.shift ?? false,
  ctrl: opts?.ctrl ?? false,
  meta: opts?.meta ?? false,
  super: opts?.super ?? false,
});

const mockPrompt: PromptAccess = {
  getLine: (n) => ["hello world", "second line", "third line"][n] ?? "",
  getLineCount: () => 3,
  getCursorLine: () => 0,
  getCursorOffset: () => 0,
  getPlainText: () => "hello world\nsecond line\nthird line",
};

const emptyPrompt: PromptAccess = {
  getLine: () => "",
  getLineCount: () => 1,
  getCursorLine: () => 0,
  getCursorOffset: () => 0,
  getPlainText: () => "",
};

let state: VimState;

beforeEach(() => {
  state = createVimState();
  state.mode = "normal";
});

// ── createVimState ───────────────────────────────────────────

describe("createVimState", () => {
  it("initializes disabled: false", () => {
    const s = createVimState();
    expect(s.disabled).toBe(false);
  });
});

// ── toggleVimMode ────────────────────────────────────────────

describe("toggleVimMode", () => {
  it("flips disabled from false to true", () => {
    const s = createVimState();
    s.disabled = false;
    toggleVimMode(s);
    expect(s.disabled).toBe(true);
  });

  it("flips disabled from true to false", () => {
    const s = createVimState();
    s.disabled = true;
    toggleVimMode(s);
    expect(s.disabled).toBe(false);
  });

  it("resets mode to insert when disabling", () => {
    const s = createVimState();
    s.mode = "normal";
    s.pendingOp = "d";
    s.count = 3;
    toggleVimMode(s);
    expect(s.mode).toBe("insert");
    expect(s.pendingOp).toBeNull();
    expect(s.pendingChar).toBeNull();
    expect(s.count).toBe(0);
    expect(s.oneShotNormal).toBe(false);
  });

  it("returns a toast and mode action when disabling", () => {
    const s = createVimState();
    s.disabled = false;
    const r = toggleVimMode(s);
    expect(r.actions).toContainEqual({ type: "toast", message: "Vim mode disabled" });
    expect(r.actions).toContainEqual({ type: "mode", mode: "insert" });
  });

  it("returns a toast action with 'Vim mode enabled' when enabling", () => {
    const s = createVimState();
    s.disabled = true;
    const r = toggleVimMode(s);
    expect(r.actions).toContainEqual({ type: "toast", message: "Vim mode enabled" });
  });

  it("does not reset mode when enabling", () => {
    const s = createVimState();
    s.disabled = true;
    s.mode = "normal";
    toggleVimMode(s);
    expect(s.mode).toBe("normal");
  });

  it("returns consume: true", () => {
    const s = createVimState();
    const r = toggleVimMode(s);
    expect(r.consume).toBe(true);
  });
});

// ── endOfWord ──────────────────────────────────────────────

describe("endOfWord", () => {
  it("from start of word, moves to last char", () => {
    expect(endOfWord("hello world", 0)).toBe(4);
  });

  it("from middle of word, moves to last char", () => {
    expect(endOfWord("hello world", 2)).toBe(4);
  });

  it("from end of word, moves to end of next word", () => {
    expect(endOfWord("hello world", 4)).toBe(10);
  });

  it("from whitespace, skips to end of next word", () => {
    expect(endOfWord("hello world", 5)).toBe(10);
  });

  it("stops at punctuation boundary", () => {
    expect(endOfWord("hello.world", 0)).toBe(4);
  });

  it("from punctuation, moves to end of punctuation run", () => {
    expect(endOfWord("hello...world", 5)).toBe(7);
  });

  it("from end of punctuation, moves to end of next word", () => {
    expect(endOfWord("a.b", 1)).toBe(2);
  });

  it("at end of text, stays put", () => {
    expect(endOfWord("hello", 4)).toBe(4);
  });

  it("handles count > 1", () => {
    expect(endOfWord("one two three", 0, 2)).toBe(6);
  });

  it("handles multiple whitespace", () => {
    expect(endOfWord("hello   world", 0)).toBe(4);
    expect(endOfWord("hello   world", 4)).toBe(12);
  });

  it("handles newlines as whitespace", () => {
    expect(endOfWord("hello\nworld", 4)).toBe(10);
  });

  it("clamps at end of text", () => {
    expect(endOfWord("hi", 0, 5)).toBe(1);
  });
});

// ── translateKey ────────────────────────────────────────────

describe("translateKey", () => {
  it("lowercase passes through", () => {
    expect(translateKey(ev("h"))).toBe("h");
  });

  it("shift+letter uppercases", () => {
    expect(translateKey(ev("g", { shift: true }))).toBe("G");
  });

  it("shift+4 → $", () => {
    expect(translateKey(ev("4", { shift: true }))).toBe("$");
  });

  it("shift+6 → ^", () => {
    expect(translateKey(ev("6", { shift: true }))).toBe("^");
  });

  it("shift+[ → {", () => {
    expect(translateKey(ev("[", { shift: true }))).toBe("{");
  });

  it("shift+] → }", () => {
    expect(translateKey(ev("]", { shift: true }))).toBe("}");
  });
});

// ── parseLeaderKey ─────────────────────────────────────────

describe("parseLeaderKey", () => {
  it("parses 'space' with printable char", () => {
    expect(parseLeaderKey("space")).toEqual({ name: "space", ctrl: false, shift: false, meta: false, char: " " });
  });

  it("parses single letter", () => {
    expect(parseLeaderKey("a")).toEqual({ name: "a", ctrl: false, shift: false, meta: false, char: "a" });
  });

  it("parses 'C-x' (ctrl modifier)", () => {
    expect(parseLeaderKey("C-x")).toEqual({ name: "x", ctrl: true, shift: false, meta: false, char: null });
  });

  it("parses 'S-a' (shift modifier, char uppercased)", () => {
    expect(parseLeaderKey("S-a")).toEqual({ name: "a", ctrl: false, shift: true, meta: false, char: "A" });
  });

  it("parses 'M-x' (meta modifier)", () => {
    expect(parseLeaderKey("M-x")).toEqual({ name: "x", ctrl: false, shift: false, meta: true, char: null });
  });

  it("parses compound modifiers 'C-S-a'", () => {
    expect(parseLeaderKey("C-S-a")).toEqual({ name: "a", ctrl: true, shift: true, meta: false, char: null });
  });

  it("parses 'tab' with printable char", () => {
    expect(parseLeaderKey("tab")).toEqual({ name: "tab", ctrl: false, shift: false, meta: false, char: "\t" });
  });

  it("returns null for empty string", () => {
    expect(parseLeaderKey("")).toBeNull();
  });

  it("multi-char key name without modifiers has no printable char", () => {
    expect(parseLeaderKey("escape")).toEqual({ name: "escape", ctrl: false, shift: false, meta: false, char: null });
  });
});

// ── handleInsertKey ─────────────────────────────────────────

describe("handleInsertKey", () => {
  beforeEach(() => {
    state.mode = "insert";
  });

  it("escape → consume, mode normal", () => {
    const r = handleInsertKey(state, "escape", ev("escape"));
    expect(r.consume).toBe(true);
    expect(state.mode).toBe("normal");
    expect(r.actions).toContainEqual({ type: "mode", mode: "normal" });
  });

  it("enter → consume, input.newline", () => {
    const r = handleInsertKey(state, "return", ev("return"));
    expect(r.consume).toBe(true);
    expect(cmds(r.actions)).toContain("input.newline");
  });

  it("ctrl+enter → consume, input.submit", () => {
    const r = handleInsertKey(state, "return", ev("return", { ctrl: true }));
    expect(r.consume).toBe(true);
    expect(cmds(r.actions)).toContain("input.submit");
  });

  it("tab → consume, insertText tab", () => {
    const r = handleInsertKey(state, "tab", ev("tab"));
    expect(r.consume).toBe(true);
    expect(r.actions).toContainEqual({ type: "insertText", text: "\t" });
  });

  it("regular key → passthrough", () => {
    const r = handleInsertKey(state, "a", ev("a"));
    expect(r.consume).toBe(false);
  });

  it("leader key → consume and insert its character", () => {
    const leader = parseLeaderKey("space");
    const r = handleInsertKey(state, "space", ev("space"), leader);
    expect(r.consume).toBe(true);
    expect(r.actions).toContainEqual({ type: "insertText", text: " " });
  });

  it("non-leader key still passes through with leader set", () => {
    const leader = parseLeaderKey("space");
    const r = handleInsertKey(state, "a", ev("a"), leader);
    expect(r.consume).toBe(false);
  });

  it("non-printable leader consumed without insertText", () => {
    const leader = parseLeaderKey("C-x");
    const r = handleInsertKey(state, "x", ev("x", { ctrl: true }), leader);
    expect(r.consume).toBe(true);
    expect(r.actions).toEqual([]);
  });

  it("explicit handlers take priority over leader (escape)", () => {
    const leader = parseLeaderKey("escape");
    const r = handleInsertKey(state, "escape", ev("escape"), leader);
    expect(r.consume).toBe(true);
    expect(state.mode).toBe("normal");
  });

  it("no leader parameter → backward compatible passthrough", () => {
    const r = handleInsertKey(state, "space", ev("space"));
    expect(r.consume).toBe(false);
  });

  it("null leader → backward compatible passthrough", () => {
    const r = handleInsertKey(state, "space", ev("space"), null);
    expect(r.consume).toBe(false);
  });

  it("tab handler wins over tab-as-leader", () => {
    const leader = parseLeaderKey("tab");
    const r = handleInsertKey(state, "tab", ev("tab"), leader);
    expect(r.consume).toBe(true);
    expect(r.actions).toContainEqual({ type: "insertText", text: "\t" });
  });

  it("return handler wins over return-as-leader", () => {
    const leader = parseLeaderKey("return");
    const r = handleInsertKey(state, "return", ev("return"), leader);
    expect(r.consume).toBe(true);
    expect(cmds(r.actions)).toContain("input.newline");
  });

  it("shift leader matches shift key event", () => {
    const leader = parseLeaderKey("S-a");
    const r = handleInsertKey(state, "A", ev("a", { shift: true }), leader);
    expect(r.consume).toBe(true);
    expect(r.actions).toContainEqual({ type: "insertText", text: "A" });
  });

  it("ctrl+o enters normal mode with oneShotNormal flag", () => {
    const r = handleInsertKey(state, "o", ev("o", { ctrl: true }));
    expect(r.consume).toBe(true);
    expect(state.mode).toBe("normal");
    expect(state.oneShotNormal).toBe(true);
    expect(r.actions).toContainEqual({ type: "mode", mode: "(insert)" });
  });

  it("ctrl+o emits (insert) mode action", () => {
    const r = handleInsertKey(state, "o", ev("o", { ctrl: true }));
    expect(r.actions.some((a) => a.type === "mode" && a.mode === "(insert)")).toBe(true);
  });
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

  it("g sets pendingChar, no actions", () => {
    const r = handleNormalKey(state, "g", ev("g"), mockPrompt);
    expect(r.consume).toBe(true);
    expect(r.actions).toEqual([]);
    expect(state.pendingChar).toBe("g");
  });
});

// ── handleNormalKey — g prefix ─────────────────────────────

describe("handleNormalKey — g prefix", () => {
  it("gg moves cursor to buffer start", () => {
    handleNormalKey(state, "g", ev("g"), mockPrompt);
    const r = handleNormalKey(state, "g", ev("g"), mockPrompt);
    expect(r.consume).toBe(true);
    expect(cursorTos(r.actions)).toEqual([0]);
    expect(state.pendingChar).toBeNull();
  });

  it("g then Escape cancels pending, no movement", () => {
    handleNormalKey(state, "g", ev("g"), mockPrompt);
    const r = handleNormalKey(state, "escape", ev("escape"), mockPrompt);
    expect(state.pendingChar).toBeNull();
    expect(r.actions).toEqual([]);
  });

  it("g then unknown key cancels pending, no movement", () => {
    handleNormalKey(state, "g", ev("g"), mockPrompt);
    const r = handleNormalKey(state, "z", ev("z"), mockPrompt);
    expect(r.consume).toBe(true);
    expect(state.pendingChar).toBeNull();
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

// ── handleNormalKey — operators ─────────────────────────────

describe("handleNormalKey — operators", () => {
  it("dd dispatches input.delete.line", () => {
    handleNormalKey(state, "d", ev("d"), mockPrompt);
    expect(state.pendingOp).toBe("d");
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

  it("escape → passthrough, resets pendingOp", () => {
    state.pendingOp = "d";
    const r = handleNormalKey(state, "escape", ev("escape"), mockPrompt);
    expect(r.consume).toBe(false);
    expect(state.pendingOp).toBeNull();
  });
});

// ── handleNormalKey — replace (r) ──────────────────────────

describe("handleNormalKey — replace (r)", () => {
  it("r sets pendingChar, consumes key, no commands", () => {
    const r = handleNormalKey(state, "r", ev("r"), mockPrompt);
    expect(r.consume).toBe(true);
    expect(r.actions).toEqual([]);
    expect(state.pendingChar).toBe("r");
  });

  it("r then a → input.delete + insertText('a'), stays normal", () => {
    handleNormalKey(state, "r", ev("r"), mockPrompt);
    const r = handleNormalKey(state, "a", ev("a"), mockPrompt);
    expect(r.consume).toBe(true);
    expect(cmds(r.actions)).toEqual(["input.delete"]);
    expect(r.actions).toContainEqual({ type: "insertText", text: "a" });
    expect(state.mode).toBe("normal");
    expect(state.pendingChar).toBeNull();
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
    expect(state.pendingChar).toBeNull();
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
    state.pendingOp = "d";
    handleNormalKey(state, "v", ev("v"), mockPrompt);
    expect(state.pendingOp).toBeNull();
    expect(state.mode).toBe("visual");
  });
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
    const r = handleVisualKey(state, "G", ev("g", { shift: true }));
    expect(cmds(r.actions)).toEqual(["input.select.buffer.end"]);
  });

  it("g sets pendingChar, no actions", () => {
    const r = handleVisualKey(state, "g", ev("g"));
    expect(r.consume).toBe(true);
    expect(r.actions).toEqual([]);
    expect(state.pendingChar).toBe("g");
  });

  it("gg selects to buffer home", () => {
    handleVisualKey(state, "g", ev("g"));
    const r = handleVisualKey(state, "g", ev("g"));
    expect(r.consume).toBe(true);
    expect(cmds(r.actions)).toEqual(["input.select.buffer.home"]);
    expect(state.pendingChar).toBeNull();
  });

  it("g then Escape in visual cancels pending, stays visual", () => {
    handleVisualKey(state, "g", ev("g"));
    handleVisualKey(state, "escape", ev("escape"));
    expect(state.pendingChar).toBeNull();
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

// ── Ctrl+O one-shot normal mode ───────────────────────────

describe("Ctrl+O one-shot normal mode", () => {
  function enterOneShot() {
    state.mode = "insert";
    handleInsertKey(state, "o", ev("o", { ctrl: true }));
  }

  it("w auto-returns to insert", () => {
    enterOneShot();
    const r = handleNormalKey(state, "w", ev("w"), mockPrompt);
    finishOneShotIfComplete(state, r);
    expect(state.mode).toBe("insert");
    expect(state.oneShotNormal).toBe(false);
    expect(r.actions).toContainEqual({ type: "mode", mode: "insert" });
  });

  it("3w auto-returns to insert after count is consumed", () => {
    enterOneShot();
    handleNormalKey(state, "3", ev("3"), mockPrompt);
    expect(state.oneShotNormal).toBe(true);
    const r = handleNormalKey(state, "w", ev("w"), mockPrompt);
    finishOneShotIfComplete(state, r);
    expect(state.mode).toBe("insert");
    expect(state.oneShotNormal).toBe(false);
  });

  it("dw auto-returns to insert after operator+motion", () => {
    enterOneShot();
    const r1 = handleNormalKey(state, "d", ev("d"), mockPrompt);
    finishOneShotIfComplete(state, r1);
    expect(state.mode).toBe("normal");
    const r2 = handleNormalKey(state, "w", ev("w"), mockPrompt);
    finishOneShotIfComplete(state, r2);
    expect(state.mode).toBe("insert");
    expect(state.oneShotNormal).toBe(false);
  });

  it("dd auto-returns to insert", () => {
    enterOneShot();
    const r1 = handleNormalKey(state, "d", ev("d"), mockPrompt);
    finishOneShotIfComplete(state, r1);
    const r2 = handleNormalKey(state, "d", ev("d"), mockPrompt);
    finishOneShotIfComplete(state, r2);
    expect(state.mode).toBe("insert");
  });

  it("r{char} auto-returns to insert", () => {
    enterOneShot();
    const r1 = handleNormalKey(state, "r", ev("r"), mockPrompt);
    finishOneShotIfComplete(state, r1);
    expect(state.mode).toBe("normal");
    const r2 = handleNormalKey(state, "a", ev("a"), mockPrompt);
    finishOneShotIfComplete(state, r2);
    expect(state.mode).toBe("insert");
  });

  it("gg auto-returns to insert", () => {
    enterOneShot();
    const r1 = handleNormalKey(state, "g", ev("g"), mockPrompt);
    finishOneShotIfComplete(state, r1);
    expect(state.mode).toBe("normal");
    const r2 = handleNormalKey(state, "g", ev("g"), mockPrompt);
    finishOneShotIfComplete(state, r2);
    expect(state.mode).toBe("insert");
  });

  it("cw enters insert directly without double mode switch", () => {
    enterOneShot();
    const r1 = handleNormalKey(state, "c", ev("c"), mockPrompt);
    finishOneShotIfComplete(state, r1);
    const r2 = handleNormalKey(state, "w", ev("w"), mockPrompt);
    finishOneShotIfComplete(state, r2);
    expect(state.mode).toBe("insert");
    expect(state.oneShotNormal).toBe(false);
    const modeActions = r2.actions.filter((a) => a.type === "mode" && a.mode === "insert");
    expect(modeActions).toHaveLength(1);
  });

  it("u auto-returns to insert", () => {
    enterOneShot();
    const r = handleNormalKey(state, "u", ev("u"), mockPrompt);
    finishOneShotIfComplete(state, r);
    expect(state.mode).toBe("insert");
  });

  it("p auto-returns to insert", () => {
    enterOneShot();
    const r = handleNormalKey(state, "p", ev("p"), mockPrompt);
    finishOneShotIfComplete(state, r);
    expect(state.mode).toBe("insert");
  });

  it(": auto-returns to insert", () => {
    enterOneShot();
    const r = handleNormalKey(state, ":", ev(":"), mockPrompt);
    finishOneShotIfComplete(state, r);
    expect(state.mode).toBe("insert");
  });

  it("e auto-returns to insert", () => {
    enterOneShot();
    const r = handleNormalKey(state, "e", ev("e"), mockPrompt);
    finishOneShotIfComplete(state, r);
    expect(state.mode).toBe("insert");
  });

  it("escape during one-shot returns to insert", () => {
    enterOneShot();
    const r = handleNormalKey(state, "escape", ev("escape"), mockPrompt);
    expect(r.consume).toBe(true);
    expect(state.mode).toBe("insert");
    expect(state.oneShotNormal).toBe(false);
    expect(r.actions).toContainEqual({ type: "mode", mode: "insert" });
  });

  it("v during one-shot cancels one-shot and enters visual", () => {
    enterOneShot();
    handleNormalKey(state, "v", ev("v"), mockPrompt);
    expect(state.mode).toBe("visual");
    expect(state.oneShotNormal).toBe(false);
  });

  it("sequential Ctrl+O usage works (flag resets cleanly)", () => {
    enterOneShot();
    const r1 = handleNormalKey(state, "w", ev("w"), mockPrompt);
    finishOneShotIfComplete(state, r1);
    expect(state.mode).toBe("insert");
    expect(state.oneShotNormal).toBe(false);
    // Second round
    enterOneShot();
    expect(state.oneShotNormal).toBe(true);
    const r2 = handleNormalKey(state, "b", ev("b"), mockPrompt);
    finishOneShotIfComplete(state, r2);
    expect(state.mode).toBe("insert");
    expect(state.oneShotNormal).toBe(false);
  });

  it("cc enters insert directly without double mode switch", () => {
    enterOneShot();
    const r1 = handleNormalKey(state, "c", ev("c"), mockPrompt);
    finishOneShotIfComplete(state, r1);
    const r2 = handleNormalKey(state, "c", ev("c"), mockPrompt);
    finishOneShotIfComplete(state, r2);
    expect(state.mode).toBe("insert");
    expect(state.oneShotNormal).toBe(false);
    const modeActions = r2.actions.filter((a) => a.type === "mode" && a.mode === "insert");
    expect(modeActions).toHaveLength(1);
  });

  it("de auto-returns to insert (deleteRange path)", () => {
    enterOneShot();
    const r1 = handleNormalKey(state, "d", ev("d"), mockPrompt);
    finishOneShotIfComplete(state, r1);
    expect(state.mode).toBe("normal");
    const r2 = handleNormalKey(state, "e", ev("e"), mockPrompt);
    finishOneShotIfComplete(state, r2);
    expect(state.mode).toBe("insert");
    expect(state.oneShotNormal).toBe(false);
    expect(r2.actions.some((a) => a.type === "deleteRange")).toBe(true);
  });

  it("does not auto-return when not in one-shot mode", () => {
    state.mode = "normal";
    state.oneShotNormal = false;
    const r = handleNormalKey(state, "w", ev("w"), mockPrompt);
    finishOneShotIfComplete(state, r);
    expect(state.mode).toBe("normal");
  });
});

describe("version sync", () => {
  it("VERSION matches package.json", async () => {
    const pkg = await import("../package.json");
    const { VERSION } = await import("../src/version");
    expect(VERSION).toBe(pkg.version);
  });
});

// ── plugin init sanity check ──────────────────────────────

describe("plugin init", () => {
  it("tui() does not throw with a minimal mock API", async () => {
    const plugin = (await import("../src/index")).default;
    expect(plugin.id).toBe("vimcode");

    // Minimal mock matching what OpenCode passes to tui().
    // Intentionally sparse — some fields are undefined or stubs,
    // which is exactly the hostile environment we need to survive.
    const dispatchCommand = () => ({ ok: false });
    const api = {
      renderer: undefined,
      ui: { toast: () => {}, dialog: { open: false } },
      keymap: { intercept: () => {}, dispatchCommand },
      route: { current: { name: "home", params: {} } },
      state: { session: { question: () => [], permission: () => [] } },
      lifecycle: { onDispose: () => {} },
      kv: { get: async () => undefined }, // empty object — the scenario that crashed v0.7.0
    };

    // Should not throw with a sparse mock API.
    // biome-ignore lint/suspicious/noExplicitAny: mock API doesn't match full plugin types
    await plugin.tui(api as any, undefined, undefined as any);
  });
});

// ── undo snapshot integration ─────────────────────────────

describe("undo snapshot — deleteRange + u", () => {
  // Exercises the full pipeline: key event → handler → applyActions → editor state.
  // The contract: u after dG restores the full buffer in one step via
  // editBuffer.setText, not the host's per-line input.undo.

  function createMockEditor(text: string, cursor: number) {
    let editorText = text;
    let editorCursor = cursor;
    const calls: { method: string; args: unknown[] }[] = [];
    const editor = {
      get plainText() {
        return editorText;
      },
      get cursorOffset() {
        return editorCursor;
      },
      set cursorOffset(v: number) {
        editorCursor = v;
      },
      visualCursor: { logicalRow: 1 },
      cursorStyle: { style: "block" as const, blinking: true },
      insertText: () => {},
      setSelectionInclusive: () => {},
      editorView: { resetSelection: () => {} },
      editBuffer: {
        deleteRange: (sl: number, sc: number, el: number, ec: number) => {
          calls.push({ method: "deleteRange", args: [sl, sc, el, ec] });
          editorText = editorText.substring(0, cursor);
        },
        setText: (t: string) => {
          calls.push({ method: "setText", args: [t] });
          editorText = t;
        },
      },
    };
    return { editor, calls, getText: () => editorText, getCursor: () => editorCursor };
  }

  async function setup(text: string, cursor: number) {
    const plugin = (await import("../src/index")).default;
    const { editor, calls, getText, getCursor } = createMockEditor(text, cursor);
    const dispatched: string[] = [];
    // biome-ignore lint/suspicious/noExplicitAny: test mock
    let handler: (ctx: any) => void;

    const api = {
      renderer: { currentFocusedEditor: editor, currentFocusedRenderable: editor },
      ui: { toast: () => {}, dialog: { open: false } },
      keymap: {
        intercept: (_e: string, h: typeof handler) => {
          handler = h;
        },
        dispatchCommand: (cmd: string) => {
          dispatched.push(cmd);
          return { ok: false };
        },
      },
      route: { current: { name: "home", params: {} } },
      state: { session: { question: () => [], permission: () => [] } },
      lifecycle: { onDispose: () => {} },
      kv: {},
    };

    // biome-ignore lint/suspicious/noExplicitAny: mock API
    await plugin.tui(api as any, undefined, undefined as any);

    const press = (name: string, opts: Record<string, boolean> = {}) => {
      handler?.({ event: { name, eventType: "press", ...opts }, consume: () => {} });
    };

    // Enter normal mode
    press("escape");

    return { press, calls, dispatched, getText, getCursor };
  }

  it("u after dG restores the full buffer via editBuffer.setText", async () => {
    const original = "hello world\nsecond line\nthird line";
    const { press, calls, dispatched, getCursor } = await setup(original, 12);

    press("d");
    press("g", { shift: true });
    expect(calls.some((c) => c.method === "deleteRange")).toBe(true);

    calls.length = 0;
    press("u");

    expect(calls).toContainEqual({ method: "setText", args: [original] });
    expect(getCursor()).toBe(12);
    expect(dispatched).not.toContain("input.undo");
  });

  it("u after dG then a motion falls back to host input.undo", async () => {
    const { press, calls, dispatched } = await setup("hello world\nsecond line\nthird line", 12);

    press("d");
    press("g", { shift: true });
    expect(calls.some((c) => c.method === "deleteRange")).toBe(true);

    // h dispatches input.move.left (a cmd action), invalidating the snapshot
    press("h");

    calls.length = 0;
    dispatched.length = 0;
    press("u");

    expect(calls.every((c) => c.method !== "setText")).toBe(true);
    // input.undo is dispatched via setTimeout
    await new Promise((r) => setTimeout(r, 20));
    expect(dispatched).toContain("input.undo");
  });
});

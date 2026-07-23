import { beforeEach, describe, expect, it } from "bun:test";
import { createVimState, handleInsertKey, type PromptAccess, type VimState } from "../../src/vim";
import { mockPrompt } from "../fixtures";
import { cmds, cursorTos, ev } from "../support";

let state: VimState;

beforeEach(() => {
  state = createVimState();
  state.mode = "normal";
});

// ── handleInsertKey ─────────────────────────────────────────

describe("handleInsertKey", () => {
  beforeEach(() => {
    state.mode = "insert";
  });

  it("escape → consume, mode normal", () => {
    const r = handleInsertKey(state, "escape", ev("escape"), mockPrompt);
    expect(r.consume).toBe(true);
    expect(state.mode).toBe("normal");
    expect(r.actions).toContainEqual({ type: "mode", mode: "normal" });
  });

  it("enter → consume, input.newline", () => {
    const r = handleInsertKey(state, "return", ev("return"), mockPrompt);
    expect(r.consume).toBe(true);
    expect(cmds(r.actions)).toContain("input.newline");
  });

  it("ctrl+enter → consume, input.submit", () => {
    const r = handleInsertKey(state, "return", ev("return", { ctrl: true }), mockPrompt);
    expect(r.consume).toBe(true);
    expect(cmds(r.actions)).toContain("input.submit");
  });

  it("tab → consume, insertText tab", () => {
    const r = handleInsertKey(state, "tab", ev("tab"), mockPrompt);
    expect(r.consume).toBe(true);
    expect(r.actions).toContainEqual({ type: "insertText", text: "\t" });
  });

  it("regular key → passthrough", () => {
    const r = handleInsertKey(state, "a", ev("a"), mockPrompt);
    expect(r.consume).toBe(false);
  });

  it("escape mid-line moves cursor one left", () => {
    const midLinePrompt: PromptAccess = {
      getLine: () => "hello world",
      getLineCount: () => 1,
      getCursorLine: () => 0,
      getCursorOffset: () => 5,
      getPlainText: () => "hello world",
    };
    const r = handleInsertKey(state, "escape", ev("escape"), midLinePrompt);
    expect(r.consume).toBe(true);
    expect(cursorTos(r.actions)).toEqual([4]);
  });

  it("escape at position 0 does not move cursor", () => {
    const r = handleInsertKey(state, "escape", ev("escape"), mockPrompt);
    expect(cursorTos(r.actions)).toEqual([]);
  });

  it("escape at start of line does not move cursor", () => {
    const startOfLinePrompt: PromptAccess = {
      getLine: (n) => ["hello world", "second line"][n] ?? "",
      getLineCount: () => 2,
      getCursorLine: () => 1,
      getCursorOffset: () => 12,
      getPlainText: () => "hello world\nsecond line",
    };
    const r = handleInsertKey(state, "escape", ev("escape"), startOfLinePrompt);
    expect(cursorTos(r.actions)).toEqual([]);
  });

  it("ctrl+o enters normal mode with oneShotNormal flag", () => {
    const r = handleInsertKey(state, "o", ev("o", { ctrl: true }), mockPrompt);
    expect(r.consume).toBe(true);
    expect(state.mode).toBe("normal");
    expect(state.oneShotNormal).toBe(true);
    expect(r.actions).toContainEqual({ type: "mode", mode: "(insert)" });
  });

  it("ctrl+o emits (insert) mode action", () => {
    const r = handleInsertKey(state, "o", ev("o", { ctrl: true }), mockPrompt);
    expect(r.actions.some((a) => a.type === "mode" && a.mode === "(insert)")).toBe(true);
  });
});

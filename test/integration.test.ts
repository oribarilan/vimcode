import { beforeEach, describe, expect, it } from "bun:test";
import { createVimState, finishOneShotIfComplete, handleInsertKey, handleNormalKey, type VimState } from "../src/vim";
import { mockPrompt } from "./fixtures";
import { ev } from "./support";

let state: VimState;

beforeEach(() => {
  state = createVimState();
  state.mode = "normal";
});

// ── Ctrl+O one-shot normal mode ───────────────────────────

describe("Ctrl+O one-shot normal mode", () => {
  function enterOneShot() {
    state.mode = "insert";
    handleInsertKey(state, "o", ev("o", { ctrl: true }), mockPrompt);
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

  it("finishOneShotIfComplete does not double-append insert when the result already enters insert", () => {
    state.oneShotNormal = true;
    const result = { consume: true, actions: [{ type: "mode", mode: "insert" } as const] };
    finishOneShotIfComplete(state, result);
    expect(state.oneShotNormal).toBe(false);
    expect(result.actions.filter((a) => a.type === "mode" && a.mode === "insert").length).toBe(1);
  });

  it("Ctrl+O one-shot stays in normal mode while an operator is pending", () => {
    state.oneShotNormal = true;
    const result = handleNormalKey(state, "d", ev("d"), mockPrompt);
    finishOneShotIfComplete(state, result);
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

  it("u after 3dw restores the full buffer via editBuffer.setText", async () => {
    const original = "hello world second line third line";
    const { press, calls, dispatched, getCursor } = await setup(original, 0);

    press("3");
    press("d");
    press("w");

    calls.length = 0;
    press("u");

    expect(calls).toContainEqual({ method: "setText", args: [original] });
    expect(getCursor()).toBe(0);
    expect(dispatched).not.toContain("input.undo");
  });

  it("u after 3dw then dd unwinds the snapshot stack one step per press", async () => {
    const original = "hello world second line third line";
    const { press, calls, dispatched } = await setup(original, 0);

    // Two stacked undoable changes → two snapshots on the stack.
    press("3");
    press("d");
    press("w");
    press("d");
    press("d");

    // First u pops the dd snapshot, second pops the 3dw snapshot — each a
    // local restore via setText, never the host's input.undo.
    calls.length = 0;
    dispatched.length = 0;
    press("u");
    expect(calls.some((c) => c.method === "setText")).toBe(true);
    expect(dispatched).not.toContain("input.undo");

    calls.length = 0;
    press("u");
    expect(calls.some((c) => c.method === "setText")).toBe(true);
    expect(dispatched).not.toContain("input.undo");

    // Stack is now empty — a third u falls through to host undo.
    calls.length = 0;
    press("u");
    expect(calls.every((c) => c.method !== "setText")).toBe(true);
    await new Promise((r) => setTimeout(r, 20));
    expect(dispatched).toContain("input.undo");
  });

  it("u after 3dw then an insert-mode edit falls back to host input.undo", async () => {
    const { press, calls, dispatched } = await setup("hello world second line third line", 0);

    press("3");
    press("d");
    press("w");

    // Enter insert and modify the buffer. The insert edit emits an
    // insertText action, which clears the vim snapshot stack.
    press("i");
    press("tab");
    press("escape");

    calls.length = 0;
    dispatched.length = 0;
    press("u");

    expect(calls.every((c) => c.method !== "setText")).toBe(true);
    // input.undo is dispatched via setTimeout
    await new Promise((r) => setTimeout(r, 20));
    expect(dispatched).toContain("input.undo");
  });
});

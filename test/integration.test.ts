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

// ── direct cursor positioning ───────────────────────────────

describe("direct cursor positioning", () => {
  async function setup(text: string, cursor: number, displayCursor = cursor) {
    const plugin = (await import("../src/index")).default;
    let editorText = text;
    let editorCursor = cursor;
    let selection: { start: number; end: number } | undefined;
    // biome-ignore lint/suspicious/noExplicitAny: test mock
    let handler: (ctx: any) => void;

    const stringOffsetForDisplayOffset = (value: string, displayOffset: number) => {
      let display = 0;
      for (let i = 0; i < value.length; i++) {
        if (display >= displayOffset) return i;
        display += value[i] === "\t" ? 2 : 1;
      }
      return value.length;
    };
    const displayOffsetForStringOffset = (value: string, offset: number) => {
      let display = 0;
      for (let i = 0; i < offset; i++) display += value[i] === "\t" ? 2 : 1;
      return display;
    };
    const lineColToOffset = (line: number, col: number) => {
      const lines = editorText.split("\n");
      const lineStart = lines.slice(0, line).reduce((offset, current) => offset + current.length + 1, 0);
      return lineStart + stringOffsetForDisplayOffset(lines[line] ?? "", col);
    };
    const deleteSelection = () => {
      if (!selection) return;
      editorText = editorText.slice(0, selection.start) + editorText.slice(selection.end + 1);
      editorCursor = selection.start;
      selection = undefined;
    };
    const editor = {
      get plainText() {
        return editorText;
      },
      get cursorOffset() {
        return displayCursor;
      },
      set cursorOffset(value: number) {
        editorCursor = stringOffsetForDisplayOffset(editorText, value);
        displayCursor = value;
      },
      get visualCursor() {
        const lineStart = editorText.lastIndexOf("\n", editorCursor - 1) + 1;
        return {
          logicalRow: editorText.slice(0, editorCursor).split("\n").length - 1,
          logicalCol: displayOffsetForStringOffset(editorText.slice(lineStart), editorCursor - lineStart),
          offset: displayOffsetForStringOffset(editorText, editorCursor),
        };
      },
      cursorStyle: { style: "block" as const, blinking: true },
      moveCursorRight: () => {
        // This matches the host behavior that made cursorTo skip past a visual selection.
        editorCursor = selection ? selection.end + 1 : editorCursor + 1;
      },
      moveCursorLeft: () => {
        editorCursor = Math.max(0, editorCursor - 1);
      },
      insertText: (input: string) => {
        editorText = editorText.slice(0, editorCursor) + input + editorText.slice(editorCursor);
        editorCursor += input.length;
      },
      setSelectionInclusive: (start: number, end: number) => {
        selection = { start, end };
      },
      setSelection: (start: number, end: number) => {
        selection = {
          start: stringOffsetForDisplayOffset(editorText, start),
          end: stringOffsetForDisplayOffset(editorText, end) - 1,
        };
      },
      editorView: {
        setCursorByOffset: (offset: number) => {
          editorCursor = stringOffsetForDisplayOffset(editorText, offset);
          displayCursor = offset;
        },
        resetSelection: () => {
          selection = undefined;
        },
      },
      editBuffer: {
        setCursor: (row: number, col: number) => {
          editorCursor = lineColToOffset(row, col);
          displayCursor = displayOffsetForStringOffset(editorText, editorCursor);
        },
        deleteRange: (startLine: number, startCol: number, endLine: number, endCol: number) => {
          const start = lineColToOffset(startLine, startCol);
          const end = lineColToOffset(endLine, endCol);
          editorText = editorText.slice(0, start) + editorText.slice(end);
          editorCursor = start;
        },
      },
      getLayoutNode: () => ({ markDirty: () => {} }),
    };

    const api = {
      renderer: {
        currentFocusedEditor: editor,
        currentFocusedRenderable: editor,
        requestRender: () => {},
      },
      ui: { toast: () => {}, dialog: { open: false } },
      keymap: {
        intercept: (_event: string, callback: typeof handler) => {
          handler = callback;
        },
        dispatchCommand: (command: string) => {
          if (command === "input.delete") {
            editorText = editorText.slice(0, editorCursor) + editorText.slice(editorCursor + 1);
          }
          if (command === "input.backspace") deleteSelection();
          // OpenTUI incorrectly moves to the preceding line's end here.
          if (command === "input.line.home") editorCursor = editorText.lastIndexOf("\n", editorCursor - 1);
          return { ok: false };
        },
      },
      route: { current: { name: "home", params: {} } },
      state: { session: { question: () => [], permission: () => [] } },
      lifecycle: { onDispose: () => {} },
      kv: {},
    };

    // biome-ignore lint/suspicious/noExplicitAny: test mock
    await plugin.tui(api as any, { startMode: "normal", updateCheck: false } as any, undefined as any);

    const press = (name: string, opts: Record<string, boolean> = {}) => {
      let consumed = false;
      handler?.({
        event: { name, eventType: "press", ...opts },
        consume: () => {
          consumed = true;
        },
      });
      if (!consumed && name.length === 1 && !opts.ctrl && !opts.meta && !opts.super) editor.insertText(name);
    };
    const flush = () => new Promise((resolve) => setTimeout(resolve, 0));

    return { flush, getCursor: () => editorCursor, getText: () => editorText, press };
  }

  it("ve<Esc>x deletes the word's last character instead of the following space", async () => {
    const { flush, getText, press } = await setup("hello world", 1);

    press("v");
    press("e");
    press("escape");
    press("x");
    await flush();

    expect(getText()).toBe("hell world");
  });

  it("l extends a visual selection instead of restarting it", async () => {
    const { flush, getText, press } = await setup("test next", 0);

    press("v");
    press("e");
    press("l");
    press("d");
    await flush();

    expect(getText()).toBe("next");
  });

  it("I inserts at the current line's first non-blank character", async () => {
    const { flush, getText, press } = await setup("previous\nnext", "previous\n".length);

    press("i", { shift: true });
    await flush();
    press("x");

    expect(getText()).toBe("previous\nxnext");
  });

  it("I positions after all leading tabs", async () => {
    const text = "\t\t\tText";
    const { getText, press } = await setup(text, text.indexOf("Text"));

    press("i", { shift: true });
    press("x");

    expect(getText()).toBe("\t\t\txText");
  });

  it("I then escape stays after tabbed indentation", async () => {
    const text = "\t\t\tTest";
    const { getCursor, press } = await setup(text, text.indexOf("Test"));

    press("i", { shift: true });
    press("escape");

    expect(getCursor()).toBe(text.indexOf("Test"));
  });

  it("d^ preserves tabbed indentation", async () => {
    const text = "\t  hello world";
    const { getText, press } = await setup(text, text.indexOf("world"), text.indexOf("world") + 3);

    press("d");
    press("6", { shift: true });

    expect(getText()).toBe("\t  world");
  });

  it("gg reaches the initial blank line", async () => {
    const { getCursor, press } = await setup("\nhello", 3);

    press("g");
    press("g");

    expect(getCursor()).toBe(0);
  });
});

// ── arrow keys pass through the intercept (issue #63) ─────

describe("arrow keys pass through the intercept", () => {
  // #63: in normal mode the intercept consumed arrow keys, so OpenCode never
  // saw them and couldn't exit the subagent view. This drives the real
  // pipeline (plugin.tui → key intercept) and asserts consume() is not called
  // for arrows, while a vim motion still is.
  async function setup() {
    const plugin = (await import("../src/index")).default;
    // biome-ignore lint/suspicious/noExplicitAny: test mock
    let handler: (ctx: any) => void;

    const api = {
      renderer: { currentFocusedEditor: undefined },
      ui: { toast: () => {}, dialog: { open: false } },
      keymap: {
        intercept: (_e: string, h: typeof handler) => {
          handler = h;
        },
        dispatchCommand: () => ({ ok: false }),
      },
      route: { current: { name: "home", params: {} } },
      state: { session: { question: () => [], permission: () => [] } },
      lifecycle: { onDispose: () => {} },
      kv: {},
    };

    // biome-ignore lint/suspicious/noExplicitAny: mock API
    await plugin.tui(api as any, { updateCheck: false } as any, undefined as any);

    // Returns whether the intercept consumed the key (i.e. called consume()).
    const press = (name: string, opts: Record<string, boolean> = {}) => {
      let consumed = false;
      handler?.({
        event: { name, eventType: "press", ...opts },
        consume: () => {
          consumed = true;
        },
      });
      return consumed;
    };

    press("escape"); // leave insert, enter normal mode
    return { press };
  }

  for (const arrow of ["up", "down", "left", "right"] as const) {
    it(`${arrow} in normal mode is not consumed, so the host handles it`, async () => {
      const { press } = await setup();
      expect(press(arrow)).toBe(false);
    });
  }

  it("a vim motion (j) is still consumed, proving the harness detects consumption", async () => {
    const { press } = await setup();
    expect(press("j")).toBe(true);
  });
});

// ── prompt overlay tracking (question.rejected leak) ──────

describe("prompt overlay tracking", () => {
  // The plugin tracks pending permission/question prompts via events so it can
  // pass keys through while an overlay owns the keyboard. Every "asked" must be
  // balanced by a terminal event, otherwise hasActivePrompts() stays true and
  // the plugin is stuck passing all keys (including Escape) to the host.
  async function setup() {
    const plugin = (await import("../src/index")).default;
    // biome-ignore lint/suspicious/noExplicitAny: test mock
    let handler: (ctx: any) => void;
    const events = new Map<string, (e: unknown) => void>();
    const sessions: Record<string, { parentID?: string }> = { root: {}, child: { parentID: "root" } };

    const api = {
      renderer: { currentFocusedEditor: undefined },
      ui: { toast: () => {}, dialog: { open: false } },
      keymap: {
        intercept: (_e: string, h: typeof handler) => {
          handler = h;
        },
        dispatchCommand: () => ({ ok: false }),
      },
      route: { current: { name: "session", params: { sessionID: "root" } } },
      state: {
        session: {
          get: (id: string) => sessions[id],
          question: () => [],
          permission: () => [],
        },
      },
      event: {
        on: (name: string, h: (e: unknown) => void) => {
          events.set(name, h);
          return () => events.delete(name);
        },
      },
      lifecycle: { onDispose: () => {} },
      kv: {},
    };

    // biome-ignore lint/suspicious/noExplicitAny: mock API
    await plugin.tui(api as any, { updateCheck: false } as any, undefined as any);

    const press = (name: string) => {
      let consumed = false;
      handler?.({
        event: { name, eventType: "press" },
        consume: () => {
          consumed = true;
        },
      });
      return consumed;
    };

    const emit = (name: string, properties: Record<string, unknown>) => events.get(name)?.({ properties });

    press("escape"); // leave insert, enter normal mode
    return { press, emit };
  }

  it("keys pass through while a question is pending, then resume after question.rejected", async () => {
    const { press, emit } = await setup();

    emit("question.asked", { id: "q1", sessionID: "root" });
    expect(press("h")).toBe(false);

    emit("question.rejected", { requestID: "q1", sessionID: "root" });
    expect(press("h")).toBe(true);
  });

  it("question.replied also resumes key consumption", async () => {
    const { press, emit } = await setup();

    emit("question.asked", { id: "q1", sessionID: "root" });
    expect(press("h")).toBe(false);

    emit("question.replied", { requestID: "q1", sessionID: "root" });
    expect(press("h")).toBe(true);
  });

  it("permission.replied resumes key consumption", async () => {
    const { press, emit } = await setup();

    emit("permission.asked", { id: "p1", sessionID: "root" });
    expect(press("h")).toBe(false);

    emit("permission.replied", { requestID: "p1", sessionID: "root" });
    expect(press("h")).toBe(true);
  });

  it("a prompt on a child session is tracked against its root", async () => {
    const { press, emit } = await setup();

    emit("question.asked", { id: "q1", sessionID: "child" });
    expect(press("h")).toBe(false);

    emit("question.rejected", { requestID: "q1", sessionID: "child" });
    expect(press("h")).toBe(true);
  });
});

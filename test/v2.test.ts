import { afterEach, describe, expect, it } from "bun:test";
import plugin from "../src/index";
import type { V2Context } from "../src/v2";

type Press = { name: string; ctrl?: boolean; shift?: boolean; eventType?: string };
type RawPressEvent = Press & { preventDefault(): void; stopPropagation(): void };
const cleanups: Array<() => void> = [];
afterEach(() => {
  for (const cleanup of cleanups.splice(0)) cleanup();
});

function host(options: Record<string, unknown> = {}, saved = { disabled: false, lastUpdateCheck: "" }) {
  const pressed: Array<(event: RawPressEvent) => void> = [];
  const commands: Array<{ id: string; run: () => void | Promise<void>; slash?: { name: string } }> = [];
  const dispatched: string[] = [];
  const toasts: string[] = [];
  const eventHandlers = new Map<
    string,
    (event: { data: { sessionID?: string; form?: { sessionID: string } } }) => void
  >();
  const pendingForms = new Map<string, unknown[]>();
  const pendingPermissions = new Map<string, unknown[]>();
  let mode = "base";
  let route: { type: string; sessionID?: string } = { type: "home" };
  let focused = true;
  let slotRender: (() => null) | undefined;
  let removedSlot = false;
  const selections: Array<[number, number]> = [];
  const editor = {
    editBuffer: { getTextRange: () => "l" },
    editorView: {
      resetSelection: () => {},
      setSelection: (start: number, end: number) => selections.push([start, end]),
    },
    setSelectionInclusive: (start: number, end: number) => selections.push([start, end + 1]),
    plainText: "hello",
    cursorOffset: 2,
    visualCursor: { logicalRow: 0 },
    cursorStyle: { style: "line", blinking: true },
    insertText(value: string) {
      this.plainText += value;
    },
  };
  const renderer = {
    currentFocusedEditor: editor,
    get currentFocusedRenderable() {
      return focused ? renderer.currentFocusedEditor : undefined;
    },
    keyInput: {
      prependListener(_name: "keypress", listener: (event: RawPressEvent) => void) {
        pressed.unshift(listener);
      },
      off(_name: "keypress", listener: (event: RawPressEvent) => void) {
        const index = pressed.indexOf(listener);
        if (index >= 0) pressed.splice(index, 1);
      },
    },
  };
  const context: V2Context = {
    options,
    renderer,
    keymap: {
      mode: { current: () => mode },
      dispatch: (id) => {
        dispatched.push(id);
        const current = renderer.currentFocusedEditor;
        if (id === "input.select.right") current.cursorOffset++;
        if (id === "input.select.left") current.cursorOffset = Math.max(0, current.cursorOffset - 1);
      },
      layer: (input) => {
        commands.push(...input().commands);
      },
    },
    storage: {
      store: <T extends object>(_key: string, _options: { initial: T }) => {
        const value = saved as unknown as T;
        return [
          value,
          async (update: (draft: T) => void) => {
            update(value);
          },
        ] as const;
      },
    },
    data: {
      on: (name, handler) => {
        eventHandlers.set(name, handler);
        return () => {
          eventHandlers.delete(name);
        };
      },
      session: {
        root: (id) => (id === "child" ? "root" : id),
        family: (id) => (id === "root" ? ["root", "child"] : [id]),
        form: { list: (id) => pendingForms.get(id) ?? [] },
        permission: { list: (id) => pendingPermissions.get(id) ?? [] },
      },
    },
    ui: {
      toast: {
        show: (input) => {
          toasts.push(input.message);
        },
      },
      router: { current: () => route },
      slot: ({ render }) => {
        slotRender = render;
        return () => {
          removedSlot = true;
        };
      },
    },
  };
  function press(name: string, flags: Omit<Press, "name"> = {}) {
    let prevented = false;
    let stopped = false;
    const event = {
      name,
      ...flags,
      preventDefault() {
        prevented = true;
      },
      stopPropagation() {
        stopped = true;
      },
    };
    for (const listener of [...pressed]) {
      listener(event);
      if (stopped) break;
    }
    return { prevented, stopped };
  }
  function emit(type: string, data: { sessionID?: string; form?: { sessionID: string } }) {
    eventHandlers.get(type)?.({ data });
  }
  return {
    context,
    press,
    emit,
    editor,
    selections,
    setEditor: (value: typeof editor) => {
      renderer.currentFocusedEditor = value;
    },
    commands,
    dispatched,
    toasts,
    saved,
    pendingForms,
    pendingPermissions,
    renderSlot: () => slotRender?.(),
    setMode: (value: string) => {
      mode = value;
    },
    setRoute: (value: typeof route) => {
      route = value;
    },
    setFocused: (value: boolean) => {
      focused = value;
    },
    get listenerCount() {
      return pressed.length;
    },
    get removedSlot() {
      return removedSlot;
    },
    get eventCount() {
      return eventHandlers.size;
    },
  };
}

async function start(mock: ReturnType<typeof host>) {
  const cleanup = await plugin.setup(mock.context);
  cleanups.push(cleanup);
  mock.renderSlot();
  return cleanup;
}

describe("OpenCode v2 POC facade", () => {
  it("one ./tui default export exposes both v1 tui and v2 setup without v2 runtime imports", () => {
    expect(plugin.id).toBe("vimcode");
    expect(plugin.tui).toBeFunction();
    expect(plugin.setup).toBeFunction();
  });

  it("consumes Escape and all unknown normal chars including Unicode before the host keymap", async () => {
    const mock = host({ updateCheck: false });
    await start(mock);
    expect(mock.listenerCount).toBe(1);
    expect(mock.press("escape")).toEqual({ prevented: true, stopped: true });
    expect(mock.press("🤖")).toEqual({ prevented: true, stopped: true });
    expect(mock.press("up")).toEqual({ prevented: false, stopped: false });
    expect(mock.press("h")).toEqual({ prevented: true, stopped: true });
    await Bun.sleep(20);
    expect(mock.dispatched).toContain("input.move.left");
    expect(mock.press("escape", { eventType: "release" })).toEqual({ prevented: false, stopped: false });
  });

  it("does not steal keys from other routes, unfocused editors, dialogs, forms or autocomplete in normal mode", async () => {
    const mock = host({ updateCheck: false });
    await start(mock);
    mock.press("escape");
    mock.setFocused(false);
    expect(mock.press("h").stopped).toBe(false);
    mock.setFocused(true);
    mock.setRoute({ type: "plugin" });
    expect(mock.press("h").stopped).toBe(false);
    mock.setRoute({ type: "home" });
    for (const mode of ["modal", "form", "autocomplete"]) {
      mock.setMode(mode);
      expect(mock.press("h").stopped).toBe(false);
    }
    mock.setMode("base");
    expect(mock.press("h").stopped).toBe(true);
  });

  it("inserts a printable leader into a focused form without interpreting other form keys as Vim commands", async () => {
    const mock = host({ updateCheck: false, experimentalV2Leader: "space" });
    await start(mock);
    mock.press("escape");
    mock.setMode("form");
    expect(mock.press("space")).toEqual({ prevented: true, stopped: true });
    expect(mock.editor.plainText).toBe("hello ");
    expect(mock.press("h").stopped).toBe(false);
    expect(mock.press("return").stopped).toBe(false);
    mock.setFocused(false);
    expect(mock.press("space").stopped).toBe(false);

    const disabled = host(
      { updateCheck: false, experimentalV2Leader: "space" },
      { disabled: true, lastUpdateCheck: "" },
    );
    await start(disabled);
    disabled.setMode("form");
    expect(disabled.press("space").stopped).toBe(false);
  });

  for (const initial of [false, true]) {
    it(`keeps controller and form disabled policy local after saved ${initial} -> ${!initial} reconciliation`, async () => {
      const mock = host(
        { updateCheck: false, startMode: "normal", experimentalV2Leader: "space" },
        { disabled: initial, lastUpdateCheck: "" },
      );
      await start(mock);
      mock.saved.disabled = !initial; // Another TUI reconciles the live store.
      expect(mock.press("z").stopped).toBe(!initial);
      mock.setMode("form");
      expect(mock.press("space").stopped).toBe(!initial);
      await mock.commands.find((command) => command.id === "vimcode.vim")?.run();
      expect(mock.saved.disabled).toBe(!initial);
      expect(mock.press("space").stopped).toBe(initial);
      mock.setMode("base");
      expect(mock.press("z").stopped).toBe(initial);
    });
  }

  it("re-anchors visual on a different editor before its first motion, counts and text objects", async () => {
    const mock = host({ updateCheck: false, startMode: "normal" });
    await start(mock);
    mock.editor.cursorOffset = 4;
    mock.press("v"); // Ownership must be captured here, before any motion.
    const second = { ...mock.editor, cursorOffset: 0 };
    mock.setEditor(second);
    mock.press("l");
    await Bun.sleep(20);
    expect(mock.selections).toEqual([[0, 2]]);
    expect(mock.editor.cursorOffset).toBe(4);
    mock.press("2");
    mock.press("l");
    await Bun.sleep(20);
    expect(mock.selections.at(-1)).toEqual([0, 4]);
    mock.press("h");
    await Bun.sleep(20);
    expect(mock.selections.at(-1)).toEqual([0, 3]);
    mock.press("i");
    mock.press("w");
    expect(mock.selections.at(-1)).toEqual([0, 5]);
  });

  it("does not normalize or dispatch a queued visual motion after focus loss, overlay or disposal", async () => {
    for (const change of ["editor", "overlay", "dispose"]) {
      const mock = host({ updateCheck: false, startMode: "normal" });
      const dispose = await start(mock);
      mock.press("v");
      mock.press("l");
      if (change === "editor") mock.setEditor({ ...mock.editor, cursorOffset: 0 });
      if (change === "overlay") mock.setMode("form");
      if (change === "dispose") dispose();
      await Bun.sleep(20);
      expect(mock.selections).toEqual([]);
      expect(mock.dispatched).not.toContain("input.select.right");
    }
  });

  it("uses host autocomplete state for Enter/Escape in insert mode without intercepting typed keys", async () => {
    const mock = host({ updateCheck: false });
    await start(mock);
    mock.setMode("autocomplete");
    expect(mock.press("a").stopped).toBe(false);
    expect(mock.press("return").stopped).toBe(true);
    expect(mock.dispatched).toContain("prompt.autocomplete.select");
    expect(mock.press("escape").stopped).toBe(true);
    expect(mock.dispatched).toContain("prompt.autocomplete.hide");
    mock.setMode("base");
    expect(mock.press("escape").stopped).toBe(true);
    expect(mock.toasts).toContain("NORMAL");
  });

  it("passes a matching space leader and next key in normal, inserts it in insert; disabling mirror consumes it", async () => {
    const mock = host({ updateCheck: false, experimentalV2Leader: "space" });
    await start(mock);
    expect(mock.press("space").stopped).toBe(true);
    expect(mock.editor.plainText).toBe("hello ");
    mock.press("escape");
    expect(mock.press("space").stopped).toBe(false);
    expect(mock.press("h").stopped).toBe(false);
    expect(mock.press("h").stopped).toBe(true);
    const noLeader = host({ updateCheck: false, experimentalV2Leader: false });
    await start(noLeader);
    noLeader.press("escape");
    expect(noLeader.press("space").stopped).toBe(true);
  });

  it("passes default ctrl+x leader and maps v2 form/permission events for child sessions", async () => {
    const mock = host({ updateCheck: false });
    await start(mock);
    mock.press("escape");
    expect(mock.press("x", { ctrl: true }).stopped).toBe(false);
    expect(mock.press("h").stopped).toBe(false);
    mock.setRoute({ type: "session", sessionID: "root" });
    mock.emit("form.created", { form: { sessionID: "child" } });
    expect(mock.press("h").stopped).toBe(false);
    mock.emit("form.cancelled", { sessionID: "child" });
    expect(mock.press("h").stopped).toBe(true);
    mock.emit("form.created", { form: { sessionID: "child" } });
    mock.emit("form.replied", { sessionID: "child" });
    expect(mock.press("h").stopped).toBe(true);
    mock.pendingPermissions.set("child", [{}]);
    expect(mock.press("h").stopped).toBe(false);
    mock.pendingPermissions.delete("child");
    mock.emit("permission.asked", { sessionID: "child" });
    expect(mock.press("h").stopped).toBe(false);
    mock.emit("permission.replied", { sessionID: "child" });
    expect(mock.press("h").stopped).toBe(true);
  });

  it("registers v2 palette/slash commands with an app slot owner, persists toggle and removes resources", async () => {
    const saved = { disabled: true, lastUpdateCheck: "" };
    const mock = host({ updateCheck: false }, saved);
    const cleanup = await start(mock);
    expect(mock.toasts).toContain("Vim mode disabled (use /vim to re-enable)");
    expect(mock.press("escape").stopped).toBe(false);
    expect(mock.commands.map((command) => command.id)).toContain("vimcode.vim");
    expect(mock.commands.find((command) => command.id === "vimcode.write")?.slash?.name).toBe("write");
    await mock.commands.find((command) => command.id === "vimcode.write")?.run();
    await Bun.sleep(20);
    expect(mock.dispatched).toContain("input.submit");
    await mock.commands.find((command) => command.id === "vimcode.vim")?.run();
    expect(mock.saved.disabled).toBe(false);
    expect(mock.press("escape").stopped).toBe(true);
    cleanup();
    cleanup();
    expect(mock.listenerCount).toBe(0);
    expect(mock.eventCount).toBe(0);
    expect(mock.removedSlot).toBe(true);
    expect(mock.press("h").stopped).toBe(false);
  });
});

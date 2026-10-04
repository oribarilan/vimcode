import { afterEach, describe, expect, it } from "bun:test";
import type { TuiPluginApi } from "@opencode-ai/plugin/tui";
import type { KeyInputContext, KeyInterceptOptions } from "@opentui/keymap";
import { registerEnabledFields, registerLeader } from "@opentui/keymap/addons";
import { createTestKeymap, TestKeymapEvent } from "@opentui/keymap/testing";
import plugin from "../src/index";

const disposals: Array<() => void | Promise<void>> = [];
const flushCommands = () => new Promise<void>((resolve) => setTimeout(resolve, 0));

// Let deferred prompt commands finish before disposing their keymap.
afterEach(async () => {
  await flushCommands();
  for (const dispose of disposals.splice(0).reverse()) await dispose();
});

// Exact remappings from #79. The host layer below models OpenCode v1's
// navigation commands; parsing, leader sequences, and dispatch are real OpenTUI.
const keybinds = {
  leader: ",",
  session_child_first: "<leader>j",
  session_parent: "k",
  session_child_cycle: "l",
  session_child_cycle_reverse: "h",
};

async function setup(loadPlugin = true) {
  const { keymap, host, cleanup, diagnostics } = createTestKeymap({ defaultKeys: true });
  disposals.push(cleanup);
  registerEnabledFields(keymap);
  registerLeader(keymap, { trigger: keybinds.leader });

  const sessions: Record<string, { parentID?: string }> = {
    root: {},
    "child-1": { parentID: "root" },
    "child-2": { parentID: "root" },
  };
  const route = { current: { name: "session", params: { sessionID: "root" } } };
  const promptTarget = host.rootTarget.append(host.createTarget("prompt"));
  const editor = {
    plainText: "hello world",
    cursorOffset: 0,
    visualCursor: { logicalRow: 0, logicalCol: 0 },
    cursorStyle: { style: "block", blinking: true },
  };
  const promptCommands: string[] = [];
  const hostCommands: string[] = [];
  let intercept: ((ctx: KeyInputContext<TestKeymapEvent>) => void) | undefined;

  function navigate(sessionID: string) {
    route.current.params.sessionID = sessionID;
    host.focus(sessionID === "root" ? promptTarget : null);
  }
  navigate("root");

  keymap.registerLayer({
    commands: [
      {
        name: "session.child.first",
        run: () => {
          hostCommands.push("session.child.first");
          navigate("child-1");
        },
      },
      {
        name: "session.parent",
        enabled: () => !!sessions[route.current.params.sessionID]?.parentID,
        run: () => {
          hostCommands.push("session.parent");
          navigate("root");
        },
      },
      ...["next", "previous"].map((direction) => ({
        name: `session.child.${direction}`,
        enabled: () => !!sessions[route.current.params.sessionID]?.parentID,
        run: () => {
          hostCommands.push(`session.child.${direction}`);
          navigate(route.current.params.sessionID === "child-1" ? "child-2" : "child-1");
        },
      })),
    ],
    bindings: [
      { key: keybinds.session_child_first, cmd: "session.child.first" },
      { key: keybinds.session_parent, cmd: "session.parent" },
      { key: keybinds.session_child_cycle, cmd: "session.child.next" },
      { key: keybinds.session_child_cycle_reverse, cmd: "session.child.previous" },
    ],
  });

  const api = {
    renderer: {
      get currentFocusedEditor() {
        return route.current.params.sessionID === "root" ? editor : undefined;
      },
    },
    ui: { toast: () => {}, dialog: { open: false } },
    keymap: {
      intercept: (
        name: "key",
        handler: (ctx: KeyInputContext<TestKeymapEvent>) => void,
        options?: KeyInterceptOptions,
      ) => {
        intercept = handler;
        const unregister = keymap.intercept(name, handler, options);
        disposals.push(unregister);
        return unregister;
      },
      registerLayer: (layer: Parameters<typeof keymap.registerLayer>[0]) => keymap.registerLayer(layer),
      dispatchCommand: (command: string) => {
        promptCommands.push(command);
        return keymap.dispatchCommand(command);
      },
    },
    tuiConfig: {
      keybinds: {
        get: (name: string) => {
          const key = keybinds[name as keyof typeof keybinds];
          return key ? [{ key }] : [];
        },
      },
    },
    route,
    state: { session: { get: (id: string) => sessions[id], question: () => [], permission: () => [] } },
    lifecycle: {
      onDispose: (dispose: () => void | Promise<void>) => {
        disposals.push(dispose);
      },
    },
    kv: {},
  };

  if (loadPlugin) {
    await plugin.tui(api as unknown as TuiPluginApi, {
      startMode: "normal",
      modeIndicator: "none",
      updateCheck: false,
    });
  }

  function pressIntercept(name: string) {
    if (!intercept) throw new Error("Plugin did not register its key intercept");
    let consumed = false;
    intercept({
      event: new TestKeymapEvent(name),
      consume: () => {
        consumed = true;
      },
      setData: (key, value) => keymap.setData(key, value),
      getData: (key) => keymap.getData(key),
    });
    return consumed;
  }

  return { api, diagnostics, host, hostCommands, navigate, pressIntercept, promptCommands, route };
}

describe("#79 — child-session key intercept", () => {
  for (const key of ["h", "k", "l"]) {
    it(`${key} passes through in a child session and normal mode survives returning to the parent`, async () => {
      const { api, navigate, pressIntercept, promptCommands } = await setup();
      expect(pressIntercept(",")).toBe(false);
      expect(pressIntercept("j")).toBe(false);
      navigate("child-1");
      expect(api.renderer.currentFocusedEditor).toBeUndefined();

      expect(pressIntercept(key)).toBe(false);
      await flushCommands();
      expect(promptCommands).toEqual([]);

      navigate("root");
      expect(pressIntercept("h")).toBe(true);
      await flushCommands();
      expect(promptCommands).toEqual(["input.move.left"]);
    });
  }

  it("suspends visual mode in child sessions without changing the mode on return", async () => {
    const { navigate, pressIntercept, promptCommands } = await setup();
    expect(pressIntercept("v")).toBe(true);
    navigate("child-1");
    for (const key of ["escape", "i", "h", "k", "l"]) expect(pressIntercept(key)).toBe(false);
    await flushCommands();
    expect(promptCommands).toEqual([]);

    navigate("root");
    expect(pressIntercept("j")).toBe(true);
    await flushCommands();
    expect(promptCommands).toEqual(["input.select.down"]);
  });

  it("still consumes prompt motions in the parent session", async () => {
    const { pressIntercept, promptCommands } = await setup();
    expect(pressIntercept("h")).toBe(true);
    await flushCommands();
    expect(promptCommands).toEqual(["input.move.left"]);
  });

  it("suspends insert handling in child sessions without changing the mode on return", async () => {
    const { navigate, pressIntercept, promptCommands } = await setup();
    expect(pressIntercept("i")).toBe(true);
    navigate("child-1");
    for (const key of ["escape", "return", "tab", ",", "h", "k", "l"]) expect(pressIntercept(key)).toBe(false);
    await flushCommands();
    expect(promptCommands).toEqual([]);

    navigate("root");
    expect(pressIntercept("z")).toBe(false);
  });
});

describe("#79 — real OpenTUI keymap dispatch", () => {
  it("the issue's bindings navigate children and return to the parent without vimcode", async () => {
    const { diagnostics, host, hostCommands, route } = await setup(false);
    host.press(",");
    host.press("j");
    expect(route.current.params.sessionID).toBe("child-1");
    host.press("l");
    expect(route.current.params.sessionID).toBe("child-2");
    host.press("h");
    expect(route.current.params.sessionID).toBe("child-1");
    host.press("k");
    expect(route.current.params.sessionID).toBe("root");
    expect(hostCommands).toEqual([
      "session.child.first",
      "session.child.next",
      "session.child.previous",
      "session.parent",
    ]);
    expect(diagnostics.errors).toEqual([]);
  });

  it(",j i k reproduces the existing workaround for returning to the parent", async () => {
    const { diagnostics, host, hostCommands, promptCommands, route } = await setup();
    host.press(",");
    host.press("j");
    expect(route.current.params.sessionID).toBe("child-1");
    host.press("i");
    host.press("k");
    expect(route.current.params.sessionID).toBe("root");
    expect(hostCommands).toEqual(["session.child.first", "session.parent"]);
    await flushCommands();
    expect(promptCommands).toEqual([]);
    expect(diagnostics.errors).toEqual([]);
  });

  for (const [key, command, target] of [
    ["h", "session.child.previous", "child-2"],
    ["k", "session.parent", "root"],
    ["l", "session.child.next", "child-2"],
  ]) {
    it(`,j then ${key} runs ${command} without switching to insert mode`, async () => {
      const { diagnostics, host, hostCommands, promptCommands, route } = await setup();
      host.press(",");
      host.press("j");
      expect(route.current.params.sessionID).toBe("child-1");
      expect(hostCommands).toEqual(["session.child.first"]);
      expect(diagnostics.errors).toEqual([]);

      host.press(key);
      expect(route.current.params.sessionID).toBe(target);
      expect(hostCommands).toEqual(["session.child.first", command]);
      await flushCommands();
      expect(promptCommands).toEqual([]);
      expect(diagnostics.errors).toEqual([]);
    });
  }
});

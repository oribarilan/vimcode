import { mock } from "bun:test";
import type { TuiPluginApi } from "@opencode-ai/plugin/tui";
import { registerEnabledFields, registerLeader } from "@opentui/keymap/addons";
import { createTestKeymap, type TestKeyModifierOptions, TestKeymapEvent } from "@opentui/keymap/testing";
import plugin from "../src/index";
import type { V2Context } from "../src/v2";

// Exercise register actions without reading or writing the desktop clipboard.
export const clipboardWrites: string[] = [];
mock.module("../src/clipboard", () => ({
  writeClipboard(text: string) {
    clipboardWrites.push(text);
  },
}));

type PasteMetadata = Parameters<TuiPluginApi["renderer"]["keyInput"]["processPaste"]>[1];
type PasteInputEvent = {
  bytes: Uint8Array;
  metadata?: PasteMetadata;
  defaultPrevented: boolean;
  propagationStopped: boolean;
  preventDefault(): void;
  stopPropagation(): void;
};

export function answerEditor(text = "hello world", status = "ANSWER") {
  let selection: { start: number; end: number } | undefined;
  const editor = {
    traits: { status },
    plainText: text,
    cursorOffset: text.length,
    cursorStyle: { style: "block", blinking: true },
    get visualCursor() {
      return { logicalRow: editor.plainText.slice(0, editor.cursorOffset).split("\n").length - 1 };
    },
    insertText(value: string) {
      editor.plainText =
        editor.plainText.slice(0, editor.cursorOffset) + value + editor.plainText.slice(editor.cursorOffset);
      editor.cursorOffset += value.length;
    },
    setSelectionInclusive(start: number, end: number) {
      selection = { start, end: end + 1 };
    },
    editorView: {
      resetSelection() {
        selection = undefined;
      },
      setSelection(start: number, end: number) {
        selection = { start, end };
      },
      getSelectedText() {
        return selection ? editor.plainText.slice(selection.start, selection.end) : "";
      },
    },
    editBuffer: {
      getTextRange(start: number, end: number) {
        return editor.plainText.slice(start, end);
      },
      setText(value: string) {
        editor.plainText = value;
      },
      deleteRange(sl: number, sc: number, el: number, ec: number) {
        const lines = editor.plainText.split("\n");
        const start = lines.slice(0, sl).reduce((n, line) => n + line.length + 1, 0) + sc;
        const end = lines.slice(0, el).reduce((n, line) => n + line.length + 1, 0) + ec;
        editor.plainText = editor.plainText.slice(0, start) + editor.plainText.slice(end);
        editor.cursorOffset = start;
      },
    },
    command(command: string) {
      const offset = editor.cursorOffset;
      if (command === "input.move.left") editor.cursorOffset = Math.max(0, offset - 1);
      if (command === "input.move.right") editor.cursorOffset = Math.min(editor.plainText.length, offset + 1);
      if (command === "input.select.right" || command === "input.select.left") {
        editor.cursorOffset = Math.max(
          0,
          Math.min(editor.plainText.length, offset + (command.endsWith("right") ? 1 : -1)),
        );
        selection = { start: Math.min(offset, editor.cursorOffset), end: Math.max(offset, editor.cursorOffset) };
      }
      if (command === "input.delete")
        editor.plainText = editor.plainText.slice(0, offset) + editor.plainText.slice(offset + 1);
      if (command === "input.backspace" && selection) {
        editor.plainText = editor.plainText.slice(0, selection.start) + editor.plainText.slice(selection.end);
        editor.cursorOffset = selection.start;
        selection = undefined;
      }
    },
    get selection() {
      return selection;
    },
  };
  return editor;
}

export async function questionHost(version: "v1" | "v2", options: Record<string, unknown> = {}) {
  const { keymap, host, diagnostics, cleanup } = createTestKeymap({ defaultKeys: true });
  registerEnabledFields(keymap);
  registerLeader(keymap, { trigger: "space" });
  const disposals: Array<() => void> = [cleanup];
  const rawListeners: Array<(event: TestKeymapEvent) => void> = [];
  const pasteListeners: Array<(event: PasteInputEvent) => void> = [];
  function prependInput(event: "keypress", listener: (event: TestKeymapEvent) => void): void;
  function prependInput(event: "paste", listener: (event: PasteInputEvent) => void): void;
  function prependInput(
    event: "keypress" | "paste",
    listener: ((event: TestKeymapEvent) => void) | ((event: PasteInputEvent) => void),
  ) {
    if (event === "keypress") rawListeners.unshift(listener as (event: TestKeymapEvent) => void);
    else pasteListeners.unshift(listener as (event: PasteInputEvent) => void);
  }
  function removeInput(event: "keypress", listener: (event: TestKeymapEvent) => void): void;
  function removeInput(event: "paste", listener: (event: PasteInputEvent) => void): void;
  function removeInput(
    event: "keypress" | "paste",
    listener: ((event: TestKeymapEvent) => void) | ((event: PasteInputEvent) => void),
  ) {
    if (event === "keypress") {
      const index = rawListeners.indexOf(listener as (event: TestKeymapEvent) => void);
      if (index >= 0) rawListeners.splice(index, 1);
    } else {
      const index = pasteListeners.indexOf(listener as (event: PasteInputEvent) => void);
      if (index >= 0) pasteListeners.splice(index, 1);
    }
  }
  const commands: Array<{ id: string; run(): void | Promise<void> }> = [];
  const dispatched: string[] = [];
  const hostActions: string[] = [];
  const committedAnswers: string[] = [];
  const navigatedAnswers: string[] = [];
  const paletteSubmissions: string[] = [];
  const pasteReplays: Array<{ text: string; metadata?: PasteMetadata }> = [];
  const toasts: string[] = [];
  const events = new Map<string, (event: { properties: { sessionID: string } }) => void>();
  const main = answerEditor("main prompt", "PROMPT");
  const renderer = {
    currentFocusedEditor: main as ReturnType<typeof answerEditor> | undefined,
    currentFocusedRenderable: main as object | undefined,
    keyInput: {
      prependListener: prependInput,
      off: removeInput,
      processParsedKey(event: TestKeyModifierOptions & { name: string }) {
        press(event.name, event);
        return true;
      },
      processPaste(bytes: Uint8Array, metadata?: PasteMetadata) {
        const text = new TextDecoder().decode(bytes);
        pasteReplays.push({ text, metadata });
        paste(text, metadata);
      },
    },
  };
  let mode = "base";
  let sessionID = "root";
  let question = false;
  let permission = false;
  let dialog = false;
  let paletteReturn: { editor: ReturnType<typeof answerEditor> | undefined; mode: string } | undefined;
  keymap.registerLayer({
    commands: [
      {
        name: "command.palette.show",
        run() {
          paletteReturn = { editor: renderer.currentFocusedEditor, mode };
          function openPalette() {
            dialog = true;
            mode = "modal";
            const input = answerEditor("", "PALETTE");
            if (options.delayedPalette) queueMicrotask(() => focus(input));
            else focus(input);
            hostActions.push("palette");
          }
          if (options.delayedPalette) queueMicrotask(openPalette);
          else openPalette();
        },
      },
    ],
  });
  keymap.registerLayer({
    enabled: () => mode === "modal" && paletteReturn !== undefined,
    commands: [
      {
        name: "palette.input",
        run() {
          hostActions.push("palette:h");
        },
      },
      {
        name: "palette.submit",
        run() {
          hostActions.push("palette:submit");
          paletteSubmissions.push(renderer.currentFocusedEditor?.plainText ?? "");
        },
      },
      {
        name: "palette.close",
        run() {
          if (!paletteReturn) throw new Error("Palette not open");
          dialog = false;
          mode = paletteReturn.mode;
          focus(paletteReturn.editor);
          paletteReturn = undefined;
        },
      },
    ],
    bindings: [
      { key: "h", cmd: "palette.input" },
      { key: "return", cmd: "palette.submit" },
      { key: "escape", cmd: "palette.close" },
    ],
  });
  const settings = { disabled: options.disabled === true, lastUpdateCheck: "" };
  const inputTarget = host.rootTarget.append(host.createTarget("editor"));
  host.focus(inputTarget);
  const isEditing = () => mode === (version === "v1" ? "question" : "form") && !!renderer.currentFocusedEditor;
  keymap.registerLayer({
    enabled: isEditing,
    commands: [
      {
        name: "answer.commit",
        run() {
          hostActions.push("commit");
          committedAnswers.push(renderer.currentFocusedEditor?.plainText ?? "");
          focus(undefined);
        },
      },
      {
        name: "answer.cancel",
        run() {
          hostActions.push("cancel");
          focus(undefined);
        },
      },
      {
        name: "answer.tab",
        run() {
          hostActions.push("tab");
          navigatedAnswers.push(renderer.currentFocusedEditor?.plainText ?? "");
          focus(undefined);
        },
      },
    ],
    bindings: [
      { key: "return", cmd: "answer.commit" },
      { key: "ctrl+return", cmd: "answer.commit" },
      { key: "escape", cmd: "answer.cancel" },
      { key: "tab", cmd: "answer.tab" },
    ],
  });
  keymap.registerLayer({
    commands: [
      "input.move.left",
      "input.move.right",
      "input.move.down",
      "input.move.up",
      "input.select.left",
      "input.select.right",
      "input.delete",
      "input.backspace",
      "input.undo",
    ].map((name) => ({
      name,
      run() {
        renderer.currentFocusedEditor?.command(name);
      },
    })),
  });
  const dispatch = (command: string) => {
    dispatched.push(command);
    return keymap.dispatchCommand(command);
  };
  const api = {
    renderer,
    keymap: {
      intercept: keymap.intercept.bind(keymap),
      dispatchCommand: dispatch,
      mode: options.noHostMode ? undefined : { current: () => mode },
      registerLayer(input: { commands: Array<{ name: string; run(): void | Promise<void> }> }) {
        commands.push(...input.commands.map((command) => ({ id: command.name, run: command.run })));
      },
    },
    ui: {
      toast(input: { message: string }) {
        toasts.push(input.message);
      },
      dialog: {
        get open() {
          return dialog;
        },
      },
    },
    route: {
      get current() {
        return { name: "session", params: { sessionID } };
      },
    },
    state: {
      session: {
        get(id: string) {
          return id === "child" ? { parentID: "root" } : {};
        },
        question: () => (question ? [{}] : []),
        permission: () => (permission ? [{}] : []),
      },
    },
    kv: {
      get: async () => settings.disabled,
      set: async (_key: string, value: unknown) => {
        settings.disabled = value === true;
      },
    },
    event: {
      on(name: string, handler: (event: { properties: { sessionID: string } }) => void) {
        events.set(name, handler);
        return () => {
          events.delete(name);
        };
      },
    },
    lifecycle: {
      onDispose(dispose: () => void) {
        disposals.push(dispose);
      },
    },
    tuiConfig: { keybinds: { get: () => [{ key: "space" }] } },
  };
  if (version === "v1") await plugin.tui(api as unknown as TuiPluginApi, { updateCheck: false, ...options });
  else {
    const context: V2Context = {
      options: { updateCheck: false, experimentalV2Leader: "space", ...options },
      renderer,
      keymap: {
        dispatch,
        mode: { current: () => mode },
        layer(input) {
          commands.push(...input().commands);
        },
      },
      storage: {
        store<T extends object>() {
          return [
            settings as unknown as T,
            async (update: (value: T) => void) => update(settings as unknown as T),
          ] as const;
        },
      },
      data: {
        on: () => () => {},
        session: {
          root: (id) => (id === "child" ? "root" : id),
          family: () => ["root", "child"],
          form: { list: () => (question ? [{}] : []) },
          permission: { list: () => (permission ? [{}] : []) },
        },
      },
      ui: {
        toast: { show: api.ui.toast },
        router: { current: () => ({ type: "session", sessionID }) },
        slot({ render }) {
          render();
          return () => {};
        },
      },
    };
    disposals.push(await plugin.setup(context));
  }
  function focus(editor: ReturnType<typeof answerEditor> | undefined) {
    renderer.currentFocusedEditor = editor;
    renderer.currentFocusedRenderable = editor;
  }
  function open(editor = answerEditor(), child = false) {
    question = true;
    mode = version === "v1" ? "question" : "form";
    sessionID = child ? "child" : "root";
    focus(editor);
    return editor;
  }
  function close() {
    question = false;
    mode = "base";
    sessionID = "root";
    focus(main);
  }
  function press(name: string, flags: TestKeyModifierOptions = {}) {
    let event = new TestKeymapEvent(name, flags);
    for (const listener of [...rawListeners]) {
      listener(event);
      if (event.propagationStopped) break;
    }
    if (!event.propagationStopped) event = host.press(name, flags);
    if (
      !event.propagationStopped &&
      !event.defaultPrevented &&
      name.length === 1 &&
      !flags.ctrl &&
      !flags.meta &&
      !flags.super
    ) {
      renderer.currentFocusedEditor?.insertText(name);
    }
    return event;
  }
  function paste(text: string, metadata?: PasteMetadata) {
    const event: PasteInputEvent = {
      bytes: new TextEncoder().encode(text),
      metadata,
      defaultPrevented: false,
      propagationStopped: false,
      preventDefault() {
        this.defaultPrevented = true;
      },
      stopPropagation() {
        this.propagationStopped = true;
      },
    };
    for (const listener of [...pasteListeners]) {
      listener(event);
      if (event.propagationStopped) break;
    }
    if (!event.propagationStopped && !event.defaultPrevented) renderer.currentFocusedEditor?.insertText(text);
    return event;
  }
  function dispose() {
    for (const fn of disposals.splice(0).reverse()) fn();
  }
  return {
    main,
    renderer,
    dispatched,
    hostActions,
    committedAnswers,
    navigatedAnswers,
    paletteSubmissions,
    pasteReplays,
    toasts,
    diagnostics,
    open,
    close,
    press,
    paste,
    focus,
    dispose,
    setMode(value: string) {
      mode = value;
    },
    setQuestion(value: boolean) {
      question = value;
    },
    setDialog(value: boolean) {
      dialog = value;
      mode = value ? "modal" : "base";
    },
    setPermission(value: boolean) {
      permission = value;
      mode = value ? "permission" : "base";
    },
    emit(name: string, sessionID = "root") {
      events.get(name)?.({ properties: { sessionID } });
    },
    async toggle() {
      await commands.find((command) => command.id === "vimcode.vim")?.run();
    },
  };
}

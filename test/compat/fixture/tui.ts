import { existsSync, readFileSync, renameSync, writeFileSync } from "node:fs";

type Editor = {
  id?: string;
  plainText: string;
  cursorOffset: number;
  visualCursor?: { logicalRow: number; logicalCol: number; offset: number };
  cursorStyle?: { style: string; blinking: boolean };
  getSelection?: () => { start: number; end: number } | null;
  clearSelection?: () => boolean;
  setText?: (text: string) => void;
  editBuffer?: { setText: (text: string) => void; getTextRange?: (start: number, end: number) => string };
  editorView?: {
    getSelection?: () => { start: number; end: number } | null;
    getSelectedText?: () => string;
    resetSelection: () => void;
  };
};
type Renderer = {
  currentFocusedEditor?: Editor;
  currentFocusedRenderable?: Editor;
  requestRender?: () => void;
  keyInput?: { listeners(event: "keypress"): readonly unknown[] };
};
type Options = { state: string; request: string; command: string; result: string; directory: string };
type Route = { type?: string; name?: string; sessionID?: string };
type V1Api = {
  renderer: Renderer;
  plugins: { list(): readonly { id: string; active: boolean }[] };
  route: { current: Route };
  mode?: { current(): string };
  lifecycle: { onDispose(fn: () => void): void };
};
type Session = { id: string; parentID?: string };
type Form = { id: string; state?: { status: string; answer?: Record<string, string> } };
type V2Api = {
  options: Options;
  renderer: Renderer;
  keymap: { commands(): readonly { id?: string }[]; mode: { current(): string }; pending(): readonly unknown[] };
  ui: {
    router: { current(): Route; navigate(route: { type: "session"; sessionID: string } | { type: "home" }): void };
  };
  client: {
    session: {
      create(input: {
        title: string;
        location: { directory: string };
        permissions: readonly { action: string; resource: string; effect: "ask" }[];
      }): Promise<Session>;
      export(input: { sessionID: string }): Promise<{ info: Session; messages: unknown[] }>;
      import(input: { info: Session; messages: unknown[]; location: { directory: string } }): Promise<Session>;
      form: {
        create(input: {
          sessionID: string;
          title: string;
          fields: readonly { key: string; type: "string"; title: string; required: true }[];
        }): Promise<Form>;
        get(input: { sessionID: string; formID: string }): Promise<Form>;
      };
    };
    permission: {
      create(input: {
        sessionID: string;
        action: string;
        resources: string[];
      }): Promise<{ id: string; effect: string }>;
      list(input: { sessionID: string }): Promise<unknown[]>;
    };
  };
};
type Request = { id: string; action: "seed"; text: string; offset: number } | { id: string; action: "observe" };
type Command = {
  id: string;
  action: "session" | "home" | "form" | "childForm" | "formState" | "permission" | "permissions";
};

function readRequest<T extends { id: string }>(file: string): T | undefined {
  if (!existsSync(file)) return;
  try {
    return JSON.parse(readFileSync(file, "utf8")) as T;
  } catch {
    // The runner writes atomically. A partial file indicates a test fault;
    // the runner times out with its last observed state rather than editing.
    return;
  }
}

function writeResult(file: string, value: unknown) {
  writeFileSync(`${file}.next`, JSON.stringify(value));
  renameSync(`${file}.next`, file);
}

function observe(
  renderer: Renderer,
  options: Options,
  ready: () => boolean,
  route: () => Route,
  mode: () => string,
  pending: () => readonly unknown[],
  extras?: (command: Command) => Promise<unknown>,
) {
  let applied: string | undefined;
  let observed: string | undefined;
  let responded: string | undefined;
  let afterSeed: unknown;
  let beforeSeed: unknown;
  let busy = false;
  let previous = "";
  const timer = setInterval(() => {
    const editor = renderer.currentFocusedEditor;
    const request = readRequest<Request>(options.request);
    if (request?.action === "observe") observed = request.id;
    if (
      request?.action === "seed" &&
      request.id !== applied &&
      editor &&
      editor === renderer.currentFocusedRenderable &&
      (mode() === "base" || mode() === "unknown")
    ) {
      beforeSeed = {
        text: editor.plainText,
        selection: editor.getSelection?.() ?? editor.editorView?.getSelection?.() ?? null,
      };
      // Use the renderable's public reset methods. Avoid leaving a stale
      // selection in the editorView when replacing the native edit buffer.
      editor.clearSelection?.();
      if (editor.setText) editor.setText(request.text);
      else editor.editBuffer?.setText(request.text);
      editor.cursorOffset = request.offset;
      editor.clearSelection?.();
      renderer.requestRender?.();
      afterSeed = {
        text: editor.plainText,
        selection: editor.getSelection?.() ?? editor.editorView?.getSelection?.() ?? null,
      };
      applied = request.id;
    }
    const command = readRequest<Command>(options.command);
    if (extras && command && command.id !== responded && !busy) {
      busy = true;
      responded = command.id;
      void extras(command)
        .then((result) => writeResult(options.result, { id: command.id, result }))
        .catch((error: unknown) => writeResult(options.result, { id: command.id, error: String(error) }))
        .finally(() => {
          busy = false;
        });
    }
    const cursor = editor?.visualCursor;
    const snapshot = {
      ready: ready(),
      applied,
      observed,
      ownsFocus: !!editor && editor === renderer.currentFocusedRenderable,
      beforeSeed,
      afterSeed,
      text: editor?.plainText ?? null,
      offset: editor?.cursorOffset ?? null,
      nextCell: editor?.editBuffer?.getTextRange?.(editor.cursorOffset, editor.cursorOffset + 1) ?? null,
      cursor: cursor ? { logicalRow: cursor.logicalRow, logicalCol: cursor.logicalCol, offset: cursor.offset } : null,
      selection: editor?.getSelection?.() ?? editor?.editorView?.getSelection?.() ?? null,
      selected: editor?.editorView?.getSelectedText?.() ?? null,
      cursorStyle: editor?.cursorStyle ?? null,
      keypressListeners: renderer.keyInput?.listeners("keypress").length ?? null,
      editorId: editor?.id ?? null,
      focusedId: renderer.currentFocusedRenderable?.id ?? null,
      mode: mode(),
      route: route(),
      pending: pending(),
    };
    const next = JSON.stringify(snapshot);
    if (next === previous) return;
    writeResult(options.state, snapshot);
    previous = next;
  }, 40);
  return () => clearInterval(timer);
}

export default {
  id: "vimcode-compat-fixture",
  async tui(api: V1Api, options: Options) {
    api.lifecycle.onDispose(
      observe(
        api.renderer,
        options,
        () => api.plugins.list().some((entry) => entry.id === "vimcode" && entry.active),
        () => api.route.current,
        () => api.mode?.current() ?? "unknown",
        () => [],
      ),
    );
  },
  setup(context: V2Api) {
    const api = context.client;
    let session: Session | undefined;
    let form: Form | undefined;
    const commands = async (command: Command) => {
      if (command.action === "session") {
        session = await api.session.create({
          title: "Synthetic vimcode compatibility test",
          location: { directory: context.options.directory },
          permissions: [{ action: "compat.fixture", resource: "*", effect: "ask" }],
        });
        context.ui.router.navigate({ type: "session", sessionID: session.id });
        return { sessionID: session.id };
      }
      if (command.action === "home") {
        context.ui.router.navigate({ type: "home" });
        return { home: true };
      }
      if (!session) throw new Error("Create a synthetic session first");
      if (command.action === "childForm") {
        const rootID = session.id;
        const transfer = await api.session.export({ sessionID: rootID });
        session = await api.session.import({
          info: {
            ...transfer.info,
            id: `ses_compat_child_${Date.now()}`,
            parentID: rootID,
            title: "Synthetic child form",
          },
          messages: [],
          location: { directory: context.options.directory },
        });
        context.ui.router.navigate({ type: "session", sessionID: rootID });
        form = await api.session.form.create({
          sessionID: session.id,
          title: "Synthetic child form",
          fields: [{ key: "answer", type: "string", title: "Child answer", required: true }],
        });
        return { rootID, childID: session.id, formID: form.id };
      }
      if (command.action === "form") {
        form = await api.session.form.create({
          sessionID: session.id,
          title: "Synthetic form",
          fields: [{ key: "answer", type: "string", title: "Answer", required: true }],
        });
        return { sessionID: session.id, formID: form.id };
      }
      if (command.action === "formState") {
        if (!form) throw new Error("Create a synthetic form first");
        return api.session.form.get({ sessionID: session.id, formID: form.id });
      }
      if (command.action === "permission")
        return api.permission.create({
          sessionID: session.id,
          action: "compat.fixture",
          resources: ["synthetic-resource"],
        });
      return api.permission.list({ sessionID: session.id });
    };
    return observe(
      context.renderer,
      context.options,
      () => context.keymap.commands().some((entry) => entry.id === "vimcode.vim"),
      () => context.ui.router.current(),
      () => context.keymap.mode.current(),
      () => context.keymap.pending(),
      commands,
    );
  },
};

import type { TuiPluginApi } from "@opencode-ai/plugin/tui";
import { findMatchingLeader, leaderChar } from "./leader";
import type { KeyEvent } from "./vim";

type V2EventName = "permission.asked" | "permission.replied" | "form.created" | "form.replied" | "form.cancelled";
type V2Event = { data: { sessionID?: string; form?: { sessionID: string } } };
type V2Settings = { disabled: boolean; lastUpdateCheck: string };
type V2Command = {
  id: string;
  title: string;
  description?: string;
  group: string;
  palette: true;
  slash?: { name: string };
  run: () => void | Promise<void>;
};
type V1Command = {
  name: string;
  title: string;
  desc?: string;
  category: string;
  slashName?: string;
  run: () => void | Promise<void>;
};
type RawKeyEvent = KeyEvent & { preventDefault(): void; stopPropagation(): void };

// Only the v2 surface used here is modeled. This structural boundary avoids a
// runtime dependency on either host's plugin package in the shared ./tui entry.
export type V2Context = {
  options: Readonly<Record<string, unknown>>;
  location?: unknown;
  renderer: {
    currentFocusedEditor?: unknown;
    currentFocusedRenderable?: unknown;
    keyInput: {
      prependListener(event: "keypress", handler: (key: RawKeyEvent) => void): void;
      off(event: "keypress", handler: (key: RawKeyEvent) => void): void;
    };
  };
  keymap: {
    dispatch(id: string): void;
    mode: { current(): string };
    layer(input: () => { mode: "global"; commands: V2Command[] }): void;
  };
  storage: {
    store<T extends object>(
      key: string,
      options: { initial: T },
    ): readonly [Readonly<T>, (update: (draft: T) => void) => Promise<void>];
  };
  data: {
    on(event: V2EventName, handler: (event: V2Event) => void): () => void;
    session: {
      root(sessionID: string): string;
      family(sessionID: string): string[];
      permission: { list(sessionID: string): unknown[] | undefined };
      form: { list(sessionID: string, location?: unknown): unknown[] | undefined };
    };
  };
  ui: {
    toast: {
      show(options: { message: string; variant?: "info" | "success" | "warning" | "error"; duration?: number }): void;
    };
    router: { current(): { type: string; sessionID?: string } };
    slot(claim: { append: "app"; render: () => null }): () => void;
  };
};

export function createV2Facade(context: V2Context): { api: TuiPluginApi; dispose: () => void } {
  const cleanups: Array<() => void> = [];
  let disposed = false;
  const dispose = () => {
    if (disposed) return;
    disposed = true;
    for (const cleanup of cleanups.reverse()) cleanup();
  };
  const own = (cleanup: () => void) => {
    let active = true;
    const once = () => {
      if (!active) return;
      active = false;
      cleanup();
    };
    cleanups.push(once);
    return once;
  };

  const [settings, updateSettings] = context.storage.store<V2Settings>("settings", {
    initial: { disabled: false, lastUpdateCheck: "" },
  });
  // Match the shared controller's per-activation snapshot. Other TUI writes
  // take effect on reload; only this activation's /vim toggle changes it now.
  let effectiveDisabled = settings.disabled;
  const config = context.options.experimentalV2Leader;
  const leader =
    config === undefined
      ? ["ctrl+x"]
      : config === false || config === "none"
        ? []
        : Array.isArray(config)
          ? config
          : [config];
  const leaders = leader.filter((key): key is string => typeof key === "string" && key !== "none");
  const members = (sessionID: string) => [...new Set([sessionID, ...context.data.session.family(sessionID)])];
  const v2Events: Record<string, V2EventName> = {
    "permission.asked": "permission.asked",
    "permission.replied": "permission.replied",
    "question.asked": "form.created",
    "question.replied": "form.replied",
    "question.rejected": "form.cancelled",
  };

  const facade = {
    renderer: context.renderer,
    keymap: {
      mode: context.keymap.mode,
      dispatchCommand(command: string) {
        if (disposed) return { ok: false };
        if (command.startsWith("prompt.autocomplete.") && context.keymap.mode.current() !== "autocomplete") {
          return { ok: false };
        }
        context.keymap.dispatch(command);
        return { ok: true };
      },
      registerLayer(input: { commands: V1Command[] }) {
        const commands: V2Command[] = input.commands.map((command) => ({
          id: command.name,
          title: command.title,
          description: command.desc,
          group: command.category,
          palette: true,
          ...(command.slashName ? { slash: { name: command.slashName } } : {}),
          run: command.run,
        }));
        // v2 layers require a Solid owner; the nonvisual app slot supplies one.
        own(
          context.ui.slot({
            append: "app",
            render: () => {
              context.keymap.layer(() => ({ mode: "global", commands }));
              return null;
            },
          }),
        );
      },
      intercept(type: string, handler: (input: { event: RawKeyEvent; consume(): void }) => void) {
        if (type !== "key") throw new Error(`Unsupported v2 key intercept: ${type}`);
        // POC: v2's public keymap does not expose intercept(). OpenTUI's
        // prependListener runs before the host keymap listener; both stop flags
        // are needed to keep consumed keys out of the keymap and textarea.
        const onKey = (event: RawKeyEvent) => {
          if (disposed || event.eventType === "release") return;
          const route = context.ui.router.current();
          const mode = context.keymap.mode.current();
          if (route.type !== "home" && route.type !== "session") return;
          const editor = context.renderer.currentFocusedEditor as { insertText?(text: string): void } | undefined;
          if (!editor || editor !== context.renderer.currentFocusedRenderable) return;
          // v2's leader token also matches inside textual forms. Insert its
          // character without running Vim commands against the form's input.
          if (mode === "form" && !effectiveDisabled) {
            const leader = findMatchingLeader(event, leaders);
            const character = leader && leaderChar(leader);
            if (character && editor.insertText) {
              event.preventDefault();
              event.stopPropagation();
              editor.insertText(character);
            }
            return;
          }
          if (mode !== "base" && mode !== "autocomplete") return;
          handler({
            event,
            consume: () => {
              event.preventDefault();
              event.stopPropagation();
            },
          });
        };
        context.renderer.keyInput.prependListener("keypress", onKey);
        return own(() => context.renderer.keyInput.off("keypress", onKey));
      },
    },
    ui: {
      toast: (input: { message: string; variant?: "info" | "success" | "warning" | "error"; duration?: number }) => {
        if (!disposed) context.ui.toast.show(input);
      },
      dialog: {
        get open() {
          const mode = context.keymap.mode.current();
          return mode !== "base" && mode !== "autocomplete";
        },
      },
    },
    route: {
      get current() {
        const route = context.ui.router.current();
        return { name: route.type, params: { sessionID: route.sessionID } };
      },
    },
    state: {
      session: {
        get: (sessionID: string) => {
          const rootID = context.data.session.root(sessionID);
          return { parentID: rootID === sessionID ? undefined : rootID };
        },
        question: (sessionID: string) =>
          members(sessionID).flatMap((id) => context.data.session.form.list(id, context.location) ?? []),
        permission: (sessionID: string) =>
          members(sessionID).flatMap((id) => context.data.session.permission.list(id) ?? []),
      },
    },
    event: {
      on(name: string, handler: (event: { properties: { sessionID?: string } }) => void) {
        const mapped = v2Events[name];
        if (!mapped) throw new Error(`Unsupported v2 event: ${name}`);
        return own(
          context.data.on(mapped, (event) => {
            if (!disposed) handler({ properties: { sessionID: event.data.form?.sessionID ?? event.data.sessionID } });
          }),
        );
      },
    },
    tuiConfig: { keybinds: { get: (name: string) => (name === "leader" ? leaders.map((key) => ({ key })) : []) } },
    kv: {
      get: async (key: string) =>
        key === "vimcode.disabled"
          ? effectiveDisabled
          : key === "lastUpdateCheck"
            ? settings.lastUpdateCheck
            : undefined,
      set: async (key: string, value: unknown) => {
        if (disposed) return;
        if (key === "vimcode.disabled") effectiveDisabled = value === true;
        await updateSettings((draft) => {
          if (key === "vimcode.disabled") draft.disabled = value === true;
          if (key === "lastUpdateCheck") draft.lastUpdateCheck = String(value);
        });
      },
    },
    lifecycle: { onDispose: (fn: () => void) => own(fn) },
  };

  // The v1 callback uses only the properties implemented above. The cast is
  // confined here; it does not claim this is a complete v1 TuiPluginApi.
  return { api: facade as unknown as TuiPluginApi, dispose };
}

// @ts-nocheck
/** @jsxImportSource @opentui/solid */
import type { TuiPluginModule } from "@opencode-ai/plugin/tui";
import { createSignal } from "solid-js";
import { writeClipboard } from "./clipboard";
import { checkForUpdate } from "./version";
import {
  type Action,
  createVimState,
  finishOneShotIfComplete,
  handleInsertKey,
  handleNormalKey,
  handleVisualKey,
  type Mode,
  matchesLeader,
  parseLeaderKey,
  translateKey,
} from "./vim";

const plugin: TuiPluginModule = {
  id: "vimcode",
  tui: async (api, options) => {
    const state = createVimState();
    const startMode = options?.startMode === "normal" ? "normal" : "insert";
    state.mode = startMode;
    const leader = options?.leader ? parseLeaderKey(options.leader) : null;

    // Resolve modeIndicator: "status" (default), "toast", or "none".
    // Backward compat: modeToast:false maps to "none", but only if
    // modeIndicator isn't explicitly set.
    const modeIndicator: "status" | "toast" | "none" =
      options?.modeIndicator === "status" || options?.modeIndicator === "toast" || options?.modeIndicator === "none"
        ? options.modeIndicator
        : options?.modeToast === false
          ? "none"
          : "status";

    // Reactive signal for mode — drives the badge indicator.
    const [mode, setMode] = createSignal<Mode>(startMode);

    if (modeIndicator === "status") {
      api.slots?.register?.({
        slots: {
          // biome-ignore lint/suspicious/noExplicitAny: slot context type comes from host
          session_prompt_right(ctx: any) {
            const m = mode();
            const color =
              m === "normal"
                ? ctx.theme.current.warning
                : m === "visual"
                  ? ctx.theme.current.primary
                  : ctx.theme.current.textMuted;
            const label = m === "(insert)" ? m : m.toUpperCase();
            return <text fg={color}>{label}</text>;
          },
          // biome-ignore lint/suspicious/noExplicitAny: slot context type comes from host
          home_prompt_right(ctx: any) {
            const m = mode();
            const color =
              m === "normal"
                ? ctx.theme.current.warning
                : m === "visual"
                  ? ctx.theme.current.primary
                  : ctx.theme.current.textMuted;
            const label = m === "(insert)" ? m : m.toUpperCase();
            return <text fg={color}>{label}</text>;
          },
        },
      });
    }

    // Track whether the previous key was the leader, so the follow-up
    // key also passes through to OpenCode's leader system.
    let leaderPending = false;
    let leaderTimer: ReturnType<typeof setTimeout> | null = null;

    // Snapshot for single-step undo of deleteRange operations.
    // The host editor's undo system splits multi-line deletions into
    // multiple entries, so we save/restore the buffer ourselves.
    let undoSnapshot: { text: string; cursor: number } | null = null;

    const prompt = {
      getLine: (n: number) => getInputText().split("\n")[n] ?? "",
      getLineCount: () => getInputText().split("\n").length,
      getCursorLine: () => api.renderer?.currentFocusedEditor?.visualCursor?.logicalRow ?? 0,
      getCursorOffset: () => api.renderer?.currentFocusedEditor?.cursorOffset ?? 0,
      getPlainText: () => getInputText(),
    };

    // api.prompt doesn't exist on the TUI plugin API. The actual text lives
    // on the focused editor exposed by the renderer.
    function getInputText(): string {
      return api.renderer?.currentFocusedEditor?.plainText ?? "";
    }

    function applyActions(actions: Action[]) {
      for (const action of actions) {
        // Any buffer-modifying action (other than our own deleteRange/undo)
        // invalidates the undo snapshot.
        if (action.type === "cmd" || action.type === "insertText") {
          undoSnapshot = null;
        }
        switch (action.type) {
          case "cmd":
            setTimeout(() => api.keymap.dispatchCommand(action.cmd), 0);
            break;
          case "mode":
            setMode(action.mode);
            if (modeIndicator === "toast") {
              api.ui?.toast?.({ message: action.mode.toUpperCase(), variant: "info", duration: 800 });
            }
            break;
          case "toast":
            api.ui?.toast?.({ message: action.message, variant: "info", duration: action.duration ?? 2000 });
            break;
          case "yank":
            writeClipboard(action.text);
            break;
          case "insertText":
            api.renderer?.currentFocusedEditor?.insertText?.(action.text);
            break;
          case "yankSelection": {
            // Deferred so it runs after any preceding select commands
            setTimeout(() => {
              const editor = api.renderer?.currentFocusedEditor;
              const text = editor?.editorView?.getSelectedText?.() ?? "";
              if (text) {
                state.yankRegister = text;
                writeClipboard(text);
                api.ui?.toast?.({ message: "yanked", variant: "info", duration: 1000 });
              }
              editor?.editorView?.resetSelection?.();
            }, 0);
            break;
          }
          case "clearSelection":
            api.renderer?.currentFocusedEditor?.editorView?.resetSelection?.();
            break;
          case "deleteRange": {
            const editor = api.renderer?.currentFocusedEditor;
            const eb = editor?.editBuffer;
            if (eb?.deleteRange) {
              undoSnapshot = { text: editor.plainText ?? "", cursor: editor.cursorOffset ?? 0 };
              const text = editor.plainText ?? "";
              const [sl, sc] = offsetToLineCol(text, action.start);
              const [el, ec] = offsetToLineCol(text, action.end + 1);
              eb.deleteRange(sl, sc, el, ec);
            }
            break;
          }
          case "undo": {
            if (undoSnapshot) {
              const editor = api.renderer?.currentFocusedEditor;
              const eb = editor?.editBuffer;
              if (eb?.setText && editor) {
                eb.setText(undoSnapshot.text);
                editor.cursorOffset = undoSnapshot.cursor;
              }
              undoSnapshot = null;
            } else {
              setTimeout(() => api.keymap.dispatchCommand("input.undo"), 0);
            }
            break;
          }
          case "cursorTo": {
            const editor = api.renderer?.currentFocusedEditor;
            if (editor) editor.cursorOffset = action.offset;
            break;
          }
          case "selectRange": {
            const editor = api.renderer?.currentFocusedEditor;
            editor?.setSelectionInclusive?.(action.start, action.end);
            break;
          }
        }
      }
    }

    function syncCursorStyle() {
      const editor = api.renderer?.currentFocusedEditor;
      if (!editor) return;
      editor.cursorStyle = { style: state.mode === "insert" ? "line" : "block", blinking: true };
    }

    // The Textarea resets cursorStyle during rendering, so re-apply on a
    // short interval. Setting a property is cheaper than the previous
    // approach of writing DECSCUSR escape sequences to stdout, and works
    // in terminals that don't support DECSCUSR (e.g. macOS Terminal.app).
    const cursorInterval = setInterval(syncCursorStyle, 100);
    api.lifecycle?.onDispose?.(() => clearInterval(cursorInterval));
    api.lifecycle?.onDispose?.(() => {
      if (leaderTimer) clearTimeout(leaderTimer);
    });

    if (options?.updateCheck !== false) {
      checkForUpdate((opts) => api.ui?.toast?.(opts), api.kv);
    }

    // Register vim ex-commands in the command palette so that
    // :q, :quit, and :wq work as expected.
    const quit = {
      category: "Vim",
      description: "Exit OpenCode",
      onSelect: () => setTimeout(() => api.keymap.dispatchCommand("app.exit"), 0),
    };
    api.command?.register?.(() => [
      { ...quit, title: "q", value: "vimcode.q" },
      { ...quit, title: "quit", value: "vimcode.quit" },
      { ...quit, title: "wq", value: "vimcode.wq" },
    ]);

    api.keymap.intercept(
      "key",
      (ctx) => {
        if (ctx.event.eventType === "release") return;

        // Pass through when any overlay owns the keyboard: dialogs (command
        // palette, session list, etc.), question prompts, or permission prompts.
        if (api.ui?.dialog?.open) return;
        const route = api.route.current;
        if (route.name === "session") {
          const sid = route.params?.sessionID;
          if (sid) {
            const q = api.state.session.question(sid);
            const p = api.state.session.permission(sid);
            if ((q && q.length > 0) || (p && p.length > 0)) return;
          }
        }

        // Let autocomplete handle Enter/Escape before vim consumes them.
        // dispatchCommand returns { ok } — true when the autocomplete layer
        // is active and handled the command, false when it's hidden/disabled.
        if (state.mode === "insert") {
          if (ctx.event.name === "escape") {
            const r = api.keymap.dispatchCommand("prompt.autocomplete.hide");
            if (r.ok) {
              ctx.consume();
              return;
            }
          }
          if (ctx.event.name === "return" && !ctx.event.ctrl) {
            const r = api.keymap.dispatchCommand("prompt.autocomplete.select");
            if (r.ok) {
              ctx.consume();
              return;
            }
          }
        }

        const key = translateKey(ctx.event);

        // In normal/visual mode, let the leader key and its follow-up
        // pass through so OpenCode's leader bindings work.
        if (leader && state.mode !== "insert") {
          if (leaderPending) {
            leaderPending = false;
            if (leaderTimer) clearTimeout(leaderTimer);
            return;
          }
          if (matchesLeader(ctx.event, leader)) {
            leaderPending = true;
            leaderTimer = setTimeout(() => {
              leaderPending = false;
            }, 2000);
            return;
          }
        }

        const handlerMode = state.mode;
        const result =
          state.mode === "insert"
            ? handleInsertKey(state, key, ctx.event, leader)
            : state.mode === "visual"
              ? handleVisualKey(state, key, ctx.event)
              : handleNormalKey(state, key, ctx.event, prompt);
        if (handlerMode === "normal") finishOneShotIfComplete(state, result);
        if (result.consume) ctx.consume();
        applyActions(result.actions);
      },
      { priority: 10_000 },
    );
  },
};

function offsetToLineCol(text: string, offset: number): [number, number] {
  const before = text.substring(0, offset);
  const lines = before.split("\n");
  return [lines.length - 1, lines[lines.length - 1].length];
}

export default plugin;

import type { TuiPluginApi, TuiPluginModule } from "@opencode-ai/plugin/tui";
import { writeClipboard } from "./clipboard";
import { createEditingContext, type EditingContext, hasAnswerFocus } from "./editing";
import { selectVisualCharacterRange } from "./editor";
import { findMatchingLeader, type KeyLike, leaderChar } from "./leader";
import { createV2Facade, type V2Context } from "./v2";
import { checkForUpdate } from "./version";
import {
  type Action,
  finishOneShotIfComplete,
  handleInsertKey,
  handleNormalKey,
  handleVisualKey,
  toggleVimMode,
  translateKey,
} from "./vim";

const plugin = {
  id: "vimcode",
  tui: async (api: TuiPluginApi, options?: Record<string, unknown>) => {
    const mainContext = createEditingContext();
    const state = mainContext.state;
    let answerContexts = new WeakMap<object, EditingContext>();
    let displayedContext = mainContext;
    const startMode = options?.startMode === "normal" ? "normal" : "insert";
    state.mode = startMode;
    const leaderKeys = resolveLeaderKeys();

    // Resolve modeIndicator: "toast" (default) or "none".
    // Backward compat: modeToast:false maps to "none", but only if
    // modeIndicator isn't explicitly set.
    const modeIndicator: "toast" | "none" =
      options?.modeIndicator === "toast" || options?.modeIndicator === "none"
        ? options.modeIndicator
        : options?.modeToast === false
          ? "none"
          : "toast";

    // Load persisted disabled state
    const persistedDisabled = (await api.kv?.get?.("vimcode.disabled")) as boolean | undefined;
    state.disabled = persistedDisabled ?? false;
    if (state.disabled) {
      api.ui?.toast?.({ message: "Vim mode disabled (use /vim to re-enable)", variant: "info", duration: 3000 });
    }

    // Keep handles for disposal even after an answer editor loses focus.
    const leaderTimers = new Set<ReturnType<typeof setTimeout>>();

    // Track pending permissions/questions from child sessions via events.
    // permission()/question() only covers one session ID, but subagent
    // prompts live on child IDs. Events fire globally; we aggregate by root.
    const pendingChildPrompts = new Map<string, number>();
    const pendingChildQuestions = new Map<string, number>();

    // biome-ignore lint/suspicious/noExplicitAny: event shape is untyped in the plugin API
    function trackPromptEvent(event: any, delta: number, question = false) {
      const sessionID = event?.properties?.sessionID ?? event?.sessionID;
      if (!sessionID) return;
      const session = api.state?.session?.get?.(sessionID);
      const rootId = session?.parentID ?? sessionID;
      const count = (pendingChildPrompts.get(rootId) ?? 0) + delta;
      if (count <= 0) pendingChildPrompts.delete(rootId);
      else pendingChildPrompts.set(rootId, count);
      if (question) {
        const questions = (pendingChildQuestions.get(rootId) ?? 0) + delta;
        if (questions <= 0) pendingChildQuestions.delete(rootId);
        else pendingChildQuestions.set(rootId, questions);
      }
    }

    // biome-ignore lint/suspicious/noExplicitAny: event shape is untyped in the plugin API
    const unsubPermsAsked = api.event?.on?.("permission.asked", (e: any) => trackPromptEvent(e, 1));
    // biome-ignore lint/suspicious/noExplicitAny: event shape is untyped in the plugin API
    const unsubPermsReplied = api.event?.on?.("permission.replied", (e: any) => trackPromptEvent(e, -1));
    // biome-ignore lint/suspicious/noExplicitAny: event shape is untyped in the plugin API
    const unsubQuestAsked = api.event?.on?.("question.asked", (e: any) => trackPromptEvent(e, 1, true));
    // biome-ignore lint/suspicious/noExplicitAny: event shape is untyped in the plugin API
    const unsubQuestReplied = api.event?.on?.("question.replied", (e: any) => trackPromptEvent(e, -1, true));
    // Dismissing a question emits question.rejected, not question.replied.
    // Without this the +1 from question.asked never balances and the plugin
    // stays stuck passing every key through to the host.
    // biome-ignore lint/suspicious/noExplicitAny: event shape is untyped in the plugin API
    const unsubQuestRejected = api.event?.on?.("question.rejected", (e: any) => trackPromptEvent(e, -1, true));
    api.lifecycle?.onDispose?.(() => {
      unsubPermsAsked?.();
      unsubPermsReplied?.();
      unsubQuestAsked?.();
      unsubQuestReplied?.();
      unsubQuestRejected?.();
    });

    function hasActivePrompts(sid: string): boolean {
      const q = api.state.session.question(sid);
      if (q && q.length > 0) return true;
      const p = api.state.session.permission(sid);
      if (p && p.length > 0) return true;
      return (pendingChildPrompts.get(sid) ?? 0) > 0;
    }

    let disposed = false;
    api.lifecycle?.onDispose?.(() => {
      disposed = true;
    });

    type HostKey = Parameters<TuiPluginApi["renderer"]["keyInput"]["processParsedKey"]>[0];
    type HostPaste = Parameters<TuiPluginApi["renderer"]["keyInput"]["processPaste"]>;
    type ConsumeEvent = { preventDefault(): void; stopPropagation(): void };
    type HostKeyEvent = HostKey & ConsumeEvent;
    type HostPasteEvent = ConsumeEvent & { bytes: HostPaste[0]; metadata?: HostPaste[1] };
    type HostInput = { type: "key"; value: HostKey } | { type: "paste"; value: HostPaste };
    // Local host declarations omit the inherited EventEmitter methods.
    const keyInput = api.renderer?.keyInput as
      | (TuiPluginApi["renderer"]["keyInput"] & {
          prependListener(event: "keypress", listener: (key: HostKeyEvent) => void): void;
          prependListener(event: "paste", listener: (paste: HostPasteEvent) => void): void;
          off(event: "keypress", listener: (key: HostKeyEvent) => void): void;
          off(event: "paste", listener: (paste: HostPasteEvent) => void): void;
        })
      | undefined;
    const canReplayInput =
      !!keyInput?.processParsedKey && !!keyInput?.processPaste && !!keyInput?.prependListener && !!keyInput?.off;
    let paletteHandoff: { source: unknown; target?: unknown; inputs: HostInput[]; deadline: number } | undefined;
    let paletteTimer: ReturnType<typeof setTimeout> | undefined;
    let replayingInput = false;

    function replayPaletteInput() {
      paletteTimer = undefined;
      const handoff = paletteHandoff;
      if (!handoff || disposed) return;
      const renderer = api.renderer;
      const target = renderer?.currentFocusedEditor;
      if (!handoff.target) {
        if (
          api.ui?.dialog?.open &&
          target &&
          target !== handoff.source &&
          target === renderer.currentFocusedRenderable
        ) {
          handoff.target = target;
        } else if (Date.now() < handoff.deadline) {
          paletteTimer = setTimeout(replayPaletteInput, 0);
          return;
        } else {
          paletteHandoff = undefined;
          api.ui?.toast?.({ message: "Command palette did not take focus", variant: "warning", duration: 2000 });
          return;
        }
      }
      if (!api.ui?.dialog?.open || target !== handoff.target || target !== renderer.currentFocusedRenderable) {
        paletteHandoff = undefined;
        return;
      }
      const input = handoff.inputs.shift();
      if (!input) {
        paletteHandoff = undefined;
        return;
      }
      // Reconstruct native events one per turn so dialog mounting and focus
      // changes settle, while preserving paste metadata and fresh flags.
      replayingInput = true;
      try {
        if (input.type === "key") keyInput?.processParsedKey(input.value);
        else keyInput?.processPaste(...input.value);
      } finally {
        replayingInput = false;
      }
      if (disposed || !handoff.inputs.length || !api.ui?.dialog?.open) paletteHandoff = undefined;
      else paletteTimer = setTimeout(replayPaletteInput, 0);
    }

    function hostMode(): string | undefined {
      return (
        (api.keymap as typeof api.keymap & { mode?: { current(): string } }).mode?.current() ?? api.mode?.current?.()
      );
    }

    function answerOwnsFocus(): boolean {
      const renderer = api.renderer;
      const route = api.route.current;
      if (!renderer || !hasAnswerFocus(renderer) || api.ui?.dialog?.open || route.name !== "session") return false;
      const mode = hostMode();
      if (mode) return mode === "question" || mode === "form";
      const sid = route.params?.sessionID;
      if (typeof sid !== "string") return false;
      const rootID = api.state.session.get?.(sid)?.parentID ?? sid;
      return !!api.state.session.question(sid)?.length || !!pendingChildQuestions.get(rootID);
    }

    function answerContextForFocus(): EditingContext | undefined {
      if (state.disabled || !answerOwnsFocus()) return;
      const editor = api.renderer.currentFocusedEditor;
      if (!editor) return;
      let context = answerContexts.get(editor);
      if (!context) {
        context = createEditingContext();
        answerContexts.set(editor, context);
      }
      return context;
    }

    function mainPromptBlocked(): boolean {
      const route = api.route.current;
      const mode = hostMode();
      if (api.ui?.dialog?.open || (mode && mode !== "base" && mode !== "autocomplete")) return true;
      if (route.name !== "session") return false;
      const sid = route.params?.sessionID;
      return typeof sid === "string" && (!!api.state.session.get?.(sid)?.parentID || hasActivePrompts(sid));
    }

    function showContext(context: EditingContext) {
      if (displayedContext === context) return;
      displayedContext = context;
      applyActions([{ type: "mode", mode: context.state.oneShotNormal ? "(insert)" : context.state.mode }], context);
    }

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

    // Read all configured leader keys from OpenCode's keybinds config.
    function resolveLeaderKeys(): KeyLike[] {
      const bindings = api.tuiConfig?.keybinds?.get?.("leader") ?? [];
      return bindings
        .map((b: { key?: unknown }) => b.key)
        .filter(
          (k: unknown): k is KeyLike =>
            !!k &&
            k !== "none" &&
            k !== "false" &&
            (typeof k === "string" ||
              (typeof k === "object" && typeof (k as Record<string, unknown>).name === "string")),
        );
    }

    function applyActions(actions: Action[], context = mainContext) {
      const state = context.state;
      const editor = api.renderer?.currentFocusedEditor;
      const route = api.route.current;
      const routeName = route.name;
      const sessionID = "params" in route ? route.params?.sessionID : undefined;
      const isAnswer = context !== mainContext;
      const stillOwnsEditor = () => {
        const renderer = api.renderer;
        const currentRoute = api.route.current;
        return (
          !disposed &&
          !mainContext.state.disabled &&
          !api.ui?.dialog?.open &&
          renderer?.currentFocusedEditor === editor &&
          (renderer?.currentFocusedRenderable === undefined || renderer.currentFocusedRenderable === editor) &&
          currentRoute.name === routeName &&
          ("params" in currentRoute ? currentRoute.params?.sessionID : undefined) === sessionID &&
          (isAnswer
            ? answerContextForFocus() === context
            : !mainPromptBlocked() && !answerContextForFocus() && !hasAnswerFocus(renderer ?? {}))
        );
      };
      function deferAction(run: () => void) {
        if (!isAnswer) {
          setTimeout(run, 0);
          return;
        }
        context.deferredActions.push(run);
        setTimeout(() => {
          const index = context.deferredActions.indexOf(run);
          if (index < 0) return;
          context.deferredActions.splice(index, 1);
          run();
        }, 0);
      }
      let keepUndoSnapshotForBatch = false;
      for (const action of actions) {
        // Buffer-modifying actions (cmd, insertText) clear the undo stack,
        // unless this batch includes a saveUndoSnapshot (which sets
        // keepUndoSnapshotForBatch to preserve the stack).
        if ((action.type === "cmd" || action.type === "insertText") && !keepUndoSnapshotForBatch) {
          context.undoSnapshots = [];
        }
        switch (action.type) {
          case "cmd": {
            const visualAnchor =
              state.mode === "visual" && (action.cmd === "input.select.left" || action.cmd === "input.select.right")
                ? state.visualAnchor
                : undefined;
            const visualEditor = visualAnchor === undefined ? undefined : editor;
            const command =
              isAnswer && action.cmd === "prompt.history.previous"
                ? "input.move.up"
                : isAnswer && action.cmd === "prompt.history.next"
                  ? "input.move.down"
                  : action.cmd;
            if (isAnswer && action.cmd === "prompt.paste") {
              if (state.yankRegister) editor?.insertText?.(state.yankRegister);
              break;
            }
            const globalCommand = command === "command.palette.show";
            if (isAnswer && globalCommand && canReplayInput) {
              paletteHandoff = { source: editor, inputs: [], deadline: Date.now() + 1000 };
            }
            if (
              isAnswer &&
              (command === "input.submit" || command.startsWith("prompt.") || command.startsWith("session."))
            )
              break;
            deferAction(() => {
              if (
                (globalCommand ? disposed : !stillOwnsEditor()) ||
                (visualEditor &&
                  (api.ui?.dialog?.open ||
                    api.renderer?.currentFocusedEditor !== visualEditor ||
                    api.renderer?.currentFocusedRenderable !== visualEditor))
              )
                return;
              const dispatched = api.keymap.dispatchCommand(command);
              if (isAnswer && globalCommand && paletteHandoff) {
                if (dispatched?.ok === false) paletteHandoff = undefined;
                else paletteTimer = setTimeout(replayPaletteInput, 0);
              }
              if (
                dispatched?.ok &&
                visualEditor &&
                visualAnchor !== undefined &&
                state.mode === "visual" &&
                state.visualAnchor === visualAnchor &&
                context.visualEditorOwner === visualEditor &&
                !api.ui?.dialog?.open &&
                api.renderer?.currentFocusedEditor === visualEditor &&
                api.renderer?.currentFocusedRenderable === visualEditor
              ) {
                selectVisualCharacterRange(visualEditor, visualAnchor);
              }
            });
            break;
          }
          case "mode":
            context.visualEditorOwner = action.mode === "visual" ? (context.visualEditorOwner ?? editor) : undefined;
            if (modeIndicator === "toast") {
              const label = action.mode === "(insert)" ? action.mode : action.mode.toUpperCase();
              api.ui?.toast?.({
                message: label,
                variant: "info",
                duration: 800,
              });
            }
            break;
          case "toast":
            api.ui?.toast?.({
              message: action.message,
              variant: "info",
              duration: action.duration ?? 2000,
            });
            break;
          case "yank":
            writeClipboard(action.text);
            break;
          case "insertText":
            api.renderer?.currentFocusedEditor?.insertText?.(action.text);
            break;
          case "yankSelection": {
            // Deferred so it runs after any preceding select commands
            deferAction(() => {
              if (!stillOwnsEditor()) return;
              const text = editor?.editorView?.getSelectedText?.() ?? "";
              if (text) {
                state.yankRegister = text;
                writeClipboard(text);
                api.ui?.toast?.({
                  message: "yanked",
                  variant: "info",
                  duration: 1000,
                });
              }
              editor?.editorView?.resetSelection?.();
            });
            break;
          }
          case "clearSelection":
            api.renderer?.currentFocusedEditor?.editorView?.resetSelection?.();
            break;
          case "deleteRange": {
            const editor = api.renderer?.currentFocusedEditor;
            const eb = editor?.editBuffer;
            if (eb?.deleteRange && editor) {
              const text = editor.plainText ?? "";
              const [sl, sc] = offsetToLineCol(text, action.start);
              const [el, ec] = offsetToLineCol(text, action.end + 1);
              eb.deleteRange(sl, sc, el, ec);
            }
            break;
          }
          case "saveUndoSnapshot": {
            const editor = api.renderer?.currentFocusedEditor;
            if (editor) {
              context.undoSnapshots.push({
                text: editor.plainText ?? "",
                cursor: editor.cursorOffset ?? 0,
              });
            }
            keepUndoSnapshotForBatch = true;
            break;
          }
          case "undo": {
            const undoSnapshot = context.undoSnapshots.pop();
            if (undoSnapshot) {
              const editor = api.renderer?.currentFocusedEditor;
              const eb = editor?.editBuffer;
              if (eb?.setText && editor) {
                eb.setText(undoSnapshot.text);
                editor.cursorOffset = undoSnapshot.cursor;
              }
            } else {
              deferAction(() => {
                if (stillOwnsEditor()) api.keymap.dispatchCommand("input.undo");
              });
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
            if (editor) {
              editor.setSelectionInclusive?.(action.start, action.end);
            }
            break;
          }
        }
      }
    }

    function syncCursorStyle() {
      const editor = api.renderer?.currentFocusedEditor;
      if (
        !editor ||
        api.ui?.dialog?.open ||
        (api.renderer.currentFocusedRenderable !== undefined && api.renderer.currentFocusedRenderable !== editor)
      )
        return;
      if (state.disabled) {
        if (answerOwnsFocus() || (!hasAnswerFocus(api.renderer) && !mainPromptBlocked())) {
          editor.cursorStyle = { style: "line", blinking: true };
        }
        return;
      }
      const answer = answerContextForFocus();
      if (!answer && (hasAnswerFocus(api.renderer) || mainPromptBlocked())) return;
      const context = answer ?? mainContext;
      showContext(context);
      editor.cursorStyle = {
        style: context.state.mode === "insert" ? "line" : "block",
        blinking: true,
      };
    }

    // The Textarea resets cursorStyle during rendering, so re-apply on a
    // short interval. Setting a property is cheaper than the previous
    // approach of writing DECSCUSR escape sequences to stdout, and works
    // in terminals that don't support DECSCUSR (e.g. macOS Terminal.app).
    const cursorInterval = setInterval(syncCursorStyle, 100);
    api.lifecycle?.onDispose?.(() => clearInterval(cursorInterval));
    api.lifecycle?.onDispose?.(() => {
      for (const timer of leaderTimers) clearTimeout(timer);
    });

    if (options?.updateCheck !== false) {
      checkForUpdate((opts) => api.ui?.toast?.(opts), api.kv);
    }

    // Register all commands via registerLayer (migrated from the deprecated
    // api.command?.register API). Commands appear in the command palette and
    // are accessible as slash commands.
    const exitRun = async () => {
      setTimeout(() => api.keymap.dispatchCommand("app.exit"), 0);
    };
    const exitCommands = ["q", "quit", "wq"].map((cmd) => ({
      name: `vimcode.${cmd}`,
      title: `:${cmd}`,
      category: "Vim",
      namespace: "palette",
      desc: cmd === "wq" ? "Exit OpenCode (write and quit)" : "Exit OpenCode",
      slashName: cmd,
      run: exitRun,
    }));
    const submitRun = async () => {
      setTimeout(() => api.keymap.dispatchCommand("input.submit"), 0);
    };
    const submitCommands = ["w", "write"].map((cmd) => ({
      name: `vimcode.${cmd}`,
      title: `:${cmd}`,
      category: "Vim",
      namespace: "palette",
      desc: "Send prompt",
      slashName: cmd,
      run: submitRun,
    }));
    api.keymap.registerLayer?.({
      commands: [
        ...exitCommands,
        ...submitCommands,
        {
          name: "vimcode.vim",
          title: ":vim",
          category: "Vim",
          namespace: "palette",
          desc: "Toggle vim mode on/off",
          slashName: "vim",
          run: async () => {
            const result = toggleVimMode(state);
            answerContexts = new WeakMap();
            await api.kv?.set?.("vimcode.disabled", state.disabled);
            applyActions(result.actions);
          },
        },
      ],
    });

    api.keymap.intercept(
      "key",
      (ctx) => {
        if (ctx.event.eventType === "release") return;

        // If vim mode is disabled, pass all keys through unmodified.
        if (mainContext.state.disabled || disposed) return;
        // Terminal input can contain several keys before timers run. A queued
        // palette must transfer ownership before the following key is routed.
        const previousAnswer = answerContextForFocus();
        if (previousAnswer) for (const action of previousAnswer.deferredActions.splice(0)) action();
        const answer = answerContextForFocus();
        const context = answer ?? mainContext;
        const state = context.state;
        if (hasAnswerFocus(api.renderer ?? {}) && !answer) return;

        // Question choices, permissions and unrelated dialogs remain host-owned.
        if (api.ui?.dialog?.open) return;
        const route = api.route.current;
        if (route.name === "session") {
          const sid = route.params?.sessionID;
          // Child sessions have no editable prompt. Let host navigation own
          // the keys without changing the mode restored in the parent (#79).
          if (!answer && typeof sid === "string" && api.state?.session?.get?.(sid)?.parentID) return;
          if (!answer && typeof sid === "string" && hasActivePrompts(sid)) {
            // Consume the leader key so dispatchLayers() doesn't
            // match it as a leader token, which would enter pending-
            // sequence state instead of typing a space.
            const matched = findMatchingLeader(ctx.event, leaderKeys);
            if (matched) {
              ctx.consume();
              const ch = leaderChar(matched);
              if (ch) api.renderer?.currentFocusedEditor?.insertText?.(ch);
            }
            return;
          }
        }

        // The v2 facade exposes the host mode here. Autocomplete can also
        // appear while vim is in normal mode; its own layer owns those keys.
        const mode = hostMode();
        if (mode === "autocomplete" && state.mode !== "insert") return;
        showContext(context);
        // Answer commit and field navigation belong to the host question layer.
        if (answer && (ctx.event.name === "return" || ctx.event.name === "tab")) return;

        // Let autocomplete handle Enter/Escape before vim consumes them.
        // dispatchCommand returns { ok } — true when the autocomplete layer
        // is active and handled the command, false when it's hidden/disabled.
        if (!answer && state.mode === "insert") {
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
        if (leaderKeys.length > 0 && state.mode !== "insert") {
          if (context.leaderPending) {
            context.leaderPending = false;
            if (context.leaderTimer) {
              clearTimeout(context.leaderTimer);
              leaderTimers.delete(context.leaderTimer);
            }
            return;
          }
          if (findMatchingLeader(ctx.event, leaderKeys)) {
            context.leaderPending = true;
            context.leaderTimer = setTimeout(() => {
              context.leaderPending = false;
              if (context.leaderTimer) leaderTimers.delete(context.leaderTimer);
            }, 2000);
            leaderTimers.add(context.leaderTimer);
            return;
          }
        }

        // Visual mode follows the active prompt, never an old editor's offset.
        // Capture ownership on entry, then re-anchor only after overlay guards.
        const editor = api.renderer?.currentFocusedEditor;
        if (state.mode === "visual" && editor && editor !== context.visualEditorOwner) {
          context.visualEditorOwner = editor;
          state.visualAnchor = editor.cursorOffset;
        }
        const handlerMode = state.mode;
        const result =
          state.mode === "insert"
            ? handleInsertKey(state, key, ctx.event, prompt)
            : state.mode === "visual"
              ? handleVisualKey(state, key, ctx.event, prompt)
              : handleNormalKey(state, key, ctx.event, prompt);
        if (handlerMode === "normal") finishOneShotIfComplete(state, result);

        // In insert mode, intercept printable leaders (space, "a") so
        // they insert their character instead of triggering the leader
        // menu mid-typing. Non-printable leaders (ctrl+x, alt+m) fall
        // through to dispatchLayers() so app-level shortcuts work
        // without switching modes. Runs after handleInsertKey so
        // explicit handlers (escape, return, tab, ctrl+o) take priority.
        // Don't mutate `result` — it may be the shared PASS constant.
        let consume = result.consume;
        let actions = result.actions;
        if (handlerMode === "insert" && !consume && leaderKeys.length > 0) {
          const matched = findMatchingLeader(ctx.event, leaderKeys);
          if (matched) {
            const ch = leaderChar(matched);
            if (ch) {
              actions = [{ type: "insertText" as const, text: ch }];
              consume = true;
            }
          }
        }

        if (consume) ctx.consume();
        applyActions(actions, context);
      },
      { priority: 10_000 },
    );
    if (canReplayInput && keyInput) {
      const capturePaletteKey = (key: HostKeyEvent) => {
        if (!paletteHandoff || replayingInput || key.eventType === "release") return;
        key.preventDefault();
        key.stopPropagation();
        paletteHandoff.inputs.push({ type: "key", value: key });
      };
      const capturePalettePaste = (paste: HostPasteEvent) => {
        if (!paletteHandoff || replayingInput) return;
        paste.preventDefault();
        paste.stopPropagation();
        paletteHandoff.inputs.push({ type: "paste", value: [paste.bytes, paste.metadata] });
      };
      keyInput.prependListener("keypress", capturePaletteKey);
      keyInput.prependListener("paste", capturePalettePaste);
      api.lifecycle?.onDispose?.(() => {
        keyInput.off("keypress", capturePaletteKey);
        keyInput.off("paste", capturePalettePaste);
        if (paletteTimer) clearTimeout(paletteTimer);
        paletteHandoff = undefined;
      });
    }
  },
  async setup(context: V2Context) {
    const { api, dispose } = createV2Facade(context);
    try {
      await plugin.tui(api, context.options);
      return dispose;
    } catch (error) {
      dispose();
      throw error;
    }
  },
} satisfies TuiPluginModule & { setup: (context: V2Context) => Promise<() => void> };

function offsetToLineCol(text: string, offset: number): [number, number] {
  const before = text.substring(0, offset);
  const lines = before.split("\n");
  return [lines.length - 1, lines[lines.length - 1].length];
}

export default plugin;

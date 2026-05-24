import type { TuiPluginModule } from "@opencode-ai/plugin/tui"
import { createVimState, translateKey, handleInsertKey, handleNormalKey, handleVisualKey, type Action, type Mode } from "./vim"
import { writeClipboard } from "./clipboard"
import { checkForUpdate } from "./version"

const plugin: TuiPluginModule = {
  id: "vimcode",
  tui: async (api) => {
    const state = createVimState()

    const prompt = {
      getLine: (n: number) => getInputText().split("\n")[n] ?? "",
      getLineCount: () => getInputText().split("\n").length,
    }

    // api.prompt doesn't exist on the TUI plugin API. The actual text lives
    // on the focused editor exposed by the renderer.
    function getInputText(): string {
      return api.renderer?.currentFocusedEditor?.plainText ?? ""
    }

    function applyActions(actions: Action[]) {
      for (const action of actions) {
        switch (action.type) {
          case "cmd":
            setTimeout(() => api.keymap.dispatchCommand(action.cmd), 0)
            break
          case "mode":
            api.ui?.toast?.({ message: action.mode.toUpperCase(), variant: "info", duration: 800 })
            break
          case "toast":
            api.ui?.toast?.({ message: action.message, variant: "info", duration: action.duration ?? 2000 })
            break
          case "yank":
            writeClipboard(action.text)
            break
          case "yankSelection": {
            const editor = api.renderer?.currentFocusedEditor
            const text = editor?.editorView?.getSelectedText?.() ?? ""
            if (text) {
              state.yankRegister = text
              writeClipboard(text)
              api.ui?.toast?.({ message: "yanked", variant: "info", duration: 1000 })
            }
            editor?.editorView?.resetSelection?.()
            break
          }
          case "clearSelection":
            api.renderer?.currentFocusedEditor?.editorView?.resetSelection?.()
            break
        }
      }
    }

    // The Textarea's renderCursor() hardcodes "block" on every frame.
    // api.renderer.addPostProcessFn would be ideal but isn't reliably
    // available for git-installed plugins. Instead, re-apply the correct
    // DECSCUSR escape on a short interval. 4 bytes at 100ms is negligible.
    const cursorInterval = setInterval(() => {
      process.stdout.write(state.mode === "normal" ? "\x1b[2 q" : "\x1b[6 q")
    }, 100)
    api.lifecycle?.onDispose?.(() => {
      clearInterval(cursorInterval)
      process.stdout.write("\x1b[2 q")
    })

    checkForUpdate((opts) => api.ui?.toast?.(opts))

    api.keymap.intercept(
      "key",
      (ctx) => {
        if (ctx.event.eventType === "release") return

        // Pass through when any overlay owns the keyboard: dialogs (command
        // palette, session list, etc.), question prompts, or permission prompts.
        if (api.ui?.dialog?.open) return
        const route = api.route.current
        if (route.name === "session") {
          const sid = route.params?.sessionID
          if (sid) {
            const q = api.state.session.question(sid)
            const p = api.state.session.permission(sid)
            if ((q && q.length > 0) || (p && p.length > 0)) return
          }
        }

        // Let autocomplete handle Enter/Escape before vim consumes them.
        // dispatchCommand returns { ok } — true when the autocomplete layer
        // is active and handled the command, false when it's hidden/disabled.
        if (state.mode === "insert") {
          if (ctx.event.name === "escape") {
            const r = api.keymap.dispatchCommand("prompt.autocomplete.hide")
            if (r.ok) { ctx.consume(); return }
          }
          if (ctx.event.name === "return" && !ctx.event.ctrl) {
            const r = api.keymap.dispatchCommand("prompt.autocomplete.select")
            if (r.ok) { ctx.consume(); return }
          }
        }

        const key = translateKey(ctx.event)
        const result = state.mode === "insert"
          ? handleInsertKey(state, key, ctx.event)
          : state.mode === "visual"
            ? handleVisualKey(state, key, ctx.event)
            : handleNormalKey(state, key, ctx.event, prompt)
        if (result.consume) ctx.consume()
        applyActions(result.actions)
      },
      { priority: 10_000 },
    )
  },
}

export default plugin

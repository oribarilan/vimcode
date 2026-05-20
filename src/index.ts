import type { TuiPluginModule } from "@opencode-ai/plugin/tui"
import { createVimState, translateKey, handleInsertKey, handleNormalKey, type Action, type Mode } from "./vim"
import { writeClipboard, readClipboard } from "./clipboard"

// Try loading host runtime modules for the slot indicator. These resolve when
// running from source (just dev) via opencode's runtime module plugin, but fail
// for git/npm installs where the cache path isn't covered by onResolve hooks.
async function tryLoadHostModules() {
  try {
    const [solidJs, opentui] = await Promise.all([
      import("solid-js"),
      import("@opentui/solid"),
    ])
    return { createSignal: solidJs.createSignal, ...opentui }
  } catch {
    return null
  }
}

const plugin: TuiPluginModule = {
  id: "vimcode",
  tui: async (api) => {
    const state = createVimState()
    const host = await tryLoadHostModules()

    // Mode change callback — set by the indicator if host modules loaded
    let onModeChange: ((mode: Mode) => void) | null = null

    const prompt = {
      getLine: (n: number) => (api.prompt?.current?.input ?? "").split("\n")[n] ?? "",
      getLineCount: () => (api.prompt?.current?.input ?? "").split("\n").length,
    }

    function applyActions(actions: Action[]) {
      for (const action of actions) {
        switch (action.type) {
          case "cmd":
            setTimeout(() => api.keymap.dispatchCommand(action.cmd), 0)
            break
          case "mode":
            if (onModeChange) onModeChange(action.mode)
            else api.ui?.toast?.({ message: action.mode.toUpperCase(), variant: "info", duration: 800 })
            break
          case "toast":
            api.ui?.toast?.({ message: action.message, variant: "info", duration: action.duration ?? 2000 })
            break
          case "yank":
            writeClipboard(action.text)
            break
          case "insert":
            readClipboard().then((saved) => {
              writeClipboard(action.text)
              setTimeout(() => {
                api.keymap.dispatchCommand("prompt.paste")
                setTimeout(() => writeClipboard(saved), 50)
              }, 0)
            })
            break
        }
      }
    }

    if (host) {
      const [mode, setMode] = host.createSignal<Mode>(state.mode)
      onModeChange = (m) => setMode(m)

      const indicator = () => {
        const el = host.createElement("box")
        const textEl = host.createElement("text")
        host.insert(el, textEl)
        host.setProp(el, "paddingLeft", 1)
        host.setProp(el, "paddingRight", 1)
        host.effect(() => {
          const color = mode() === "normal"
            ? api.theme.current.warning
            : api.theme.current.success
          host.setProp(textEl, "fg", color)
          host.setProp(textEl, "bold", true)
        })
        host.insert(textEl, () => mode() === "normal" ? "NORMAL" : "INSERT")
        return el
      }

      api.slots.register({
        slots: {
          session_prompt_right: indicator,
          home_prompt_right: indicator,
        },
      })
    }

    api.keymap.intercept(
      "key",
      (ctx) => {
        if (ctx.event.eventType === "release") return

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
          : handleNormalKey(state, key, ctx.event, prompt)
        if (result.consume) ctx.consume()
        applyActions(result.actions)
      },
      { priority: 10_000 },
    )
  },
}

export default plugin

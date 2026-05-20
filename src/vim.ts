export type Mode = "normal" | "insert"
export type Operator = "d" | "c" | "y" | null

export type Action =
  | { type: "cmd"; cmd: string }
  | { type: "mode"; mode: Mode }
  | { type: "toast"; message: string; duration?: number }
  | { type: "yank"; text: string }
  | { type: "insert"; text: string }

export type HandlerResult = {
  consume: boolean
  actions: Action[]
}

export type VimState = {
  mode: Mode
  pendingOp: Operator
  count: number
  lineTracker: number
  yankRegister: string
}

export type KeyEvent = {
  name: string
  shift?: boolean
  ctrl?: boolean
  meta?: boolean
  super?: boolean
  eventType?: string
}

export type PromptAccess = {
  getLine: (n: number) => string
  getLineCount: () => number
}

export const MOTIONS: Record<string, string> = {
  h: "input.move.left",
  l: "input.move.right",
  j: "input.move.down",
  k: "input.move.up",
  w: "input.word.forward",
  b: "input.word.backward",
  e: "input.word.forward",
  "0": "input.line.home",
  "^": "input.line.home",
  $: "input.line.end",
  G: "input.buffer.end",
}

const DELETE_MOTION: Record<string, string> = {
  w: "input.delete.word.forward",
  b: "input.delete.word.backward",
  e: "input.delete.word.forward",
  $: "input.delete.to.line.end",
  "0": "input.delete.to.line.start",
  "^": "input.delete.to.line.start",
  h: "input.backspace",
  l: "input.delete",
}

const PASS: HandlerResult = { consume: false, actions: [] }
const CONSUME: HandlerResult = { consume: true, actions: [] }

export function createVimState(): VimState {
  return { mode: "insert", pendingOp: null, count: 0, lineTracker: 0, yankRegister: "" }
}

export function translateKey(ev: KeyEvent): string {
  let key = ev.name
  if (ev.shift && ev.name.length === 1) {
    if (/[a-z]/.test(ev.name)) key = ev.name.toUpperCase()
    else if (ev.name === "4") key = "$"
    else if (ev.name === "6") key = "^"
  }
  return key
}

export function handleInsertKey(state: VimState, key: string, ev: KeyEvent): HandlerResult {
  if (ev.name === "escape") {
    state.mode = "normal"
    state.lineTracker = 0
    return { consume: true, actions: [{ type: "mode", mode: "normal" }] }
  }
  if (ev.name === "return" && ev.ctrl) {
    return { consume: true, actions: [{ type: "cmd", cmd: "input.submit" }] }
  }
  if (ev.name === "return") {
    return { consume: true, actions: [{ type: "cmd", cmd: "input.newline" }] }
  }
  if (ev.name === "tab") {
    return { consume: true, actions: [{ type: "insert", text: "\t" }] }
  }
  return PASS
}

export function handleNormalKey(
  state: VimState,
  key: string,
  ev: KeyEvent,
  prompt: PromptAccess,
): HandlerResult {
  if (ev.meta || ev.super) return PASS
  if (ev.ctrl) {
    if (ev.name === "r") {
      resetPending(state)
      return { consume: true, actions: [{ type: "cmd", cmd: "input.redo" }] }
    }
    return PASS
  }

  if (ev.name === "escape") {
    resetPending(state)
    return PASS
  }

  // Everything below is consumed
  const actions: Action[] = []

  if (/[1-9]/.test(key) || (key === "0" && state.count > 0)) {
    state.count = state.count * 10 + parseInt(key)
    return { consume: true, actions }
  }

  if (ev.name === "return") {
    actions.push({ type: "cmd", cmd: "input.submit" })
    resetPending(state)
    return { consume: true, actions }
  }

  if (key === ":") {
    actions.push({ type: "cmd", cmd: "command.palette.show" })
    resetPending(state)
    return { consume: true, actions }
  }

  if (key === "p") {
    if (state.yankRegister) actions.push({ type: "yank", text: state.yankRegister })
    actions.push({ type: "cmd", cmd: "prompt.paste" })
    resetPending(state)
    return { consume: true, actions }
  }

  if (key === "X") {
    pushN(actions, "input.backspace", consumeCount(state))
    return { consume: true, actions }
  }

  if (key === "J") {
    const n = consumeCount(state)
    for (let i = 0; i < n; i++) {
      actions.push({ type: "cmd", cmd: "input.line.end" })
      actions.push({ type: "cmd", cmd: "input.delete" })
    }
    return { consume: true, actions }
  }

  // Operators: d, c, y
  if (key === "d" || key === "c" || key === "y") {
    if (state.pendingOp === key) {
      const n = consumeCount(state)
      if (key === "y") {
        const lines: string[] = []
        for (let i = 0; i < n; i++) lines.push(prompt.getLine(state.lineTracker + i))
        const text = lines.join("\n") + "\n"
        state.yankRegister = text
        actions.push({ type: "yank", text })
        actions.push({ type: "toast", message: `${n} line${n > 1 ? "s" : ""} yanked`, duration: 1000 })
      } else {
        pushN(actions, "input.delete.line", n)
        if (key === "c") enterInsert(state, actions)
      }
      state.pendingOp = null
      return { consume: true, actions }
    }
    state.pendingOp = key
    return { consume: true, actions }
  }

  if (key === "D") {
    actions.push({ type: "cmd", cmd: "input.delete.to.line.end" })
    resetPending(state)
    return { consume: true, actions }
  }

  if (key === "C") {
    actions.push({ type: "cmd", cmd: "input.delete.to.line.end" })
    enterInsert(state, actions)
    return { consume: true, actions }
  }

  // Pending operator + motion
  if (state.pendingOp && key in MOTIONS) {
    const n = consumeCount(state)

    if (state.pendingOp === "y") {
      actions.push({ type: "toast", message: "Only yy supported for now", duration: 1500 })
      resetPending(state)
      return { consume: true, actions }
    }

    if (key === "j") {
      pushN(actions, "input.delete.line", n + 1)
      if (state.pendingOp === "c") enterInsert(state, actions)
      else resetPending(state)
      return { consume: true, actions }
    }
    if (key === "k") {
      pushN(actions, "input.move.up", n)
      pushN(actions, "input.delete.line", n + 1)
      if (state.pendingOp === "c") enterInsert(state, actions)
      else resetPending(state)
      return { consume: true, actions }
    }

    const deleteCmd = DELETE_MOTION[key]
    if (deleteCmd) {
      pushN(actions, deleteCmd, n)
      if (state.pendingOp === "c") enterInsert(state, actions)
      else resetPending(state)
      return { consume: true, actions }
    }

    resetPending(state)
    return { consume: true, actions }
  }

  // Standalone motions
  if (key in MOTIONS) {
    const n = consumeCount(state)
    if ((key === "j" || key === "k") && isInputEmpty(prompt)) {
      const cmd = key === "k" ? "prompt.history.previous" : "prompt.history.next"
      pushN(actions, cmd, n)
      return { consume: true, actions }
    }
    pushN(actions, MOTIONS[key], n)
    updateLineTracker(state, key, n, prompt)
    return { consume: true, actions }
  }

  // gg (buffer home)
  if (key === "g") {
    actions.push({ type: "cmd", cmd: "input.buffer.home" })
    state.lineTracker = 0
    resetPending(state)
    return { consume: true, actions }
  }

  if (key === "x") {
    pushN(actions, "input.delete", consumeCount(state))
    return { consume: true, actions }
  }

  if (key === "u") {
    actions.push({ type: "cmd", cmd: "input.undo" })
    resetPending(state)
    return { consume: true, actions }
  }

  // Insert entries
  if (key === "i") {
    enterInsert(state, actions)
    return { consume: true, actions }
  }

  if (key === "a") {
    actions.push({ type: "cmd", cmd: "input.move.right" })
    enterInsert(state, actions)
    return { consume: true, actions }
  }

  if (key === "A") {
    actions.push({ type: "cmd", cmd: "input.line.end" })
    enterInsert(state, actions)
    return { consume: true, actions }
  }

  if (key === "o") {
    actions.push({ type: "cmd", cmd: "input.line.end" })
    actions.push({ type: "cmd", cmd: "input.newline" })
    state.lineTracker++
    enterInsert(state, actions)
    return { consume: true, actions }
  }

  if (key === "O") {
    actions.push({ type: "cmd", cmd: "input.line.home" })
    actions.push({ type: "cmd", cmd: "input.newline" })
    actions.push({ type: "cmd", cmd: "input.move.up" })
    enterInsert(state, actions)
    return { consume: true, actions }
  }

  // Unbound key — already consumed
  return { consume: true, actions }
}

// ── Helpers ──────────────────────────────────────────────────

function resetPending(state: VimState) {
  state.pendingOp = null
  state.count = 0
}

function consumeCount(state: VimState): number {
  const n = state.count || 1
  state.count = 0
  return n
}

function enterInsert(state: VimState, actions: Action[]) {
  resetPending(state)
  state.mode = "insert"
  actions.push({ type: "mode", mode: "insert" })
}

function pushN(actions: Action[], cmd: string, n: number) {
  for (let i = 0; i < n; i++) actions.push({ type: "cmd", cmd })
}

function updateLineTracker(state: VimState, key: string, n: number, prompt: PromptAccess) {
  if (key === "j") state.lineTracker += n
  else if (key === "k") state.lineTracker = Math.max(0, state.lineTracker - n)
  else if (key === "G") state.lineTracker = prompt.getLineCount() - 1
  else if (key === "g") state.lineTracker = 0
}

function isInputEmpty(prompt: PromptAccess): boolean {
  return prompt.getLineCount() === 1 && prompt.getLine(0) === ""
}

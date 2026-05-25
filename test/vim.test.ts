import { describe, it, expect, beforeEach } from "bun:test"
import {
  createVimState,
  translateKey,
  handleInsertKey,
  handleNormalKey,
  handleVisualKey,
  type VimState,
  type Action,
  type PromptAccess,
} from "../src/vim"

function cmds(actions: Action[]): string[] {
  return actions.filter((a): a is Extract<Action, { type: "cmd" }> => a.type === "cmd").map((a) => a.cmd)
}

const ev = (
  name: string,
  opts?: { shift?: boolean; ctrl?: boolean; meta?: boolean; super?: boolean },
) => ({
  name,
  shift: opts?.shift ?? false,
  ctrl: opts?.ctrl ?? false,
  meta: opts?.meta ?? false,
  super: opts?.super ?? false,
})

const mockPrompt: PromptAccess = {
  getLine: (n) => ["hello world", "second line", "third line"][n] ?? "",
  getLineCount: () => 3,
}

const emptyPrompt: PromptAccess = {
  getLine: () => "",
  getLineCount: () => 1,
}

let state: VimState

beforeEach(() => {
  state = createVimState()
  state.mode = "normal"
})

// ── translateKey ────────────────────────────────────────────

describe("translateKey", () => {
  it("lowercase passes through", () => {
    expect(translateKey(ev("h"))).toBe("h")
  })

  it("shift+letter uppercases", () => {
    expect(translateKey(ev("g", { shift: true }))).toBe("G")
  })

  it("shift+4 → $", () => {
    expect(translateKey(ev("4", { shift: true }))).toBe("$")
  })

  it("shift+6 → ^", () => {
    expect(translateKey(ev("6", { shift: true }))).toBe("^")
  })

  it("shift+[ → {", () => {
    expect(translateKey(ev("[", { shift: true }))).toBe("{")
  })

  it("shift+] → }", () => {
    expect(translateKey(ev("]", { shift: true }))).toBe("}")
  })
})

// ── handleInsertKey ─────────────────────────────────────────

describe("handleInsertKey", () => {
  beforeEach(() => {
    state.mode = "insert"
  })

  it("escape → consume, mode normal", () => {
    const r = handleInsertKey(state, "escape", ev("escape"))
    expect(r.consume).toBe(true)
    expect(state.mode).toBe("normal")
    expect(r.actions).toContainEqual({ type: "mode", mode: "normal" })
  })

  it("enter → consume, input.newline", () => {
    const r = handleInsertKey(state, "return", ev("return"))
    expect(r.consume).toBe(true)
    expect(cmds(r.actions)).toContain("input.newline")
  })

  it("ctrl+enter → consume, input.submit", () => {
    const r = handleInsertKey(state, "return", ev("return", { ctrl: true }))
    expect(r.consume).toBe(true)
    expect(cmds(r.actions)).toContain("input.submit")
  })

  it("tab → consume, insertText tab", () => {
    const r = handleInsertKey(state, "tab", ev("tab"))
    expect(r.consume).toBe(true)
    expect(r.actions).toContainEqual({ type: "insertText", text: "\t" })
  })

  it("regular key → passthrough", () => {
    const r = handleInsertKey(state, "a", ev("a"))
    expect(r.consume).toBe(false)
  })
})

// ── handleNormalKey — motions ───────────────────────────────

describe("handleNormalKey — motions", () => {
  it("h dispatches input.move.left", () => {
    const r = handleNormalKey(state, "h", ev("h"), mockPrompt)
    expect(cmds(r.actions)).toEqual(["input.move.left"])
  })

  it("j dispatches input.move.down", () => {
    const r = handleNormalKey(state, "j", ev("j"), mockPrompt)
    expect(cmds(r.actions)).toEqual(["input.move.down"])
  })

  it("k dispatches input.move.up", () => {
    const r = handleNormalKey(state, "k", ev("k"), mockPrompt)
    expect(cmds(r.actions)).toEqual(["input.move.up"])
  })

  it("l dispatches input.move.right", () => {
    const r = handleNormalKey(state, "l", ev("l"), mockPrompt)
    expect(cmds(r.actions)).toEqual(["input.move.right"])
  })

  it("3j dispatches input.move.down 3 times", () => {
    handleNormalKey(state, "3", ev("3"), mockPrompt)
    const r = handleNormalKey(state, "j", ev("j"), mockPrompt)
    expect(cmds(r.actions)).toEqual([
      "input.move.down",
      "input.move.down",
      "input.move.down",
    ])
  })

  it("G dispatches input.buffer.end", () => {
    const r = handleNormalKey(state, "G", ev("g", { shift: true }), mockPrompt)
    expect(cmds(r.actions)).toEqual(["input.buffer.end"])
  })

  it("0 dispatches input.line.home", () => {
    const r = handleNormalKey(state, "0", ev("0"), mockPrompt)
    expect(cmds(r.actions)).toEqual(["input.line.home"])
  })

  it("0 after count > 0 accumulates as digit", () => {
    handleNormalKey(state, "1", ev("1"), mockPrompt)
    handleNormalKey(state, "0", ev("0"), mockPrompt)
    expect(state.count).toBe(10)
  })

  it("g dispatches input.buffer.home", () => {
    const r = handleNormalKey(state, "g", ev("g"), mockPrompt)
    expect(cmds(r.actions)).toEqual(["input.buffer.home"])
  })
})

// ── handleNormalKey — operators ─────────────────────────────

describe("handleNormalKey — operators", () => {
  it("dd dispatches input.delete.line", () => {
    handleNormalKey(state, "d", ev("d"), mockPrompt)
    expect(state.pendingOp).toBe("d")
    const r = handleNormalKey(state, "d", ev("d"), mockPrompt)
    expect(cmds(r.actions)).toEqual(["input.delete.line"])
  })

  it("2dd dispatches input.delete.line twice", () => {
    handleNormalKey(state, "2", ev("2"), mockPrompt)
    handleNormalKey(state, "d", ev("d"), mockPrompt)
    const r = handleNormalKey(state, "d", ev("d"), mockPrompt)
    expect(cmds(r.actions)).toEqual(["input.delete.line", "input.delete.line"])
  })

  it("dw dispatches input.delete.word.forward", () => {
    handleNormalKey(state, "d", ev("d"), mockPrompt)
    const r = handleNormalKey(state, "w", ev("w"), mockPrompt)
    expect(cmds(r.actions)).toEqual(["input.delete.word.forward"])
  })

  it("d$ dispatches input.delete.to.line.end", () => {
    handleNormalKey(state, "d", ev("d"), mockPrompt)
    const r = handleNormalKey(state, "$", ev("4", { shift: true }), mockPrompt)
    expect(cmds(r.actions)).toEqual(["input.delete.to.line.end"])
  })

  it("d0 dispatches input.delete.to.line.start", () => {
    handleNormalKey(state, "d", ev("d"), mockPrompt)
    const r = handleNormalKey(state, "0", ev("0"), mockPrompt)
    expect(cmds(r.actions)).toEqual(["input.delete.to.line.start"])
  })

  it("dj dispatches input.delete.line twice", () => {
    handleNormalKey(state, "d", ev("d"), mockPrompt)
    const r = handleNormalKey(state, "j", ev("j"), mockPrompt)
    expect(cmds(r.actions)).toEqual(["input.delete.line", "input.delete.line"])
  })

  it("dk dispatches input.move.up + input.delete.line twice", () => {
    handleNormalKey(state, "d", ev("d"), mockPrompt)
    const r = handleNormalKey(state, "k", ev("k"), mockPrompt)
    expect(cmds(r.actions)).toEqual([
      "input.move.up",
      "input.delete.line",
      "input.delete.line",
    ])
  })

  it("cc dispatches input.delete.line, enters insert", () => {
    handleNormalKey(state, "c", ev("c"), mockPrompt)
    const r = handleNormalKey(state, "c", ev("c"), mockPrompt)
    expect(cmds(r.actions)).toEqual(["input.delete.line"])
    expect(state.mode).toBe("insert")
  })

  it("cw dispatches input.delete.word.forward, enters insert", () => {
    handleNormalKey(state, "c", ev("c"), mockPrompt)
    const r = handleNormalKey(state, "w", ev("w"), mockPrompt)
    expect(cmds(r.actions)).toEqual(["input.delete.word.forward"])
    expect(state.mode).toBe("insert")
  })

  it("yy sets yankRegister and toasts", () => {
    handleNormalKey(state, "y", ev("y"), mockPrompt)
    const r = handleNormalKey(state, "y", ev("y"), mockPrompt)
    expect(state.yankRegister).toBe("hello world\n")
    expect(r.actions.some((a) => a.type === "yank")).toBe(true)
    expect(r.actions.some((a) => a.type === "toast")).toBe(true)
  })

  it("y+motion toasts unsupported", () => {
    handleNormalKey(state, "y", ev("y"), mockPrompt)
    const r = handleNormalKey(state, "w", ev("w"), mockPrompt)
    const toasts = r.actions.filter((a) => a.type === "toast")
    expect(toasts).toHaveLength(1)
    expect((toasts[0] as Extract<Action, { type: "toast" }>).message).toContain("Only yy supported")
  })
})

// ── handleNormalKey — shortcuts ─────────────────────────────

describe("handleNormalKey — shortcuts", () => {
  it("D dispatches input.delete.to.line.end", () => {
    const r = handleNormalKey(state, "D", ev("d", { shift: true }), mockPrompt)
    expect(cmds(r.actions)).toEqual(["input.delete.to.line.end"])
  })

  it("C dispatches input.delete.to.line.end and enters insert", () => {
    const r = handleNormalKey(state, "C", ev("c", { shift: true }), mockPrompt)
    expect(cmds(r.actions)).toEqual(["input.delete.to.line.end"])
    expect(state.mode).toBe("insert")
  })
})

// ── handleNormalKey — special keys ──────────────────────────

describe("handleNormalKey — special keys", () => {
  it(": dispatches command.palette.show", () => {
    const r = handleNormalKey(state, ":", ev(":"), mockPrompt)
    expect(cmds(r.actions)).toEqual(["command.palette.show"])
  })

  it("/ dispatches session.timeline", () => {
    const r = handleNormalKey(state, "/", ev("/"), mockPrompt)
    expect(cmds(r.actions)).toEqual(["session.timeline"])
  })

  it("[ dispatches session.half.page.up", () => {
    const r = handleNormalKey(state, "[", ev("["), mockPrompt)
    expect(cmds(r.actions)).toEqual(["session.half.page.up"])
  })

  it("] dispatches session.half.page.down", () => {
    const r = handleNormalKey(state, "]", ev("]"), mockPrompt)
    expect(cmds(r.actions)).toEqual(["session.half.page.down"])
  })

  it("{ dispatches session.message.previous", () => {
    const r = handleNormalKey(state, "{", ev("[", { shift: true }), mockPrompt)
    expect(cmds(r.actions)).toEqual(["session.message.previous"])
  })

  it("} dispatches session.message.next", () => {
    const r = handleNormalKey(state, "}", ev("]", { shift: true }), mockPrompt)
    expect(cmds(r.actions)).toEqual(["session.message.next"])
  })

  it("X dispatches input.backspace", () => {
    const r = handleNormalKey(
      state,
      "X",
      ev("x", { shift: true }),
      mockPrompt,
    )
    expect(cmds(r.actions)).toEqual(["input.backspace"])
  })

  it("J dispatches input.line.end + input.delete", () => {
    const r = handleNormalKey(
      state,
      "J",
      ev("j", { shift: true }),
      mockPrompt,
    )
    expect(cmds(r.actions)).toEqual(["input.line.end", "input.delete"])
  })

  it("u dispatches input.undo", () => {
    const r = handleNormalKey(state, "u", ev("u"), mockPrompt)
    expect(cmds(r.actions)).toEqual(["input.undo"])
  })

  it("ctrl+r dispatches input.redo", () => {
    const r = handleNormalKey(
      state,
      "r",
      ev("r", { ctrl: true }),
      mockPrompt,
    )
    expect(r.consume).toBe(true)
    expect(cmds(r.actions)).toEqual(["input.redo"])
  })

  it("p with yankRegister set pastes", () => {
    state.yankRegister = "yanked text\n"
    const r = handleNormalKey(state, "p", ev("p"), mockPrompt)
    expect(r.actions.some((a) => a.type === "yank")).toBe(true)
    expect(cmds(r.actions)).toContain("prompt.paste")
  })

  it("meta combo → passthrough", () => {
    const r = handleNormalKey(
      state,
      "c",
      ev("c", { meta: true }),
      mockPrompt,
    )
    expect(r.consume).toBe(false)
  })

  it("escape → passthrough, resets pendingOp", () => {
    state.pendingOp = "d"
    const r = handleNormalKey(state, "escape", ev("escape"), mockPrompt)
    expect(r.consume).toBe(false)
    expect(state.pendingOp).toBeNull()
  })
})

// ── handleNormalKey — insert entries ────────────────────────

describe("handleNormalKey — insert entries", () => {
  it("i enters insert", () => {
    const r = handleNormalKey(state, "i", ev("i"), mockPrompt)
    expect(state.mode).toBe("insert")
    expect(r.actions).toContainEqual({ type: "mode", mode: "insert" })
  })

  it("a dispatches input.move.right, enters insert", () => {
    const r = handleNormalKey(state, "a", ev("a"), mockPrompt)
    expect(cmds(r.actions)).toContain("input.move.right")
    expect(state.mode).toBe("insert")
  })

  it("A dispatches input.line.end, enters insert", () => {
    const r = handleNormalKey(
      state,
      "A",
      ev("a", { shift: true }),
      mockPrompt,
    )
    expect(cmds(r.actions)).toContain("input.line.end")
    expect(state.mode).toBe("insert")
  })

  it("o dispatches input.line.end + input.newline, enters insert, lineTracker increments", () => {
    const tracker = state.lineTracker
    const r = handleNormalKey(state, "o", ev("o"), mockPrompt)
    expect(cmds(r.actions)).toEqual(["input.line.end", "input.newline"])
    expect(state.mode).toBe("insert")
    expect(state.lineTracker).toBe(tracker + 1)
  })

  it("O dispatches input.line.home + input.newline + input.move.up, enters insert", () => {
    const r = handleNormalKey(
      state,
      "O",
      ev("o", { shift: true }),
      mockPrompt,
    )
    expect(cmds(r.actions)).toEqual([
      "input.line.home",
      "input.newline",
      "input.move.up",
    ])
    expect(state.mode).toBe("insert")
  })
})

// ── handleNormalKey — line tracker ──────────────────────────

describe("handleNormalKey — line tracker", () => {
  it("j increments lineTracker", () => {
    const before = state.lineTracker
    handleNormalKey(state, "j", ev("j"), mockPrompt)
    expect(state.lineTracker).toBe(before + 1)
  })

  it("k clamps lineTracker at 0", () => {
    state.lineTracker = 0
    handleNormalKey(state, "k", ev("k"), mockPrompt)
    expect(state.lineTracker).toBe(0)
  })

  it("G sets lineTracker to last line", () => {
    handleNormalKey(state, "G", ev("g", { shift: true }), mockPrompt)
    expect(state.lineTracker).toBe(2) // getLineCount() - 1
  })

  it("g resets lineTracker to 0", () => {
    state.lineTracker = 2
    handleNormalKey(state, "g", ev("g"), mockPrompt)
    expect(state.lineTracker).toBe(0)
  })
})

// ── handleNormalKey — history scrolling ─────────────────────

describe("handleNormalKey — history scrolling", () => {
  it("j dispatches prompt.history.next when input is empty", () => {
    const r = handleNormalKey(state, "j", ev("j"), emptyPrompt)
    expect(cmds(r.actions)).toEqual(["prompt.history.next"])
  })

  it("k dispatches prompt.history.previous when input is empty", () => {
    const r = handleNormalKey(state, "k", ev("k"), emptyPrompt)
    expect(cmds(r.actions)).toEqual(["prompt.history.previous"])
  })

  it("j dispatches input.move.down when input is non-empty", () => {
    const r = handleNormalKey(state, "j", ev("j"), mockPrompt)
    expect(cmds(r.actions)).toEqual(["input.move.down"])
  })

  it("3k dispatches prompt.history.previous 3 times when empty", () => {
    handleNormalKey(state, "3", ev("3"), emptyPrompt)
    const r = handleNormalKey(state, "k", ev("k"), emptyPrompt)
    expect(cmds(r.actions)).toEqual([
      "prompt.history.previous",
      "prompt.history.previous",
      "prompt.history.previous",
    ])
  })

  it("dj still deletes lines when input is empty", () => {
    handleNormalKey(state, "d", ev("d"), emptyPrompt)
    const r = handleNormalKey(state, "j", ev("j"), emptyPrompt)
    expect(cmds(r.actions)).toEqual(["input.delete.line", "input.delete.line"])
  })
})

// ── handleNormalKey — visual mode entry ────────────────────

describe("handleNormalKey — visual mode entry", () => {
  it("v enters visual mode", () => {
    const r = handleNormalKey(state, "v", ev("v"), mockPrompt)
    expect(r.consume).toBe(true)
    expect(state.mode).toBe("visual")
    expect(r.actions).toContainEqual({ type: "mode", mode: "visual" })
  })

  it("v clears pending operator", () => {
    state.pendingOp = "d"
    handleNormalKey(state, "v", ev("v"), mockPrompt)
    expect(state.pendingOp).toBeNull()
    expect(state.mode).toBe("visual")
  })
})

// ── handleVisualKey — motions ──────────────────────────────

describe("handleVisualKey — motions", () => {
  beforeEach(() => {
    state.mode = "visual"
  })

  it("h dispatches input.select.left", () => {
    const r = handleVisualKey(state, "h", ev("h"))
    expect(cmds(r.actions)).toEqual(["input.select.left"])
  })

  it("l dispatches input.select.right", () => {
    const r = handleVisualKey(state, "l", ev("l"))
    expect(cmds(r.actions)).toEqual(["input.select.right"])
  })

  it("j dispatches input.select.down", () => {
    const r = handleVisualKey(state, "j", ev("j"))
    expect(cmds(r.actions)).toEqual(["input.select.down"])
  })

  it("k dispatches input.select.up", () => {
    const r = handleVisualKey(state, "k", ev("k"))
    expect(cmds(r.actions)).toEqual(["input.select.up"])
  })

  it("w dispatches input.select.word.forward", () => {
    const r = handleVisualKey(state, "w", ev("w"))
    expect(cmds(r.actions)).toEqual(["input.select.word.forward"])
  })

  it("$ dispatches input.select.line.end", () => {
    const r = handleVisualKey(state, "$", ev("4", { shift: true }))
    expect(cmds(r.actions)).toEqual(["input.select.line.end"])
  })

  it("3l dispatches input.select.right 3 times", () => {
    handleVisualKey(state, "3", ev("3"))
    const r = handleVisualKey(state, "l", ev("l"))
    expect(cmds(r.actions)).toEqual([
      "input.select.right",
      "input.select.right",
      "input.select.right",
    ])
  })

  it("G dispatches input.select.buffer.end", () => {
    const r = handleVisualKey(state, "G", ev("g", { shift: true }))
    expect(cmds(r.actions)).toEqual(["input.select.buffer.end"])
  })

  it("g dispatches input.select.buffer.home", () => {
    const r = handleVisualKey(state, "g", ev("g"))
    expect(cmds(r.actions)).toEqual(["input.select.buffer.home"])
  })
})

// ── handleVisualKey — operators ────────────────────────────

describe("handleVisualKey — operators", () => {
  beforeEach(() => {
    state.mode = "visual"
  })

  it("d deletes selection and enters normal mode", () => {
    const r = handleVisualKey(state, "d", ev("d"))
    expect(r.consume).toBe(true)
    expect(cmds(r.actions)).toContain("input.backspace")
    expect(state.mode).toBe("normal")
    expect(r.actions).toContainEqual({ type: "mode", mode: "normal" })
  })

  it("c deletes selection and enters insert mode", () => {
    const r = handleVisualKey(state, "c", ev("c"))
    expect(r.consume).toBe(true)
    expect(cmds(r.actions)).toContain("input.backspace")
    expect(state.mode).toBe("insert")
    expect(r.actions).toContainEqual({ type: "mode", mode: "insert" })
  })

  it("y yanks selection and enters normal mode", () => {
    const r = handleVisualKey(state, "y", ev("y"))
    expect(r.consume).toBe(true)
    expect(r.actions).toContainEqual({ type: "yankSelection" })
    expect(state.mode).toBe("normal")
    expect(r.actions).toContainEqual({ type: "mode", mode: "normal" })
  })

  it("x deletes selection (alias for d)", () => {
    const r = handleVisualKey(state, "x", ev("x"))
    expect(cmds(r.actions)).toContain("input.backspace")
    expect(state.mode).toBe("normal")
  })
})

// ── handleVisualKey — exit and passthrough ─────────────────

describe("handleVisualKey — exit and passthrough", () => {
  beforeEach(() => {
    state.mode = "visual"
  })

  it("Escape exits visual mode and clears selection", () => {
    const r = handleVisualKey(state, "escape", ev("escape"))
    expect(r.consume).toBe(true)
    expect(state.mode).toBe("normal")
    expect(r.actions).toContainEqual({ type: "clearSelection" })
    expect(r.actions).toContainEqual({ type: "mode", mode: "normal" })
  })

  it("v exits visual mode and clears selection", () => {
    const r = handleVisualKey(state, "v", ev("v"))
    expect(r.consume).toBe(true)
    expect(state.mode).toBe("normal")
    expect(r.actions).toContainEqual({ type: "clearSelection" })
  })

  it("meta combo passes through", () => {
    const r = handleVisualKey(state, "c", ev("c", { meta: true }))
    expect(r.consume).toBe(false)
  })

  it("ctrl combo passes through", () => {
    const r = handleVisualKey(state, "x", ev("x", { ctrl: true }))
    expect(r.consume).toBe(false)
  })

  it("unrecognized key is consumed (no typing in visual)", () => {
    const r = handleVisualKey(state, "z", ev("z"))
    expect(r.consume).toBe(true)
    expect(r.actions).toEqual([])
  })
})

export type Mode = "normal" | "insert" | "visual" | "(insert)";
export type Operator = "d" | "c" | "y" | null;

export type Action =
  | { type: "cmd"; cmd: string }
  | { type: "mode"; mode: Mode }
  | { type: "toast"; message: string; duration?: number }
  | { type: "yank"; text: string }
  | { type: "insertText"; text: string }
  | { type: "yankSelection" }
  | { type: "clearSelection" }
  | { type: "deleteRange"; start: number; end: number }
  | { type: "undo" }
  | { type: "cursorTo"; offset: number }
  | { type: "selectRange"; start: number; end: number };

export type HandlerResult = {
  consume: boolean;
  actions: Action[];
};

export type VimState = {
  mode: Mode;
  pendingOp: Operator;
  pendingChar: "r" | "g" | null;
  count: number;
  yankRegister: string;
  oneShotNormal: boolean;
  disabled: boolean;
};

export type KeyEvent = {
  name: string;
  shift?: boolean;
  ctrl?: boolean;
  meta?: boolean;
  super?: boolean;
  eventType?: string;
};

export type ParsedLeader = {
  name: string;
  ctrl: boolean;
  shift: boolean;
  meta: boolean;
  char: string | null;
};

export type PromptAccess = {
  getLine: (n: number) => string;
  getLineCount: () => number;
  getCursorLine: () => number;
  getCursorOffset: () => number;
  getPlainText: () => string;
};

export const MOTIONS: Record<string, string> = {
  h: "input.move.left",
  l: "input.move.right",
  j: "input.move.down",
  k: "input.move.up",
  w: "input.word.forward",
  b: "input.word.backward",
  "0": "input.line.home",
  "^": "input.line.home",
  $: "input.line.end",
  G: "input.buffer.end",
};

export const SELECT_MOTIONS: Record<string, string> = {
  h: "input.select.left",
  l: "input.select.right",
  j: "input.select.down",
  k: "input.select.up",
  w: "input.select.word.forward",
  b: "input.select.word.backward",
  e: "input.select.word.forward",
  "0": "input.select.line.home",
  "^": "input.select.line.home",
  $: "input.select.line.end",
  G: "input.select.buffer.end",
};

const DELETE_MOTION: Record<string, string> = {
  w: "input.delete.word.forward",
  b: "input.delete.word.backward",
  $: "input.delete.to.line.end",
  "0": "input.delete.to.line.start",
  "^": "input.delete.to.line.start",
  h: "input.backspace",
  l: "input.delete",
};

const PASS: HandlerResult = { consume: false, actions: [] };
const _CONSUME: HandlerResult = { consume: true, actions: [] };

export function createVimState(): VimState {
  return {
    mode: "insert",
    pendingOp: null,
    pendingChar: null,
    count: 0,
    yankRegister: "",
    oneShotNormal: false,
    disabled: false,
  };
}

export function toggleVimMode(state: VimState): HandlerResult {
  state.disabled = !state.disabled;
  const message = state.disabled ? "Vim mode disabled" : "Vim mode enabled";
  return { consume: true, actions: [{ type: "toast", message }] };
}

export function endOfWord(text: string, offset: number, count = 1): number {
  const len = text.length;
  if (len === 0) return 0;
  let pos = offset;
  for (let step = 0; step < count; step++) {
    // If inside a word/punct run, advance one to start looking for next end
    if (pos < len - 1 && charKind(text[pos]) !== "space") {
      pos++;
    }
    // Skip whitespace
    while (pos < len && isWhitespace(text[pos])) pos++;
    if (pos >= len) return len - 1;
    // Find end of current word class run
    const kind = charKind(text[pos]);
    while (pos + 1 < len && charKind(text[pos + 1]) === kind) pos++;
  }
  return Math.min(pos, len - 1);
}

function isWhitespace(ch: string): boolean {
  return ch === " " || ch === "\t" || ch === "\n" || ch === "\r";
}

function charKind(ch: string): "word" | "punct" | "space" {
  if (isWhitespace(ch)) return "space";
  if (/\w/.test(ch)) return "word";
  return "punct";
}

export function translateKey(ev: KeyEvent): string {
  let key = ev.name;
  if (ev.shift && ev.name.length === 1) {
    if (/[a-z]/.test(ev.name)) key = ev.name.toUpperCase();
    else if (ev.name === "4") key = "$";
    else if (ev.name === "6") key = "^";
    else if (ev.name === "[") key = "{";
    else if (ev.name === "]") key = "}";
  }
  return key;
}

export function parseLeaderKey(raw: string): ParsedLeader | null {
  if (!raw) return null;
  let ctrl = false;
  let shift = false;
  let meta = false;
  let remaining = raw;
  while (remaining.length > 2 && remaining[1] === "-") {
    const mod = remaining[0].toUpperCase();
    if (mod === "C") ctrl = true;
    else if (mod === "S") shift = true;
    else if (mod === "M") meta = true;
    else break;
    remaining = remaining.slice(2);
  }
  const name = remaining.toLowerCase();
  let char: string | null = null;
  if (!ctrl && !meta) {
    if (name === "space") char = " ";
    else if (name === "tab") char = "\t";
    else if (name.length === 1 && /[a-z0-9]/.test(name)) char = shift ? name.toUpperCase() : name;
  }
  return { name, ctrl, shift, meta, char };
}

export function matchesLeader(ev: KeyEvent, leader: ParsedLeader): boolean {
  return (
    ev.name === leader.name &&
    (ev.ctrl ?? false) === leader.ctrl &&
    (ev.shift ?? false) === leader.shift &&
    (ev.meta ?? false) === leader.meta
  );
}

export function handleInsertKey(
  state: VimState,
  _key: string,
  ev: KeyEvent,
  leader?: ParsedLeader | null,
): HandlerResult {
  if (ev.name === "escape") {
    state.mode = "normal";
    return { consume: true, actions: [{ type: "mode", mode: "normal" }] };
  }
  if (ev.name === "return" && ev.ctrl) {
    return { consume: true, actions: [{ type: "cmd", cmd: "input.submit" }] };
  }
  if (ev.name === "return") {
    return { consume: true, actions: [{ type: "cmd", cmd: "input.newline" }] };
  }
  if (ev.name === "tab") {
    return { consume: true, actions: [{ type: "insertText", text: "\t" }] };
  }
  if (ev.name === "o" && ev.ctrl) {
    state.mode = "normal";
    state.oneShotNormal = true;
    return { consume: true, actions: [{ type: "mode", mode: "(insert)" }] };
  }
  // Swallow the leader key so OpenCode doesn't open the leader menu
  // while typing. Insert the literal character if it's printable.
  if (leader && matchesLeader(ev, leader)) {
    return leader.char
      ? { consume: true, actions: [{ type: "insertText", text: leader.char }] }
      : { consume: true, actions: [] };
  }
  return PASS;
}

export function handleNormalKey(state: VimState, key: string, ev: KeyEvent, prompt: PromptAccess): HandlerResult {
  if (ev.meta || ev.super) return PASS;
  if (ev.ctrl) {
    if (ev.name === "r") {
      resetPending(state);
      return { consume: true, actions: [{ type: "cmd", cmd: "input.redo" }] };
    }
    return PASS;
  }

  if (ev.name === "escape") {
    if (state.oneShotNormal) {
      state.oneShotNormal = false;
      state.mode = "insert";
      resetPending(state);
      return { consume: true, actions: [{ type: "mode", mode: "insert" }] };
    }
    resetPending(state);
    return PASS;
  }

  // Pending character argument (r{char})
  if (state.pendingChar === "r") {
    const n = consumeCount(state);
    const actions: Action[] = [];
    pushN(actions, "input.delete", n);
    actions.push({ type: "insertText", text: key.repeat(n) });
    state.pendingChar = null;
    return { consume: true, actions };
  }

  // Pending g prefix (gg, ge, etc.)
  if (state.pendingChar === "g") {
    state.pendingChar = null;
    const actions: Action[] = [];
    if (key === "g") {
      consumeCount(state);
      actions.push({ type: "cursorTo", offset: 0 });
    } else {
      resetPending(state);
    }
    return { consume: true, actions };
  }

  if (ev.name === "tab") return PASS;

  // Everything below is consumed
  const actions: Action[] = [];

  if (/[1-9]/.test(key) || (key === "0" && state.count > 0)) {
    state.count = state.count * 10 + parseInt(key, 10);
    return { consume: true, actions };
  }

  if (ev.name === "return") {
    actions.push({ type: "cmd", cmd: "input.submit" });
    resetPending(state);
    return { consume: true, actions };
  }

  if (key === ":") {
    actions.push({ type: "cmd", cmd: "command.palette.show" });
    resetPending(state);
    return { consume: true, actions };
  }

  if (key === "/") {
    actions.push({ type: "cmd", cmd: "session.timeline" });
    resetPending(state);
    return { consume: true, actions };
  }

  if (key === "[") {
    actions.push({ type: "cmd", cmd: "session.half.page.up" });
    resetPending(state);
    return { consume: true, actions };
  }

  if (key === "]") {
    actions.push({ type: "cmd", cmd: "session.half.page.down" });
    resetPending(state);
    return { consume: true, actions };
  }

  if (key === "{") {
    actions.push({ type: "cmd", cmd: "session.message.previous" });
    resetPending(state);
    return { consume: true, actions };
  }

  if (key === "}") {
    actions.push({ type: "cmd", cmd: "session.message.next" });
    resetPending(state);
    return { consume: true, actions };
  }

  if (key === "p") {
    if (state.yankRegister) actions.push({ type: "yank", text: state.yankRegister });
    actions.push({ type: "cmd", cmd: "prompt.paste" });
    resetPending(state);
    return { consume: true, actions };
  }

  if (key === "X") {
    pushN(actions, "input.backspace", consumeCount(state));
    return { consume: true, actions };
  }

  if (key === "J") {
    const n = consumeCount(state);
    for (let i = 0; i < n; i++) {
      actions.push({ type: "cmd", cmd: "input.line.end" });
      actions.push({ type: "cmd", cmd: "input.delete" });
    }
    return { consume: true, actions };
  }

  // Operators: d, c, y
  if (key === "d" || key === "c" || key === "y") {
    if (state.pendingOp === key) {
      const n = consumeCount(state);
      if (key === "y") {
        const cursorLine = prompt.getCursorLine();
        const lines: string[] = [];
        for (let i = 0; i < n; i++) lines.push(prompt.getLine(cursorLine + i));
        const text = `${lines.join("\n")}\n`;
        state.yankRegister = text;
        actions.push({ type: "yank", text });
        actions.push({ type: "toast", message: `${n} line${n > 1 ? "s" : ""} yanked`, duration: 1000 });
      } else {
        pushN(actions, "input.delete.line", n);
        if (key === "c") enterInsert(state, actions);
      }
      state.pendingOp = null;
      return { consume: true, actions };
    }
    state.pendingOp = key;
    return { consume: true, actions };
  }

  if (key === "D") {
    actions.push({ type: "cmd", cmd: "input.delete.to.line.end" });
    resetPending(state);
    return { consume: true, actions };
  }

  if (key === "C") {
    actions.push({ type: "cmd", cmd: "input.delete.to.line.end" });
    enterInsert(state, actions);
    return { consume: true, actions };
  }

  // Pending operator + e (end-of-word needs special handling)
  if (state.pendingOp && key === "e") {
    const n = consumeCount(state);
    const offset = prompt.getCursorOffset();
    const target = endOfWord(prompt.getPlainText(), offset, n);
    if (state.pendingOp === "y") {
      const text = prompt.getPlainText().slice(offset, target + 1);
      state.yankRegister = text;
      actions.push({ type: "yank", text });
      resetPending(state);
    } else {
      actions.push({ type: "deleteRange", start: offset, end: target });
      if (state.pendingOp === "c") enterInsert(state, actions);
      else resetPending(state);
    }
    return { consume: true, actions };
  }

  // Pending operator + motion
  if (state.pendingOp && key in MOTIONS) {
    const n = consumeCount(state);

    if (state.pendingOp === "y") {
      const selectCmd = SELECT_MOTIONS[key];
      if (selectCmd) {
        pushN(actions, selectCmd, n);
        actions.push({ type: "yankSelection" });
      }
      resetPending(state);
      return { consume: true, actions };
    }

    if (key === "j") {
      pushN(actions, "input.delete.line", n + 1);
      if (state.pendingOp === "c") enterInsert(state, actions);
      else resetPending(state);
      return { consume: true, actions };
    }
    if (key === "k") {
      pushN(actions, "input.move.up", n);
      pushN(actions, "input.delete.line", n + 1);
      if (state.pendingOp === "c") enterInsert(state, actions);
      else resetPending(state);
      return { consume: true, actions };
    }
    if (key === "G") {
      consumeCount(state);
      const offset = prompt.getCursorOffset();
      const text = prompt.getPlainText();
      actions.push({ type: "deleteRange", start: offset, end: Math.max(0, text.length - 1) });
      if (state.pendingOp === "c") enterInsert(state, actions);
      else resetPending(state);
      return { consume: true, actions };
    }

    const deleteCmd = DELETE_MOTION[key];
    if (deleteCmd) {
      pushN(actions, deleteCmd, n);
      if (state.pendingOp === "c") enterInsert(state, actions);
      else resetPending(state);
      return { consume: true, actions };
    }

    resetPending(state);
    return { consume: true, actions };
  }

  // Standalone e (end-of-word)
  if (key === "e") {
    const n = consumeCount(state);
    const target = endOfWord(prompt.getPlainText(), prompt.getCursorOffset(), n);
    actions.push({ type: "cursorTo", offset: target });
    return { consume: true, actions };
  }

  // Standalone motions
  if (key in MOTIONS) {
    const n = consumeCount(state);
    if ((key === "j" || key === "k") && isInputEmpty(prompt)) {
      const cmd = key === "k" ? "prompt.history.previous" : "prompt.history.next";
      pushN(actions, cmd, n);
      return { consume: true, actions };
    }
    pushN(actions, MOTIONS[key], n);
    return { consume: true, actions };
  }

  // g prefix — wait for second keypress
  if (key === "g") {
    state.pendingChar = "g";
    return { consume: true, actions };
  }

  if (key === "x") {
    pushN(actions, "input.delete", consumeCount(state));
    return { consume: true, actions };
  }

  if (key === "r") {
    state.pendingChar = "r";
    return { consume: true, actions };
  }

  if (key === "u") {
    actions.push({ type: "undo" });
    resetPending(state);
    return { consume: true, actions };
  }

  // Visual mode entry
  if (key === "v") {
    state.mode = "visual";
    state.oneShotNormal = false;
    resetPending(state);
    return { consume: true, actions: [{ type: "mode", mode: "visual" }] };
  }

  // Insert entries
  if (key === "i") {
    enterInsert(state, actions);
    return { consume: true, actions };
  }

  if (key === "a") {
    actions.push({ type: "cmd", cmd: "input.move.right" });
    enterInsert(state, actions);
    return { consume: true, actions };
  }

  if (key === "A") {
    actions.push({ type: "cmd", cmd: "input.line.end" });
    enterInsert(state, actions);
    return { consume: true, actions };
  }

  if (key === "o") {
    actions.push({ type: "cmd", cmd: "input.line.end" });
    actions.push({ type: "cmd", cmd: "input.newline" });
    enterInsert(state, actions);
    return { consume: true, actions };
  }

  if (key === "O") {
    actions.push({ type: "cmd", cmd: "input.line.home" });
    actions.push({ type: "cmd", cmd: "input.newline" });
    actions.push({ type: "cmd", cmd: "input.move.up" });
    enterInsert(state, actions);
    return { consume: true, actions };
  }

  // Unbound key — already consumed
  return { consume: true, actions };
}

export function handleVisualKey(state: VimState, key: string, ev: KeyEvent): HandlerResult {
  if (ev.meta || ev.super) return PASS;
  if (ev.ctrl) return PASS;

  const actions: Action[] = [];

  // Pending g prefix in visual mode
  if (state.pendingChar === "g") {
    state.pendingChar = null;
    if (key === "g") {
      actions.push({ type: "cmd", cmd: "input.select.buffer.home" });
      state.count = 0;
      return { consume: true, actions };
    }
    // Unknown g-combo or escape — fall through to normal visual handling
  }

  // Count accumulation
  if (/[1-9]/.test(key) || (key === "0" && state.count > 0)) {
    state.count = state.count * 10 + parseInt(key, 10);
    return { consume: true, actions };
  }

  // Exit visual mode
  if (ev.name === "escape" || key === "v") {
    exitVisual(state, actions);
    return { consume: true, actions };
  }

  // Operators act on selection
  if (key === "d" || key === "x") {
    actions.push({ type: "cmd", cmd: "input.backspace" });
    enterNormal(state, actions);
    return { consume: true, actions };
  }

  if (key === "c") {
    actions.push({ type: "cmd", cmd: "input.backspace" });
    enterInsert(state, actions);
    return { consume: true, actions };
  }

  if (key === "y") {
    actions.push({ type: "yankSelection" });
    enterNormal(state, actions);
    return { consume: true, actions };
  }

  // Motions extend selection
  if (key in SELECT_MOTIONS) {
    pushN(actions, SELECT_MOTIONS[key], consumeCount(state));
    return { consume: true, actions };
  }

  // g prefix — wait for second keypress
  if (key === "g") {
    state.pendingChar = "g";
    return { consume: true, actions };
  }

  // Unbound key — consume to prevent typing
  return { consume: true, actions };
}

// ── Helpers ──────────────────────────────────────────────────

export function finishOneShotIfComplete(state: VimState, result: HandlerResult): void {
  if (!state.oneShotNormal) return;
  if (!result.consume) return;
  if (state.pendingOp !== null || state.pendingChar !== null || state.count > 0) return;
  const alreadyEnteringInsert = result.actions.some((a) => a.type === "mode" && a.mode === "insert");
  if (alreadyEnteringInsert) {
    state.oneShotNormal = false;
    return;
  }
  state.oneShotNormal = false;
  state.mode = "insert";
  result.actions.push({ type: "mode", mode: "insert" });
}

function resetPending(state: VimState) {
  state.pendingOp = null;
  state.pendingChar = null;
  state.count = 0;
}

function consumeCount(state: VimState): number {
  const n = state.count || 1;
  state.count = 0;
  return n;
}

function enterInsert(state: VimState, actions: Action[]) {
  resetPending(state);
  state.mode = "insert";
  state.oneShotNormal = false;
  actions.push({ type: "mode", mode: "insert" });
}

function enterNormal(state: VimState, actions: Action[]) {
  state.mode = "normal";
  state.count = 0;
  state.oneShotNormal = false;
  actions.push({ type: "mode", mode: "normal" });
}

function exitVisual(state: VimState, actions: Action[]) {
  actions.push({ type: "clearSelection" });
  enterNormal(state, actions);
}

function pushN(actions: Action[], cmd: string, n: number) {
  for (let i = 0; i < n; i++) actions.push({ type: "cmd", cmd });
}

function isInputEmpty(prompt: PromptAccess): boolean {
  return prompt.getLineCount() === 1 && prompt.getLine(0) === "";
}

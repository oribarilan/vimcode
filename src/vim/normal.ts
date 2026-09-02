import { consumeCount, enterInsert, resetPending } from "./state";
import { DELETE_MOTION, MOTIONS, SELECT_MOTIONS } from "./tables";
import { currentLineRange, endOfWord, firstNonBlankOnLine } from "./text";
import { resolveTextObject } from "./textobject";
import type { Action, HandlerResult, KeyEvent, Operator, PromptAccess, VimState } from "./types";
import { PASS, pushN } from "./util";

export function handleNormalKey(state: VimState, key: string, ev: KeyEvent, prompt: PromptAccess): HandlerResult {
  if (ev.meta || ev.super) return PASS;
  if (ev.ctrl) {
    if (ev.name === "r") {
      resetPending(state);
      return { consume: true, actions: [{ type: "cmd", cmd: "input.redo" }] };
    }
    return PASS;
  }

  // Arrow keys are host navigation, not vim motions. Pass them through so
  // OpenCode handles them (e.g. exiting the subagent view from normal mode,
  // issue #63). Consuming them here would swallow the key and trap the user.
  if (ev.name === "up" || ev.name === "down" || ev.name === "left" || ev.name === "right") {
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
  if (state.pending.kind === "replace") {
    const n = consumeCount(state);
    const actions: Action[] = [];
    pushN(actions, "input.delete", n);
    actions.push({ type: "insertText", text: key.repeat(n) });
    state.pending = { kind: "none" };
    return finishUndoableChange(actions);
  }

  // Pending g prefix (gg, ge, etc.)
  if (state.pending.kind === "goto") {
    state.pending = { kind: "none" };
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

  // Pending text object: the object char after d/c/y + i/a (diw, caw, ...).
  // Resolves to an inclusive range and applies the operator. Must run before
  // the object char is interpreted as a motion (e.g. w).
  if (state.pending.kind === "textobject") {
    const { op, around } = state.pending;
    const range = resolveTextObject(prompt.getPlainText(), prompt.getCursorOffset(), key, around);
    if (!range) {
      resetPending(state);
      return { consume: true, actions: [] };
    }
    return applyOperatorRange(state, op, prompt.getPlainText(), range.start, range.end);
  }

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
    return finishUndoableChange(actions);
  }

  if (key === "X") {
    pushN(actions, "input.backspace", consumeCount(state));
    return finishUndoableChange(actions);
  }

  if (key === "J") {
    const n = consumeCount(state);
    for (let i = 0; i < n; i++) {
      actions.push({ type: "cmd", cmd: "input.line.end" });
      actions.push({ type: "cmd", cmd: "input.delete" });
    }
    return finishUndoableChange(actions);
  }

  // Operators: d, c, y
  if (key === "d" || key === "c" || key === "y") {
    if (state.pending.kind === "operator" && state.pending.op === key) {
      const n = consumeCount(state);
      if (key === "y") {
        const cursorLine = prompt.getCursorLine();
        const lines: string[] = [];
        for (let i = 0; i < n; i++) lines.push(prompt.getLine(cursorLine + i));
        const text = `${lines.join("\n")}\n`;
        state.yankRegister = text;
        actions.push({ type: "yank", text });
        actions.push({ type: "toast", message: `${n} line${n > 1 ? "s" : ""} yanked`, duration: 1000 });
        resetPending(state);
      } else {
        pushN(actions, "input.delete.line", n);
        if (key === "c") enterInsert(state, actions);
        else resetPending(state);
        return finishUndoableChange(actions);
      }
      return { consume: true, actions };
    }
    state.pending = { kind: "operator", op: key };
    return { consume: true, actions };
  }

  // Operator + i/a begins a text object (diw, caw, ...). Must precede the
  // standalone i/a insert entries below — otherwise `di` falls through and
  // enters insert instead of waiting for the object char (#57).
  if (state.pending.kind === "operator" && (key === "i" || key === "a")) {
    state.pending = { kind: "textobject", op: state.pending.op, around: key === "a" };
    return { consume: true, actions };
  }

  if (key === "D") {
    actions.push({ type: "cmd", cmd: "input.delete.to.line.end" });
    resetPending(state);
    return finishUndoableChange(actions);
  }

  if (key === "C") {
    actions.push({ type: "cmd", cmd: "input.delete.to.line.end" });
    enterInsert(state, actions);
    return finishUndoableChange(actions);
  }

  // `_` is linewise when used with an operator, like `dd`/`cc`/`yy`.
  if (state.pending.kind === "operator" && key === "_") {
    const op = state.pending.op;
    const n = consumeCount(state);

    if (op === "y") {
      const cursorLine = prompt.getCursorLine();
      const lines: string[] = [];
      for (let i = 0; i < n; i++) lines.push(prompt.getLine(cursorLine + i));
      const text = `${lines.join("\n")}\n`;
      state.yankRegister = text;
      actions.push({ type: "yank", text });
      resetPending(state);
      return { consume: true, actions };
    }

    pushN(actions, "input.delete.line", n);
    if (op === "c") enterInsert(state, actions);
    else resetPending(state);
    return finishUndoableChange(actions);
  }

  // `^` is an exclusive characterwise motion to the first non-blank character.
  if (state.pending.kind === "operator" && key === "^") {
    const op = state.pending.op;
    consumeCount(state);
    const text = prompt.getPlainText();
    const offset = prompt.getCursorOffset();
    const target = firstNonBlankOnLine(text, offset);
    const start = Math.min(offset, target);
    const end = Math.max(offset, target) - 1;

    if (op === "y") {
      const yanked = text.slice(start, end + 1);
      state.yankRegister = yanked;
      actions.push({ type: "yank", text: yanked });
      resetPending(state);
      return { consume: true, actions };
    }

    if (start <= end) actions.push({ type: "deleteRange", start, end });
    if (op === "c") enterInsert(state, actions);
    else resetPending(state);
    return finishUndoableChange(actions);
  }

  // Pending operator + e (end-of-word needs special handling)
  if (state.pending.kind === "operator" && key === "e") {
    const op = state.pending.op;
    const n = consumeCount(state);
    const offset = prompt.getCursorOffset();
    const target = endOfWord(prompt.getPlainText(), offset, n);
    return applyOperatorRange(state, op, prompt.getPlainText(), offset, target);
  }

  // Pending operator + motion
  if (state.pending.kind === "operator" && key in MOTIONS) {
    const op = state.pending.op;
    const n = consumeCount(state);

    if (op === "y") {
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
      if (op === "c") enterInsert(state, actions);
      else resetPending(state);
      return finishUndoableChange(actions);
    }
    if (key === "k") {
      pushN(actions, "input.move.up", n);
      pushN(actions, "input.delete.line", n + 1);
      if (op === "c") enterInsert(state, actions);
      else resetPending(state);
      return finishUndoableChange(actions);
    }
    if (key === "G") {
      consumeCount(state);
      const offset = prompt.getCursorOffset();
      const text = prompt.getPlainText();
      return applyOperatorRange(state, op, text, offset, Math.max(0, text.length - 1));
    }

    const deleteCmd = DELETE_MOTION[key];
    if (deleteCmd) {
      pushN(actions, deleteCmd, n);
      if (op === "c") enterInsert(state, actions);
      else resetPending(state);
      return finishUndoableChange(actions);
    }

    // unreachable: every MOTIONS key reaching here has a DELETE_MOTION entry (j/k/G handled above)
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

  if (key === "^" || key === "_") {
    const n = consumeCount(state);
    actions.push({
      type: "cursorTo",
      offset: firstNonBlankOnLine(prompt.getPlainText(), prompt.getCursorOffset(), key === "_" ? n - 1 : 0),
    });
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
    state.pending = { kind: "goto" };
    return { consume: true, actions };
  }

  if (key === "x") {
    pushN(actions, "input.delete", consumeCount(state));
    return finishUndoableChange(actions);
  }

  if (key === "r") {
    state.pending = { kind: "replace" };
    return { consume: true, actions };
  }

  if (key === "u") {
    actions.push({ type: "undo" });
    resetPending(state);
    return { consume: true, actions };
  }

  // Visual mode entry
  if (key === "V") {
    const range = currentLineRange(prompt.getPlainText(), prompt.getCursorOffset());
    state.mode = "visual";
    state.visualAnchor = prompt.getCursorOffset();
    state.oneShotNormal = false;
    resetPending(state);
    return {
      consume: true,
      actions: [
        { type: "selectRange", start: range.start, end: range.end },
        { type: "mode", mode: "visual" },
      ],
    };
  }

  if (key === "v") {
    state.mode = "visual";
    state.visualAnchor = prompt.getCursorOffset();
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

  if (key === "I") {
    moveToFirstNonBlank(actions, prompt.getLine(prompt.getCursorLine()));
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

function finishUndoableChange(actions: Action[]): HandlerResult {
  return { consume: true, actions: [{ type: "saveUndoSnapshot" }, ...actions] };
}

// Apply a d/c/y operator to an inclusive [start, end] buffer range: yank
// copies the slice; delete/change remove it, with change entering insert.
// Shared by operator+e, operator+G, and the text-object dispatch.
function applyOperatorRange(
  state: VimState,
  op: Operator | undefined,
  text: string,
  start: number,
  end: number,
): HandlerResult {
  if (op === "y") {
    const yanked = text.slice(start, end + 1);
    state.yankRegister = yanked;
    resetPending(state);
    return { consume: true, actions: [{ type: "yank", text: yanked }] };
  }
  const actions: Action[] = [{ type: "deleteRange", start, end }];
  if (op === "c") enterInsert(state, actions);
  else resetPending(state);
  return finishUndoableChange(actions);
}

function isInputEmpty(prompt: PromptAccess): boolean {
  return prompt.getLineCount() === 1 && prompt.getLine(0) === "";
}

function moveToFirstNonBlank(actions: Action[], line: string) {
  actions.push({ type: "cmd", cmd: "input.line.home" });
  const firstNonBlank = line.search(/[^ \t\r]/);
  if (firstNonBlank !== -1) pushN(actions, "input.move.right", firstNonBlank);
}

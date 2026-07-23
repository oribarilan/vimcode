import { consumeCount, enterInsert, enterNormal, exitVisual } from "./state";
import { SELECT_MOTIONS } from "./tables";
import { endOfWord } from "./text";
import type { Action, HandlerResult, KeyEvent, PromptAccess, VimState } from "./types";
import { PASS, pushN } from "./util";

export function handleVisualKey(state: VimState, key: string, ev: KeyEvent, prompt: PromptAccess): HandlerResult {
  if (ev.meta || ev.super) return PASS;
  if (ev.ctrl) return PASS;

  const actions: Action[] = [];

  // Pending g prefix in visual mode
  if (state.pending.kind === "goto") {
    state.pending = { kind: "none" };
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

  // e — extend selection to end of word (custom, not a host command)
  if (key === "e") {
    const n = consumeCount(state);
    const target = endOfWord(prompt.getPlainText(), prompt.getCursorOffset(), n);
    actions.push({ type: "selectRange", start: state.visualAnchor ?? 0, end: target });
    actions.push({ type: "cursorTo", offset: target });
    return { consume: true, actions };
  }

  // Motions extend selection
  if (key in SELECT_MOTIONS) {
    pushN(actions, SELECT_MOTIONS[key], consumeCount(state));
    return { consume: true, actions };
  }

  // g prefix — wait for second keypress
  if (key === "g") {
    state.pending = { kind: "goto" };
    return { consume: true, actions };
  }

  // Unbound key — consume to prevent typing
  return { consume: true, actions };
}

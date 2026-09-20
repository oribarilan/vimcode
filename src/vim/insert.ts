import type { Action, HandlerResult, KeyEvent, PromptAccess, VimState } from "./types";
import { PASS } from "./util";

export function handleInsertKey(state: VimState, _key: string, ev: KeyEvent, prompt: PromptAccess): HandlerResult {
  if (ev.name === "escape") {
    state.mode = "normal";
    const actions: Action[] = [];
    // Vim moves cursor one left when leaving insert mode,
    // unless at position 0 or start of line.
    const offset = prompt.getCursorOffset();
    const stayedAtIEntry = offset === state.insertEntryOffset;
    state.insertEntryOffset = undefined;
    if (!stayedAtIEntry && offset > 0 && prompt.getPlainText()[offset - 1] !== "\n") {
      actions.push({ type: "cursorLeft" });
    }
    actions.push({ type: "mode", mode: "normal" });
    return { consume: true, actions };
  }
  if (ev.name === "return" && ev.ctrl) {
    state.insertEntryOffset = undefined;
    return { consume: true, actions: [{ type: "cmd", cmd: "input.submit" }] };
  }
  if (ev.name === "return") {
    state.insertEntryOffset = undefined;
    return { consume: true, actions: [{ type: "cmd", cmd: "input.newline" }] };
  }
  if (ev.name === "tab") {
    state.insertEntryOffset = undefined;
    return { consume: true, actions: [{ type: "insertText", text: "\t" }] };
  }
  if (ev.name === "o" && ev.ctrl) {
    state.mode = "normal";
    state.oneShotNormal = true;
    state.insertEntryOffset = undefined;
    return { consume: true, actions: [{ type: "mode", mode: "(insert)" }] };
  }
  state.insertEntryOffset = undefined;
  return PASS;
}

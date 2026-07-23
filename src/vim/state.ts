import type { Action, HandlerResult, VimState } from "./types";

export function createVimState(): VimState {
  return {
    mode: "insert",
    pending: { kind: "none" },
    count: 0,
    yankRegister: "",
    oneShotNormal: false,
    disabled: false,
  };
}

export function toggleVimMode(state: VimState): HandlerResult {
  state.disabled = !state.disabled;
  if (state.disabled) {
    // Reset to clean insert mode so cursor style updates and no stale
    // pending state carries over when re-enabled.
    state.mode = "insert";
    state.pending = { kind: "none" };
    state.count = 0;
    state.oneShotNormal = false;
    return {
      consume: true,
      actions: [
        { type: "toast", message: "Vim mode disabled" },
        { type: "mode", mode: "insert" },
      ],
    };
  }
  return { consume: true, actions: [{ type: "toast", message: "Vim mode enabled" }] };
}

export function finishOneShotIfComplete(state: VimState, result: HandlerResult): void {
  if (!state.oneShotNormal) return;
  if (!result.consume) return;
  if (state.pending.kind !== "none" || state.count > 0) return;
  const alreadyEnteringInsert = result.actions.some((a) => a.type === "mode" && a.mode === "insert");
  if (alreadyEnteringInsert) {
    state.oneShotNormal = false;
    return;
  }
  state.oneShotNormal = false;
  state.mode = "insert";
  result.actions.push({ type: "mode", mode: "insert" });
}

export function resetPending(state: VimState) {
  state.pending = { kind: "none" };
  state.count = 0;
}

export function consumeCount(state: VimState): number {
  const n = state.count || 1;
  state.count = 0;
  return n;
}

export function enterInsert(state: VimState, actions: Action[]) {
  resetPending(state);
  state.mode = "insert";
  state.oneShotNormal = false;
  actions.push({ type: "mode", mode: "insert" });
}

export function enterNormal(state: VimState, actions: Action[]) {
  state.mode = "normal";
  state.count = 0;
  state.oneShotNormal = false;
  actions.push({ type: "mode", mode: "normal" });
}

export function exitVisual(state: VimState, actions: Action[]) {
  actions.push({ type: "clearSelection" });
  enterNormal(state, actions);
}

import type { HandlerResult } from "./types";

export { handleInsertKey } from "./insert";
export { handleNormalKey } from "./normal";
export { createVimState, finishOneShotIfComplete, toggleVimMode } from "./state";
export { endOfWord } from "./text";
export type { Action, KeyEvent, PromptAccess, VimState } from "./types";
export { translateKey } from "./util";
export { handleVisualKey } from "./visual";

const _CONSUME: HandlerResult = { consume: true, actions: [] };

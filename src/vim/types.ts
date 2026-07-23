export type Mode = "normal" | "insert" | "visual" | "(insert)";
export type Operator = "d" | "c" | "y";

export type Pending = { kind: "none" } | { kind: "operator"; op: Operator } | { kind: "goto" } | { kind: "replace" };

export type Action =
  | { type: "cmd"; cmd: string }
  | { type: "mode"; mode: Mode }
  | { type: "toast"; message: string; duration?: number }
  | { type: "yank"; text: string }
  | { type: "insertText"; text: string }
  | { type: "yankSelection" }
  | { type: "clearSelection" }
  | { type: "deleteRange"; start: number; end: number }
  | { type: "saveUndoSnapshot" }
  | { type: "undo" }
  | { type: "cursorTo"; offset: number }
  | { type: "selectRange"; start: number; end: number };

export type HandlerResult = {
  consume: boolean;
  actions: Action[];
};

export type VimState = {
  mode: Mode;
  pending: Pending;
  count: number;
  yankRegister: string;
  oneShotNormal: boolean;
  disabled: boolean;
  visualAnchor?: number;
};

export type KeyEvent = {
  name: string;
  shift?: boolean;
  ctrl?: boolean;
  meta?: boolean;
  super?: boolean;
  eventType?: string;
};

export type PromptAccess = {
  getLine: (n: number) => string;
  getLineCount: () => number;
  getCursorLine: () => number;
  getCursorOffset: () => number;
  getPlainText: () => string;
};

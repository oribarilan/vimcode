import type { Action } from "../src/vim";

export function cmds(actions: Action[]): string[] {
  return actions.filter((a): a is Extract<Action, { type: "cmd" }> => a.type === "cmd").map((a) => a.cmd);
}

export function cursorTos(actions: Action[]): number[] {
  return actions.filter((a): a is Extract<Action, { type: "cursorTo" }> => a.type === "cursorTo").map((a) => a.offset);
}

export function cursorLefts(actions: Action[]): number {
  return actions.filter((a) => a.type === "cursorLeft").length;
}

export function deleteRanges(actions: Action[]): Array<{ start: number; end: number }> {
  return actions
    .filter((a): a is Extract<Action, { type: "deleteRange" }> => a.type === "deleteRange")
    .map((a) => ({ start: a.start, end: a.end }));
}

export function saveUndoSnapshots(actions: Action[]): Action[] {
  return actions.filter((a) => a.type === "saveUndoSnapshot");
}

export function selectRanges(actions: Action[]): Array<{ start: number; end: number }> {
  return actions
    .filter((a): a is Extract<Action, { type: "selectRange" }> => a.type === "selectRange")
    .map((a) => ({ start: a.start, end: a.end }));
}

export const ev = (name: string, opts?: { shift?: boolean; ctrl?: boolean; meta?: boolean; super?: boolean }) => ({
  name,
  shift: opts?.shift ?? false,
  ctrl: opts?.ctrl ?? false,
  meta: opts?.meta ?? false,
  super: opts?.super ?? false,
});

import type { Action, HandlerResult, KeyEvent } from "./types";

export const PASS: HandlerResult = { consume: false, actions: [] };

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

export function pushN(actions: Action[], cmd: string, n: number) {
  for (let i = 0; i < n; i++) actions.push({ type: "cmd", cmd });
}

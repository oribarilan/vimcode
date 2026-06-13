import type { KeyEvent } from "./vim";

export type KeyStrokeInput = { name: string; ctrl?: boolean; shift?: boolean; meta?: boolean; super?: boolean };
export type KeyLike = string | KeyStrokeInput;

const MODS = ["ctrl", "shift", "meta", "super"] as const;
type Mod = (typeof MODS)[number];

const MOD_ALIASES: Record<string, Mod> = {
  ctrl: "ctrl",
  control: "ctrl",
  shift: "shift",
  meta: "meta",
  alt: "meta",
  option: "meta",
  super: "super",
};

function parseString(s: string): { key: string; mods: Record<Mod, boolean> } {
  const mods: Record<Mod, boolean> = { ctrl: false, shift: false, meta: false, super: false };
  if (s === "+") return { key: "+", mods };
  const parts = s.split("+").filter(Boolean);
  const last = parts.pop();
  if (!last) return { key: s.toLowerCase(), mods };
  const key = last.toLowerCase();
  for (const p of parts) {
    const mod = MOD_ALIASES[p.toLowerCase()];
    if (mod) mods[mod] = true;
  }
  return { key, mods };
}

function matchParsed(ev: KeyEvent, key: string, mods: Record<Mod, boolean>): boolean {
  if (ev.name.toLowerCase() !== key) return false;
  return MODS.every((m) => (ev[m] ?? false) === mods[m]);
}

export function matchesKeyLike(ev: KeyEvent, keyLike: KeyLike): boolean {
  if (typeof keyLike === "string") {
    const { key, mods } = parseString(keyLike);
    return matchParsed(ev, key, mods);
  }
  const mods: Record<Mod, boolean> = { ctrl: false, shift: false, meta: false, super: false };
  for (const m of MODS) if (keyLike[m]) mods[m] = true;
  return matchParsed(ev, keyLike.name.toLowerCase(), mods);
}

export function findMatchingLeader(ev: KeyEvent, keys: KeyLike[]): KeyLike | null {
  return keys.find((k) => matchesKeyLike(ev, k)) ?? null;
}

export function leaderChar(keyLike: KeyLike): string | null {
  let key: string;
  let hasShift: boolean;
  let hasOtherMod: boolean;

  if (typeof keyLike === "string") {
    const parsed = parseString(keyLike);
    key = parsed.key;
    hasShift = parsed.mods.shift;
    hasOtherMod = parsed.mods.ctrl || parsed.mods.meta || parsed.mods.super;
  } else {
    key = keyLike.name.toLowerCase();
    hasShift = keyLike.shift ?? false;
    hasOtherMod = !!(keyLike.ctrl || keyLike.meta || keyLike.super);
  }

  if (hasOtherMod) return null;
  if (key === "space") return " ";
  if (key === "tab") return "\t";
  if (key.length !== 1) return null;
  return hasShift ? key.toUpperCase() : key;
}

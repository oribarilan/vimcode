import { describe, expect, it } from "bun:test";
import { findMatchingLeader, leaderChar, matchesKeyLike } from "../src/leader";

const ev = (name: string, opts?: { shift?: boolean; ctrl?: boolean; meta?: boolean; super?: boolean }) => ({
  name,
  shift: opts?.shift ?? false,
  ctrl: opts?.ctrl ?? false,
  meta: opts?.meta ?? false,
  super: opts?.super ?? false,
});

describe("matchesKeyLike", () => {
  // String format
  it("ctrl+x matches event with ctrl and name x", () => {
    expect(matchesKeyLike(ev("x", { ctrl: true }), "ctrl+x")).toBe(true);
  });

  it("control+x matches (alias)", () => {
    expect(matchesKeyLike(ev("x", { ctrl: true }), "control+x")).toBe(true);
  });

  it("alt+m matches event with meta", () => {
    expect(matchesKeyLike(ev("m", { meta: true }), "alt+m")).toBe(true);
  });

  it("option+m matches event with meta (alias)", () => {
    expect(matchesKeyLike(ev("m", { meta: true }), "option+m")).toBe(true);
  });

  it("ctrl+shift+d matches event with ctrl+shift", () => {
    expect(matchesKeyLike(ev("d", { ctrl: true, shift: true }), "ctrl+shift+d")).toBe(true);
  });

  it("ctrl+x does not match when shift is also true", () => {
    expect(matchesKeyLike(ev("x", { ctrl: true, shift: true }), "ctrl+x")).toBe(false);
  });

  it("space matches event with name space", () => {
    expect(matchesKeyLike(ev("space"), "space")).toBe(true);
  });

  it("+ as literal key matches event with name +", () => {
    expect(matchesKeyLike(ev("+"), "+")).toBe(true);
  });

  it("Ctrl+X matches (case insensitive)", () => {
    expect(matchesKeyLike(ev("x", { ctrl: true }), "Ctrl+X")).toBe(true);
  });

  it("simple key a matches event with name a", () => {
    expect(matchesKeyLike(ev("a"), "a")).toBe(true);
  });

  // Object format
  it("object { name: x, ctrl: true } matches event", () => {
    expect(matchesKeyLike(ev("x", { ctrl: true }), { name: "x", ctrl: true })).toBe(true);
  });

  it("object { name: x } does not match event with ctrl", () => {
    expect(matchesKeyLike(ev("x", { ctrl: true }), { name: "x" })).toBe(false);
  });

  it("object without modifiers matches plain event", () => {
    expect(matchesKeyLike(ev("a"), { name: "a" })).toBe(true);
  });
});

describe("findMatchingLeader", () => {
  it("returns first matching key from array", () => {
    const keys = ["ctrl+x", "space", "a"] as const;
    expect(findMatchingLeader(ev("space"), [...keys])).toBe("space");
  });

  it("returns null for empty array", () => {
    expect(findMatchingLeader(ev("a"), [])).toBeNull();
  });

  it("returns null when nothing matches", () => {
    expect(findMatchingLeader(ev("z"), ["a", "b", "c"])).toBeNull();
  });
});

describe("leaderChar", () => {
  // String format
  it("space → ' '", () => {
    expect(leaderChar("space")).toBe(" ");
  });

  it("tab → '\\t'", () => {
    expect(leaderChar("tab")).toBe("\t");
  });

  it("ctrl+x → null", () => {
    expect(leaderChar("ctrl+x")).toBeNull();
  });

  it("shift+a → 'A'", () => {
    expect(leaderChar("shift+a")).toBe("A");
  });

  it("a → 'a'", () => {
    expect(leaderChar("a")).toBe("a");
  });

  it("escape → null (multi-char name)", () => {
    expect(leaderChar("escape")).toBeNull();
  });

  // Object format
  it("{ name: space } → ' '", () => {
    expect(leaderChar({ name: "space" })).toBe(" ");
  });

  it("{ name: x, ctrl: true } → null", () => {
    expect(leaderChar({ name: "x", ctrl: true })).toBeNull();
  });

  it("{ name: a, shift: true } → 'A'", () => {
    expect(leaderChar({ name: "a", shift: true })).toBe("A");
  });

  it("{ name: a } → 'a'", () => {
    expect(leaderChar({ name: "a" })).toBe("a");
  });
});

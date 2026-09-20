import { describe, expect, it } from "bun:test";
import { translateKey } from "../../src/vim";
import { ev } from "../support";

// ── translateKey ────────────────────────────────────────────

describe("translateKey", () => {
  it("lowercase passes through", () => {
    expect(translateKey(ev("h"))).toBe("h");
  });

  it("shift+letter uppercases", () => {
    expect(translateKey(ev("g", { shift: true }))).toBe("G");
  });

  it("shift+4 → $", () => {
    expect(translateKey(ev("4", { shift: true }))).toBe("$");
  });

  it("shift+6 → ^", () => {
    expect(translateKey(ev("6", { shift: true }))).toBe("^");
  });

  it("shift+- → _", () => {
    expect(translateKey(ev("-", { shift: true }))).toBe("_");
  });

  it("shift+[ → {", () => {
    expect(translateKey(ev("[", { shift: true }))).toBe("{");
  });

  it("shift+] → }", () => {
    expect(translateKey(ev("]", { shift: true }))).toBe("}");
  });
});

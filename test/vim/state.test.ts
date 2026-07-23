import { describe, expect, it } from "bun:test";
import { createVimState, toggleVimMode } from "../../src/vim";

// ── createVimState ───────────────────────────────────────────

describe("createVimState", () => {
  it("initializes disabled: false", () => {
    const s = createVimState();
    expect(s.disabled).toBe(false);
  });
});

// ── toggleVimMode ────────────────────────────────────────────

describe("toggleVimMode", () => {
  it("flips disabled from false to true", () => {
    const s = createVimState();
    s.disabled = false;
    toggleVimMode(s);
    expect(s.disabled).toBe(true);
  });

  it("flips disabled from true to false", () => {
    const s = createVimState();
    s.disabled = true;
    toggleVimMode(s);
    expect(s.disabled).toBe(false);
  });

  it("resets mode to insert when disabling", () => {
    const s = createVimState();
    s.mode = "normal";
    s.pending = { kind: "operator", op: "d" };
    s.count = 3;
    toggleVimMode(s);
    expect(s.mode).toBe("insert");
    expect(s.pending).toEqual({ kind: "none" });
    expect(s.count).toBe(0);
    expect(s.oneShotNormal).toBe(false);
  });

  it("returns a toast and mode action when disabling", () => {
    const s = createVimState();
    s.disabled = false;
    const r = toggleVimMode(s);
    expect(r.actions).toContainEqual({ type: "toast", message: "Vim mode disabled" });
    expect(r.actions).toContainEqual({ type: "mode", mode: "insert" });
  });

  it("returns a toast action with 'Vim mode enabled' when enabling", () => {
    const s = createVimState();
    s.disabled = true;
    const r = toggleVimMode(s);
    expect(r.actions).toContainEqual({ type: "toast", message: "Vim mode enabled" });
  });

  it("does not reset mode when enabling", () => {
    const s = createVimState();
    s.disabled = true;
    s.mode = "normal";
    toggleVimMode(s);
    expect(s.mode).toBe("normal");
  });

  it("returns consume: true", () => {
    const s = createVimState();
    const r = toggleVimMode(s);
    expect(r.consume).toBe(true);
  });
});

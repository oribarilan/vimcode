import { describe, expect, it } from "bun:test";
import { resolveTextObject } from "../../src/vim/textobject";

// resolveTextObject is the single dispatch seam: object char -> range.
// PR1 handles only `w`; unknown chars must return null so handlers no-op.

describe("resolveTextObject", () => {
  it("resolves `w` to the inner word range", () => {
    expect(resolveTextObject("hello world", 2, "w", false)).toEqual({ start: 0, end: 4 });
  });

  it("resolves `w` with around to include trailing whitespace", () => {
    expect(resolveTextObject("hello world", 2, "w", true)).toEqual({ start: 0, end: 5 });
  });

  it("returns null for an unknown object char", () => {
    expect(resolveTextObject("hello world", 2, "z", false)).toBeNull();
  });

  it("returns null when the underlying object has no range", () => {
    expect(resolveTextObject("", 0, "w", false)).toBeNull();
  });
});

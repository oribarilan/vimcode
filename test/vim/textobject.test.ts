import { describe, expect, it } from "bun:test";
import { resolveTextObject } from "../../src/vim/textobject";

// resolveTextObject is the single dispatch seam: object char -> range.
// Word (`w`), quote (" ' ` and `q`=any), and bracket (( ) { } [ ] < > and
// `b`=any) objects all route through here; unknown chars return null so
// handlers no-op.

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

  it("resolves double quotes", () => {
    expect(resolveTextObject('say "hi"', 6, '"', false)).toEqual({ start: 5, end: 6 });
  });

  it("resolves single quotes", () => {
    expect(resolveTextObject("say 'hi'", 6, "'", false)).toEqual({ start: 5, end: 6 });
  });

  it("resolves backticks", () => {
    expect(resolveTextObject("say `hi`", 6, "`", false)).toEqual({ start: 5, end: 6 });
  });

  it("resolves `q` to the nearest quote of any type", () => {
    expect(resolveTextObject("'hi'", 2, "q", false)).toEqual({ start: 1, end: 2 });
  });

  it("resolves parens from either delimiter", () => {
    expect(resolveTextObject("(abc)", 2, "(", false)).toEqual({ start: 1, end: 3 });
    expect(resolveTextObject("(abc)", 2, ")", false)).toEqual({ start: 1, end: 3 });
  });

  it("resolves braces, square brackets, and angle brackets", () => {
    expect(resolveTextObject("{x}", 1, "{", false)).toEqual({ start: 1, end: 1 });
    expect(resolveTextObject("[x]", 1, "[", false)).toEqual({ start: 1, end: 1 });
    expect(resolveTextObject("<x>", 1, "<", false)).toEqual({ start: 1, end: 1 });
  });

  it("resolves `b` to the nearest bracket of any type", () => {
    expect(resolveTextObject("[x]", 1, "b", false)).toEqual({ start: 1, end: 1 });
  });

  it("`b` excludes angle brackets", () => {
    expect(resolveTextObject("<x>", 1, "b", false)).toBeNull();
  });

  it("passes the around flag through to pairs", () => {
    expect(resolveTextObject("(abc)", 2, "(", true)).toEqual({ start: 0, end: 4 });
  });
});

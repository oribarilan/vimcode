import { describe, expect, it } from "bun:test";
import { endOfWord } from "../../src/vim";
import { charKind, currentLineRange, isWhitespace, wordRange } from "../../src/vim/text";

// ── endOfWord ──────────────────────────────────────────────

describe("endOfWord", () => {
  it("from start of word, moves to last char", () => {
    expect(endOfWord("hello world", 0)).toBe(4);
  });

  it("from middle of word, moves to last char", () => {
    expect(endOfWord("hello world", 2)).toBe(4);
  });

  it("from end of word, moves to end of next word", () => {
    expect(endOfWord("hello world", 4)).toBe(10);
  });

  it("from whitespace, skips to end of next word", () => {
    expect(endOfWord("hello world", 5)).toBe(10);
  });

  it("stops at punctuation boundary", () => {
    expect(endOfWord("hello.world", 0)).toBe(4);
  });

  it("from punctuation, moves to end of punctuation run", () => {
    expect(endOfWord("hello...world", 5)).toBe(7);
  });

  it("from end of punctuation, moves to end of next word", () => {
    expect(endOfWord("a.b", 1)).toBe(2);
  });

  it("at end of text, stays put", () => {
    expect(endOfWord("hello", 4)).toBe(4);
  });

  it("handles count > 1", () => {
    expect(endOfWord("one two three", 0, 2)).toBe(6);
  });

  it("handles multiple whitespace", () => {
    expect(endOfWord("hello   world", 0)).toBe(4);
    expect(endOfWord("hello   world", 4)).toBe(12);
  });

  it("handles newlines as whitespace", () => {
    expect(endOfWord("hello\nworld", 4)).toBe(10);
  });

  it("clamps at end of text", () => {
    expect(endOfWord("hi", 0, 5)).toBe(1);
  });
});

// ── isWhitespace ───────────────────────────────────────────

describe("isWhitespace", () => {
  it("returns true for a space", () => {
    expect(isWhitespace(" ")).toBe(true);
  });

  it("returns true for a tab", () => {
    expect(isWhitespace("\t")).toBe(true);
  });

  it("returns true for a newline", () => {
    expect(isWhitespace("\n")).toBe(true);
  });

  it("returns true for a carriage return", () => {
    expect(isWhitespace("\r")).toBe(true);
  });

  it("returns false for a word character", () => {
    expect(isWhitespace("a")).toBe(false);
  });

  it("returns false for punctuation", () => {
    expect(isWhitespace(".")).toBe(false);
  });
});

// ── charKind ───────────────────────────────────────────────

describe("charKind", () => {
  it("classifies a letter as word", () => {
    expect(charKind("a")).toBe("word");
  });

  it("classifies a digit as word", () => {
    expect(charKind("7")).toBe("word");
  });

  it("classifies an underscore as word", () => {
    expect(charKind("_")).toBe("word");
  });

  it("classifies whitespace as space", () => {
    expect(charKind(" ")).toBe("space");
    expect(charKind("\n")).toBe("space");
  });

  it("classifies punctuation as punct", () => {
    expect(charKind(".")).toBe("punct");
    expect(charKind("-")).toBe("punct");
  });
});

// ── currentLineRange ───────────────────────────────────────

describe("currentLineRange", () => {
  it("returns {0,0} for empty text", () => {
    expect(currentLineRange("", 0)).toEqual({ start: 0, end: 0 });
  });

  it("spans a single line to its final char index", () => {
    expect(currentLineRange("hello", 2)).toEqual({ start: 0, end: 4 });
  });

  it("ends at the newline for a middle line", () => {
    // "hello\nworld" — offset 8 is on the second (last) line; end clamps to len-1
    expect(currentLineRange("hello\nworld", 8)).toEqual({ start: 6, end: 10 });
  });

  it("starts after the preceding newline", () => {
    // offset 0 is on the first line, which ends at the first newline (index 5)
    expect(currentLineRange("hello\nworld", 0)).toEqual({ start: 0, end: 5 });
  });

  it("clamps an out-of-range offset into the text", () => {
    expect(currentLineRange("hello", 99)).toEqual({ start: 0, end: 4 });
  });
});

// ── wordRange (inner) ──────────────────────────────────────

describe("wordRange (inner)", () => {
  it("from mid-word, spans the whole word", () => {
    expect(wordRange("hello world", 2, false)).toEqual({ start: 0, end: 4 });
  });

  it("from the first char, spans the whole word", () => {
    expect(wordRange("hello world", 0, false)).toEqual({ start: 0, end: 4 });
  });

  it("from the last char, spans the whole word", () => {
    expect(wordRange("hello world", 4, false)).toEqual({ start: 0, end: 4 });
  });

  it("spans the second word", () => {
    expect(wordRange("hello world", 6, false)).toEqual({ start: 6, end: 10 });
  });

  it("on a single space, selects just that space", () => {
    expect(wordRange("hello world", 5, false)).toEqual({ start: 5, end: 5 });
  });

  it("on whitespace, selects the whole whitespace run", () => {
    expect(wordRange("a   b", 2, false)).toEqual({ start: 1, end: 3 });
  });

  it("on punctuation, selects the punctuation char", () => {
    expect(wordRange("a.b", 1, false)).toEqual({ start: 1, end: 1 });
  });

  it("on a punctuation run, selects the whole run", () => {
    expect(wordRange("a...b", 2, false)).toEqual({ start: 1, end: 3 });
  });

  it("selects a single-char buffer", () => {
    expect(wordRange("x", 0, false)).toEqual({ start: 0, end: 0 });
  });

  it("returns null for empty text", () => {
    expect(wordRange("", 0, false)).toBeNull();
  });

  it("does not cross a newline", () => {
    expect(wordRange("ab\ncd", 1, false)).toEqual({ start: 0, end: 1 });
  });

  it("selects the word after a newline", () => {
    expect(wordRange("ab\ncd", 3, false)).toEqual({ start: 3, end: 4 });
  });

  it("returns null when the cursor sits on a newline", () => {
    expect(wordRange("ab\ncd", 2, false)).toBeNull();
  });

  it("clamps an out-of-range offset into the text", () => {
    expect(wordRange("hello", 99, false)).toEqual({ start: 0, end: 4 });
  });
});

// ── wordRange (around) ─────────────────────────────────────

describe("wordRange (around)", () => {
  it("includes trailing whitespace", () => {
    expect(wordRange("hello world", 2, true)).toEqual({ start: 0, end: 5 });
  });

  it("includes a whole trailing whitespace run", () => {
    expect(wordRange("a   b", 0, true)).toEqual({ start: 0, end: 3 });
  });

  it("includes leading whitespace when there is no trailing whitespace", () => {
    expect(wordRange("hello world", 8, true)).toEqual({ start: 5, end: 10 });
  });

  it("on whitespace, includes the following word", () => {
    expect(wordRange("a   b", 2, true)).toEqual({ start: 1, end: 4 });
  });

  it("does not extend an around-word onto a CR (CRLF safety)", () => {
    expect(wordRange("word\r\nnext", 0, true)).toEqual({ start: 0, end: 3 });
  });

  it("stops a whitespace run at a CR (CRLF safety)", () => {
    // "a \r\nb": cursor on the space at index 1; the run must not swallow \r
    expect(wordRange("a \r\nb", 1, false)).toEqual({ start: 1, end: 1 });
  });
});

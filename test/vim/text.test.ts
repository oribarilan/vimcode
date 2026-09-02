import { describe, expect, it } from "bun:test";
import { endOfWord } from "../../src/vim";
import {
  anyBracketRange,
  anyQuoteRange,
  bracketRange,
  charKind,
  currentLineRange,
  firstNonBlankOnLine,
  isWhitespace,
  quoteRange,
  wordRange,
} from "../../src/vim/text";

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

// ── firstNonBlankOnLine ─────────────────────────────────────

describe("firstNonBlankOnLine", () => {
  it("skips spaces and tabs", () => {
    expect(firstNonBlankOnLine(" \t  hello", 0)).toBe(4);
  });

  it("uses the cursor's current line", () => {
    const text = "first line\n\t  second line";
    expect(firstNonBlankOnLine(text, text.indexOf("second") + 3)).toBe(text.indexOf("second"));
  });

  it("moves down the requested number of lines", () => {
    const text = "first\n  second\n\t third\n    fourth";
    expect(firstNonBlankOnLine(text, 0, 3)).toBe(text.indexOf("fourth"));
  });

  it("returns the line start when the line is blank", () => {
    expect(firstNonBlankOnLine("  \t\r\nnext", 0)).toBe(0);
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

// ── bracketRange ───────────────────────────────────────────

describe("bracketRange", () => {
  it("inner spans between the delimiters", () => {
    expect(bracketRange("(abc)", 2, "(", ")", false)).toEqual({ start: 1, end: 3 });
  });

  it("around includes the delimiters", () => {
    expect(bracketRange("(abc)", 2, "(", ")", true)).toEqual({ start: 0, end: 4 });
  });

  it("works with the cursor on the opening delimiter", () => {
    expect(bracketRange("(abc)", 0, "(", ")", false)).toEqual({ start: 1, end: 3 });
  });

  it("works with the cursor on the closing delimiter", () => {
    expect(bracketRange("(abc)", 4, "(", ")", false)).toEqual({ start: 1, end: 3 });
  });

  it("selects the innermost pair when nested", () => {
    // ( a ( b ) c ) — cursor on b (index 3) picks the inner pair
    expect(bracketRange("(a(b)c)", 3, "(", ")", false)).toEqual({ start: 3, end: 3 });
  });

  it("selects the outer pair when the cursor is outside the inner one", () => {
    expect(bracketRange("(a(b)c)", 1, "(", ")", false)).toEqual({ start: 1, end: 5 });
  });

  it("spans multiple lines", () => {
    // "(\nx\n)" — inner is everything between the parens, newlines included
    expect(bracketRange("(\nx\n)", 2, "(", ")", false)).toEqual({ start: 1, end: 3 });
  });

  it("returns null for an empty pair (nothing inside)", () => {
    expect(bracketRange("()", 0, "(", ")", false)).toBeNull();
  });

  it("around still selects an empty pair", () => {
    expect(bracketRange("()", 0, "(", ")", true)).toEqual({ start: 0, end: 1 });
  });

  it("returns null when there is no enclosing pair", () => {
    expect(bracketRange("abc", 1, "(", ")", false)).toBeNull();
  });

  it("returns null when the cursor is outside the pair", () => {
    expect(bracketRange("(a)b", 3, "(", ")", false)).toBeNull();
  });

  it("handles curly braces too", () => {
    expect(bracketRange("x{ y }z", 3, "{", "}", true)).toEqual({ start: 1, end: 5 });
  });
});

// ── quoteRange ─────────────────────────────────────────────

describe("quoteRange", () => {
  it("inner spans between the quotes", () => {
    // say "hi" ok — cursor on the i (index 6)
    expect(quoteRange('say "hi" ok', 6, '"', false)).toEqual({ start: 5, end: 6 });
  });

  it("around includes the quotes", () => {
    expect(quoteRange('say "hi" ok', 6, '"', true)).toEqual({ start: 4, end: 7 });
  });

  it("works with the cursor on the opening quote", () => {
    expect(quoteRange('say "hi"', 4, '"', false)).toEqual({ start: 5, end: 6 });
  });

  it("works with the cursor on the closing quote", () => {
    expect(quoteRange('say "hi"', 7, '"', false)).toEqual({ start: 5, end: 6 });
  });

  it("returns null for an empty pair", () => {
    expect(quoteRange('a "" b', 2, '"', false)).toBeNull();
  });

  it("around still selects an empty pair", () => {
    expect(quoteRange('a "" b', 2, '"', true)).toEqual({ start: 2, end: 3 });
  });

  it("pairs quotes left-to-right and picks the enclosing pair", () => {
    // "a" "b" — cursor on b (index 5) selects the second pair
    expect(quoteRange('"a" "b"', 5, '"', false)).toEqual({ start: 5, end: 5 });
  });

  it("returns null when the cursor is between two pairs", () => {
    expect(quoteRange('"a" "b"', 3, '"', false)).toBeNull();
  });

  it("does not pair quotes across a newline", () => {
    // "x"\n"y" — cursor on y is enclosed only by the second line's pair
    expect(quoteRange('"x"\n"y"', 5, '"', false)).toEqual({ start: 5, end: 5 });
  });

  it("returns null for an unpaired quote", () => {
    expect(quoteRange('a "b', 3, '"', false)).toBeNull();
  });

  it("returns null when there are no quotes", () => {
    expect(quoteRange("abc", 1, '"', false)).toBeNull();
  });
});

// ── anyQuoteRange (iq) ─────────────────────────────────────

describe("anyQuoteRange", () => {
  it("matches whichever quote type is present", () => {
    expect(anyQuoteRange("say 'hi'", 6, false)).toEqual({ start: 5, end: 6 });
  });

  it("picks the tightest enclosing quote when types nest", () => {
    // "a 'b' c" — cursor on b: the single-quote pair is tighter than the double
    expect(anyQuoteRange("\"a 'b' c\"", 4, false)).toEqual({ start: 4, end: 4 });
  });

  it("supports around", () => {
    expect(anyQuoteRange("say 'hi'", 6, true)).toEqual({ start: 4, end: 7 });
  });

  it("returns null when no quote encloses the cursor", () => {
    expect(anyQuoteRange("abc", 1, false)).toBeNull();
  });
});

// ── anyBracketRange (ib) ───────────────────────────────────

describe("anyBracketRange", () => {
  it("matches whichever bracket type is present", () => {
    expect(anyBracketRange("a [x] b", 3, false)).toEqual({ start: 3, end: 3 });
  });

  it("picks the tightest enclosing bracket when types nest", () => {
    // ( [x] ) — cursor on x: the square-bracket pair is tighter than the paren
    expect(anyBracketRange("( [x] )", 3, false)).toEqual({ start: 3, end: 3 });
  });

  it("supports around", () => {
    expect(anyBracketRange("( [x] )", 3, true)).toEqual({ start: 2, end: 4 });
  });

  it("excludes angle brackets (ib is ()/{}/[] only)", () => {
    expect(anyBracketRange("<x>", 1, false)).toBeNull();
  });

  it("returns null when no bracket encloses the cursor", () => {
    expect(anyBracketRange("abc", 1, false)).toBeNull();
  });
});

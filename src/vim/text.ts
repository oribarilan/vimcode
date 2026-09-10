import type { Range } from "./types";

export function endOfWord(text: string, offset: number, count = 1): number {
  const len = text.length;
  if (len === 0) return 0;
  let pos = offset;
  for (let step = 0; step < count; step++) {
    // If inside a word/punct run, advance one to start looking for next end
    if (pos < len - 1 && charKind(text[pos]) !== "space") {
      pos++;
    }
    // Skip whitespace
    while (pos < len && isWhitespace(text[pos])) pos++;
    if (pos >= len) return len - 1;
    // Find end of current word class run
    const kind = charKind(text[pos]);
    while (pos + 1 < len && charKind(text[pos + 1]) === kind) pos++;
  }
  return Math.min(pos, len - 1);
}

export function isWhitespace(ch: string): boolean {
  return ch === " " || ch === "\t" || ch === "\n" || ch === "\r";
}

export function charKind(ch: string): "word" | "punct" | "space" {
  if (isWhitespace(ch)) return "space";
  if (/\w/.test(ch)) return "word";
  return "punct";
}

// A word/whitespace run never spans a line break. \r and \n both count so
// runs stay within a line on Windows (CRLF) as well as Unix.
function isLineBreak(ch: string): boolean {
  return ch === "\n" || ch === "\r";
}

export function currentLineRange(text: string, offset: number): { start: number; end: number } {
  if (text.length === 0) return { start: 0, end: 0 };
  const safeOffset = Math.min(Math.max(offset, 0), text.length - 1);
  const start = text.lastIndexOf("\n", safeOffset - 1) + 1;
  const newline = text.indexOf("\n", safeOffset);
  return { start, end: newline === -1 ? text.length - 1 : newline };
}

export function firstNonBlankOnLine(text: string, offset: number, linesDown = 0): number {
  const safeOffset = Math.min(Math.max(offset, 0), text.length);
  let start = text.lastIndexOf("\n", safeOffset - 1) + 1;
  for (let i = 0; i < linesDown; i++) {
    const newline = text.indexOf("\n", start);
    if (newline === -1) break;
    start = newline + 1;
  }
  const lineEnd = text.indexOf("\n", start);
  const line = text.slice(start, lineEnd === -1 ? text.length : lineEnd);
  const firstNonBlank = line.search(/[^ \t\r]/);
  return start + Math.max(0, firstNonBlank);
}

// Inclusive [start, end] offsets for the `iw`/`aw` text object under the
// cursor. A "word" is a run of one charKind (word/punct/space); runs never
// cross a newline. `around` extends past a word/punct run to its trailing
// whitespace (or leading, when there is none), and past a whitespace run to
// the following word. Returns null when there is nothing to select (empty
// text, or the cursor sits on a newline).
export function wordRange(text: string, offset: number, around: boolean): Range | null {
  const len = text.length;
  if (len === 0) return null;
  const pos = Math.min(Math.max(offset, 0), len - 1);
  if (isLineBreak(text[pos])) return null;

  const kind = charKind(text[pos]);
  let start = pos;
  while (start > 0 && !isLineBreak(text[start - 1]) && charKind(text[start - 1]) === kind) start--;
  let end = pos;
  while (end < len - 1 && !isLineBreak(text[end + 1]) && charKind(text[end + 1]) === kind) end++;

  if (!around) return { start, end };

  if (kind === "space") {
    if (end < len - 1 && !isLineBreak(text[end + 1])) {
      const nextKind = charKind(text[end + 1]);
      let te = end + 1;
      while (te < len - 1 && !isLineBreak(text[te + 1]) && charKind(text[te + 1]) === nextKind) te++;
      return { start, end: te };
    }
    return { start, end };
  }

  let trailing = end;
  while (trailing < len - 1 && !isLineBreak(text[trailing + 1]) && charKind(text[trailing + 1]) === "space") trailing++;
  if (trailing > end) return { start, end: trailing };

  let leading = start;
  while (leading > 0 && !isLineBreak(text[leading - 1]) && charKind(text[leading - 1]) === "space") leading--;
  return { start: leading, end };
}

// Inclusive range for a bracket pair text object (i(/a(, i{/a{, ...). Finds
// the innermost pair enclosing the cursor, depth-aware and across lines. A
// cursor sitting on either delimiter counts as inside that pair. `around`
// includes the delimiters; inner excludes them and returns null for an empty
// pair. Returns null when no pair encloses the cursor. `open` must differ
// from `close` (use quoteRange for symmetric delimiters).
export function bracketRange(text: string, offset: number, open: string, close: string, around: boolean): Range | null {
  const len = text.length;
  if (len === 0) return null;
  const pos = Math.min(Math.max(offset, 0), len - 1);

  let openIdx: number;
  let closeIdx: number;
  if (text[pos] === open) {
    openIdx = pos;
    closeIdx = matchForward(text, pos, open, close);
  } else if (text[pos] === close) {
    closeIdx = pos;
    openIdx = matchBackward(text, pos, open, close);
  } else {
    openIdx = enclosingOpen(text, pos, open, close);
    closeIdx = openIdx === -1 ? -1 : matchForward(text, openIdx, open, close);
  }
  if (openIdx === -1 || closeIdx === -1) return null;

  if (around) return { start: openIdx, end: closeIdx };
  if (closeIdx - openIdx <= 1) return null; // empty pair — nothing inside
  return { start: openIdx + 1, end: closeIdx - 1 };
}

// Scan left from an interior offset for the nearest open with no matching
// close between it and the cursor (the enclosing pair's opening).
function enclosingOpen(text: string, from: number, open: string, close: string): number {
  let depth = 0;
  for (let i = from; i >= 0; i--) {
    if (text[i] === close) depth++;
    else if (text[i] === open) {
      if (depth === 0) return i;
      depth--;
    }
  }
  return -1;
}

// Scan right from an opening delimiter for its matching close (depth-aware).
function matchForward(text: string, openIdx: number, open: string, close: string): number {
  let depth = 0;
  for (let i = openIdx; i < text.length; i++) {
    if (text[i] === open) depth++;
    else if (text[i] === close && --depth === 0) return i;
  }
  return -1;
}

// Scan left from a closing delimiter for its matching open (depth-aware).
function matchBackward(text: string, closeIdx: number, open: string, close: string): number {
  let depth = 0;
  for (let i = closeIdx; i >= 0; i--) {
    if (text[i] === close) depth++;
    else if (text[i] === open && --depth === 0) return i;
  }
  return -1;
}

// Inclusive range for a quote text object (i"/a", i'/a', ...). Quotes don't
// nest, so they pair left-to-right within the cursor's line (never across a
// newline). Returns the pair enclosing the cursor — a cursor on a quote counts
// as inside — with `around` including the quotes. Inner returns null for an
// empty pair; the function returns null when no pair encloses the cursor.
export function quoteRange(text: string, offset: number, quote: string, around: boolean): Range | null {
  const len = text.length;
  if (len === 0) return null;
  const pos = Math.min(Math.max(offset, 0), len - 1);
  const lineStart = text.lastIndexOf("\n", pos - 1) + 1;
  const nextNewline = text.indexOf("\n", pos);
  const lineEnd = nextNewline === -1 ? len : nextNewline; // exclusive

  const quotes: number[] = [];
  for (let i = lineStart; i < lineEnd; i++) {
    if (text[i] === quote) quotes.push(i);
  }

  for (let p = 0; p + 1 < quotes.length; p += 2) {
    const openIdx = quotes[p];
    const closeIdx = quotes[p + 1];
    if (pos < openIdx || pos > closeIdx) continue;
    if (around) return { start: openIdx, end: closeIdx };
    if (closeIdx - openIdx <= 1) return null; // empty pair
    return { start: openIdx + 1, end: closeIdx - 1 };
  }
  return null;
}

// `iq`/`aq`: the tightest quote pair (of " ' `) enclosing the cursor.
export function anyQuoteRange(text: string, offset: number, around: boolean): Range | null {
  let winner: string | null = null;
  let bestSpan = Infinity;
  for (const quote of ['"', "'", "`"]) {
    const span = quoteRange(text, offset, quote, true);
    if (span && span.end - span.start < bestSpan) {
      bestSpan = span.end - span.start;
      winner = quote;
    }
  }
  return winner === null ? null : quoteRange(text, offset, winner, around);
}

// `ib`/`ab`: the tightest bracket pair (of () {} [], not angle) enclosing the
// cursor. Diverges from vim, where `ib` is parens only — see README.
export function anyBracketRange(text: string, offset: number, around: boolean): Range | null {
  const pairs: Array<[string, string]> = [
    ["(", ")"],
    ["{", "}"],
    ["[", "]"],
  ];
  let winner: [string, string] | null = null;
  let bestSpan = Infinity;
  for (const [open, close] of pairs) {
    const span = bracketRange(text, offset, open, close, true);
    if (span && span.end - span.start < bestSpan) {
      bestSpan = span.end - span.start;
      winner = [open, close];
    }
  }
  return winner === null ? null : bracketRange(text, offset, winner[0], winner[1], around);
}

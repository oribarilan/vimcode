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

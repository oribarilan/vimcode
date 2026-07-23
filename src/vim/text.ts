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

export function currentLineRange(text: string, offset: number): { start: number; end: number } {
  if (text.length === 0) return { start: 0, end: 0 };
  const safeOffset = Math.min(Math.max(offset, 0), text.length - 1);
  const start = text.lastIndexOf("\n", safeOffset - 1) + 1;
  const newline = text.indexOf("\n", safeOffset);
  return { start, end: newline === -1 ? text.length - 1 : newline };
}

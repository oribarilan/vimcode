import { anyBracketRange, anyQuoteRange, bracketRange, quoteRange, wordRange } from "./text";
import type { Range } from "./types";

// The single dispatch seam for text objects. Maps an object char (the key
// after `i`/`a`) to its inclusive [start, end] range under the cursor, or
// null when the char is not a text object or there is nothing to select.
// `q` is any quote (" ' `) and `b` is any bracket (() {} [], not angle);
// both pick the tightest pair enclosing the cursor.
export function resolveTextObject(text: string, offset: number, objectChar: string, around: boolean): Range | null {
  switch (objectChar) {
    case "w":
      return wordRange(text, offset, around);
    case '"':
    case "'":
    case "`":
      return quoteRange(text, offset, objectChar, around);
    case "q":
      return anyQuoteRange(text, offset, around);
    case "(":
    case ")":
      return bracketRange(text, offset, "(", ")", around);
    case "{":
    case "}":
      return bracketRange(text, offset, "{", "}", around);
    case "[":
    case "]":
      return bracketRange(text, offset, "[", "]", around);
    case "<":
    case ">":
      return bracketRange(text, offset, "<", ">", around);
    case "b":
      return anyBracketRange(text, offset, around);
    default:
      return null;
  }
}

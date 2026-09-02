import { wordRange } from "./text";
import type { Range } from "./types";

// The single dispatch seam for text objects. Maps an object char (the key
// after `i`/`a`) to its inclusive [start, end] range under the cursor, or
// null when the char is not a text object or there is nothing to select.
// PR2 extends this with quote and bracket pairs (" ' ` ( ) { } [ ] < > q b)
// without touching the normal/visual handlers.
export function resolveTextObject(text: string, offset: number, objectChar: string, around: boolean): Range | null {
  switch (objectChar) {
    case "w":
      return wordRange(text, offset, around);
    default:
      return null;
  }
}

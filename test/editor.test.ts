import { describe, expect, it } from "bun:test";
import { selectVisualCharacterRange } from "../src/editor";

describe("selectVisualCharacterRange", () => {
  it("includes the cursor without clearing the renderer's native selection anchor", () => {
    const calls: number[][] = [];
    let renders = 0;
    let clearedAnchor = false;
    const editor = {
      cursorOffset: 2,
      setSelection() {
        clearedAnchor = true;
      },
      editorView: { setSelection: (start: number, end: number) => calls.push([start, end]) },
      requestRender: () => renders++,
    };
    selectVisualCharacterRange(editor, 0);
    expect(calls).toEqual([[0, 3]]);
    expect(clearedAnchor).toBe(false);
    expect(renders).toBe(1);
  });

  it("keeps the original anchor when moving backward", () => {
    const calls: number[][] = [];
    selectVisualCharacterRange(
      { cursorOffset: 2, editorView: { setSelection: (start, end) => calls.push([start, end]) } },
      4,
    );
    expect(calls).toEqual([[2, 5]]);
  });

  it("leaves unsupported editors alone instead of using an anchor-clearing fallback", () => {
    let renders = 0;
    selectVisualCharacterRange({ cursorOffset: 1, requestRender: () => renders++ }, 0);
    expect(renders).toBe(0);
  });
});

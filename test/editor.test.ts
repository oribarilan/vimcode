import { describe, expect, it } from "bun:test";
import { selectVisualCharacterRange } from "../src/editor";

function editor(cursorOffset: number, character = "c") {
  const calls: number[][] = [];
  const probes: number[][] = [];
  let renders = 0;
  let resets = 0;
  let clearedAnchor = false;
  return {
    cursorOffset,
    calls,
    probes,
    get renders() {
      return renders;
    },
    get resets() {
      return resets;
    },
    get clearedAnchor() {
      return clearedAnchor;
    },
    setSelection() {
      clearedAnchor = true;
    },
    editBuffer: {
      getTextRange: (start: number, end: number) => {
        probes.push([start, end]);
        return character;
      },
    },
    editorView: {
      setSelection: (start: number, end: number) => calls.push([start, end]),
      resetSelection: () => resets++,
    },
    requestRender: () => renders++,
  };
}

describe("selectVisualCharacterRange", () => {
  it("includes the cursor without clearing the renderer's native selection anchor", () => {
    const mock = editor(2);
    selectVisualCharacterRange(mock, 0);
    expect(mock.calls).toEqual([[0, 3]]);
    expect(mock.probes).toEqual([[2, 3]]);
    expect(mock.clearedAnchor).toBe(false);
    expect(mock.renders).toBe(1);
  });

  const background = { name: "background" };
  const foreground = { name: "foreground" };
  for (const [name, bg, fg] of [
    ["both", background, foreground],
    ["background only", background, undefined],
    ["foreground only", undefined, foreground],
    ["neither", undefined, undefined],
  ] as const) {
    it(`forwards host-owned selection colors unchanged (${name})`, () => {
      let colors: Array<typeof background | undefined> = [];
      const mock = {
        ...editor(2),
        ...(bg ? { selectionBg: bg } : {}),
        ...(fg ? { selectionFg: fg } : {}),
        editorView: {
          resetSelection: () => {},
          setSelection(_start: number, _end: number, selectedBg?: typeof background, selectedFg?: typeof foreground) {
            colors = [selectedBg, selectedFg];
          },
        },
      };
      selectVisualCharacterRange(mock, 0);
      expect(colors).toHaveLength(2);
      expect(colors[0]).toBe(bg);
      expect(colors[1]).toBe(fg);
    });
  }

  it("keeps the original anchor when moving backward", () => {
    const mock = editor(2);
    selectVisualCharacterRange(mock, 4);
    expect(mock.calls).toEqual([[2, 5]]);
  });

  for (const character of ["", "\n"]) {
    it(`does not expand across ${character ? "EOL" : "EOF"}, including backward selection`, () => {
      for (const [cursor, anchor] of [
        [2, 1],
        [1, 2],
      ]) {
        const mock = editor(cursor, character);
        selectVisualCharacterRange(mock, anchor);
        expect(mock.calls).toEqual([[1, 2]]);
        expect(mock.clearedAnchor).toBe(false);
      }
    });
  }

  it("resets the lower selection on empty buffers without selecting placeholder text", () => {
    const mock = editor(0, "");
    selectVisualCharacterRange(mock, 0);
    expect(mock.calls).toEqual([]);
    expect(mock.resets).toBe(1);
    expect(mock.clearedAnchor).toBe(false);
  });

  it("uses host display-cell offsets even when they exceed JavaScript string length", () => {
    const mock = editor(5, "界");
    selectVisualCharacterRange(mock, 4);
    expect(mock.probes).toEqual([[5, 6]]);
    expect(mock.calls).toEqual([[4, 6]]);
  });

  it("leaves unsupported editors alone instead of using an anchor-clearing fallback", () => {
    let renders = 0;
    selectVisualCharacterRange({ cursorOffset: 1, requestRender: () => renders++ }, 0);
    expect(renders).toBe(0);
  });
});

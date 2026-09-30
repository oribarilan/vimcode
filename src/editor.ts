import type { RGBA } from "@opentui/core";

type VisualSelectionEditor = {
  cursorOffset: number;
  selectionBg?: RGBA;
  selectionFg?: RGBA;
  editorView?: { setSelection(start: number, end: number, bg?: RGBA, fg?: RGBA): void };
  requestRender?: () => void;
};

// Normalize the visible range without clearing the renderer's native anchor.
// The top-level setSelection() clears it, so a following word/line motion
// would restart selection at the current cursor instead of the Vim anchor.
export function selectVisualCharacterRange(editor: VisualSelectionEditor, anchor: number): void {
  if (!editor.editorView?.setSelection) return;
  const start = Math.min(anchor, editor.cursorOffset);
  const end = Math.max(anchor, editor.cursorOffset) + 1;
  editor.editorView.setSelection(start, end, editor.selectionBg, editor.selectionFg);
  editor.requestRender?.();
}

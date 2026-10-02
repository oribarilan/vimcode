type VisualSelectionEditor<Color> = {
  cursorOffset: number;
  selectionBg?: Color;
  selectionFg?: Color;
  editBuffer?: { getTextRange(start: number, end: number): string };
  editorView?: {
    setSelection(start: number, end: number, bg?: Color, fg?: Color): void;
    resetSelection(): void;
  };
  requestRender?: () => void;
};

// Normalize the visible range without clearing the renderer's native anchor.
// The top-level setSelection() clears it, so a following word/line motion
// would restart selection at the current cursor instead of the Vim anchor.
export function selectVisualCharacterRange<Color>(editor: VisualSelectionEditor<Color>, anchor: number): void {
  if (!editor.editorView?.setSelection || !editor.editBuffer?.getTextRange) return;
  const start = Math.min(anchor, editor.cursorOffset);
  const last = Math.max(anchor, editor.cursorOffset);
  // Offsets are host display cells, not JavaScript string indices. A host
  // range probe distinguishes a character from EOF/EOL without truncating
  // wide characters or selecting a newline when moving onto a line boundary.
  const character = editor.editBuffer.getTextRange(last, last + 1);
  const end = character && character !== "\n" ? last + 1 : last;
  if (start === end) editor.editorView.resetSelection();
  else editor.editorView.setSelection(start, end, editor.selectionBg, editor.selectionFg);
  editor.requestRender?.();
}

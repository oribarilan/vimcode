import { createVimState, type VimState } from "./vim";

export type EditingContext = {
  state: VimState;
  undoSnapshots: Array<{ text: string; cursor: number }>;
  deferredEdits: Array<() => void>;
  visualEditorOwner?: unknown;
  leaderPending: boolean;
  leaderTimer?: ReturnType<typeof setTimeout>;
};

export function createEditingContext(): EditingContext {
  return { state: createVimState(), undoSnapshots: [], deferredEdits: [], leaderPending: false };
}

// The host assigns this trait to question textareas on both v1 and v2.
// It is not sufficient alone: the controller also checks question ownership.
export function hasAnswerFocus(renderer: {
  currentFocusedEditor?: unknown;
  currentFocusedRenderable?: unknown;
}): boolean {
  const editor = renderer.currentFocusedEditor;
  return (
    !!editor &&
    editor === renderer.currentFocusedRenderable &&
    (editor as { traits?: { status?: unknown } }).traits?.status === "ANSWER"
  );
}

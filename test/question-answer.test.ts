import { afterEach, describe, expect, it } from "bun:test";
import { answerEditor, clipboardWrites, questionHost } from "./question-answer-support";

const disposals: Array<() => void> = [];
const flush = () => Bun.sleep(5);
async function waitFor(check: () => boolean) {
  for (let attempt = 0; attempt < 100; attempt++) {
    if (check()) return;
    await Bun.sleep(5);
  }
  throw new Error("Timed out waiting for palette key delivery");
}
afterEach(async () => {
  await flush();
  for (const dispose of disposals.splice(0)) dispose();
  clipboardWrites.length = 0;
});

for (const version of ["v1", "v2"] as const) {
  async function setup(options: Record<string, unknown> = {}) {
    const mock = await questionHost(version, options);
    disposals.push(mock.dispose);
    return mock;
  }
  describe(`#78 — ${version} question answer editing`, () => {
    for (const mainMode of ["insert", "normal", "visual"] as const) {
      it(`starts the answer in insert, restores main ${mainMode} on return`, async () => {
        const mock = await setup({ startMode: mainMode === "insert" ? "insert" : "normal" });
        if (mainMode === "visual") mock.press("v");
        const answer = mock.open();
        await Bun.sleep(120);
        expect(answer.cursorStyle.style).toBe("line");
        mock.press("z");
        expect(answer.plainText).toBe("hello worldz");
        expect(mock.press("escape").propagationStopped).toBe(true);
        expect(mock.hostActions).toEqual([]);
        mock.press("h");
        await flush();
        expect(answer.cursorOffset).toBe(10);
        mock.close();
        mock.dispatched.length = 0;
        mock.press(mainMode === "visual" ? "l" : "h");
        await flush();
        if (mainMode === "insert") expect(mock.main.plainText).toBe("main prompth");
        else expect(mock.dispatched).toEqual([mainMode === "visual" ? "input.select.right" : "input.move.left"]);
      });
    }
    it("consumes first Escape, uses focused edit commands, and lets normal Escape cancel", async () => {
      const mock = await setup({ startMode: "normal" });
      const answer = mock.open();
      expect(mock.press("escape").propagationStopped).toBe(true);
      await flush();
      expect(mock.hostActions).toEqual([]);
      expect(answer.cursorOffset).toBe(10);
      mock.press("h");
      mock.press("x");
      await flush();
      expect(answer.plainText).toBe("hello word");
      expect(mock.main.plainText).toBe("main prompt");
      mock.press("escape");
      expect(mock.hostActions).toEqual(["cancel"]);
      expect(mock.diagnostics.errors).toEqual([]);
    });
    for (const mode of ["insert", "normal", "visual"] as const) {
      it(`preserves Enter, Ctrl+Enter and Tab host behavior in answer ${mode}`, async () => {
        const mock = await setup();
        for (const [key, flags] of [
          ["return", {}],
          ["return", { ctrl: true }],
          ["tab", {}],
        ] as const) {
          mock.open();
          if (mode !== "insert") mock.press("escape");
          if (mode === "visual") mock.press("v");
          mock.press(key, flags);
        }
        await flush();
        expect(mock.hostActions).toEqual(["commit", "commit", "tab"]);
        expect(mock.dispatched).not.toContain("input.submit");
        expect(mock.dispatched).not.toContain("input.newline");
        expect(mock.dispatched.filter((command) => command.startsWith("prompt.autocomplete"))).toEqual([]);
      });
    }
    for (const [label, key, flags] of [
      ["Enter", "return", {}],
      ["Ctrl+Enter", "return", { ctrl: true }],
      ["Tab", "tab", {}],
    ] as const) {
      it(`applies a rapid delete before native ${label} changes focus`, async () => {
        const mock = await setup();
        const answer = mock.open();
        mock.press("escape");
        mock.press("x");
        mock.press(key, flags);
        await flush();
        expect(key === "tab" ? mock.navigatedAnswers : mock.committedAnswers).toEqual(["hello worl"]);
        expect(answer.plainText).toBe("hello worl");
      });
    }
    it("applies queued motions before the next insert key", async () => {
      const mock = await setup();
      const answer = mock.open();
      mock.press("escape");
      mock.press("h");
      mock.press("i");
      mock.press("!");
      await flush();
      expect(answer.plainText).toBe("hello wor!ld");
      expect(answer.cursorOffset).toBe(10);
    });
    it("restores a line cursor when Vim is disabled from normal mode", async () => {
      const mock = await setup({ startMode: "normal" });
      await Bun.sleep(120);
      expect(mock.main.cursorStyle.style).toBe("block");
      await mock.toggle();
      await Bun.sleep(120);
      expect(mock.main.cursorStyle.style).toBe("line");
      await mock.toggle();
      const answer = mock.open();
      mock.press("escape");
      await Bun.sleep(120);
      expect(answer.cursorStyle.style).toBe("block");
      await mock.toggle();
      await Bun.sleep(120);
      expect(answer.cursorStyle.style).toBe("line");
    });
    it("restores the answer's line cursor after disabling through the palette", async () => {
      const mock = await setup();
      const answer = mock.open();
      mock.press("escape");
      await Bun.sleep(120);
      expect(answer.cursorStyle.style).toBe("block");
      mock.press(":");
      await flush();
      await mock.toggle();
      mock.press("escape");
      await Bun.sleep(120);
      expect(mock.renderer.currentFocusedEditor).toBe(answer);
      expect(answer.cursorStyle.style).toBe("line");
    });
    it("deletes a text object and undoes without borrowing main snapshots", async () => {
      const mock = await setup({ startMode: "normal" });
      mock.main.cursorOffset = 0;
      mock.press("d");
      mock.press("i");
      mock.press("w");
      expect(mock.main.plainText).toBe(" prompt");
      const answer = mock.open();
      mock.press("escape");
      mock.press("g");
      mock.press("g");
      mock.press("d");
      mock.press("i");
      mock.press("w");
      expect(answer.plainText).toBe(" world");
      mock.close();
      mock.press("u");
      expect(mock.main.plainText).toBe("main prompt");
      expect(answer.plainText).toBe(" world");
      mock.open(answer);
      mock.press("u");
      expect(answer.plainText).toBe("hello world");
      expect(mock.main.plainText).toBe("main prompt");
    });
    it("cannot borrow a main snapshot when the answer has no undo snapshots", async () => {
      const mock = await setup({ startMode: "normal" });
      mock.main.cursorOffset = 0;
      mock.press("d");
      mock.press("i");
      mock.press("w");
      const answer = mock.open();
      mock.press("escape");
      mock.press("u");
      await flush();
      expect(mock.dispatched).toContain("input.undo");
      expect(answer.plainText).toBe("hello world");
      expect(mock.main.plainText).toBe(" prompt");
      mock.close();
      mock.press("u");
      expect(mock.main.plainText).toBe("main prompt");
    });
    it("keeps answer and main yank registers separate and pastes locally", async () => {
      const mock = await setup({ startMode: "normal" });
      mock.press("y");
      mock.press("y");
      const answer = mock.open();
      mock.press("escape");
      mock.press("g");
      mock.press("g");
      mock.press("y");
      mock.press("i");
      mock.press("w");
      mock.press("p");
      expect(answer.plainText).toBe("hellohello world");
      expect(mock.dispatched).not.toContain("prompt.paste");
      mock.close();
      mock.press("p");
      await flush();
      expect(clipboardWrites).toEqual(["main prompt\n", "hello", "hello", "main prompt\n"]);
      expect(mock.dispatched).toContain("prompt.paste");
    });
    it("shows block in answer normal and line after returning to insert", async () => {
      const mock = await setup({ startMode: "normal" });
      const answer = mock.open();
      await Bun.sleep(120);
      expect(answer.cursorStyle.style).toBe("line");
      mock.press("escape");
      await Bun.sleep(120);
      expect(answer.cursorStyle.style).toBe("block");
      mock.press("i");
      await Bun.sleep(120);
      expect(answer.cursorStyle.style).toBe("line");
    });
    it("keeps main count and pending operator while answering", async () => {
      const mock = await setup({ startMode: "normal" });
      mock.press("2");
      mock.press("d");
      const answer = mock.open();
      mock.press("escape");
      mock.press("h");
      await flush();
      expect(answer.plainText).toBe("hello world");
      mock.close();
      mock.press("w");
      await flush();
      expect(mock.dispatched.filter((command) => command === "input.delete.word.forward")).toHaveLength(2);
    });
    it("keeps one-shot normal isolated", async () => {
      const mock = await setup();
      mock.press("o", { ctrl: true });
      mock.open();
      mock.press("escape");
      mock.press("h");
      await flush();
      mock.close();
      mock.press("h");
      await flush();
      mock.press("z");
      expect(mock.main.plainText).toContain("z");
    });
    it("re-anchors main visual mode if its prompt editor changed while answering", async () => {
      const mock = await setup({ startMode: "normal" });
      mock.press("v");
      mock.open();
      mock.press("escape");
      mock.close();
      const nextPrompt = answerEditor("new prompt", "PROMPT");
      nextPrompt.cursorOffset = 0;
      mock.focus(nextPrompt);
      mock.press("l");
      await flush();
      expect(nextPrompt.selection).toEqual({ start: 0, end: 2 });
    });
    it("supports visual selection, visual Escape and deleting the selection", async () => {
      const mock = await setup();
      const answer = mock.open(answerEditor("hello world"));
      mock.press("escape");
      mock.press("g");
      mock.press("g");
      mock.press("v");
      mock.press("l");
      await flush();
      expect(answer.selection).toEqual({ start: 0, end: 2 });
      mock.press("escape");
      expect(mock.hostActions).toEqual([]);
      expect(answer.selection).toBeUndefined();
      mock.press("g");
      mock.press("g");
      mock.press("v");
      mock.press("l");
      await flush();
      mock.press("d");
      await flush();
      expect(answer.plainText).toBe("llo world");
    });
    it("starts replacement and reopened answer editors fresh and isolates root/child", async () => {
      const mock = await setup({ startMode: "normal" });
      const first = mock.open();
      mock.press("escape");
      mock.press("2");
      mock.press("d");
      const second = mock.open(answerEditor("child answer"), true);
      mock.press("z");
      expect(second.plainText).toBe("child answerz");
      mock.press("escape");
      mock.press("h");
      await flush();
      expect(first.plainText).toBe("hello world");
      mock.close();
      const reopened = mock.open(answerEditor("again"));
      mock.press("z");
      expect(reopened.plainText).toBe("againz");
      expect(mock.press("escape").propagationStopped).toBe(true);
      mock.press("u");
      await flush();
      expect(mock.dispatched).toContain("input.undo");
      expect(reopened.plainText).toBe("againz");
    });
    it("inserts a printable leader in insert and keeps answer leader sequencing separate", async () => {
      const mock = await setup({ startMode: "normal" });
      mock.press("space");
      const answer = mock.open();
      mock.press("space");
      expect(answer.plainText).toBe("hello world ");
      mock.press("escape");
      expect(mock.press("h").propagationStopped).toBe(true);
      await flush();
      mock.close();
      mock.dispatched.length = 0;
      mock.press("h");
      await flush();
      expect(mock.dispatched).toEqual([]);
    });
    it("empty answer j/k are editor motions, never prompt history", async () => {
      const mock = await setup();
      mock.open(answerEditor(""));
      mock.press("escape");
      mock.press("j");
      mock.press("k");
      await flush();
      expect(mock.dispatched).toEqual(["input.move.down", "input.move.up"]);
    });
    it("preserves the global palette shortcut, yields modal keys and restores the same answer mode", async () => {
      const mock = await setup({ startMode: "normal" });
      const answer = mock.open();
      mock.press("escape");
      mock.press(":");
      await flush();
      expect(mock.dispatched).toContain("command.palette.show");
      mock.press("h");
      mock.press("escape");
      expect(mock.hostActions).toEqual(["palette", "palette:h"]);
      expect(mock.renderer.currentFocusedEditor).toBe(answer);
      expect(mock.press("h").propagationStopped).toBe(true);
      await flush();
      expect(answer.plainText).toBe("hello world");
      expect(answer.cursorOffset).toBe(9);
      expect(mock.main.plainText).toBe("main prompt");
    });
    for (const delayedPalette of [false, true]) {
      for (const priorEdit of [false, true]) {
        it(`orders a ${delayedPalette ? "delayed" : "queued"} palette before following keys${priorEdit ? " after a prior edit" : ""}`, async () => {
          const mock = await setup({ delayedPalette });
          const answer = mock.open();
          mock.press("escape");
          if (priorEdit) mock.press("x");
          mock.press(":");
          mock.press("x");
          mock.press("return");
          await waitFor(() => mock.hostActions.includes("palette:submit"));
          expect(mock.committedAnswers).toEqual([]);
          expect(mock.hostActions).toEqual(["palette", "palette:submit"]);
          expect(mock.paletteSubmissions).toEqual(["x"]);
          expect(mock.dispatched).toEqual([...(priorEdit ? ["input.delete"] : []), "command.palette.show"]);
          expect(answer.plainText).toBe(priorEdit ? "hello worl" : "hello world");
          expect(mock.renderer.currentFocusedEditor?.traits.status).toBe("PALETTE");
          expect(mock.renderer.currentFocusedEditor?.plainText).toBe("x");
          mock.press("escape");
          await waitFor(() => mock.renderer.currentFocusedEditor === answer);
          mock.press("h");
          await flush();
          expect(answer.cursorOffset).toBe(9);
        });
      }
    }
    it("orders native paste with keys during delayed palette focus", async () => {
      const mock = await setup({ delayedPalette: true });
      const answer = mock.open();
      const metadata = { kind: "text" as const, mimeType: "text/plain" };
      mock.press("escape");
      mock.press(":");
      mock.press("a");
      const paste = mock.paste("x", metadata);
      mock.press("b");
      mock.press("return");
      expect(paste.defaultPrevented).toBe(true);
      await waitFor(() => mock.hostActions.includes("palette:submit"));
      expect(mock.paletteSubmissions).toEqual(["axb"]);
      expect(mock.pasteReplays).toEqual([{ text: "x", metadata }]);
      expect(mock.committedAnswers).toEqual([]);
      expect(answer.plainText).toBe("hello world");
    });
    it("does not replay buffered paste into an answer after the palette closes", async () => {
      const mock = await setup({ delayedPalette: true });
      const answer = mock.open();
      mock.press("escape");
      mock.press(":");
      mock.press("x");
      mock.press("escape");
      const paste = mock.paste("y");
      expect(paste.defaultPrevented).toBe(true);
      await waitFor(() => mock.renderer.currentFocusedEditor === answer && mock.hostActions.includes("palette"));
      await flush();
      expect(mock.pasteReplays).toEqual([]);
      expect(answer.plainText).toBe("hello world");
    });
    it("does not replay buffered Enter into an answer after the palette closes", async () => {
      const mock = await setup({ delayedPalette: true });
      const answer = mock.open();
      mock.press("escape");
      mock.press(":");
      mock.press("x");
      mock.press("escape");
      mock.press("return");
      await waitFor(() => mock.renderer.currentFocusedEditor === answer && mock.hostActions.includes("palette"));
      await flush();
      expect(mock.committedAnswers).toEqual([]);
      expect(mock.paletteSubmissions).toEqual([]);
      expect(answer.plainText).toBe("hello world");
    });
    it("drops buffered palette keys on disposal", async () => {
      const mock = await setup({ delayedPalette: true });
      const answer = mock.open();
      mock.press("escape");
      mock.press(":");
      mock.press("x");
      mock.press("return");
      mock.dispose();
      await flush();
      expect(mock.hostActions).toEqual([]);
      expect(mock.dispatched).toEqual([]);
      expect(answer.plainText).toBe("hello world");
    });
    it("does not drop a queued global palette command just because focus changes", async () => {
      const mock = await setup();
      mock.open();
      mock.press("escape");
      mock.press(":");
      mock.close();
      await flush();
      expect(mock.dispatched).toContain("command.palette.show");
    });
    it("does not dispatch prompt-only actions from normal answer editing", async () => {
      const mock = await setup();
      mock.open();
      mock.press("escape");
      for (const key of ["/", "[", "]", "{", "}", "p"]) mock.press(key);
      await flush();
      expect(mock.dispatched).toEqual([]);
    });
    it("leaves choices, generic forms, permission fields, modal dialogs and stale ANSWER traits alone", async () => {
      const mock = await setup({ startMode: "normal" });
      mock.open();
      mock.focus(undefined);
      expect(mock.press("h").propagationStopped).toBe(false);
      const generic = mock.open(answerEditor("form", "FORM"));
      expect(mock.press("h").propagationStopped).toBe(false);
      expect(generic.plainText).toBe("formh");
      mock.close();
      mock.setPermission(true);
      mock.focus(answerEditor("reason", "REJECT"));
      expect(mock.press("h").propagationStopped).toBe(false);
      mock.setPermission(false);
      mock.setDialog(true);
      mock.focus(answerEditor());
      expect(mock.press("h").propagationStopped).toBe(false);
      mock.setDialog(false);
      mock.setQuestion(false);
      mock.focus(answerEditor());
      expect(mock.press("h").propagationStopped).toBe(false);
    });
    if (version === "v1") {
      for (const terminal of ["question.replied", "question.rejected"]) {
        it(`balances child question event ownership after ${terminal} without host mode reporting`, async () => {
          const mock = await setup({ noHostMode: true });
          mock.open();
          mock.setQuestion(false);
          mock.emit("question.asked", "child");
          mock.press("escape");
          expect(mock.hostActions).toEqual([]);
          mock.emit(terminal, "child");
          const answer = mock.renderer.currentFocusedEditor;
          mock.press("h");
          await flush();
          expect(answer?.plainText).toBe("hello worlhd");
          expect(mock.dispatched).not.toContain("input.move.left");
        });
      }
      it("requires an active question, not just a permission, on hosts without mode reporting", async () => {
        const mock = await setup({ noHostMode: true, startMode: "normal" });
        mock.open();
        mock.setQuestion(false);
        mock.setPermission(true);
        mock.press("escape");
        expect(mock.toasts).not.toContain("NORMAL");
        mock.setPermission(false);
        mock.open();
        mock.press("escape");
        expect(mock.hostActions).toEqual([]);
        expect(mock.toasts).toContain("NORMAL");
      });
    }
    it("does not style an unrelated overlay using the main Vim mode", async () => {
      const mock = await setup({ startMode: "normal" });
      mock.open(answerEditor("reason", "REJECT"));
      mock.setPermission(true);
      const editor = mock.renderer.currentFocusedEditor;
      if (!editor) throw new Error("No focused editor");
      editor.cursorStyle.style = "underline";
      await Bun.sleep(120);
      expect(editor.cursorStyle.style).toBe("underline");
    });
    it("respects disabled Vim and restarts answer state when toggled", async () => {
      const mock = await setup({ disabled: true });
      mock.open();
      mock.press("escape");
      expect(mock.hostActions).toEqual(["cancel"]);
      await mock.toggle();
      const answer = mock.open();
      expect(mock.press("escape").propagationStopped).toBe(true);
      mock.press("g");
      mock.press("g");
      mock.press("d");
      mock.press("i");
      mock.press("w");
      expect(answer.plainText).toBe(" world");
      mock.press("2");
      mock.press("d");
      await mock.toggle();
      await mock.toggle();
      expect(mock.renderer.currentFocusedEditor).toBe(answer);
      mock.press("z");
      expect(answer.plainText).toBe("z world");
      mock.dispatched.length = 0;
      mock.press("escape");
      mock.press("u");
      await flush();
      expect(mock.dispatched).toEqual(["input.undo"]);
      expect(answer.plainText).toBe("z world");
    });
    it("requires actual focused-renderable ownership", async () => {
      const mock = await setup();
      mock.open();
      mock.renderer.currentFocusedRenderable = {};
      mock.press("escape");
      expect(mock.hostActions).toEqual(["cancel"]);
      expect(mock.toasts).not.toContain("NORMAL");
    });
    it("drops deferred undo and selection yank after answer focus changes", async () => {
      const mock = await setup();
      const answer = mock.open();
      mock.press("escape");
      mock.press("u");
      mock.close();
      await flush();
      expect(mock.dispatched).not.toContain("input.undo");
      mock.open();
      mock.press("escape");
      mock.press("v");
      mock.press("l");
      mock.press("y");
      mock.close();
      await flush();
      expect(clipboardWrites).toEqual([]);
      expect(answer.plainText).toBe("hello world");
      expect(mock.main.plainText).toBe("main prompt");
    });
    for (const change of ["focus", "overlay", "dispose"] as const) {
      it(`drops queued answer edits after ${change}`, async () => {
        const mock = await setup();
        const answer = mock.open();
        mock.press("escape");
        mock.press("x");
        if (change === "focus") mock.close();
        if (change === "overlay") mock.setDialog(true);
        if (change === "dispose") mock.dispose();
        await flush();
        expect(mock.dispatched).not.toContain("input.delete");
        expect(answer.plainText).toBe("hello world");
        expect(mock.main.plainText).toBe("main prompt");
      });
    }
    it("drops main commands when a question opens before the host clears prompt focus", async () => {
      const mock = await setup({ startMode: "normal" });
      mock.press("x");
      mock.setQuestion(true);
      mock.setMode(version === "v1" ? "question" : "form");
      await flush();
      expect(mock.dispatched).not.toContain("input.delete");
      expect(mock.main.plainText).toBe("main prompt");
    });
    it("drops main commands queued before an answer took focus", async () => {
      const mock = await setup({ startMode: "normal" });
      mock.press("x");
      const answer = mock.open();
      await flush();
      expect(answer.plainText).toBe("hello world");
      expect(mock.dispatched).not.toContain("input.delete");
    });
  });
}

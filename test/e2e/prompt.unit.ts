import { describe, expect, it } from "bun:test";
import type { ScreenSnapshot } from "@kitlangton/terminal-control";
import { promptMatches, providerDisabledPrompt, visiblePrompt } from "./prompt";

function screen(lines: string[], outside = "one Xtwo three"): ScreenSnapshot {
  return {
    reason: "idle",
    text: [outside, "  ┃", ...lines.map((line) => `  ┃  ${line}`), "  ┃", "  ┃  Build · Test model", "  ╹▀▀▀▀▀"].join(
      "\n",
    ),
    frame: {
      version: 2,
      cols: 110,
      rows: 34,
      foreground: { r: 255, g: 255, b: 255 },
      background: { r: 0, g: 0, b: 0 },
      cursor: { x: 5, y: 2, style: "block", blinking: false, color: { r: 255, g: 255, b: 255 } },
      cells: [],
    },
  };
}

describe("pinned-host home prompt screen oracle", () => {
  it("ignores matching text outside the prompt and rejects a matching suffix", () => {
    expect(promptMatches(visiblePrompt(screen(["wrong"])), ["one Xtwo three"])).toBe(false);
    expect(promptMatches(visiblePrompt(screen(["extra one Xtwo three"])), ["one Xtwo three"])).toBe(false);
  });

  it("compares every line, including empty lines and internal whitespace", () => {
    const prompt = visiblePrompt(screen(["alpha  beta", "", "gamma"]));
    expect(promptMatches(prompt, ["alpha  beta", "", "gamma"])).toBe(true);
    expect(promptMatches(prompt, ["alpha beta", "", "gamma"])).toBe(false);
    expect(promptMatches(prompt, ["alpha  beta", "gamma"])).toBe(false);
  });

  it("requires provider-free metadata inside the strict bordered prompt for both empty placeholders", () => {
    for (const placeholder of ["Ask", "Ask anything..."]) {
      const snapshot = screen([placeholder]);
      const disabled = {
        ...snapshot,
        text: snapshot.text.replace("Build · Test model", "Build · No provider selected Connect a provider"),
      };
      expect(promptMatches(visiblePrompt(disabled), [placeholder])).toBe(true);
      expect(providerDisabledPrompt(disabled)).toBe(true);
      expect(providerDisabledPrompt(snapshot)).toBe(false);
      expect(
        providerDisabledPrompt({
          ...snapshot,
          text: `Build · No provider selected Connect a provider\n${snapshot.text}`,
        }),
      ).toBe(false);
      expect(providerDisabledPrompt({ ...disabled, text: disabled.text.replace("╹", "x") })).toBe(false);
      expect(providerDisabledPrompt({ ...disabled, text: `${disabled.text}\n  ┃  Build · Duplicate` })).toBe(false);
    }
  });

  it("normalizes a visible cursor relative to the prompt", () => {
    const prompt = visiblePrompt(screen(["abc"]));
    expect(promptMatches(prompt, ["abc"], { x: 0, y: 0 })).toBe(true);
    expect(promptMatches(prompt, ["abc"], { x: 1, y: 0 })).toBe(false);
  });

  it("rejects missing or ambiguous borders", () => {
    const snapshot = screen(["abc"]);
    expect(visiblePrompt({ ...snapshot, text: snapshot.text.replace("╹", "x") })).toBeNull();
    expect(visiblePrompt({ ...snapshot, text: `${snapshot.text}\n  ┃  Build · Duplicate` })).toBeNull();
  });

  it("keeps exact visible text authoritative when cursor metadata is missing or outside the editor", () => {
    const snapshot = screen(["abc"]);
    if (!snapshot.frame.cursor) throw new Error("fixture cursor missing");
    for (const cursor of [null, { ...snapshot.frame.cursor, y: 0 }]) {
      const prompt = visiblePrompt({ ...snapshot, frame: { ...snapshot.frame, cursor } });
      expect(promptMatches(prompt, ["abc"])).toBe(true);
      expect(prompt?.cursor).toBeNull();
      expect(promptMatches(prompt, ["abc"], { x: 0, y: 0 })).toBe(false);
    }
  });
});

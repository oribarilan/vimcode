import { beforeAll, describe, it } from "bun:test";
import { checkpoint, type HostRun, prepareRun, pressKey, scenario, typeText, verifyInstalledArtifact } from "./host";

const negativeControl = process.env.VIMCODE_E2E_NO_PLUGIN === "1";
// Leave time for bounded sends/captures and finally cleanup before Bun's outer timeout.
const scenarioTimeoutMs = 240_000;

describe("Terminal Control / cache-installed OpenCode", () => {
  let run: HostRun;
  beforeAll(() => {
    run = prepareRun();
  }, 60_000);

  it.skipIf(negativeControl)(
    "cold tarball load and text insertion",
    async () => {
      await scenario(run, "cold-load", async () => {
        verifyInstalledArtifact(run);
        await typeText(run, "cold package loaded");
        await checkpoint(run, "cold-insert", ["cold package loaded"]);
      });
    },
    scenarioTimeoutMs,
  );

  it(
    "Escape / 0 / w / i / X edits exactly at the next word",
    async () => {
      await scenario(run, "word-motion", async () => {
        await typeText(run, "one two three");
        await checkpoint(run, "word-insert", ["one two three"]);
        await pressKey(run, "Escape");
        await checkpoint(run, "word-escape", ["one two three"]);
        await typeText(run, "0");
        await checkpoint(run, "word-home", ["one two three"]);
        await typeText(run, "w");
        await checkpoint(run, "word-next", ["one two three"]);
        await typeText(run, "i");
        await checkpoint(run, "word-insert-mode", ["one two three"]);
        await typeText(run, "X");
        // Cursor-only SDK frames can be stale; the editing effect proves 0/w placement.
        await checkpoint(run, "word-result", ["one Xtwo three"]);
      });
    },
    scenarioTimeoutMs,
  );

  it.skipIf(negativeControl)(
    "ci quote replaces only the quoted contents",
    async () => {
      await scenario(run, "quote-change", async () => {
        await typeText(run, 'say "old words" now');
        await checkpoint(run, "quote-insert", ['say "old words" now']);
        await pressKey(run, "Escape");
        await checkpoint(run, "quote-escape", ['say "old words" now']);
        await typeText(run, "0");
        await checkpoint(run, "quote-home", ['say "old words" now']);
        await typeText(run, "w");
        await checkpoint(run, "quote-next", ['say "old words" now']);
        await typeText(run, 'ci"');
        await checkpoint(run, "quote-empty", ['say "" now']);
        await typeText(run, "new");
        await checkpoint(run, "quote-result", ['say "new" now']);
      });
    },
    scenarioTimeoutMs,
  );

  it.skipIf(negativeControl)(
    "multiline dG and one u restore the entire prompt",
    async () => {
      await scenario(run, "multiline-undo", async () => {
        await typeText(run, "alpha");
        await checkpoint(run, "line-one", ["alpha"]);
        // Providers are disabled; also prove Vim handling is live before Enter.
        await pressKey(run, "Escape");
        await checkpoint(run, "newline-guard", ["alpha"], { x: 4, y: 0 });
        await typeText(run, "A");
        await checkpoint(run, "newline-insert-mode", ["alpha"], { x: 5, y: 0 });
        await pressKey(run, "Enter");
        await checkpoint(run, "newline-one", ["alpha", ""], { x: 0, y: 1 });
        await typeText(run, "bravo");
        await checkpoint(run, "line-two", ["alpha", "bravo"]);
        await pressKey(run, "Enter");
        await checkpoint(run, "newline-two", ["alpha", "bravo", ""], { x: 0, y: 2 });
        await typeText(run, "charlie");
        await checkpoint(run, "line-three", ["alpha", "bravo", "charlie"]);
        await pressKey(run, "Escape");
        await checkpoint(run, "multiline-escape", ["alpha", "bravo", "charlie"], { x: 6, y: 2 });
        await typeText(run, "gg");
        await checkpoint(run, "multiline-home", ["alpha", "bravo", "charlie"], { x: 0, y: 0 });
        await typeText(run, "j");
        await checkpoint(run, "multiline-down", ["alpha", "bravo", "charlie"], { x: 0, y: 1 });
        await typeText(run, "dG");
        await checkpoint(run, "multiline-delete", ["alpha", ""], { x: 0, y: 1 });
        await typeText(run, "u");
        await checkpoint(run, "multiline-restored", ["alpha", "bravo", "charlie"], { x: 0, y: 1 });
      });
    },
    scenarioTimeoutMs,
  );
});

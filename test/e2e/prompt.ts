import type { ScreenSnapshot } from "@kitlangton/terminal-control";

export type VisiblePrompt = {
  lines: string[];
  origin: { x: number; y: number };
  cursor: { x: number; y: number; style: string } | null;
};

// Both pinned hosts use this bordered home prompt; arbitrary terminal text is not an oracle.
// Terminal padding cannot distinguish trailing buffer spaces, so cases use short ASCII lines.
export function visiblePrompt(snapshot: ScreenSnapshot): VisiblePrompt | null {
  const rows = snapshot.text.split("\n");
  const metadata = rows.flatMap((row, y) => {
    const match = /^( *)┃ {2}(?:Build|Plan) · /.exec(row);
    return match ? [{ y, x: match[1].length }] : [];
  });
  if (metadata.length !== 1) return null;
  const { x, y } = metadata[0];
  const border = `${" ".repeat(x)}┃`;
  if (!rows[y + 1]?.startsWith(`${" ".repeat(x)}╹▀`)) return null;
  let top = y;
  while (top > 0 && rows[top - 1].startsWith(border)) top--;
  if (y - top < 3) return null;
  const content = (row: string) => row.slice(x + 3).trimEnd();
  if (content(rows[top]) !== "" || content(rows[y - 1]) !== "") return null;
  const lines = rows.slice(top + 1, y - 1).map(content);
  const origin = { x: x + 3, y: top + 1 };
  const cursor = snapshot.frame.cursor;
  const cursorInPrompt = cursor && cursor.x >= origin.x && cursor.y >= origin.y && cursor.y < y - 1;
  return {
    lines,
    origin,
    cursor: cursorInPrompt ? { x: cursor.x - origin.x, y: cursor.y - origin.y, style: cursor.style } : null,
  };
}

export function visibleV1AnswerChoice(snapshot: ScreenSnapshot): VisiblePrompt | null {
  const rows = snapshot.text.split("\n");
  const titles = rows.flatMap((row, y) => {
    const match = /^( *)┃ {2}Vimcode E2E question *$/.exec(row);
    return match ? [{ y, x: match[1].length }] : [];
  });
  if (titles.length !== 1) return null;
  const { x, y } = titles[0];
  const border = `${" ".repeat(x)}┃`;
  if (
    [-1, 1, 3, 5].some((offset) => rows[y + offset]?.trimEnd() !== border) ||
    rows[y + 2]?.trimEnd() !== `${border}  1. Type your own answer` ||
    rows[y + 4]?.trimEnd() !== `${border}  ↑↓ select  enter submit  esc dismiss`
  )
    return null;
  return { lines: ["Type your own answer"], origin: { x: x + 6, y: y + 2 }, cursor: null };
}

// Exact one-line answer layouts on the pinned hosts, not timeline text.
export function visibleAnswer(snapshot: ScreenSnapshot): VisiblePrompt | null {
  const rows = snapshot.text.split("\n");
  const titles = rows.flatMap((row, y) => {
    const match = /^( *)┃ {2}Vimcode E2E question *$/.exec(row);
    return match ? [{ y, x: match[1].length }] : [];
  });
  if (titles.length !== 1) return null;
  const { x, y } = titles[0];
  const border = `${" ".repeat(x)}┃`;
  const content = (offset: number) =>
    rows[y + offset]?.startsWith(border) ? rows[y + offset].slice(x + 1).trimEnd() : undefined;
  if (
    rows[y - 1]?.trimEnd() === border &&
    [1, 4, 6].every((offset) => rows[y + offset]?.trimEnd() === border) &&
    content(2) === "  1. Type your own answer" &&
    content(5) === "  ↑↓ select  enter submit  esc dismiss" &&
    rows[y + 3]?.startsWith(`${border}     `)
  ) {
    const origin = { x: x + 6, y: y + 3 };
    const cursor = snapshot.frame.cursor;
    return {
      lines: [rows[origin.y].slice(origin.x).trimEnd()],
      origin,
      cursor:
        cursor && cursor.y === origin.y && cursor.x >= origin.x
          ? { x: cursor.x - origin.x, y: 0, style: cursor.style }
          : null,
    };
  }
  if (
    rows[y - 1]?.trimEnd() !== border ||
    [1, 3, 5, 7, 9].some((offset) => rows[y + offset]?.trimEnd() !== border) ||
    content(2) !== "  Answer  Submit" ||
    content(4) !== "  Answer" ||
    content(8) !== "  ⇆ tab  enter confirm  esc dismiss" ||
    !rows[y + 6]?.startsWith(`${border}   `)
  )
    return null;
  const origin = { x: x + 4, y: y + 6 };
  const cursor = snapshot.frame.cursor;
  return {
    lines: [rows[origin.y].slice(origin.x).trimEnd()],
    origin,
    cursor:
      cursor && cursor.y === origin.y && cursor.x >= origin.x
        ? { x: cursor.x - origin.x, y: 0, style: cursor.style }
        : null,
  };
}

export function providerDisabledPrompt(snapshot: ScreenSnapshot): boolean {
  const prompt = visiblePrompt(snapshot);
  if (!prompt) return false;
  const metadataRow = prompt.origin.y + prompt.lines.length + 1;
  return (
    snapshot.text.split("\n")[metadataRow].slice(prompt.origin.x).trimEnd() ===
    "Build · No provider selected Connect a provider"
  );
}

export function promptMatches(
  prompt: VisiblePrompt | null,
  lines: string[],
  cursor?: { x: number; y: number },
): boolean {
  return (
    prompt !== null &&
    prompt.lines.length === lines.length &&
    prompt.lines.every((line, index) => line === lines[index]) &&
    (!cursor || (prompt.cursor?.x === cursor.x && prompt.cursor.y === cursor.y))
  );
}

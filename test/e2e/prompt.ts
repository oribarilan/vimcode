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

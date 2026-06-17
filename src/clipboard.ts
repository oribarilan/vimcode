import { spawn } from "node:child_process";

// Best-effort clipboard write. Falls back gracefully when the clipboard
// tool is missing — the error handler prevents unhandled ENOENT crashes.
export function writeClipboard(text: string): void {
  const [cmd, args] = clipboardCmd();
  const proc = spawn(cmd, args);
  proc.on("error", () => {});
  proc.stdin.write(text);
  proc.stdin.end();
}

function clipboardCmd(): [string, string[]] {
  if (process.platform === "darwin") return ["pbcopy", []];
  if (process.platform === "win32") return ["clip.exe", []];
  if (process.env.WAYLAND_DISPLAY) return ["wl-copy", []];
  // X11 fallback
  return ["xclip", ["-selection", "clipboard"]];
}

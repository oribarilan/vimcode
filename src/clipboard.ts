import { spawn } from "child_process"

export function writeClipboard(text: string): void {
  try {
    const proc = spawn("pbcopy")
    proc.stdin.write(text)
    proc.stdin.end()
  } catch {
    /* clipboard unavailable */
  }
}

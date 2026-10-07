import { ChildProcess, execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { type DriverOptions, TerminalControl } from "@kitlangton/terminal-control";

export async function bounded<T>(operation: Promise<T>, label: string, timeoutMs = 5_000): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      operation,
      new Promise<never>((_, reject) => {
        timer = setTimeout(() => reject(new Error(`${label} exceeded ${timeoutMs}ms`)), timeoutMs);
      }),
    ]);
  } finally {
    clearTimeout(timer);
  }
}

type PrivateDriver = { child: ChildProcess; ready: Promise<unknown>; abort: (error: Error) => void };
export type OwnedDriver = {
  terminal: TerminalControl;
  ready: Promise<unknown>;
  child: ChildProcess;
  closed: Promise<void>;
  hostGroups: Set<number>;
  frozen: boolean;
  reaped: boolean;
  discoveryError?: unknown;
};

type ProcessRow = { pid: number; parent: number; group: number; state: string };
function processes(): ProcessRow[] {
  return execFileSync("/bin/ps", ["-axo", "pid=,ppid=,pgid=,stat="], { encoding: "utf8", timeout: 1_000 })
    .trim()
    .split("\n")
    .map((line) => {
      const [pid, parent, group, state] = line.trim().split(/\s+/);
      return { pid: Number(pid), parent: Number(parent), group: Number(group), state };
    });
}

function signal(identity: number, value: NodeJS.Signals) {
  try {
    process.kill(identity, value);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ESRCH") throw error;
  }
}

// portable-pty gives each launched host a new session/group (PGID = host PID).
// Freeze the driver before discovery: even a timed-out launch cannot spawn after
// the ownership snapshot. Capture before SDK abort too, which otherwise kills it.
function retainHosts(owner: OwnedDriver) {
  const pid = owner.child.pid;
  if (!pid || owner.child.exitCode !== null || owner.child.signalCode !== null) return;
  signal(pid, "SIGSTOP");
  owner.frozen = true;
  const deadline = Date.now() + 1_000;
  let rows = processes();
  while (rows.some((row) => row.pid === pid && !row.state.startsWith("T"))) {
    if (Date.now() >= deadline) throw new Error(`Owned driver PID ${pid} did not freeze`);
    rows = processes();
  }
  for (const row of rows) {
    if (row.parent !== pid) continue;
    if (row.group !== row.pid) throw new Error(`Unexpected owned PTY process group for PID ${row.pid}`);
    owner.hostGroups.add(row.group);
  }
}

// SDK 1.2.1 has no public pre-ready ownership or forced-close API. Keep this
// guarded private boundary local to the optional spike; never patch the SDK.
export async function ownDriver(options: DriverOptions): Promise<OwnedDriver> {
  if (!["darwin", "linux"].includes(process.platform)) throw new Error("Owned PTY cleanup requires macOS or Linux");
  const entry = fileURLToPath(import.meta.resolve("@kitlangton/terminal-control"));
  const manifest = JSON.parse(readFileSync(join(dirname(entry), "../package.json"), "utf8")) as { version: string };
  const constructorSource = TerminalControl.toString();
  const prototype = TerminalControl.prototype as unknown as PrivateDriver;
  if (
    manifest.version !== "1.2.1" ||
    createHash("sha256").update(readFileSync(entry)).digest("hex") !==
      "b4476b7d422818b1bd56397a2571db9ffdfe5122799172c572f4dc788edebee1" ||
    !constructorSource.includes("this.child = spawn(") ||
    !constructorSource.includes("this.ready = new Promise(") ||
    typeof prototype.abort !== "function" ||
    !prototype.abort.toString().includes("this.child.kill()")
  ) {
    throw new Error("Terminal Control private lifecycle shape changed; expected pinned SDK 1.2.1");
  }
  const Constructor = TerminalControl as unknown as new (options: DriverOptions) => TerminalControl;
  const terminal = new Constructor(options);
  const internals = terminal as unknown as PrivateDriver;
  const child = internals.child;
  if (!(child instanceof ChildProcess)) throw new Error("Terminal Control private child shape changed");
  const closed = new Promise<void>((resolve) => child.once("close", () => resolve()));
  if (!(internals.ready instanceof Promise)) {
    child.kill("SIGKILL");
    await bounded(closed, "invalid SDK shape driver reap");
    throw new Error("Terminal Control private ready shape changed");
  }
  const owner: OwnedDriver = {
    terminal,
    ready: internals.ready,
    child,
    closed,
    hostGroups: new Set(),
    frozen: false,
    reaped: false,
  };
  const abort = internals.abort.bind(terminal);
  internals.abort = (error) => {
    try {
      retainHosts(owner);
    } catch (discoveryError) {
      owner.discoveryError = discoveryError;
    } finally {
      abort(error);
    }
  };
  // A rejected hello must be observed even if cleanup begins before awaiting it.
  void owner.ready.catch(() => {});
  return owner;
}

async function confirmReaped(owner: OwnedDriver, timeoutMs: number) {
  const deadline = Date.now() + timeoutMs;
  while (processes().some((row) => owner.hostGroups.has(row.group))) {
    if (Date.now() >= deadline) throw new Error(`forced PTY group reap exceeded ${timeoutMs}ms`);
    await Bun.sleep(10);
  }
  if (owner.discoveryError) throw owner.discoveryError;
  owner.reaped = true;
}

export async function terminateDriver(owner: OwnedDriver, timeoutMs = 5_000) {
  retainHosts(owner);
  // Kill the PTY groups BEFORE the driver, not just its PID: killing the driver
  // alone bypasses Rust Session::drop and can leave an OpenCode host alive.
  for (const group of owner.hostGroups) signal(-group, "SIGKILL");
  // SIGKILL also terminates stopped processes; do not resume and reopen a spawn race.
  owner.child.kill("SIGKILL");
  await bounded(owner.closed, "forced driver reap", timeoutMs);
  await confirmReaped(owner, timeoutMs);
}

export async function closeDriver(owner: OwnedDriver, timeoutMs = 5_000) {
  try {
    await bounded(owner.terminal.close(), "driver shutdown", timeoutMs);
    await bounded(owner.closed, "driver reap", timeoutMs);
    // SDK close becomes a no-op after abort: retries must still verify retained ownership.
    await confirmReaped(owner, timeoutMs);
  } catch (error) {
    await terminateDriver(owner, timeoutMs);
    throw error;
  }
}

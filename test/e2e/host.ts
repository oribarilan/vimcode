import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readdirSync, readFileSync, realpathSync, statSync, writeFileSync } from "node:fs";
import { dirname, isAbsolute, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  type Key,
  resolveTerminalControlBinary,
  type ScreenSnapshot,
  type Session,
  type TerminalControl,
} from "@kitlangton/terminal-control";
import { bounded, closeDriver, type OwnedDriver, ownDriver } from "./driver";
import { promptMatches, providerDisabledPrompt, type VisiblePrompt, visiblePrompt } from "./prompt";

const root = realpathSync(fileURLToPath(new URL("../../", import.meta.url)));
const configNames = [
  ".git",
  ".opencode",
  "opencode.json",
  "opencode.jsonc",
  "tui.json",
  "tui.jsonc",
  "cli.json",
  "cli.jsonc",
];

type Check = { name: string; status: "pass" | "fail"; expected?: unknown; actual?: unknown; error?: string };
type Receipt = {
  host: "v1" | "v2";
  binary: string;
  version: string;
  platform: string;
  terminalControl: string;
  driverBinary?: string;
  negativeControl: boolean;
  providersDisabled?: boolean;
  providerObservations?: Record<string, string>;
  artifact?: { tarball: string; sha256: string; installed?: string; verifiedFiles?: Record<string, string> };
  checks: Check[];
  cleanupErrors: string[];
};

export type HostRun = {
  output: string;
  env: Record<string, string>;
  receipt: Receipt;
  terminal?: TerminalControl;
  driver?: OwnedDriver;
  session?: Session;
  scenario?: string;
};

export function saveReceipt(run: HostRun) {
  writeFileSync(join(run.output, "receipt.json"), `${JSON.stringify(run.receipt, null, 2)}\n`);
}

export function prepareRun(): HostRun {
  if (!["darwin", "linux"].includes(process.platform))
    throw new Error("Terminal Control E2E requires macOS or GNU/Linux");
  const host = process.env.VIMCODE_E2E_HOST;
  const binary = process.env.VIMCODE_E2E_BIN;
  const version = process.env.VIMCODE_E2E_VERSION;
  const outputArg = process.env.VIMCODE_E2E_OUTPUT;
  if (
    (host !== "v1" && host !== "v2") ||
    !binary ||
    !version ||
    !outputArg ||
    !isAbsolute(binary) ||
    !isAbsolute(outputArg)
  ) {
    throw new Error("Use just test-e2e v1|v2 /absolute/opencode expected-version /absolute/new-output-directory");
  }
  const output = join(realpathSync(dirname(outputArg)), outputArg.slice(dirname(outputArg).length + 1));
  for (let path = output; ; path = dirname(path)) {
    if (configNames.some((name) => existsSync(join(path, name))))
      throw new Error(`E2E output must be outside project/config ancestry: ${path}`);
    if (dirname(path) === path) break;
  }
  if (existsSync(output) && readdirSync(output).length) throw new Error(`E2E output must be empty: ${output}`);
  mkdirSync(output, { recursive: true });
  const canonicalOutput = realpathSync(output);
  for (let path = canonicalOutput; ; path = dirname(path)) {
    if (configNames.some((name) => existsSync(join(path, name))))
      throw new Error(`E2E output must be outside project/config ancestry: ${path}`);
    if (dirname(path) === path) break;
  }
  for (const folder of ["home", "config/opencode", "data", "cache", "state", "sandbox", "bin", "build", "reference"]) {
    mkdirSync(join(canonicalOutput, folder), { recursive: true });
  }
  const toolDirectories = [process.execPath, Bun.which("npm"), Bun.which("node")]
    .filter((path): path is string => path !== null)
    .map((path) => dirname(path));
  const env = {
    PATH: [
      ...new Set([
        join(canonicalOutput, "bin"),
        ...toolDirectories,
        "/usr/local/bin",
        "/usr/bin",
        "/bin",
        "/usr/sbin",
        "/sbin",
      ]),
    ].join(":"),
    HOME: join(canonicalOutput, "home"),
    XDG_CONFIG_HOME: join(canonicalOutput, "config"),
    XDG_DATA_HOME: join(canonicalOutput, "data"),
    XDG_CACHE_HOME: join(canonicalOutput, "cache"),
    XDG_STATE_HOME: join(canonicalOutput, "state"),
    TERM: "xterm-256color",
    COLORTERM: "truecolor",
    OPENCODE_DISABLE_AUTOUPDATE: "1",
  };
  for (const name of ["pbcopy", "wl-copy", "xclip", "xsel", "clip.exe"]) {
    writeFileSync(join(canonicalOutput, "bin", name), "#!/bin/sh\ncat >/dev/null\n", { mode: 0o755 });
  }
  for (const name of ["pbpaste", "wl-paste"]) {
    writeFileSync(join(canonicalOutput, "bin", name), "#!/bin/sh\nexit 0\n", { mode: 0o755 });
  }
  const run: HostRun = {
    output: canonicalOutput,
    env,
    receipt: {
      host,
      binary,
      version,
      platform: `${process.platform}-${process.arch}`,
      terminalControl: "1.2.1",
      negativeControl: process.env.VIMCODE_E2E_NO_PLUGIN === "1",
      checks: [],
      cleanupErrors: [],
    },
  };
  saveReceipt(run);
  try {
    if (process.env.TERMCTRL_BINARY) {
      throw new Error(
        "TERMCTRL_BINARY override is unsupported: unset it to use the pinned Terminal Control 1.2.1 packaged driver",
      );
    }
    run.receipt.driverBinary = realpathSync(resolveTerminalControlBinary());
    writeFileSync(
      join(run.output, "config/opencode/opencode.json"),
      JSON.stringify({ autoupdate: false, enabled_providers: [] }),
    );
    const actualBinary = realpathSync(binary);
    const actualVersion = execFileSync(actualBinary, ["--version"], { env, encoding: "utf8", timeout: 10_000 })
      .trim()
      .replace(/^opencode v/, "");
    Object.assign(run.receipt, { binary: actualBinary, version: actualVersion });
    if (actualVersion !== version || !version.startsWith(host === "v1" ? "1." : "2."))
      throw new Error(`Expected OpenCode ${host} ${version}, got ${actualVersion}`);
    const packed = JSON.parse(
      execFileSync("npm", ["pack", "--ignore-scripts", "--json", "--pack-destination", join(run.output, "build")], {
        cwd: root,
        env,
        encoding: "utf8",
        timeout: 30_000,
      }),
    ) as Array<{ filename: string; files: Array<{ path: string }> }>;
    if (
      packed.length !== 1 ||
      packed[0].files.some((file) => file.path.startsWith("test/") || file.path.startsWith("scripts/"))
    ) {
      throw new Error("Expected one package without test/launcher fixtures");
    }
    const tarball = join(run.output, "build", packed[0].filename);
    execFileSync("tar", ["-xzf", tarball, "-C", join(run.output, "reference")], { env, timeout: 10_000 });
    run.receipt.artifact = { tarball, sha256: hash(readFileSync(tarball)) };
    const spec = `vimcode@file:${tarball}`;
    const options = { updateCheck: false, modeIndicator: "none", experimentalV2Leader: "ctrl+x" };
    const config =
      host === "v1"
        ? { plugin: run.receipt.negativeControl ? [] : [[spec, options]], keybinds: { leader: "ctrl+x" } }
        : { plugins: run.receipt.negativeControl ? [] : [{ package: spec, options }], keybinds: { leader: "ctrl+x" } };
    writeFileSync(join(run.output, `config/opencode/${host === "v1" ? "tui" : "cli"}.json`), JSON.stringify(config));
    saveReceipt(run);
    return run;
  } catch (error) {
    run.receipt.checks.push({ name: "setup", status: "fail", error: String(error) });
    saveReceipt(run);
    throw error;
  }
}

function hash(bytes: Uint8Array): string {
  return createHash("sha256").update(bytes).digest("hex");
}

export function verifyInstalledArtifact(run: HostRun) {
  if (run.receipt.negativeControl) return;
  const cache = join(run.output, "cache/opencode");
  const entries = [...new Bun.Glob("**/node_modules/vimcode/package.json").scanSync({ cwd: cache, absolute: true })];
  if (entries.length !== 1) throw new Error(`Expected exactly one cache-installed vimcode, found ${entries.length}`);
  const installed = dirname(entries[0]);
  const reference = join(run.output, "reference/package");
  const files = ["package.json", ...sourceFiles(join(reference, "src")).map((path) => `src/${path}`)];
  const verifiedFiles: Record<string, string> = {};
  for (const relative of files) {
    const expected = readFileSync(join(reference, relative));
    if (!expected.equals(readFileSync(join(installed, relative))))
      throw new Error(`Cache artifact mismatch: ${relative}`);
    verifiedFiles[relative] = hash(expected);
  }
  if (!run.receipt.artifact) throw new Error("Package identity missing");
  Object.assign(run.receipt.artifact, { installed, verifiedFiles });
  saveReceipt(run);
}

function sourceFiles(directory: string, prefix = ""): string[] {
  return readdirSync(directory).flatMap((name) => {
    const relative = join(prefix, name);
    return statSync(join(directory, name)).isDirectory() ? sourceFiles(join(directory, name), relative) : [relative];
  });
}

export async function startScenario(run: HostRun, name: string) {
  if (run.driver) throw new Error("Previous owned driver has not been reaped; refusing another launch");
  run.scenario = name;
  mkdirSync(join(run.output, name));
  // The driver also gets no provider credentials; launch independently rejects inheritance.
  const driverEnv = Object.fromEntries(Object.keys(process.env).map((key) => [key, undefined]));
  Object.assign(driverEnv, run.env);
  run.driver = await ownDriver({ binaryPath: run.receipt.driverBinary, cwd: run.output, env: driverEnv });
  run.terminal = run.driver.terminal;
  await bounded(run.driver.ready, "driver startup", 10_000);
  run.session = await bounded(
    run.terminal.launch({
      command: [
        run.receipt.binary,
        ...(run.receipt.host === "v2" ? ["--standalone"] : []),
        join(run.output, "sandbox"),
      ],
      cwd: join(run.output, "sandbox"),
      host: "opentui",
      viewport: { cols: 110, rows: 34 },
      inheritEnv: false,
      env: run.env,
      record: "on-failure",
    }),
    "host launch",
    10_000,
  );
  const deadline = Date.now() + 30_000;
  const connectionDialog = (snapshot: ScreenSnapshot) =>
    /^\s+Connect a provider\s+esc\s*$/m.test(snapshot.text) &&
    /^\s+Search\s*$/m.test(snapshot.text) &&
    /^\s+Other Custom provider\s*$/m.test(snapshot.text);
  const ready = (snapshot: ScreenSnapshot) => {
    const prompt = visiblePrompt(snapshot);
    return (
      providerDisabledPrompt(snapshot) &&
      prompt?.lines.length === 1 &&
      (prompt.lines[0] === "Ask" || prompt.lines[0].startsWith("Ask anything"))
    );
  };
  let capture = await waitVisible(run, (snapshot) => connectionDialog(snapshot) || ready(snapshot), 30_000);
  // Disabled providers trigger this setup overlay on v1. Never approve or submit it.
  if (connectionDialog(capture)) {
    await pressKey(run, "Escape");
    capture = await waitVisible(
      run,
      (snapshot) => !connectionDialog(snapshot) && ready(snapshot),
      deadline - Date.now(),
    );
  }
  if (!ready(capture)) throw new Error("Provider isolation failed: no provider-free home prompt observed");
  run.receipt.providerObservations ??= {};
  run.receipt.providerObservations[name] = "Build · No provider selected Connect a provider";
  run.receipt.providersDisabled = true;
  writeFileSync(join(run.output, name, "provider-disabled.txt"), capture.text);
  saveReceipt(run);
}

// Native capture can report idle immediately based on output from BEFORE the last
// input. Observe stability after this call too, so Escape is decoded before 0/w.
async function waitVisible(run: HostRun, predicate: (snapshot: ScreenSnapshot) => boolean, timeoutMs: number) {
  const deadline = Date.now() + timeoutMs;
  const settleMs = 250;
  let previous = "";
  let stableSince = Date.now();
  while (Date.now() < deadline) {
    const remaining = deadline - Date.now();
    const snapshot = await bounded(
      sessionFor(run).screen.capture({
        allowIncomplete: true,
        settleMs,
        deadlineMs: Math.min(1_000, remaining),
      }),
      "visible screen capture",
      remaining,
    );
    if (snapshot.reason === "exited" || snapshot.reason === "outputclosed")
      throw new Error(`OpenCode capture ended with ${snapshot.reason}`);
    const current = JSON.stringify({ text: snapshot.text, cursor: snapshot.frame.cursor });
    const matches = predicate(snapshot);
    if (current !== previous || snapshot.reason !== "idle" || !matches) stableSince = Date.now();
    previous = current;
    if (matches && snapshot.reason === "idle" && Date.now() - stableSince >= settleMs) return snapshot;
    // Polling cadence, not a substitute for an observed settled frame.
    await Bun.sleep(Math.min(10, Math.max(0, deadline - Date.now())));
  }
  throw new Error("Timed out waiting for a settled visible prompt");
}

export function sessionFor(run: HostRun): Session {
  if (!run.session) throw new Error("Host session missing");
  return run.session;
}

export async function typeText(run: HostRun, text: string, timeoutMs = 5_000) {
  await bounded(sessionFor(run).keyboard.type(text), "keyboard type", timeoutMs);
}

export async function pressKey(run: HostRun, key: Key, timeoutMs = 5_000) {
  await bounded(sessionFor(run).keyboard.press(key), "keyboard press", timeoutMs);
}

export async function checkpoint(run: HostRun, name: string, lines: string[], cursor?: { x: number; y: number }) {
  let actual: VisiblePrompt | null = null;
  try {
    const capture = await waitVisible(
      run,
      (snapshot) => {
        actual = visiblePrompt(snapshot);
        return promptMatches(actual, lines, cursor);
      },
      5_000,
    );
    run.receipt.checks.push({ name, status: "pass", expected: { lines, cursor }, actual });
    writeFileSync(join(run.output, run.scenario ?? "", `${name}.txt`), capture.text);
    saveReceipt(run);
  } catch (error) {
    const message = `Checkpoint ${name}: expected ${JSON.stringify({ lines, cursor })}, last visible prompt ${JSON.stringify(actual)}`;
    run.receipt.checks.push({ name, status: "fail", expected: { lines, cursor }, actual, error: message });
    saveReceipt(run);
    throw new Error(message, { cause: error });
  }
}

export async function saveFailure(run: HostRun, error: unknown) {
  run.receipt.checks.push({
    name: run.scenario ?? "setup",
    status: "fail",
    error: error instanceof Error ? error.message : String(error),
  });
  if (run.session) {
    try {
      const capture: ScreenSnapshot = await bounded(
        run.session.screen.capture({ allowIncomplete: true, settleMs: 0, deadlineMs: 0 }),
        "failure capture",
      );
      const directory = join(run.output, run.scenario ?? "");
      writeFileSync(join(directory, "failure.txt"), capture.text);
      writeFileSync(join(directory, "failure.json"), JSON.stringify(capture, null, 2));
      await bounded(run.session.saveRecording(join(directory, "failure.termctrl")), "failure recording");
    } catch (captureError) {
      run.receipt.checks.push({ name: "failure-evidence", status: "fail", error: String(captureError) });
    }
  }
  saveReceipt(run);
}

export async function stopScenario(run: HostRun) {
  const errors: string[] = [];
  if (run.session) {
    try {
      await bounded(run.session.stop(), "host stop");
    } catch (error) {
      errors.push(String(error));
    }
  }
  if (run.driver) {
    try {
      await closeDriver(run.driver);
    } catch (error) {
      errors.push(String(error));
    }
    // Never forget a live handle if the forced reap itself failed.
    if (run.driver.reaped) {
      run.session = undefined;
      run.terminal = undefined;
      run.driver = undefined;
    }
  }
  run.receipt.cleanupErrors.push(...errors);
  saveReceipt(run);
  if (errors.length) throw new Error(`Owned E2E session cleanup failed: ${errors.join("; ")}`);
}

export async function scenario(run: HostRun, name: string, test: () => Promise<void>) {
  try {
    await startScenario(run, name);
    await test();
  } catch (error) {
    await saveFailure(run, error);
    throw error;
  } finally {
    await stopScenario(run);
  }
}

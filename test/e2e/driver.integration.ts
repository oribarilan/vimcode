import { expect, it } from "bun:test";
import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { bounded, closeDriver, ownDriver } from "./driver";
import { type HostRun, prepareRun, pressKey, scenario, startScenario, stopScenario, typeText } from "./host";

if (!["darwin", "linux"].includes(process.platform))
  throw new Error("Harness integration process checks require macOS or Linux");

function fixture(mode: "ready-stall" | "shutdown-stall" | "launch-stall" | "abort" | "send-stall") {
  const directory = mkdtempSync(join(realpathSync(tmpdir()), "vimcode-driver-probe-"));
  const binaryPath = join(directory, "driver");
  writeFileSync(
    binaryPath,
    `#!${process.execPath}
import { spawn } from "node:child_process";
import { appendFileSync, writeFileSync } from "node:fs";
import { createInterface } from "node:readline";
process.on("SIGTERM", () => {});
setInterval(() => {}, 1000);
if (${JSON.stringify(mode)} !== "ready-stall") {
  console.log(JSON.stringify({ type: "hello", protocolVersion: 2 }));
  createInterface({ input: process.stdin }).on("line", line => {
    const request = JSON.parse(line);
    appendFileSync(${JSON.stringify(join(directory, "requests.txt"))}, request.method + "\\n");
    const result = value => console.log(JSON.stringify({ type: "result", id: request.id, result: value }));
    if (${JSON.stringify(mode)} === "send-stall" && request.method !== "launch") {
      if (request.method === "capture") result({ reason: "idle", shot: {
        text: "  ┃\\n  ┃  Ask\\n  ┃\\n  ┃  Build · No provider selected Connect a provider\\n  ╹▀▀▀▀▀",
        frame: { cursor: null }
      }});
      else if (request.method === "recording") result({ bytes: [] });
      else if (request.method === "stop") result(null);
      // SEND and shutdown deliberately never respond; the real scenario must unwind/reap.
    }
    if (request.method === "launch") {
      const host = spawn(${JSON.stringify(process.execPath)}, ["-e", "process.on('SIGTERM',()=>{});setInterval(()=>{},1000)"], { detached: true, stdio: "ignore" });
      writeFileSync(${JSON.stringify(join(directory, "host.pid"))}, String(host.pid));
      if (${JSON.stringify(mode)} === "abort") console.log("invalid-json");
      else if (${JSON.stringify(mode)} !== "launch-stall") console.log(JSON.stringify({ type: "result", id: request.id, result: null }));
    }
  });
}
`,
    { mode: 0o755 },
  );
  return { directory, binaryPath };
}

function present(pid: number) {
  return execFileSync("/bin/ps", ["-axo", "pid="], { encoding: "utf8" }).split(/\s+/).includes(String(pid));
}

for (const mode of ["ready-stall", "shutdown-stall", "launch-stall", "abort"] as const) {
  it(`owned driver reaps ${mode} and its detached host`, async () => {
    const probe = fixture(mode);
    const env = Object.fromEntries(Object.keys(process.env).map((key) => [key, undefined]));
    Object.assign(env, { HOME: probe.directory, PATH: "/usr/bin:/bin" });
    const owner = await ownDriver({ binaryPath: probe.binaryPath, cwd: probe.directory, env });
    const pid = owner.child.pid;
    if (!pid) throw new Error("missing owned driver PID");
    try {
      if (mode === "ready-stall") {
        await expect(bounded(owner.ready, "probe readiness", 100)).rejects.toThrow("probe readiness exceeded");
      } else {
        await bounded(owner.ready, "probe readiness", 2_000);
        const launch = owner.terminal.launch({ command: ["unused"] });
        if (mode === "abort") {
          await expect(bounded(launch, "probe launch", 2_000)).rejects.toThrow("invalid termctrl driver response");
        } else if (mode === "launch-stall") {
          await expect(bounded(launch, "probe launch", 200)).rejects.toThrow("probe launch exceeded");
        } else {
          await bounded(launch, "probe launch", 2_000);
        }
      }
      await expect(closeDriver(owner, 100)).rejects.toThrow(/driver (shutdown|reap) exceeded/);
      expect(owner.reaped).toBe(true);
      expect(present(pid)).toBe(false);
      if (mode !== "ready-stall") {
        const hostPid = Number(readFileSync(join(probe.directory, "host.pid"), "utf8"));
        expect(owner.hostGroups.has(hostPid)).toBe(true);
        expect(present(hostPid)).toBe(false);
      }
    } finally {
      if (!owner.reaped) await closeDriver(owner, 1_000).catch(() => {});
      rmSync(probe.directory, { recursive: true, force: true });
    }
  });
}

for (const send of ["type", "press"] as const) {
  it(`scenario captures stalled keyboard ${send} failure and finally reaps its driver/host`, async () => {
    const probe = fixture("send-stall");
    const run: HostRun = {
      output: probe.directory,
      env: { HOME: probe.directory, PATH: "/usr/bin:/bin" },
      receipt: {
        host: "v1",
        binary: "unused",
        version: "unused",
        platform: process.platform,
        terminalControl: "1.2.1",
        driverBinary: probe.binaryPath,
        negativeControl: false,
        checks: [],
        cleanupErrors: [],
      },
    };
    let owner: HostRun["driver"];
    try {
      await expect(
        scenario(run, `send-${send}`, async () => {
          owner = run.driver;
          if (send === "type") await typeText(run, "synthetic", 100);
          else await pressKey(run, "Escape", 100);
          throw new Error("stalled send must not complete");
        }),
      ).rejects.toThrow("driver shutdown exceeded");
      if (!owner?.child.pid) throw new Error("scenario did not retain driver ownership");
      const hostPid = Number(readFileSync(join(probe.directory, "host.pid"), "utf8"));
      const receipt = JSON.parse(readFileSync(join(probe.directory, "receipt.json"), "utf8")) as {
        checks: Array<{ name: string; status: string; error: string }>;
        cleanupErrors: string[];
      };
      expect(receipt.checks).toEqual([
        { name: `send-${send}`, status: "fail", error: `keyboard ${send} exceeded 100ms` },
      ]);
      expect(receipt.cleanupErrors).toEqual(["Error: driver shutdown exceeded 5000ms"]);
      expect(readFileSync(join(probe.directory, `send-${send}/failure.txt`), "utf8")).toContain("No provider selected");
      expect(readFileSync(join(probe.directory, `send-${send}/failure.termctrl`)).length).toBe(0);
      const requests = readFileSync(join(probe.directory, "requests.txt"), "utf8").trim().split("\n");
      expect(requests).toContain("send");
      expect(requests.slice(-3)).toEqual(["recording", "stop", "shutdown"]);
      expect(owner.reaped).toBe(true);
      expect(owner.hostGroups.has(hostPid)).toBe(true);
      expect(present(owner.child.pid)).toBe(false);
      expect(present(hostPid)).toBe(false);
      expect(run.driver).toBeUndefined();
      expect(run.session).toBeUndefined();
    } finally {
      if (run.driver && !run.driver.reaped) await closeDriver(run.driver, 1_000).catch(() => {});
      rmSync(probe.directory, { recursive: true, force: true });
    }
  }, 20_000);
}

it("retains unresolved ownership across cleanup retries and blocks later launches", async () => {
  const probe = fixture("shutdown-stall");
  const env = Object.fromEntries(Object.keys(process.env).map((key) => [key, undefined]));
  Object.assign(env, { HOME: probe.directory, PATH: "/usr/bin:/bin" });
  const owner = await ownDriver({ binaryPath: probe.binaryPath, cwd: probe.directory, env });
  const run: HostRun = {
    output: probe.directory,
    env: {},
    driver: owner,
    terminal: owner.terminal,
    receipt: {
      host: "v1",
      binary: "unused",
      version: "unused",
      platform: process.platform,
      terminalControl: "1.2.1",
      negativeControl: false,
      checks: [],
      cleanupErrors: [],
    },
  };
  try {
    await bounded(owner.ready, "probe readiness", 2_000);
    await bounded(owner.terminal.launch({ command: ["unused"] }), "probe launch", 2_000);
    owner.discoveryError = new Error("injected unresolved ownership");
    await expect(closeDriver(owner, 100)).rejects.toThrow("injected unresolved ownership");
    await owner.closed;
    expect(owner.reaped).toBe(false);
    await expect(stopScenario(run)).rejects.toThrow("injected unresolved ownership");
    expect(owner.reaped).toBe(false);
    expect(run.driver).toBe(owner);
    await expect(startScenario(run, "must-not-launch")).rejects.toThrow("refusing another launch");
    expect(present(Number(readFileSync(join(probe.directory, "host.pid"), "utf8")))).toBe(false);
  } finally {
    // The injected discovery failure is the only unresolved condition in this fixture.
    owner.discoveryError = undefined;
    await closeDriver(owner, 1_000).catch(() => {});
    rmSync(probe.directory, { recursive: true, force: true });
  }
});

it("rejects inherited TERMCTRL_BINARY before binary execution and records the reason", () => {
  const output = mkdtempSync(join(realpathSync(tmpdir()), "vimcode-override-probe-"));
  const keys = [
    "TERMCTRL_BINARY",
    "VIMCODE_E2E_HOST",
    "VIMCODE_E2E_BIN",
    "VIMCODE_E2E_VERSION",
    "VIMCODE_E2E_OUTPUT",
  ] as const;
  const before = keys.map((key) => process.env[key]);
  Object.assign(process.env, {
    TERMCTRL_BINARY: "/not-a-pinned-driver",
    VIMCODE_E2E_HOST: "v1",
    VIMCODE_E2E_BIN: "/must-not-execute",
    VIMCODE_E2E_VERSION: "1.18.34",
    VIMCODE_E2E_OUTPUT: output,
  });
  try {
    expect(() => prepareRun()).toThrow("TERMCTRL_BINARY override is unsupported");
    const receipt = JSON.parse(readFileSync(join(output, "receipt.json"), "utf8")) as {
      checks: Array<{ status: string; error: string }>;
      driverBinary?: string;
    };
    expect(receipt.checks[0].status).toBe("fail");
    expect(receipt.checks[0].error).toContain("unset it");
    expect(receipt.driverBinary).toBeUndefined();
  } finally {
    keys.forEach((key, index) => {
      if (before[index] === undefined) delete process.env[key];
      else process.env[key] = before[index];
    });
    rmSync(output, { recursive: true, force: true });
  }
});

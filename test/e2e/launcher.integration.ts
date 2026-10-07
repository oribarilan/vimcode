import { expect, it } from "bun:test";
import { mkdirSync, mkdtempSync, realpathSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  binarySettings,
  freshRunRoot,
  isolatedToolEnv,
  nativeSource,
  outputPath,
  pins,
  resolveBinary,
  runHosts,
  selectHosts,
  verifiedBinary,
} from "../../scripts/test-e2e";

function fixture() {
  return mkdtempSync(join(realpathSync(tmpdir()), "vimcode-launcher-probe-"));
}

it("defaults to both exact pins, supports one host and existing four-argument CI calls", () => {
  expect(pins).toEqual({ v1: "1.18.34", v2: "2.0.15" });
  expect(selectHosts([])).toEqual({ hosts: ["v1", "v2"] });
  expect(selectHosts(["", "", "", ""])).toEqual({ hosts: ["v1", "v2"] });
  for (const host of ["v1", "v2"] as const) {
    expect(selectHosts([host, "", "", ""])).toEqual({ hosts: [host] });
    expect(selectHosts([host, "/native/opencode", pins[host], "/outside/output"])).toEqual({
      hosts: [host],
      explicit: { binary: "/native/opencode", version: pins[host], output: "/outside/output" },
    });
  }
});

it("rejects bad selectors, incomplete explicit arguments, relative CI paths and unpinned versions", () => {
  for (const args of [
    ["v3"],
    ["v1", "/binary"],
    ["", "/binary", pins.v1, "/output"],
    ["v2", "/binary", pins.v2, "/output", "extra"],
  ])
    expect(() => selectHosts(args)).toThrow("Use just test-e2e");
  for (const args of [
    ["v1", "relative", pins.v1, "/output"],
    ["v2", "/binary", "latest", "/output"],
  ])
    expect(() => selectHosts(args)).toThrow("requires absolute binary/output paths and pinned version");
});

it("parses synthetic dotenv as data, with process precedence, only path keys, and CI file exclusion", () => {
  const text = `# synthetic, never a user's file
export VIMCODE_E2E_V1_BIN="./host one" # comment
VIMCODE_E2E_V2_BIN='./$(touch must-not-run)'
SYNTHETIC_PROVIDER_SECRET=do-not-forward
OPENCODE_CONFIG_CONTENT=do-not-forward
VIMCODE_E2E_VERSION=latest
UNKNOWN_KEY=do-not-forward
`;
  expect(binarySettings({}, text)).toEqual({ v1: "./host one", v2: "./$(touch must-not-run)" });
  expect(binarySettings({ VIMCODE_E2E_V1_BIN: "/process/host" }, text)).toEqual({
    v1: "/process/host",
    v2: "./$(touch must-not-run)",
  });
  expect(binarySettings({ CI: "true" }, text)).toEqual({});
  expect(binarySettings({ CI: "1", VIMCODE_E2E_V2_BIN: "/ci/host" }, text)).toEqual({ v2: "/ci/host" });
  expect(binarySettings({ VIMCODE_E2E_V1_BIN: "" }, text)).toEqual({ v1: "", v2: "./$(touch must-not-run)" });
  expect(binarySettings({}, 'VIMCODE_E2E_V1_BIN="line\\nnext"')).toEqual({ v1: "line\nnext" });
});

it("Bun --env-file=/dev/null really excludes synthetic local secrets from the launched child", () => {
  const directory = fixture();
  try {
    writeFileSync(join(directory, ".env"), "SYNTHETIC_PROVIDER_SECRET=do-not-forward\nVIMCODE_E2E_V1_BIN=./host\n");
    const env = isolatedToolEnv(join(directory, "tools"));
    const probe =
      "process.stdout.write(JSON.stringify({secret:process.env.SYNTHETIC_PROVIDER_SECRET,bin:process.env.VIMCODE_E2E_V1_BIN}))";
    const autoload = Bun.spawnSync([process.execPath, "-e", probe], { cwd: directory, env, stdout: "pipe" });
    expect(autoload.exitCode).toBe(0);
    expect(JSON.parse(new TextDecoder().decode(autoload.stdout))).toEqual({ secret: "do-not-forward", bin: "./host" });
    const isolated = Bun.spawnSync([process.execPath, "--env-file=/dev/null", "-e", probe], {
      cwd: directory,
      env,
      stdout: "pipe",
    });
    expect(isolated.exitCode).toBe(0);
    expect(JSON.parse(new TextDecoder().decode(isolated.stdout))).toEqual({});
    expect(env).not.toHaveProperty("SYNTHETIC_PROVIDER_SECRET");
    expect(env).not.toHaveProperty("VIMCODE_E2E_V1_BIN");
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

it("infers unique canonical OS-temp outputs and rejects nonempty/config ancestors", () => {
  const first = freshRunRoot();
  const second = freshRunRoot();
  try {
    expect(first).not.toBe(second);
    expect(first.startsWith(join(realpathSync(tmpdir()), "vimcode-e2e-"))).toBe(true);
    expect(outputPath(join(first, "v1"))).toBe(join(first, "v1"));
    writeFileSync(join(first, "evidence.txt"), "preserved");
    expect(() => outputPath(first)).toThrow("new or empty");
    mkdirSync(join(second, "project"));
    mkdirSync(join(second, "project/.git"));
    expect(() => outputPath(join(second, "project/new"))).toThrow("outside project/config ancestry");
    symlinkSync(join(second, "project"), join(first, "linked"));
    expect(() => outputPath(join(first, "linked/new"))).toThrow("outside project/config ancestry");
  } finally {
    rmSync(first, { recursive: true, force: true });
    rmSync(second, { recursive: true, force: true });
  }
});

it("binary overrides resolve relative to the repository base, canonicalize, and reject missing/wrong versions", () => {
  const directory = fixture();
  try {
    const env = isolatedToolEnv(join(directory, "tools"));
    const binary = join(directory, "native");
    writeFileSync(binary, "#!/bin/sh\nprintf 'opencode v1.18.34\\n'\n", { mode: 0o755 });
    symlinkSync(binary, join(directory, "link"));
    expect(verifiedBinary("./link", "v1", directory, env, directory)).toBe(binary);
    expect(() => verifiedBinary("./missing", "v1", directory, env, directory)).toThrow("binary path does not exist");
    expect(() => verifiedBinary(binary, "v2", directory, env)).toThrow("Expected OpenCode v2 2.0.15");
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

it("invalid selected-host settings fail without blocking another host or an unrelated selector", async () => {
  const directory = fixture();
  try {
    const env = isolatedToolEnv(join(directory, "tools"));
    const binary = join(directory, "v2-native");
    writeFileSync(binary, "#!/bin/sh\nprintf 'opencode v2.0.15\\n'\n", { mode: 0o755 });
    for (const invalid of ["", "  ", "line\nnext"]) {
      const settings = binarySettings({ VIMCODE_E2E_V1_BIN: invalid, VIMCODE_E2E_V2_BIN: binary });
      const completed: string[] = [];
      const execute = async (host: "v1" | "v2") => {
        try {
          resolveBinary(host, settings[host], directory, env);
          completed.push(host);
          return 0;
        } catch (error) {
          expect(String(error)).toContain("VIMCODE_E2E_V1_BIN must be a nonempty binary path");
          return 1;
        }
      };
      expect(await runHosts(selectHosts([]).hosts, execute)).toBe(1);
      expect(completed).toEqual(["v2"]);
      completed.length = 0;
      expect(await runHosts(selectHosts(["v2"]).hosts, execute)).toBe(0);
      expect(completed).toEqual(["v2"]);
    }
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

it("version probes are bounded even when an override stalls", () => {
  const directory = fixture();
  try {
    const env = isolatedToolEnv(join(directory, "tools"));
    const binary = join(directory, "stalled");
    writeFileSync(binary, `#!${process.execPath}\nprocess.on("SIGTERM", () => {});\nsetInterval(() => {}, 1000);\n`, {
      mode: 0o755,
    });
    const start = Date.now();
    expect(() => verifiedBinary(binary, "v1", directory, env)).toThrow("ETIMEDOUT");
    expect(Date.now() - start).toBeLessThan(15_000);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
}, 20_000);

it("only bootstraps verified native shapes and gives unsupported platforms an actionable override", () => {
  expect(nativeSource("v1", "darwin", "arm64")).toEqual({
    asset: "opencode-darwin-arm64.zip",
    sha256: "8522b70f545184b3a8d97c5ca4f814093b2476d72aebfda8c48bcd072ec31d1b",
  });
  expect(nativeSource("v1", "linux", "x64")).toEqual({
    asset: "opencode-linux-x64-baseline.tar.gz",
    sha256: "24b0d458d21ef548b2752166303defcf7f4945b049fb4876ab78dfaf86d81b27",
  });
  expect(nativeSource("v2", "darwin", "arm64")).toEqual({ package: "@opencode/cli-darwin-arm64" });
  expect(nativeSource("v2", "linux", "x64")).toEqual({ package: "@opencode/cli-linux-x64-baseline" });
  expect(() => nativeSource("v2", "linux", "arm64")).toThrow("set VIMCODE_E2E_V2_BIN");
  expect(() => nativeSource("v1", "win32", "x64")).toThrow("No verified bootstrap");
});

it("both-host execution is sequential, continues after failure, and never turns negative exit 1 green", async () => {
  const visited: string[] = [];
  expect(
    await runHosts(["v1", "v2"], async (host) => {
      visited.push(host);
      const child = Bun.spawn(
        [process.execPath, "--env-file=/dev/null", "-e", `process.exit(${host === "v1" ? 1 : 0})`],
        {
          env: {},
          stdout: "ignore",
          stderr: "ignore",
        },
      );
      return child.exited;
    }),
  ).toBe(1);
  expect(visited).toEqual(["v1", "v2"]);
  expect(await runHosts(["v1", "v2"], async () => 0)).toBe(0);
  expect(await runHosts(["v2"], async () => 1)).toBe(1);
  expect(await runHosts(["v1", "v2"], async (host) => (host === "v2" ? 1 : 0))).toBe(1);
});

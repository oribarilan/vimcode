import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  realpathSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, isAbsolute, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { parseEnv } from "node:util";

export const pins = { v1: "1.18.34", v2: "2.0.15" } as const;
export type Host = keyof typeof pins;
const overrideKeys = { v1: "VIMCODE_E2E_V1_BIN", v2: "VIMCODE_E2E_V2_BIN" } as const;
type Environment = Record<string, string | undefined>;
export type Selection = { hosts: Host[]; explicit?: { binary: string; version: string; output: string } };
const root = realpathSync(fileURLToPath(new URL("../", import.meta.url)));
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

export function selectHosts(args: string[]): Selection {
  const values = [...args];
  while (values.at(-1) === "") values.pop();
  if (!values.length) return { hosts: ["v1", "v2"] };
  const [host, binary, version, output] = values;
  if ((host !== "v1" && host !== "v2") || (values.length !== 1 && values.length !== 4))
    throw new Error(
      "Use just test-e2e [v1|v2] or just test-e2e HOST /absolute/BINARY PINNED_VERSION /absolute/NEW_OUTPUT",
    );
  if (values.length === 1) return { hosts: [host] };
  if (!isAbsolute(binary) || !isAbsolute(output) || version !== pins[host])
    throw new Error(`Explicit ${host} requires absolute binary/output paths and pinned version ${pins[host]}`);
  return { hosts: [host], explicit: { binary, version, output } };
}

// parseEnv is data-only: neither shell expansion nor unknown keys reach child environments.
export function binarySettings(env: Environment, fileText = ""): Partial<Record<Host, string>> {
  const local = env.CI ? {} : parseEnv(fileText);
  const settings: Partial<Record<Host, string>> = {};
  for (const host of ["v1", "v2"] as const) {
    const key = overrideKeys[host];
    const value = env[key] ?? local[key];
    if (value !== undefined) settings[host] = value;
  }
  return settings;
}

export function isolatedToolEnv(directory: string): Record<string, string> {
  for (const name of ["home", "config", "data", "cache", "state", "cwd"])
    mkdirSync(join(directory, name), { recursive: true });
  const tools = [process.execPath, Bun.which("npm"), Bun.which("node")]
    .filter((path): path is string => path !== null)
    .map((path) => dirname(path));
  return {
    PATH: [...new Set([...tools, "/usr/local/bin", "/usr/bin", "/bin", "/usr/sbin", "/sbin"])].join(":"),
    HOME: join(directory, "home"),
    XDG_CONFIG_HOME: join(directory, "config"),
    XDG_DATA_HOME: join(directory, "data"),
    XDG_CACHE_HOME: join(directory, "cache"),
    XDG_STATE_HOME: join(directory, "state"),
    OPENCODE_DISABLE_AUTOUPDATE: "1",
  };
}

function outsideConfig(path: string) {
  for (let ancestor = path; ; ancestor = dirname(ancestor)) {
    if (configNames.some((name) => existsSync(join(ancestor, name))))
      throw new Error(`E2E output must be outside project/config ancestry: ${ancestor}`);
    if (dirname(ancestor) === ancestor) break;
  }
}

export function freshRunRoot(): string {
  const temporary = realpathSync(tmpdir());
  outsideConfig(temporary);
  return realpathSync(mkdtempSync(join(temporary, "vimcode-e2e-")));
}

export function outputPath(path: string): string {
  if (!isAbsolute(path)) throw new Error("E2E output must be absolute");
  const canonical = existsSync(path)
    ? realpathSync(path)
    : join(realpathSync(dirname(path)), path.slice(dirname(path).length + 1));
  outsideConfig(canonical);
  if (existsSync(canonical) && (!statSync(canonical).isDirectory() || readdirSync(canonical).length))
    throw new Error(`E2E output must be a new or empty directory: ${canonical}`);
  return canonical;
}

function command(binary: string, args: string[], directory: string, env: Record<string, string>, timeout = 10_000) {
  return execFileSync(binary, args, {
    cwd: directory,
    env,
    encoding: "utf8",
    timeout,
    killSignal: "SIGKILL",
    maxBuffer: 2 * 1024 * 1024,
  });
}

function versionOf(binary: string, directory: string, env: Record<string, string>): string {
  return command(binary, ["--version"], directory, env)
    .trim()
    .replace(/^opencode v/, "");
}

export function verifiedBinary(
  path: string,
  host: Host,
  directory: string,
  env: Record<string, string>,
  base = root,
): string {
  // Validate only when this host runs: an unused host override must not block selection.
  if (!path.trim() || /[\r\n\0]/.test(path)) throw new Error(`${overrideKeys[host]} must be a nonempty binary path`);
  let binary: string;
  try {
    binary = realpathSync(resolve(base, path));
    if (!statSync(binary).isFile()) throw new Error("not a file");
  } catch {
    throw new Error(`${overrideKeys[host]}: binary path does not exist or is not a file: ${path}`);
  }
  const actual = versionOf(binary, directory, env);
  if (actual !== pins[host])
    throw new Error(`Expected OpenCode ${host} ${pins[host]}, got ${JSON.stringify(actual)} at ${binary}`);
  return binary;
}

export function nativeSource(
  host: Host,
  platform: NodeJS.Platform = process.platform,
  arch: string = process.arch,
): { package: string } | { asset: string; sha256: string } {
  const target = `${platform}-${arch}`;
  if (target !== "darwin-arm64" && target !== "linux-x64")
    throw new Error(
      `No verified bootstrap for ${target}; set ${overrideKeys[host]} to a native OpenCode ${pins[host]} binary`,
    );
  if (host === "v2") return { package: `@opencode/cli-${target === "linux-x64" ? "linux-x64-baseline" : target}` };
  return target === "darwin-arm64"
    ? { asset: "opencode-darwin-arm64.zip", sha256: "8522b70f545184b3a8d97c5ca4f814093b2476d72aebfda8c48bcd072ec31d1b" }
    : {
        asset: "opencode-linux-x64-baseline.tar.gz",
        sha256: "24b0d458d21ef548b2752166303defcf7f4945b049fb4876ab78dfaf86d81b27",
      };
}

function provision(host: Host, directory: string, env: Record<string, string>): string {
  const source = nativeSource(host);
  const native = join(directory, "native");
  mkdirSync(native);
  if ("package" in source) {
    // npm refuses using the same config file for both scopes; neither may read host credentials.
    const userConfig = join(directory, "user.npmrc");
    const globalConfig = join(directory, "global.npmrc");
    writeFileSync(userConfig, "");
    writeFileSync(globalConfig, "");
    command(
      "npm",
      [
        "install",
        "--prefix",
        native,
        "--no-save",
        "--ignore-scripts",
        "--no-audit",
        "--no-fund",
        "--registry=https://registry.npmjs.org",
        `--userconfig=${userConfig}`,
        `--globalconfig=${globalConfig}`,
        "--fetch-retries=1",
        "--fetch-timeout=45000",
        `${source.package}@${pins[host]}`,
      ],
      directory,
      env,
      120_000,
    );
    const packageRoot = join(native, "node_modules", source.package);
    const manifest = JSON.parse(readFileSync(join(packageRoot, "package.json"), "utf8")) as {
      name: string;
      version: string;
    };
    if (manifest.name !== source.package || manifest.version !== pins[host])
      throw new Error("Unexpected native host package identity");
    return verifiedBinary(join(packageRoot, "bin/opencode"), host, directory, env);
  }
  const archive = join(directory, source.asset);
  command(
    "curl",
    [
      "--fail",
      "--location",
      "--connect-timeout",
      "10",
      "--max-time",
      "90",
      "--output",
      archive,
      `https://github.com/anomalyco/opencode/releases/download/v${pins[host]}/${source.asset}`,
    ],
    directory,
    env,
    100_000,
  );
  if (createHash("sha256").update(readFileSync(archive)).digest("hex") !== source.sha256)
    throw new Error(`Official ${source.asset} SHA-256 mismatch; refusing extraction`);
  const zip = source.asset.endsWith(".zip");
  const contents = command(zip ? "unzip" : "tar", zip ? ["-Z1", archive] : ["-tzf", archive], directory, env).trim();
  if (contents !== "opencode") throw new Error("Expected exactly one native opencode archive entry");
  command(zip ? "unzip" : "tar", zip ? ["-q", archive, "-d", native] : ["-xzf", archive, "-C", native], directory, env);
  return verifiedBinary(join(native, "opencode"), host, directory, env);
}

export function resolveBinary(
  host: Host,
  override: string | undefined,
  directory: string,
  env: Record<string, string>,
): string {
  if (override !== undefined) return verifiedBinary(override, host, directory, env);
  const installed = Bun.which("opencode");
  if (installed) {
    try {
      if (versionOf(installed, directory, env) === pins[host]) return realpathSync(installed);
    } catch {
      // A broken/unmatched PATH host is not an override; bootstrap the exact pin instead.
    }
  }
  process.stdout.write(`Bootstrapping private OpenCode ${host}@${pins[host]} (network required)\n`);
  try {
    return provision(host, directory, env);
  } catch (error) {
    throw new Error(
      `Could not bootstrap ${host}@${pins[host]}. Set ${overrideKeys[host]} in .env or the process environment to an existing pinned native binary. ${error instanceof Error ? error.message : String(error)}`,
      { cause: error },
    );
  }
}

export async function runHosts(hosts: Host[], execute: (host: Host) => Promise<number>): Promise<number> {
  let status = 0;
  for (const host of hosts) if ((await execute(host)) !== 0) status = 1;
  return status;
}

async function main() {
  if (!["darwin", "linux"].includes(process.platform))
    throw new Error("Terminal Control E2E requires macOS or GNU/Linux");
  const selection = selectHosts(process.argv.slice(2));
  // CI and fully explicit invocations never read a local file.
  const file = join(root, ".env");
  const settings = selection.explicit
    ? {}
    : binarySettings(process.env, !process.env.CI && existsSync(file) ? readFileSync(file, "utf8") : "");
  const runRoot = freshRunRoot();
  process.stdout.write(`E2E run directory: ${runRoot}\n`);
  const outputs = Object.fromEntries(
    selection.hosts.map((host) => [host, outputPath(selection.explicit?.output ?? join(runRoot, host))]),
  );
  for (const host of selection.hosts)
    process.stdout.write(`${host}@${pins[host]} receipt: ${join(outputs[host], "receipt.json")}\n`);
  return runHosts(selection.hosts, async (host) => {
    try {
      const directory = join(runRoot, `${host}-tools`);
      const env = isolatedToolEnv(directory);
      const binary = resolveBinary(host, selection.explicit?.binary ?? settings[host], directory, env);
      process.stdout.write(`${host} binary: ${binary}\n`);
      const child = Bun.spawn([process.execPath, "--env-file=/dev/null", "test", "./test/e2e/opencode.e2e.ts"], {
        cwd: root,
        env: {
          ...env,
          VIMCODE_E2E_HOST: host,
          VIMCODE_E2E_BIN: binary,
          VIMCODE_E2E_VERSION: pins[host],
          VIMCODE_E2E_OUTPUT: outputs[host],
          VIMCODE_E2E_NO_PLUGIN: process.env.VIMCODE_E2E_NO_PLUGIN === "1" ? "1" : "0",
          ...(process.env.TERMCTRL_BINARY ? { TERMCTRL_BINARY: process.env.TERMCTRL_BINARY } : {}),
        },
        stdout: "inherit",
        stderr: "inherit",
        stdin: "ignore",
      });
      return await child.exited;
    } catch (error) {
      const message = `${host} launcher failed: ${error instanceof Error ? error.message : String(error)}`;
      writeFileSync(join(runRoot, `${host}-launcher-error.txt`), `${message}\n`);
      process.stderr.write(`${message}\n`);
      return 1;
    }
  });
}

if (import.meta.main) {
  try {
    process.exitCode = await main();
  } catch (error) {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    process.exitCode = 1;
  }
}

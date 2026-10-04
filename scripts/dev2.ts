import { mkdirSync, realpathSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const root = realpathSync(fileURLToPath(new URL("../", import.meta.url)));
const state = join(root, ".dev2");
mkdirSync(state, { recursive: true });
const stateRoot = realpathSync(state);
const binary = process.argv[2] || process.env.OPENCODE_V2_BIN;
const npx = process.platform === "win32" ? [process.env.ComSpec ?? "cmd.exe", "/d", "/c", "npx"] : ["npx"];
const command = binary ? [binary] : [...npx, "--yes", "--package=@opencode/cli@2.0.15", "opencode"];

// Keep v2's config migration, credentials and history away from the v1 setup.
const env = { ...process.env };
for (const key of ["OPENCODE_CONFIG", "OPENCODE_CONFIG_CONTENT", "OPENCODE_CONFIG_DIR", "OPENCODE_TUI_CONFIG"]) {
  delete env[key];
}
Object.assign(env, {
  XDG_CONFIG_HOME: join(stateRoot, "config"),
  XDG_DATA_HOME: join(stateRoot, "data"),
  XDG_CACHE_HOME: join(stateRoot, "cache"),
  XDG_STATE_HOME: join(stateRoot, "state"),
  OPENCODE_CLI_CONFIG_CONTENT: JSON.stringify({
    plugins: [{ package: root, options: { updateCheck: false, experimentalV2Leader: "ctrl+x" } }],
    keybinds: {
      leader: "ctrl+x",
      "session.child.first": ["down", "<leader>down", "<leader>j"],
      "composer.subagent.up": ["up", "h", "k"],
      "composer.subagent.down": ["down", "j", "l"],
    },
  }),
});

let version: string;
try {
  const probe = Bun.spawnSync([...command, "--version"], { cwd: root, env, stdout: "pipe", stderr: "inherit" });
  if (probe.exitCode !== 0) process.exit(probe.exitCode);
  version = new TextDecoder().decode(probe.stdout).trim();
} catch (error) {
  process.stderr.write(`Could not launch OpenCode v2: ${error instanceof Error ? error.message : String(error)}\n`);
  process.exit(1);
}
if (!/^(?:opencode v)?2\./.test(version)) {
  process.stderr.write(`dev2 requires OpenCode 2.x, got ${JSON.stringify(version)}. Use just dev for v1.\n`);
  process.exit(1);
}

process.stdout.write(`Starting ${version} with local vimcode; separate state: ${stateRoot}\n`);
const child = Bun.spawn([...command, "--standalone", root], {
  cwd: root,
  env,
  stdin: "inherit",
  stdout: "inherit",
  stderr: "inherit",
});
process.exit(await child.exited);

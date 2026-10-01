#!/usr/bin/env python3
"""Real-host compatibility probe. Never sends a prompt or approves a permission."""
import argparse
import json
import os
from pathlib import Path
import shutil
import subprocess
import sys

from cases import run_core, run_v2_prompts, run_v2_reload
from driver import capture, configure, new_context, ready, save, start, stop

ROOT = Path(__file__).resolve().parents[2]


def finalize(ctx):
    try:
        try:
            (ctx["output"] / "last-screen.txt").write_text(capture(ctx))
        except (OSError, subprocess.SubprocessError):
            pass
        if not stop(ctx):
            ctx["report"]["result"] = "failed"
            ctx["report"].setdefault("failure", "Owned test session cleanup could not be confirmed")
    finally:
        checks = ctx["report"]["checks"]
        ctx["report"]["summary"] = {
            "pass": sum(check["status"] == "pass" for check in checks),
            "known-gap": [check["name"] for check in checks if check["status"] == "known-gap"],
            "fail": [check["name"] for check in checks if check["status"] == "fail"],
        }
        save(ctx)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--host", choices=("v1", "v2"), required=True)
    parser.add_argument("--binary", type=Path, required=True)
    parser.add_argument("--expect-version", required=True)
    parser.add_argument("--output", type=Path, required=True, help="a new, empty directory outside a project")
    args = parser.parse_args()
    if sys.platform not in ("darwin", "linux") or not shutil.which("tmux") or not shutil.which("npm"):
        parser.error("Requires macOS/Linux/WSL with tmux, npm and Python 3; native Windows is untested")
    args.binary = args.binary.resolve()
    if not args.binary.is_file() or not os.access(args.binary, os.X_OK):
        parser.error("--binary must name an executable file")
    try:
        version = subprocess.check_output([str(args.binary), "--version"], text=True, timeout=10).strip().removeprefix("opencode v")
    except (OSError, subprocess.SubprocessError) as error:
        parser.error(f"Could not determine OpenCode binary version: {error}")
    if version != args.expect_version:
        parser.error(f"Binary version {version!r} does not match --expect-version {args.expect_version!r}")
    args.actual_version = version

    output = args.output.resolve()
    for ancestor in (output, *output.parents):
        if (ancestor / ".git").exists() or any((ancestor / name).exists() for name in (".opencode", "opencode.json", "opencode.jsonc", "tui.json", "tui.jsonc", "cli.json", "cli.jsonc")):
            parser.error(f"--output must be outside a checkout and project OpenCode config: {ancestor}")
    if output.exists() and any(output.iterdir()):
        parser.error(f"--output must be new or empty: {output}")
    output.mkdir(parents=True, exist_ok=True)
    build = output / "build"
    build.mkdir()
    try:
        with (output / "pack.log").open("w") as log:
            subprocess.run(["npm", "pack", "--ignore-scripts", "--pack-destination", str(build)], cwd=ROOT,
                           check=True, stdout=subprocess.DEVNULL, stderr=log, timeout=30)
    except (OSError, subprocess.SubprocessError) as error:
        parser.error(f"Could not package the plugin; see {output / 'pack.log'}: {error}")
    tarball = build / f"vimcode-{json.loads((ROOT / 'package.json').read_text())['version']}.tgz"
    ctx = new_context(args, output, tarball)
    configure(ctx)
    save(ctx)
    try:
        start(ctx, "cold")
        ctx["report"]["coldInstall"] = ready(ctx, "cold")
        save(ctx)
        if not stop(ctx):
            raise RuntimeError("Could not confirm cleanup of the cold test session")
        # A failed cold install remains a failure, even when warm replay
        # succeeds. The second run distinguishes installer from input bugs.
        start(ctx, "warm")
        ctx["report"]["warmInstall"] = ready(ctx, "warm")
        save(ctx)
        if ctx["report"]["warmInstall"]["status"] != "passed":
            raise RuntimeError("Warm installation did not register vimcode")
        run_core(ctx)
        if args.host == "v2":
            run_v2_prompts(ctx)
            run_v2_reload(ctx)
        ctx["report"]["result"] = "passed" if ctx["report"]["coldInstall"]["status"] == "passed" else "cold-install-failed"
    except Exception as error:
        ctx["report"]["result"] = "failed"
        ctx["report"]["failure"] = str(error)[:900]
    finally:
        finalize(ctx)
    summary = ctx["report"]["summary"]
    print(f"{ctx['report']['result']}: {summary['pass']} passing, {len(summary['known-gap'])} known gaps, "
          f"{len(summary['fail'])} failed; {output / 'receipt.json'}")
    return 0 if ctx["report"]["result"] == "passed" else 1


if __name__ == "__main__":
    sys.exit(main())

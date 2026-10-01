"""Isolated tmux/fixture control for the optional real-host compatibility tests."""
import hashlib
import json
import os
import platform
import shlex
import subprocess
import tarfile
import time
import uuid
from pathlib import Path

FIXTURE = Path(__file__).resolve().parent / "fixture"


def atomic_json(path, data):
    temp = path.with_suffix(path.suffix + ".next")
    temp.write_text(json.dumps(data, ensure_ascii=False, indent=2) + "\n")
    temp.replace(path)


def read_json(path):
    return json.loads(path.read_text())


def wait_for(read, check, label, seconds=25):
    deadline = time.monotonic() + seconds
    last = None
    while time.monotonic() < deadline:
        try:
            last = read()
            if check(last):
                return last
        except (OSError, ValueError):
            pass
        time.sleep(0.1)
    raise RuntimeError(f"Timed out waiting for {label}; last state: {str(last)[:400]}")


def compare_state(name, actual, intended, prior=None):
    def matches(expected):
        return all(actual.get(key) == value for key, value in expected.items())
    status = "pass" if matches(intended) else "known-gap" if prior and matches(prior) else "fail"
    return {"name": name, "status": status, "intended": intended, "prior": prior, "actual": actual}


def new_context(args, output, tarball):
    socket = "vimcode-hardening-" + uuid.uuid4().hex[:10]
    session = "vimcode-hardening-test"
    return {
        "args": args,
        "output": output,
        "tarball": tarball,
        "socket": socket,
        "session": session,
        "pane": session + ":0.0",
        "state": output / "state.json",
        "request": output / "request.json",
        "command": output / "command.json",
        "result": output / "result.json",
        "config": output / "config" / "opencode",
        "report": {
            "host": args.host,
            "binary": str(args.binary),
            "version": args.actual_version,
            "platform": platform.platform(),
            "environment": {
                "isolation": "env -i with a dedicated tmux socket",
                "home": str(output / "home"),
                "xdgConfigHome": str(output / "config"),
                "xdgDataHome": str(output / "data"),
                "xdgCacheHome": str(output / "cache"),
                "xdgStateHome": str(output / "state"),
                "sandbox": str(output / "sandbox"),
                "clipboard": "test-bin stubs for macOS, Linux and WSL; no native clipboard reads",
                "terminal": "xterm-256color",
            },
            "tmux": subprocess.check_output(["tmux", "-V"], text=True, timeout=8).strip(),
            "artifact": str(tarball),
            "artifactSha256": hashlib.sha256(tarball.read_bytes()).hexdigest(),
            "output": str(output),
            "coldInstall": {},
            "warmInstall": {},
            "checks": [],
        },
    }


def tmux(ctx, *parts):
    command = ["tmux", "-L", ctx["socket"], "-f", "/dev/null", *parts]
    return subprocess.run(command, text=True, capture_output=True, check=True, timeout=8).stdout


def capture(ctx):
    return tmux(ctx, "capture-pane", "-p", "-t", ctx["pane"], "-S", "-35")


def snapshot(ctx):
    return read_json(ctx["state"])


def fresh_snapshot(ctx, seconds=3):
    # A cached state file is not evidence that the observer is still alive.
    token = uuid.uuid4().hex
    atomic_json(ctx["request"], {"id": token, "action": "observe"})
    return wait_for(lambda: snapshot(ctx), lambda value: value.get("observed") == token,
                    "fresh observer acknowledgement", seconds)


def send(ctx, key, literal=True):
    parts = ("send-keys", "-t", ctx["pane"], "-l", key) if literal else ("send-keys", "-t", ctx["pane"], key)
    tmux(ctx, *parts)
    time.sleep(0.18)
    return fresh_snapshot(ctx)


def keys(ctx, sequence):
    return [send(ctx, key) for key in sequence]


def save(ctx):
    atomic_json(ctx["output"] / "receipt.json", ctx["report"])


def record(ctx, name, intended, prior=None):
    actual = fresh_snapshot(ctx)
    intended = {"ownsFocus": True, **intended}
    prior = {"ownsFocus": True, **prior} if prior else None
    value = compare_state(name, actual, intended, prior)
    ctx["report"]["checks"].append(value)
    save(ctx)
    if value["status"] == "fail":
        raise AssertionError(f"{name}: intended {intended}; known prior {prior}; got {actual}")
    return value


def configure(ctx):
    output = ctx["output"]
    config_dir = ctx["config"]
    config_dir.mkdir(parents=True)
    options = {"updateCheck": False, "experimentalV2Leader": "space"}
    fixture = {"state": str(ctx["state"]), "request": str(ctx["request"]),
               "command": str(ctx["command"]), "result": str(ctx["result"]),
               "directory": str(output / "sandbox")}
    spec = f"vimcode@file:{ctx['tarball']}"
    if ctx["args"].host == "v1":
        config = {"plugin": [[spec, options], [str(FIXTURE / "tui.ts"), fixture]],
                  "keybinds": {"leader": "space", "command_list": "ctrl+p,<leader>p"}}
        file = config_dir / "tui.json"
    else:
        config = {"plugins": [{"package": spec, "options": options}, {"package": str(FIXTURE), "options": fixture}],
                  "keybinds": {"leader": "space", "command.palette.show": ["ctrl+p", "<leader>p"]}}
        file = config_dir / "cli.json"
    atomic_json(file, config)
    ctx["config_file"] = file
    (output / "sandbox").mkdir()
    (output / "bin").mkdir()
    # Never touch the user's clipboard, even if a future key scenario
    # accidentally executes a native paste rather than a Vim motion.
    for name in ("pbcopy", "wl-copy", "xclip", "xsel", "clip.exe"):
        tool = output / "bin" / name
        tool.write_text("#!/bin/sh\nexec cat > " + shlex.quote(str(output / "clipboard.txt")) + "\n")
        tool.chmod(0o755)
    for name in ("pbpaste", "wl-paste"):
        tool = output / "bin" / name
        tool.write_text("#!/bin/sh\nexit 0\n")
        tool.chmod(0o755)


def start(ctx, label):
    # Never accept a previous process's ready/seed/command snapshot.
    for path in (ctx["state"], ctx["request"], ctx["command"], ctx["result"]):
        path.unlink(missing_ok=True)
    output = ctx["output"]
    env = {"PATH": str(output / "bin") + os.pathsep + "/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin",
           "HOME": str(output / "home"), "XDG_CONFIG_HOME": str(output / "config"),
           "XDG_DATA_HOME": str(output / "data"), "XDG_CACHE_HOME": str(output / "cache"),
           "XDG_STATE_HOME": str(output / "state"), "OPENCODE_DISABLE_AUTOUPDATE": "1",
           "TERM": "xterm-256color", "COLORTERM": "truecolor"}
    for folder in ("home", "data", "cache", "state"):
        (output / folder).mkdir(exist_ok=True)
    binary_args = [str(ctx["args"].binary)]
    if ctx["args"].host == "v2":
        binary_args.append("--standalone")
    binary_args.append(str(output / "sandbox"))
    command = ["env", "-i", *[f"{key}={value}" for key, value in env.items()], *binary_args]
    command_line = "exec " + shlex.join(command) + " 2>" + shlex.quote(str(output / f"{label}-stderr.log"))
    tmux(ctx, "new-session", "-d", "-s", ctx["session"], "-x", "110", "-y", "34",
         "-c", str(output / "sandbox"), "/bin/sh", "-c", command_line)
    tmux(ctx, "set-option", "-w", "-t", ctx["session"], "window-size", "manual")
    tmux(ctx, "resize-window", "-t", ctx["session"], "-x", "110", "-y", "34")


def stop(ctx):
    try:
        tmux(ctx, "kill-session", "-t", ctx["session"])
        return True
    except (OSError, subprocess.SubprocessError) as error:
        if isinstance(error, subprocess.CalledProcessError):
            message = error.stderr or ""
            if any(text in message for text in ("can't find session", "no server running", "No such file")):
                return True
        ctx["report"].setdefault("cleanupErrors", []).append({
            "socket": ctx["socket"], "session": ctx["session"], "error": str(error)[:500],
        })
        return False


def identity(ctx):
    tarball = ctx["tarball"]
    with tarfile.open(tarball) as archive:
        members = archive.getmembers()
        if any(member.name.startswith("package/test/") or "compat/fixture" in member.name for member in members):
            raise RuntimeError("Test fixtures must not be shipped in the tarball")
        expected = {
            member.name.removeprefix("package/"): archive.extractfile(member).read()
            for member in members
            if member.isfile() and (member.name == "package/package.json" or member.name.startswith("package/src/"))
        }
    if "src/index.ts" not in expected or "src/v2.ts" not in expected or "package.json" not in expected:
        raise RuntimeError(f"Tarball is missing the dual entrypoint: {sorted(expected)}")
    entries = list((ctx["output"] / "cache" / "opencode").rglob("node_modules/vimcode/src/index.ts"))
    if len(entries) != 1:
        raise RuntimeError(f"Expected exactly one cache-installed vimcode, got: {entries}")
    root = entries[0].parent.parent
    for relative, content in expected.items():
        if not (root / relative).exists() or (root / relative).read_bytes() != content:
            raise RuntimeError(f"Installed artifact mismatch: {root / relative}")
    return {"entry": str(entries[0]), "verifiedFiles":
            {name: hashlib.sha256(content).hexdigest() for name, content in sorted(expected.items())}}


def ready(ctx, label):
    try:
        wait_for(lambda: snapshot(ctx), lambda value: value.get("ready") is True, "registered vimcode.vim command", 20)
        wait_for(lambda: capture(ctx), lambda value: "Ask anything" in value, "visible TUI prompt", 8)
        for _ in range(5):
            tmux(ctx, "send-keys", "-t", ctx["pane"], "C-p")
            try:
                wait_for(lambda: capture(ctx), lambda value: "Commands" in value, "command palette", 1)
                break
            except RuntimeError:
                time.sleep(0.2)
        else:
            raise RuntimeError("Cannot open host command palette with ctrl+p")
        tmux(ctx, "send-keys", "-t", ctx["pane"], "-l", "vim")
        pane = wait_for(lambda: capture(ctx), lambda value: ":vim" in value and "Commands" in value,
                        "vimcode command in palette", 8)
        (ctx["output"] / f"{label}-palette.txt").write_text(pane)
        tmux(ctx, "send-keys", "-t", ctx["pane"], "Escape")
        wait_for(lambda: snapshot(ctx), lambda value: value.get("mode") in ("base", "unknown") and
                 value.get("focusedId") == value.get("editorId"), "editor after palette dismissal", 5)
        wait_for(lambda: capture(ctx), lambda value: "Commands" not in value, "palette closed", 5)
        time.sleep(0.2)
        return {"status": "passed", **identity(ctx)}
    except Exception as error:
        (ctx["output"] / f"{label}-screen.txt").write_text(capture(ctx))
        return {"status": "failed", "reason": str(error)[:600]}


def normal(ctx):
    # A completed autocomplete key can immediately reopen completion for
    # the remaining slash. Its first Escape hides it; the next enters Vim.
    for _ in range(3):
        state = snapshot(ctx)
        if state.get("mode") != "autocomplete" and state.get("cursorStyle", {}).get("style") == "block":
            return
        send(ctx, "Escape", False)
    wait_for(lambda: snapshot(ctx), lambda value: value.get("mode") != "autocomplete" and
             value.get("cursorStyle", {}).get("style") == "block", "Vim normal cursor", 3)


def seed(ctx, text, offset=0, preserve_mode=False):
    if not preserve_mode:
        normal(ctx)
    uid = uuid.uuid4().hex
    atomic_json(ctx["request"], {"action": "seed", "id": uid, "text": text, "offset": offset})
    state = wait_for(lambda: snapshot(ctx), lambda value: value.get("applied") == uid, "seeded editor", 5)
    if state["text"] != text or state["offset"] != offset or state["afterSeed"]["selection"] is not None:
        raise AssertionError(f"Seed was not clean: {state}")
    return state


def command(ctx, action):
    uid = uuid.uuid4().hex
    atomic_json(ctx["command"], {"id": uid, "action": action})
    response = wait_for(lambda: read_json(ctx["result"]), lambda value: value["id"] == uid, action, 8)
    if "error" in response:
        raise RuntimeError(f"Fixture {action}: {response['error']}")
    return response["result"]

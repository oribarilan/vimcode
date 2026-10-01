import io
from itertools import product
import json
import os
from pathlib import Path
import shutil
import subprocess
import sys
import tempfile
import unittest
from unittest.mock import patch
import uuid

from cases import completed_command
from driver import tmux
from run import main


def test_project_config_ancestors_are_rejected_before_packaging_or_host_launch():
    names = ("opencode.json", "opencode.jsonc", "tui.json", "tui.jsonc", "cli.json", "cli.jsonc")
    hosts = (("v1", "1.18.33"), ("v2", "2.0.15"))
    for name, (host, version), symlinked in product(names, hosts, (False, True)):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory).resolve()
            parent = root / "project"
            parent.mkdir()
            (parent / name).write_text("{}\n")
            output = parent / "output"
            output.mkdir()
            supplied = output
            if symlinked:
                supplied = root / "output-link"
                supplied.symlink_to(output, target_is_directory=True)
            case = f"{host}, {name}, symlinked={symlinked}"
            argv = ["run.py", "--host", host, "--binary", sys.executable,
                    "--expect-version", version, "--output", str(supplied)]
            stderr = io.StringIO()
            with patch("run.sys.argv", argv), patch("run.sys.platform", "linux"), \
                 patch("run.sys.stderr", stderr), patch("run.shutil.which", return_value="/usr/bin/mock"), \
                 patch("run.subprocess.check_output", return_value=version), \
                 patch("run.subprocess.run", side_effect=AssertionError(f"Packaged under {case}")) as pack, \
                 patch("run.start") as launch:
                try:
                    main()
                except SystemExit as error:
                    assert error.code == 2, case
                else:
                    raise AssertionError(f"Accepted project config ancestor: {case}")
            assert "--output must be outside a checkout and project OpenCode config" in stderr.getvalue(), case
            assert str(parent) in stderr.getvalue(), case
            pack.assert_not_called()
            launch.assert_not_called()
            assert list(output.iterdir()) == [], case


def test_tmux_always_names_owned_socket_and_empty_config():
    with patch("driver.subprocess.run", return_value=subprocess.CompletedProcess([], 0, stdout="")) as run:
        tmux({"socket": "owned-random-socket"}, "new-session", "-d", "-s", "owned-session")
    assert run.call_args.args[0] == ["tmux", "-L", "owned-random-socket", "-f", "/dev/null",
                                      "new-session", "-d", "-s", "owned-session"]


def test_private_tmux_ignores_hostile_parent_home_config():
    if not shutil.which("tmux"):
        raise unittest.SkipTest("tmux not installed; command isolation still tested without tmux")
    with tempfile.TemporaryDirectory() as directory:
        home = Path(directory)
        config = "set -g base-index 1\nset -g pane-base-index 1\nset -g destroy-unattached on\n"
        (home / ".tmux.conf").write_text(config)
        ctx = {"socket": "vimcode-unit-" + uuid.uuid4().hex, "session": "owned-test"}
        with patch.dict(os.environ, {"HOME": directory, "XDG_CONFIG_HOME": directory}):
            try:
                tmux(ctx, "new-session", "-d", "-s", ctx["session"], "sleep 30")
                assert tmux(ctx, "list-panes", "-t", ctx["session"], "-F", "#{window_index}.#{pane_index}").strip() == "0.0"
                assert tmux(ctx, "show-options", "-gv", "destroy-unattached").strip() == "off"
                tmux(ctx, "capture-pane", "-p", "-t", ctx["session"] + ":0.0")
            finally:
                tmux(ctx, "kill-server")  # Only the randomly named server above.
        assert (home / ".tmux.conf").read_text() == config


def test_server_completion_polls_past_first_pending_response():
    for action, pending, complete in (
        ("formState", {"state": {"status": "pending"}}, {"state": {"status": "answered"}}),
        ("permissions", [{"id": "pending"}], []),
    ):
        with tempfile.TemporaryDirectory() as directory:
            ctx = {"output": Path(directory), "report": {}}
            with patch("cases.command", side_effect=[pending, complete]) as command:
                assert completed_command(ctx, action, lambda result: result == complete) == complete
            assert command.call_count == 2
            receipt = json.loads((Path(directory) / "receipt.json").read_text())
            assert receipt["completionResponses"][action] == complete


def test_permanent_server_pending_is_bounded_and_receipted():
    for action, pending in (("formState", {"state": {"status": "pending"}}), ("permissions", [{"id": "pending"}])):
        with tempfile.TemporaryDirectory() as directory:
            ctx = {"output": Path(directory), "report": {}}
            with patch("cases.command", return_value=pending):
                try:
                    completed_command(ctx, action, lambda _: False, seconds=0.01)
                except RuntimeError as error:
                    assert action + " completion" in str(error)
                    assert "pending" in str(error)
                else:
                    raise AssertionError("Permanently pending server state was accepted")
            receipt = json.loads((Path(directory) / "receipt.json").read_text())
            assert receipt["completionResponses"][action] == pending


def load_tests(_loader, _tests, _pattern):
    functions = [value for name, value in globals().items() if name.startswith("test_") and callable(value)]
    return unittest.TestSuite(unittest.FunctionTestCase(function) for function in functions)

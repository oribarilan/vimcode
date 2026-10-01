import json
import os
from pathlib import Path
import shutil
import subprocess
import tempfile
import unittest
from unittest.mock import patch
import uuid

from cases import completed_command
from driver import tmux


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

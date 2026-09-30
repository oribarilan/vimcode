import json
from pathlib import Path
import subprocess
import tempfile
import unittest
from unittest.mock import patch

from driver import compare_state, fresh_snapshot, stop
from run import finalize


def test_substring_is_not_a_visual_selection_pass():
    assert compare_state("visual", {"text": "pha beta gamma"}, {"text": "ha beta gamma"})["status"] == "fail"


def test_known_gap_is_distinct_from_a_pass():
    assert compare_state("redo", {"text": "alpha beta gamma"}, {"text": "alpha gamma"},
                         {"text": "alpha beta gamma"})["status"] == "known-gap"


def test_repaired_gap_is_a_pass():
    assert compare_state("redo", {"text": "alpha gamma"}, {"text": "alpha gamma"},
                         {"text": "alpha beta gamma"})["status"] == "pass"


def test_unknown_regression_is_a_failure():
    assert compare_state("redo", {"text": "garbled"}, {"text": "alpha gamma"},
                         {"text": "alpha beta gamma"})["status"] == "fail"


def test_correct_text_with_wrong_cursor_fails():
    assert compare_state("cursor", {"text": "abc", "offset": 1},
                         {"text": "abc", "offset": 0})["status"] == "fail"


def test_stale_selection_fails():
    assert compare_state("selection", {"text": "abc", "selection": {"start": 0, "end": 1}},
                         {"text": "abc", "selection": None})["status"] == "fail"


def test_lost_focus_fails():
    assert compare_state("focus", {"text": "abc", "ownsFocus": False},
                         {"text": "abc", "ownsFocus": True})["status"] == "fail"


def test_stale_observer_acknowledgement_times_out():
    with tempfile.TemporaryDirectory() as directory:
        ctx = {"request": Path(directory) / "request.json"}
        with patch("driver.snapshot", return_value={"observed": "old"}):
            try:
                fresh_snapshot(ctx, seconds=0.01)
            except RuntimeError as error:
                assert "fresh observer acknowledgement" in str(error)
            else:
                raise AssertionError("A stale observation was accepted")


def test_fresh_observer_acknowledgement_is_required():
    with tempfile.TemporaryDirectory() as directory:
        request = Path(directory) / "request.json"
        with patch("driver.snapshot", side_effect=lambda _: {"observed": json.loads(request.read_text())["id"]}):
            value = fresh_snapshot({"request": request})
            assert value["observed"] == json.loads(request.read_text())["id"]


def test_cleanup_failures_preserve_a_failing_final_receipt():
    for error in (subprocess.TimeoutExpired(["tmux"], 8), OSError("synthetic shutdown failure")):
        with tempfile.TemporaryDirectory() as directory:
            ctx = {"output": Path(directory), "socket": "owned-socket", "session": "owned-session",
                   "pane": "owned-session:0.0", "report": {"result": "passed", "checks": []}}
            with patch("driver.tmux", side_effect=error):
                finalize(ctx)
            receipt = json.loads((Path(directory) / "receipt.json").read_text())
            assert receipt["result"] == "failed"
            assert receipt["cleanupErrors"][0]["socket"] == "owned-socket"
            assert receipt["cleanupErrors"][0]["session"] == "owned-session"
            assert receipt["summary"] == {"pass": 0, "known-gap": [], "fail": []}


def test_already_closed_owned_session_is_not_a_cleanup_failure():
    ctx = {"socket": "owned-socket", "session": "owned-session", "report": {}}
    error = subprocess.CalledProcessError(1, ["tmux"], stderr="can't find session: owned-session")
    with patch("driver.tmux", side_effect=error):
        assert stop(ctx) is True
    assert "cleanupErrors" not in ctx["report"]


def load_tests(_loader, _tests, _pattern):
    functions = [value for name, value in globals().items() if name.startswith("test_") and callable(value)]
    return unittest.TestSuite(unittest.FunctionTestCase(function) for function in functions)


if __name__ == "__main__":
    unittest.main()

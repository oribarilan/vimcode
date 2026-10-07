"""Exact-buffer scenarios for the installed OpenCode TUI package."""
from driver import atomic_json, capture, command, compare_state, keys, normal, read_json, record, save, seed, send, snapshot, tmux, wait_for


def run_core(ctx):
    # Physical typing first: no fixture cursor/selection reset can explain
    # this selection trace. Later cases seed via top-level editor methods.
    record(ctx, "fresh-editor", {"text": ""})
    send(ctx, "alpha beta gamma")
    record(ctx, "physical-editor-input", {"text": "alpha beta gamma"})
    normal(ctx)
    keys(ctx, "gg")
    ctx["report"]["physicalVisualTrace"] = [snapshot(ctx), *keys(ctx, "vll")]
    save(ctx)
    record(ctx, "physical-visual-selection", {"offset": 2, "selected": "alp", "selection": {"start": 0, "end": 3}})
    send(ctx, "x")
    record(ctx, "physical-visual-forward", {"text": "ha beta gamma", "offset": 0, "selected": "", "selection": None})
    seed(ctx, "alpha beta gamma")
    keys(ctx, "wdw")
    record(ctx, "ascii-word-delete", {"text": "alpha gamma", "offset": 6, "selected": "", "selection": None})
    send(ctx, "u")
    record(ctx, "ascii-undo", {"text": "alpha beta gamma"})
    seed(ctx, "alpha beta gamma")
    keys(ctx, "wdiw")
    record(ctx, "text-object-delete", {"text": "alpha  gamma"})
    seed(ctx, "alpha beta gamma")
    keys(ctx, "🤖é")
    record(ctx, "unbound-unicode-consumed", {"text": "alpha beta gamma"})
    keys(ctx, "r🤖")
    record(ctx, "unicode-replace", {"text": "🤖lpha beta gamma"})
    seed(ctx, "alpha beta gamma")
    ctx["report"]["visualForwardTrace"] = [snapshot(ctx), *keys(ctx, "vll")]
    save(ctx)
    record(ctx, "visual-forward-selection", {"offset": 2, "selected": "alp", "selection": {"start": 0, "end": 3}})
    send(ctx, "x")
    record(ctx, "visual-forward-delete", {"text": "ha beta gamma", "offset": 0, "selected": "", "selection": None})
    seed(ctx, "alpha beta gamma", 4)
    ctx["report"]["visualBackwardTrace"] = [snapshot(ctx), *keys(ctx, "vhh")]
    save(ctx)
    record(ctx, "visual-backward-selection", {"offset": 2, "selected": "pha", "selection": {"start": 2, "end": 5}})
    send(ctx, "x")
    record(ctx, "visual-backward-delete", {"text": "al beta gamma", "offset": 2, "selected": "", "selection": None})
    seed(ctx, "alpha beta gamma", 2)
    keys(ctx, "vhhlll")
    record(ctx, "visual-crosses-anchor", {"offset": 3, "selected": "ph", "selection": {"start": 2, "end": 4}})
    send(ctx, "x")
    record(ctx, "visual-cross-anchor-delete", {"text": "ala beta gamma", "offset": 2, "selected": "", "selection": None})

    seed(ctx, "")
    keys(ctx, "vl")
    record(ctx, "visual-empty-no-placeholder", {"text": "", "offset": 0, "selected": "", "selection": None})
    send(ctx, "v")
    for name, value, offset, motions, selected, start, end, remaining in (
        ("eof", "ab", 1, "vl", "b", 1, 2, "a"),
        ("eol", "a\nb", 0, "vl", "a", 0, 1, "\nb"),
        ("backward-eol", "a\nb", 1, "vh", "a", 0, 1, "\nb"),
    ):
        seed(ctx, value, offset)
        keys(ctx, motions)
        record(ctx, f"visual-{name}-selection", {"selected": selected, "selection": {"start": start, "end": end}})
        send(ctx, "x")
        record(ctx, f"visual-{name}-delete", {"text": remaining, "offset": start, "selected": "", "selection": None})
    # Controls preserve PR82's wide endpoint behavior. v1 still has inherited
    # wide deletion differences; these are not a claim of Unicode parity.
    for name, glyph in (("cjk", "界"), ("emoji", "😀"), ("tab", "\t")):
        seed(ctx, "a" + glyph + "b")
        keys(ctx, "vl")
        end = 3 if ctx["args"].host == "v2" else 2
        record(ctx, f"wide-{name}-selection-control", {"offset": 1, "selected": "a" + glyph,
               "selection": {"start": 0, "end": end}})
        send(ctx, "x")
        record(ctx, f"wide-{name}-delete-control", {"text": "b" if ctx["args"].host == "v2" else glyph + "b",
               "offset": 0, "selected": "", "selection": None})

    # Native word/vertical endpoint semantics still differ between hosts. The
    # horizontal fix must preserve their original anchor, not change them.
    v2 = ctx["args"].host == "v2"
    for name, motions, value, end, offset in (
        ("word", "vlw", "alpha beta gamma", 7 if v2 else 6, 6),
        ("line", "vl$", "alpha beta gamma", 16, 16),
        ("cross-word", "vlbw", "alpha beta gamma", 7 if v2 else 6, 6),
        ("vertical", "vlj", "alpha\nbravo\ncharlie", 8 if v2 else 7, 7),
    ):
        seed(ctx, value)
        keys(ctx, motions)
        record(ctx, f"mixed-{name}-selection", {"text": value, "offset": offset,
               "selected": value[:end], "selection": {"start": 0, "end": end}})
        send(ctx, "x")
        record(ctx, f"mixed-{name}-delete", {"text": value[end:], "offset": 0,
               "selected": "", "selection": None})
    seed(ctx, "alpha beta gamma")
    send(ctx, "i")
    send(ctx, "a")
    send(ctx, "space", False)
    send(ctx, "b")
    record(ctx, "insert-space-leader", {"text": "a balpha beta gamma"})
    normal(ctx)
    send(ctx, "space", False)
    send(ctx, "p")
    pane = wait_for(lambda: capture(ctx), lambda value: "Commands" in value, "space leader palette", 5)
    (ctx["output"] / "leader-palette.txt").write_text(pane)
    send(ctx, "Escape", False)
    record(ctx, "normal-leader-does-not-edit", {"text": "a balpha beta gamma"})
    seed(ctx, "")
    send(ctx, "i")
    send(ctx, "/")
    wait_for(lambda: snapshot(ctx), lambda value: value.get("mode") == "autocomplete", "host autocomplete", 5)
    send(ctx, "Escape", False)
    dismissed = wait_for(lambda: snapshot(ctx), lambda value: value.get("mode") in ("base", "unknown"),
                         "autocomplete dismissal", 5)
    ctx["report"]["autocompleteDismissedPrefix"] = dismissed["text"]
    send(ctx, "x")
    intended = "x" if ctx["args"].host == "v1" else "/x"
    record(ctx, "autocomplete-escape-insert", {"text": intended})
    seed(ctx, "alpha beta gamma")
    keys(ctx, "wdw")
    send(ctx, "u")
    send(ctx, "C-r", False)
    record(ctx, "snapshot-redo", {"text": "alpha gamma"}, {"text": "alpha beta gamma"})
    seed(ctx, "a\tbeta gamma", 3)
    keys(ctx, "diw")
    record(ctx, "tab-inner-word-offset", {"text": "a\t gamma"}, {"text": "ata gamma"})


def completed_command(ctx, action, check, seconds=8):
    # A renderer acknowledgement is not evidence of a completed server write.
    # Persist every queried response, including the last one on timeout.
    def query():
        result = command(ctx, action)
        ctx["report"].setdefault("completionResponses", {})[action] = result
        save(ctx)
        return result
    return wait_for(query, check, action + " completion", seconds)


def run_v2_prompts(ctx):
    seed(ctx, "alpha beta gamma", 4)
    send(ctx, "v")
    old_editor = snapshot(ctx)["editorId"]
    command(ctx, "session")
    wait_for(lambda: snapshot(ctx), lambda value: value["route"].get("type") == "session" and
             value["editorId"] != old_editor, "new synthetic session editor")
    seed(ctx, "hello", preserve_mode=True)
    send(ctx, "l")
    record(ctx, "visual-editor-switch-selection", {"offset": 1, "selected": "he", "selection": {"start": 0, "end": 2}})
    send(ctx, "x")
    record(ctx, "visual-editor-switch-delete", {"text": "llo", "offset": 0, "selected": "", "selection": None})
    command(ctx, "form")
    wait_for(lambda: snapshot(ctx), lambda value: value["mode"] == "form", "root form")
    for ch in "hello world":
        send(ctx, ch)
    record(ctx, "root-form-space", {"text": "hello world", "mode": "form", "editorStatus": "ANSWER",
           "cursorStyle": {"style": "line", "blinking": True}})
    send(ctx, "Escape", False)
    record(ctx, "root-form-escape-normal", {"text": "hello world", "offset": 10, "mode": "form",
           "cursorStyle": {"style": "block", "blinking": True}})
    keys(ctx, "hx")
    record(ctx, "root-form-normal-delete", {"text": "hello word", "offset": 9, "mode": "form"})
    keys(ctx, "il")
    record(ctx, "root-form-insert-correction", {"text": "hello world", "offset": 10,
           "cursorStyle": {"style": "line", "blinking": True}})
    send(ctx, "Enter", False)
    send(ctx, "Enter", False)
    completed_command(ctx, "formState", lambda result:
                      result.get("state") == {"status": "answered", "answer": {"answer": "hello world"}})
    for kind, burst in (("key", ":x"), ("paste", ":\x1b[200~x\x1b[201~")):
        command(ctx, "form")
        wait_for(lambda: snapshot(ctx), lambda value: value["mode"] == "form", "palette-order form")
        send(ctx, "hello world")
        send(ctx, "Escape", False)
        record(ctx, f"root-form-{kind}-before-palette", {"text": "hello world", "offset": 10, "mode": "form"})
        tmux(ctx, "send-keys", "-t", ctx["pane"], "-l", burst)
        wait_for(lambda: snapshot(ctx), lambda value: value["mode"] == "modal", "palette owns burst input")
        record(ctx, f"root-form-{kind}-palette-query", {"text": "x", "mode": "modal", "editorStatus": "FILTER"})
        send(ctx, "Escape", False)
        record(ctx, f"root-form-{kind}-after-palette", {"text": "hello world", "offset": 10, "mode": "form",
               "editorStatus": "ANSWER", "cursorStyle": {"style": "block", "blinking": True}})
        send(ctx, "Enter", False)
        send(ctx, "Enter", False)
        completed_command(ctx, "formState", lambda result:
                          result.get("state") == {"status": "answered", "answer": {"answer": "hello world"}})
    command(ctx, "form")
    wait_for(lambda: snapshot(ctx), lambda value: value["mode"] == "form", "burst-edit form")
    send(ctx, "burst draft")
    send(ctx, "Escape", False)
    record(ctx, "root-form-before-burst", {"text": "burst draft", "offset": 10, "mode": "form"})
    # One terminal write: no timer turn may separate the edit from Enter.
    tmux(ctx, "send-keys", "-t", ctx["pane"], "-l", "x\r")
    wait_for(lambda: snapshot(ctx), lambda value: value.get("editorStatus") != "ANSWER", "burst answer committed")
    if command(ctx, "formState").get("state", {}).get("status") == "pending":
        send(ctx, "Enter", False)
    expected = {"state": {"status": "answered", "answer": {"answer": "burst draf"}}}
    actual = completed_command(ctx, "formState", lambda result: result.get("state") == expected["state"])
    ctx["report"]["checks"].append(compare_state("root-form-burst-submit", actual, expected))
    save(ctx)
    command(ctx, "childForm")
    wait_for(lambda: snapshot(ctx), lambda value: value["mode"] == "form", "child form")
    for ch in "child words":
        send(ctx, ch)
    record(ctx, "child-form-space", {"text": "child words", "mode": "form", "editorStatus": "ANSWER",
           "cursorStyle": {"style": "line", "blinking": True}})
    send(ctx, "Escape", False)
    record(ctx, "child-form-escape-normal", {"text": "child words", "offset": 10, "mode": "form",
           "cursorStyle": {"style": "block", "blinking": True}})
    send(ctx, "x")
    record(ctx, "child-form-normal-delete", {"text": "child word", "offset": 10})
    keys(ctx, "i!")
    record(ctx, "child-form-insert-correction", {"text": "child word!", "offset": 11,
           "cursorStyle": {"style": "line", "blinking": True}})
    send(ctx, "Enter", False)
    send(ctx, "Enter", False)
    completed_command(ctx, "formState", lambda result:
                      result.get("state") == {"status": "answered", "answer": {"answer": "child word!"}})
    command(ctx, "permission")
    wait_for(lambda: capture(ctx), lambda pane: "Permission required" in pane, "pending permission")
    send(ctx, "Escape", False)
    wait_for(lambda: snapshot(ctx), lambda value: value["editorId"] == "session.permission.reject.message",
             "child permission reject")
    for ch in "no thanks":
        send(ctx, ch)
    record(ctx, "child-permission-message", {"text": "no thanks"})
    send(ctx, "Enter", False)
    completed_command(ctx, "permissions", lambda result: result == [])


def run_v2_reload(ctx):
    command(ctx, "home")
    wait_for(lambda: snapshot(ctx), lambda value: value["route"].get("type") == "home", "home editor for reload", 5)
    seed(ctx, "alpha beta gamma")
    tmux(ctx, "send-keys", "-t", ctx["pane"], "C-p")
    wait_for(lambda: capture(ctx), lambda value: "Commands" in value, "palette before Vim disable", 5)
    tmux(ctx, "send-keys", "-t", ctx["pane"], "-l", "vim")
    wait_for(lambda: capture(ctx), lambda value: ":vim" in value, "Vim toggle command", 5)
    send(ctx, "Enter", False)
    send(ctx, "z")
    record(ctx, "disabled-typing-passes-through", {"text": "zalpha beta gamma",
           "cursorStyle": {"style": "line", "blinking": True}})
    saved = list((ctx["output"] / "state" / "opencode").rglob("plugin.vimcode.settings.json"))
    if len(saved) != 1 or read_json(saved[0]).get("disabled") is not True:
        raise AssertionError(f"Disabled state did not persist: {saved}")
    tmux(ctx, "send-keys", "-t", ctx["pane"], "C-p")
    wait_for(lambda: capture(ctx), lambda value: "Commands" in value, "palette before Vim re-enable", 5)
    tmux(ctx, "send-keys", "-t", ctx["pane"], "-l", "vim")
    wait_for(lambda: capture(ctx), lambda value: ":vim" in value, "Vim re-enable command", 5)
    send(ctx, "Enter", False)
    normal(ctx)
    send(ctx, "z")
    record(ctx, "re-enabled-unknown-consumed", {"text": "zalpha beta gamma"})
    if read_json(saved[0]).get("disabled") is not False:
        raise AssertionError("Re-enabled state was not persisted")

    before_listeners = snapshot(ctx).get("keypressListeners")
    # Reconciliation can reactivate the fixture itself; do not replay the last
    # seed or synthetic session command against the new fixture activation.
    ctx["request"].unlink(missing_ok=True)
    ctx["command"].unlink(missing_ok=True)
    config = read_json(ctx["config_file"])
    plugins = config["plugins"]
    config["plugins"] = [item for item in plugins if not item["package"].startswith("vimcode@")]
    atomic_json(ctx["config_file"], config)
    wait_for(lambda: snapshot(ctx), lambda value: value.get("ready") is False, "vimcode unload", 8)
    wait_for(lambda: snapshot(ctx), lambda value: value.get("keypressListeners", 0) < before_listeners,
             "raw key listener disposed", 8)
    ctx["report"]["unloadListenerCounts"] = {"before": before_listeners,
                                             "after": snapshot(ctx)["keypressListeners"]}
    send(ctx, "z")
    record(ctx, "unloaded-typing-passes-through", {"text": "zzalpha beta gamma"})
    config["plugins"] = plugins
    atomic_json(ctx["config_file"], config)
    wait_for(lambda: snapshot(ctx), lambda value: value.get("ready") is True, "vimcode reload", 8)
    wait_for(lambda: snapshot(ctx), lambda value: value.get("cursorStyle", {}).get("style") == "line",
             "new vimcode instance starts in insert mode", 5)
    normal(ctx)
    seed(ctx, "alpha beta gamma")
    send(ctx, "x")
    record(ctx, "single-delete-after-reload", {"text": "lpha beta gamma"})

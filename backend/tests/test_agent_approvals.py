import asyncio

import pytest

from app.routers import mcp as M
from app.services import agents


@pytest.mark.parametrize("name", ["export_image", "export_mask", "export_layer"])
def test_every_export_that_writes_a_file_asks(name):
    why = asyncio.run(M._risk(name, {"path": "/tmp/formvis-test/out.png"}))
    assert why and "Undo cannot restore" in why


def test_an_ordinary_edit_does_not_ask():
    assert asyncio.run(M._risk("set_layer", {"id": "L1", "opacity": 0.5})) is None


@pytest.mark.parametrize("answer, status", [(None, "timeout"), ("stop", "stopped"), ("deny", "denied")])
def test_no_answer_stop_and_decline_each_have_their_own_status_and_reach_the_disk(answer, status, tmp_path, monkeypatch):
    import json

    monkeypatch.setenv("FORMVIS_DATA_DIR", str(tmp_path))
    monkeypatch.setattr(agents, "APPROVAL_SECONDS", 0.2)

    async def run():
        entry = agents.begin("Tester", "export_image", {"path": "/tmp/formvis-test/out.png"})
        task = asyncio.create_task(agents.approval(entry, "overwrites a picture file"))
        await asyncio.sleep(0.05)
        if answer == "stop":
            agents.stop(None)
        elif answer == "deny":
            agents.decide(entry["id"], False)
        await task
        return entry

    assert asyncio.run(run())["status"] == status
    lines = (tmp_path / agents.ACTIVITY_FILE).read_text(encoding="utf-8").splitlines()
    assert json.loads(lines[-1])["status"] == status


def test_the_choice_on_outside_agents_is_kept_beside_agents_json(tmp_path, monkeypatch):
    import json

    monkeypatch.setenv("FORMVIS_DATA_DIR", str(tmp_path))
    monkeypatch.setattr(agents, "_loaded", False)
    monkeypatch.setitem(agents._stored, "allowed", None)
    agents.set_outside_allowed(True)
    assert json.loads((tmp_path / "agents.json").read_text())["allowed"] is True
    monkeypatch.setattr(agents, "_loaded", False)
    monkeypatch.setitem(agents._stored, "allowed", None)
    assert agents.outside_allowed() is True and agents.state()["allowed"] is True


def test_a_window_with_no_screen_refuses_at_once_instead_of_asking(monkeypatch, tmp_path):
    import time

    monkeypatch.setenv("FORMVIS_DATA_DIR", str(tmp_path))
    monkeypatch.setattr(M, "_headless", True)
    monkeypatch.setattr(M, "_seen", time.monotonic())
    monkeypatch.setattr(M, "_allowed", False)
    started = time.monotonic()
    out = asyncio.run(M._call("get_document", {}))
    assert out["isError"] and "no screen" in out["content"][0]["text"] and time.monotonic() - started < 2
    monkeypatch.setattr(M, "_allowed", True)
    out = asyncio.run(M._agent_call("Tester", "export_image", {"path": str(tmp_path / "out.png")}))
    assert out["isError"] and "no screen" in out["content"][0]["text"] and time.monotonic() - started < 4


def test_the_activity_record_rotates_and_keeps_three_old_files(tmp_path, monkeypatch):
    monkeypatch.setenv("FORMVIS_DATA_DIR", str(tmp_path))
    monkeypatch.setattr(agents, "ACTIVITY_MAX_BYTES", 600)
    for i in range(40):
        agents.end(agents.begin("Tester", "set_layer", {"id": f"L{i}"}), "ok")
    names = sorted(p.name for p in tmp_path.iterdir() if p.name.startswith(agents.ACTIVITY_FILE))
    assert names == [agents.ACTIVITY_FILE, *(f"{agents.ACTIVITY_FILE}.{n}" for n in (1, 2, 3))]
    assert all((tmp_path / n).stat().st_size <= 600 for n in names)


def test_every_tool_declares_what_it_is_and_nothing_impossible():
    assert set(M.DECLARED) == M.NAMES and len(M.NAMES) == len(M.TOOLS)
    assert M.declaration_faults() == []
    assert all(M.DECLARED[t["name"]]["read"] == t["annotations"]["readOnlyHint"] for t in M.TOOLS)


@pytest.mark.parametrize("name, change, fault", [
    ("delete_layer", {"reach": ""}, "delete_layer declares no reach"),
    ("file_info", {"asks": "reads a file"}, "file_info is read-only and asks for approval"),
    ("export_layer", {"asks": ""}, "export_layer writes files without asking for approval"),
    ("convert_file", {"reach": "reads files"}, "convert_file has an output_path but does not declare that it writes files"),
    ("get_document", {"headless": True}, "get_document runs with no window but acts on the open document"),
    ("open_file", {"reach": "document"}, "open_file takes a file path but declares no files"),
    ("file_info", {"reach": "app"}, "file_info takes a file path but declares no files"),
    ("convert_file", {"reach": "document", "headless": False}, "convert_file takes a file path but declares no files"),
    ("ui_menu_list", {"reach": "reads files"}, "ui_menu_list declares files but no folder check covers its path"),
])
def test_a_missing_or_impossible_declaration_is_named(name, change, fault, monkeypatch):
    monkeypatch.setitem(M.DECLARED, name, {**M.DECLARED[name], **change})
    assert any(f.startswith(fault) for f in M.declaration_faults())
    monkeypatch.delitem(M.DECLARED, name)
    assert f"{name} has no declaration" in M.declaration_faults()


def test_the_gate_asks_for_what_each_tool_declares_and_nothing_else(monkeypatch):
    async def window(name, args):
        return {"structuredContent": {"id": "cmd.risky", "risky": True, "label": "Risky"}}

    monkeypatch.setattr(M, "_call", window)
    args = {"path": "/tmp/formvis-test/x.png", "overwrite": True, "action": "quit", "id": "cmd.risky", "commands": [{"id": "cmd.risky"}]}
    asked = {n for n in M.NAMES if asyncio.run(M._risk(n, args))}
    assert asked == {n for n, d in M.DECLARED.items() if d["asks"]}
    assert asyncio.run(M._risk("convert_file", {**args, "overwrite": False})) is None
    assert asyncio.run(M._risk("ui_window", {"action": "size"})) is None

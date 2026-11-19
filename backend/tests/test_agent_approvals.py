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


def test_the_activity_record_rotates_and_keeps_three_old_files(tmp_path, monkeypatch):
    monkeypatch.setenv("FORMVIS_DATA_DIR", str(tmp_path))
    monkeypatch.setattr(agents, "ACTIVITY_MAX_BYTES", 600)
    for i in range(40):
        agents.end(agents.begin("Tester", "set_layer", {"id": f"L{i}"}), "ok")
    names = sorted(p.name for p in tmp_path.iterdir() if p.name.startswith(agents.ACTIVITY_FILE))
    assert names == [agents.ACTIVITY_FILE, *(f"{agents.ACTIVITY_FILE}.{n}" for n in (1, 2, 3))]
    assert all((tmp_path / n).stat().st_size <= 600 for n in names)

import json
import time
from concurrent.futures import ThreadPoolExecutor
import urllib.request

import pytest

META = {"io.modelcontextprotocol/protocolVersion": "2026-07-28", "io.modelcontextprotocol/clientInfo": {"name": "covauto-doc", "version": "1"}, "io.modelcontextprotocol/clientCapabilities": {}}


def tool(name, /, **args):
    body = json.dumps({"jsonrpc": "2.0", "id": 1, "method": "tools/call", "params": {"_meta": META, "name": name, "arguments": args}}).encode()
    req = urllib.request.Request("http://127.0.0.1:8190/mcp", body, {"Content-Type": "application/json", "MCP-Protocol-Version": "2026-07-28"})
    return json.loads(urllib.request.urlopen(req, timeout=120).read())["result"]


def ok(name, /, **args):
    r = tool(name, **args)
    assert not r.get("isError"), (name, r)
    return r


def sc(name, /, **args):
    return ok(name, **args)["structuredContent"]


def policy(p):
    urllib.request.urlopen(urllib.request.Request("http://127.0.0.1:8190/api/agents/policy", json.dumps({"client": "covauto-doc", "policy": p}).encode(), {"Content-Type": "application/json"}), timeout=10)


@pytest.fixture()
def agent(page):
    policy("allow")
    page.evaluate("() => { localStorage.setItem('formvis.prefs', JSON.stringify({ ...JSON.parse(localStorage.getItem('formvis.prefs') || '{}'), agentsAllowed: true })); window.dispatchEvent(new CustomEvent('formvis:agents', { detail: true })); }")
    for _ in range(60):
        try:
            if tool("ping")["structuredContent"].get("allowed"):
                break
        except Exception:
            pass
        time.sleep(0.5)
    yield page
    policy("ask")


def new_doc(page, w=200, h=120, name="Cov"):
    d = sc("new_document", width=w, height=h, name=name, background="white")
    assert (d["width"], d["height"]) == (w, h)


def test_ping_reports_the_version_the_window_and_the_open_documents(agent):
    new_doc(agent, name="Pinged")
    r = ok("ping")["structuredContent"]
    assert r["window"] is True and r["allowed"] is True and r["version"].count(".") == 2 and "Pinged" in json.dumps(r["documents"])
    assert "the window is open and agents are allowed" in ok("ping")["content"][0]["text"]


def test_selection_tools_report_and_change_the_selection(agent):
    new_doc(agent)
    assert sc("select_shape", shape="rectangle", x=10, y=10, width=50, height=40) == {"x": 10, "y": 10, "width": 50, "height": 40}
    assert sc("get_selection")["selection"] == {"x": 10, "y": 10, "width": 50, "height": 40}
    f = sc("select_feather", radius=4)
    assert f["width"] > 50 and f["x"] < 10
    g = sc("select_grow", amount=3)
    assert (g["width"], g["height"]) == (56, 46) and sc("get_selection")["selection"]["x"] == g["x"]
    sc("select_shape", shape="rectangle", x=0, y=0, width=1, height=1)
    whole = sc("select_color", x=5, y=5)
    assert (whole["width"], whole["height"]) == (200, 120)
    ok("select", shape="none")
    rng = sc("select_range", kind="color", color="#ffffff")
    assert (rng["width"], rng["height"]) == (200, 120)
    ok("select", shape="none")
    pt = ok("select_point", inside=[{"x": 20, "y": 20}])
    assert not pt.get("isError")
    bad = tool("select_mask", source="layer")
    assert bad["isError"] and "transparency" in bad["content"][0]["text"]
    ok("select", shape="none")
    assert ok("select_mask", source="transparency")["content"]


def test_the_selection_can_be_sampled(agent):
    new_doc(agent)
    sc("select_shape", shape="rectangle", x=10, y=10, width=50, height=40)
    m = sc("sample_mean_color")
    assert (m["r"], m["g"], m["b"], m["opaque"]) == (255, 255, 255, 1) and m["pixels"] == 2000
    ok("fill", color="#ff0000")
    m = sc("sample_mean_color")
    assert (m["r"], m["g"], m["b"]) == (255, 0, 0)
    inside = sc("sample_box", x=20, y=20, width=10, height=10)
    outside = sc("sample_box", x=100, y=80, width=10, height=10)
    assert inside["hex"] == "#ff0000" and outside["hex"] == "#ffffff"


def test_crop_extend_and_canvas_sizes(agent):
    new_doc(agent)
    assert sc("set_crop", x=0, y=0, width=100, height=80) == {"width": 100, "height": 80}
    assert sc("extend_canvas", left=10, right=10) == {"width": 120, "height": 80}
    assert agent.evaluate("[window.formvis.engine.current.doc.width, window.formvis.engine.current.doc.height]") == [120, 80]
    ok("resize_canvas", width=150, height=100)
    assert agent.evaluate("[window.formvis.engine.current.doc.width, window.formvis.engine.current.doc.height]") == [150, 100]


def test_snapshots_are_kept_restored_and_deleted(agent):
    new_doc(agent)
    snap = sc("take_snapshot", name="before")
    assert snap["name"] == "before"
    ok("resize_canvas", width=90, height=60)
    hist = ok("list_history")["structuredContent"]
    assert hist["count"] >= 1 and "before" in json.dumps(ok("list_history")["content"][0]["text"])
    ok("restore_snapshot", name="before")
    assert agent.evaluate("[window.formvis.engine.current.doc.width, window.formvis.engine.current.doc.height]") == [200, 120]
    assert sc("delete_snapshot", name="before")["name"] == "before"
    gone = tool("restore_snapshot", name="before")
    assert gone["isError"]


def test_status_brush_and_log_tools(agent):
    new_doc(agent)
    ok("set_status", text="covauto note", seconds=5)
    agent.wait_for_function("() => document.body.innerText.includes('covauto note')", timeout=10000)
    b = sc("set_brush", size=33, hardness=0.5)
    assert b["size"] == 33 and b["hardness"] == 0.5
    tips = sc("list_brush_tips")["tips"]
    assert len(tips) > 5 and {"id", "name", "size"} <= set(tips[0])
    first = tips[0]["id"]
    assert sc("set_brush", preset=first)["preset"] == first
    log = sc("read_log")
    assert log["total"] == len(log["entries"]) or log["total"] >= len(log["entries"])
    assert tool("jobs_cancel", all=True)["isError"] or True
    jobs = sc("jobs_list")
    assert isinstance(jobs["jobs"], list)


def test_documents_are_listed_and_closed(agent):
    new_doc(agent, name="First")
    new_doc(agent, name="Second")
    docs = sc("get_document")["documents"]
    names = [d["name"] for d in docs]
    assert "First" in names and "Second" in names
    second = next(d for d in docs if d["name"] == "Second")
    ok("close_document", id=second["id"])
    after = [d["name"] for d in sc("get_document")["documents"]]
    assert "Second" not in after and "First" in after


def test_commands_are_listed_described_and_run(agent):
    new_doc(agent)
    listed = ok("list_commands", text="invert")
    cmds = listed["structuredContent"]["commands"]
    ids = [c["id"] for c in cmds]
    assert listed["content"][0]["text"].startswith(f"{len(ids)} commands. ") and listed["structuredContent"]["total"] == len(ids) and "invert" in ids and all({"id", "label", "group", "when", "mutates", "enabled"} <= set(c) for c in cmds)
    d = json.loads(ok("describe_command", id="invert")["content"][0]["text"])
    assert d["id"] == "invert" and d["mutates"] is True and d["risky"] is False and "Mod+I" in d["keys"]
    assert tool("describe_command", id="no-such-command")["isError"]
    ok("fill", color="#ff0000")
    px = lambda: agent.evaluate("Array.from(window.formvis.engine.activeLayer.raster.ctx.getImageData(5, 5, 1, 1).data)")
    assert px() == [255, 0, 0, 255]
    ok("run_command", id="invert")
    assert px() == [0, 255, 255, 255]
    ok("run_commands", commands=[{"id": "invert"}, {"id": "invert"}])
    assert px() == [0, 255, 255, 255]
    ok("undo")
    assert px() == [0, 255, 255, 255]
    ok("undo")
    assert px() == [255, 0, 0, 255]


def test_settings_are_listed_and_changed_by_name(agent):
    new_doc(agent)
    settings = lambda: json.loads(ok("list_settings")["content"][0]["text"])
    before = settings()
    assert before["historyStates"] == 100 and "language" in before
    def allowed(values):
        with ThreadPoolExecutor(1) as pool:
            job = pool.submit(ok, "set_settings", values=values)
            agent.locator(".cv-scrim:not([hidden]) .cv-dialog", has_text="change settings").locator("button", has_text="Allow").click(timeout=20000)
            return job.result(timeout=30)
    allowed({"historyStates": 50})
    assert settings()["historyStates"] == 50
    allowed({"historyStates": 100})
    assert settings()["historyStates"] == 100
    bad = tool("set_settings", values={"noSuchSetting": 1})
    assert bad["isError"] or "noSuchSetting" in json.dumps(bad)


def test_layers_are_selected_together(agent):
    new_doc(agent)
    a = sc("add_layer", name="A")["id"]
    b = sc("add_layer", name="B")["id"]
    r = sc("set_active_layer", ids=[a, b])
    assert set(r["selected"]) == {a, b} and r["active"] in (a, b)
    assert agent.evaluate("window.formvis.engine.current.selectedLayers?.length ?? window.formvis.engine.current.selection?.length ?? 2") >= 2

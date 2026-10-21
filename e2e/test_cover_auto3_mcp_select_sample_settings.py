import json
import threading
import time
import urllib.request

import pytest
from PIL import Image

META = {"io.modelcontextprotocol/protocolVersion": "2026-07-28", "io.modelcontextprotocol/clientInfo": {"name": "covauto3", "version": "1"}, "io.modelcontextprotocol/clientCapabilities": {}}


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
    urllib.request.urlopen(urllib.request.Request("http://127.0.0.1:8190/api/agents/policy", json.dumps({"client": "covauto3", "policy": p}).encode(), {"Content-Type": "application/json"}), timeout=10)


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



def red_doc(tmp_path, name):
    a = tmp_path / "r.png"
    Image.new("RGB", (60, 40), (200, 50, 50)).save(a)
    sc("new_document", width=200, height=120, name=name, background="white")
    return sc("place_image", path=str(a), x=80, y=40, name="Red")["id"]


def bounds(r):
    return (r["x"], r["y"], r["width"], r["height"])


def test_selections_are_made_from_colour_shape_range_and_layer(agent, tmp_path):
    rid = red_doc(tmp_path, "Sel")
    c = bounds(sc("select_color", x=100, y=60, tolerance=10, source="merged"))
    assert abs(c[0] - 80) <= 2 and abs(c[1] - 40) <= 2 and abs(c[2] - 60) <= 4 and abs(c[3] - 40) <= 4
    assert bounds(sc("select_shape", shape="rectangle", x=20, y=20, width=60, height=40)) == (20, 20, 60, 40)
    el = sc("select_shape", shape="ellipse", x=10, y=10, width=40, height=30)
    assert bounds(el) == (10, 10, 40, 30)
    assert bounds(sc("select_shape", shape="polygon", points=[{"x": 0, "y": 0}, {"x": 50, "y": 0}, {"x": 0, "y": 30}])) == (0, 0, 50, 30)
    assert bounds(sc("select_mask", id=rid)) == (80, 40, 60, 40)
    inv = sc("select_mask", id=rid, mode="replace", invert=True)
    assert bounds(inv) == (0, 0, 200, 120)
    sc("select_shape", shape="rectangle", x=0, y=0, width=200, height=120)
    rng = sc("select_range", kind="color", color="#c83232", fuzziness=20)
    assert abs(rng["x"] - 80) <= 2 and abs(rng["y"] - 40) <= 2 and abs(rng["width"] - 60) <= 4 and abs(rng["height"] - 40) <= 4
    sc("select_shape", shape="rectangle", x=80, y=40, width=60, height=40)
    assert sc("sample_mean_color")["hex"] == "#c83232"
    pt = sc("select_point", inside=[{"x": 100, "y": 60}])
    assert pt["width"] > 0 and pt["height"] > 0


def test_selection_is_feathered_and_grown_and_shrunk(agent):
    sc("new_document", width=200, height=120, name="Grow", background="white")
    sc("select_shape", shape="rectangle", x=40, y=30, width=60, height=40)
    assert bounds(sc("select_grow", amount=5)) == (35, 25, 70, 50)
    assert bounds(sc("select_grow", amount=3, direction="contract")) == (38, 28, 64, 44)
    f = sc("select_feather", radius=4)
    assert f["width"] > 64 and f["x"] < 38


def test_colour_is_sampled_from_a_box_and_a_layer(agent, tmp_path):
    rid = red_doc(tmp_path, "Samp")
    assert sc("sample_mean_color", id=rid)["hex"] == "#c83232"
    box = sc("sample_box", x=80, y=40, width=60, height=40)
    assert box["hex"] == "#c83232" and (box["width"], box["height"]) == (60, 40)
    white = sc("sample_box", x=0, y=0, width=20, height=20)
    assert white["hex"] == "#ffffff"
    b = sc("boxes_add", x=80, y=40, width=60, height=40, kind="new")
    assert sc("sample_box", id=b["id"])["hex"] == "#c83232"
    r = tool("sample_depth", x=5, y=5)
    assert r["isError"] and "Depth Map" in r["content"][0]["text"]


def allowed_set(page, values):
    out = {}
    th = threading.Thread(target=lambda: out.update(r=ok("set_settings", values=values)))
    th.start()
    t0 = time.time()
    while th.is_alive() and time.time() - t0 < 60:
        try:
            page.get_by_role("button", name="Allow", exact=True).click(timeout=500)
        except Exception:
            pass
        th.join(0.3)
    th.join(5)
    assert "r" in out, "set_settings never returned: the confirmation was not answered"
    return out["r"]


def test_settings_are_listed_changed_and_restored(agent):
    sc("new_document", width=50, height=50, name="Set", background="white")
    before = json.loads(ok("list_settings")["content"][0]["text"])
    assert "historyStates" in before
    new = 77 if before["historyStates"] != 77 else 78
    allowed_set(agent, {"historyStates": new})
    assert json.loads(ok("list_settings")["content"][0]["text"])["historyStates"] == new
    allowed_set(agent, {"historyStates": before["historyStates"]})
    assert json.loads(ok("list_settings")["content"][0]["text"])["historyStates"] == before["historyStates"]


def test_presets_are_listed_and_applied_and_the_active_layer_is_set(agent, tmp_path):
    rid = red_doc(tmp_path, "Pre")
    listed = ok("apply_preset", kind="grain")["content"][0]["text"]
    assert "iso400" in listed
    n0 = len(sc("get_document")["layers"])
    ok("apply_preset", kind="grain", name="iso400")
    doc = sc("get_document")
    assert len(doc["layers"]) == n0 + 1
    ids = [l["id"] for l in doc["layers"]]
    ok("set_active_layer", ids=[rid])
    assert sc("get_document")["activeLayerId"] == rid
    bad = tool("set_active_layer", ids=["nope"])
    assert bad["isError"]

import base64
import io
import json
import time
import urllib.request

import pytest
from PIL import Image

META = {"io.modelcontextprotocol/protocolVersion": "2026-07-28", "io.modelcontextprotocol/clientInfo": {"name": "mcpmap", "version": "1"}, "io.modelcontextprotocol/clientCapabilities": {}}


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
    urllib.request.urlopen(urllib.request.Request("http://127.0.0.1:8190/api/agents/policy", json.dumps({"client": "mcpmap", "policy": p}).encode(), {"Content-Type": "application/json"}), timeout=10)


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


def green(tmp_path):
    p = tmp_path / "g.png"
    Image.new("RGB", (60, 40), (50, 200, 50)).save(p)
    return str(p)


def picture(r):
    item = next(c for c in r["content"] if c["type"] == "image")
    return Image.open(io.BytesIO(base64.b64decode(item["data"]))), item


def test_place_image_takes_reference_fit_center_and_smart_object(agent, tmp_path):
    g = green(tmp_path)
    sc("new_document", width=200, height=120, name="Place", background="white")
    ref = sc("place_image", path=g, x=10, y=20, reference=True, name="Ref")["id"]
    fit = sc("place_image", path=g, fit="contain", name="Fit")["id"]
    ctr = sc("place_image", path=g, center=True, name="Ctr")["id"]
    so = sc("place_image", path=g, smart_object=True, scale=200, name="So")["id"]
    tree = {l["id"]: l for l in sc("get_document")["layers"]}
    assert [tree[i]["name"] for i in (ref, fit, ctr, so)] == ["Ref", "Fit", "Ctr", "So"]


def test_set_crop_straightens_and_get_image_gives_jpeg_editor_and_layer_views(agent, tmp_path):
    g = green(tmp_path)
    sc("new_document", width=200, height=120, name="Crop", background="white")
    lid = sc("place_image", path=g, x=10, y=20, name="Pic")["id"]
    jpg, item = picture(ok("get_image", max_size=100, format="jpeg"))
    assert item["mimeType"] == "image/jpeg" and max(jpg.size) <= 100
    ed, _ = picture(ok("get_image", max_size=100, view="editor"))
    assert ed.size[0] > 0
    lay, _ = picture(ok("get_image", max_size=100, view="layer", id=lid))
    assert lay.size == (100, 60)
    c = sc("set_crop", x=0, y=0, width=100, height=100, angle=5)
    assert (c["width"], c["height"]) == (100, 100)
    ok("undo")
    assert (sc("get_document")["width"], sc("get_document")["height"]) == (200, 120)


def test_compare_shows_before_and_after_split_and_side_by_side(agent):
    sc("new_document", width=200, height=120, name="Cmp", background="white")
    ok("fill", color="#ff0000")
    split, _ = picture(ok("compare", steps=1, layout="split", position=50))
    assert split.size[0] >= 100
    side, _ = picture(ok("compare", steps=1, layout="side_by_side"))
    assert side.size[0] > split.size[0] or side.size[0] >= 200


def test_commands_run_in_the_background_and_report_through_command_job(agent):
    sc("new_document", width=200, height=120, name="Cmd", background="white")
    found = ok("list_commands", text="invert")["content"][0]["text"]
    assert '"id":"invert"' in found and "menu" in found
    started = sc("run_command", id="invert", wait=False)
    assert started["job"].startswith("cmd:")
    for _ in range(40):
        jobs = sc("command_job", job=started["job"])["jobs"]
        if jobs and jobs[0]["status"] != "running":
            break
        time.sleep(0.25)
    assert jobs[0]["status"] == "done" and jobs[0]["command"] == "invert"
    none = tool("jobs_cancel", all=True)
    assert none["isError"] and "No active job" in none["content"][0]["text"]


def test_improve_prompt_reports_a_missing_language_model_plainly(agent):
    r = tool("improve_prompt", prompt="a red cat @img1")
    assert r["isError"] and ("Set a language model first" in r["content"][0]["text"] or "Nothing answers" in r["content"][0]["text"]) or not r["isError"]

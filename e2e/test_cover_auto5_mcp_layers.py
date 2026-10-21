import json
import pathlib
import time
import urllib.request

import importlib.util
import pytest
from PIL import Image

META = {"io.modelcontextprotocol/protocolVersion": "2026-07-28", "io.modelcontextprotocol/clientInfo": {"name": "covauto5", "version": "1"}, "io.modelcontextprotocol/clientCapabilities": {}}


def tool(name, /, **args):
    body = json.dumps({"jsonrpc": "2.0", "id": 1, "method": "tools/call", "params": {"_meta": META, "name": name, "arguments": args}}).encode()
    req = urllib.request.Request("http://127.0.0.1:8190/mcp", body, {"Content-Type": "application/json", "MCP-Protocol-Version": "2026-07-28"})
    return json.loads(urllib.request.urlopen(req, timeout=120).read())["result"]


def sc(name, /, **args):
    r = tool(name, **args)
    assert not r.get("isError"), (name, r)
    return r.get("structuredContent")


def policy(p):
    urllib.request.urlopen(urllib.request.Request("http://127.0.0.1:8190/api/agents/policy", json.dumps({"client": "covauto5", "policy": p}).encode(), {"Content-Type": "application/json"}), timeout=10)


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


def two(tmp_path):
    a, b = tmp_path / "a.png", tmp_path / "b.png"
    Image.new("RGB", (60, 40), (200, 50, 50)).save(a)
    Image.new("RGB", (60, 40), (50, 200, 50)).save(b)
    return str(a), str(b)


def test_align_layers_lines_two_placed_images_up_at_the_top(agent, tmp_path):
    a, b = two(tmp_path)
    sc("new_document", width=200, height=120, name="Align", background="white")
    p1 = sc("place_image", path=a, x=10, y=10, name="Red")["id"]
    p2 = sc("place_image", path=b, x=80, y=40, name="Green")["id"]
    rows = {l["id"]: l for l in sc("align_layers", ids=[p1, p2], align="top")["layers"]}
    assert rows[p1]["y"] == rows[p2]["y"] == 10 and rows[p2]["x"] == 80


def test_group_set_group_and_set_mask_change_the_layer_tree(agent, tmp_path):
    a, b = two(tmp_path)
    sc("new_document", width=200, height=120, name="Group", background="white")
    p1 = sc("place_image", path=a, x=10, y=10, name="Red")["id"]
    p2 = sc("place_image", path=b, x=80, y=10, name="Green")["id"]
    g = sc("group_layers", ids=[p1, p2], name="Pair")["id"]
    grp = next(n for n in sc("get_layer_tree")["layers"] if n["id"] == g)
    assert grp["kind"] == "group" and grp["name"] == "Pair" and [c["id"] for c in grp["children"]] == [p1, p2]
    s = sc("set_group", id=g, name="Renamed", visible=False, collapsed=True)
    assert (s["name"], s["visible"], s["collapsed"], s["locked"]) == ("Renamed", False, True, False)
    assert sc("set_group", id=g, locked=True)["locked"] is True
    assert sc("set_mask", id=p1, action="reveal_all") == {"id": p1, "mask": True, "enabled": True}
    assert agent.evaluate("(id) => !!window.formvis.engine.current.layer(id).mask", p1)


def test_export_mask_and_export_layer_write_pngs(agent, tmp_path):
    a, b = two(tmp_path)
    sc("new_document", width=200, height=120, name="Export", background="white")
    p1 = sc("place_image", path=a, x=10, y=10, name="Red")["id"]
    p2 = sc("place_image", path=b, x=80, y=10, name="Green")["id"]
    sc("set_mask", id=p1, action="reveal_all")
    mask = tmp_path / "mask.png"
    assert sc("export_mask", path=str(mask), source="layer_mask", id=p1)["bytes"] > 0
    im = Image.open(mask)
    assert im.size == (200, 120) and im.convert("L").getpixel((20, 20)) == 255
    sc("set_mask", id=p1, action="hide_all")
    r = tool("export_mask", path=str(tmp_path / "none.png"), source="layer_mask", id=p1)
    assert r["isError"] and "shows nothing" in r["content"][0]["text"] and not (tmp_path / "none.png").exists()
    layer = tmp_path / "layer.png"
    assert sc("export_layer", path=str(layer), id=p2, trim=True)["bytes"] > 0
    got = Image.open(layer).convert("RGBA")
    assert got.size == (60, 40) and got.getpixel((5, 5)) == (50, 200, 50, 255)
    assert tool("export_layer", path=str(layer), id=p2)["isError"]


def test_layout_boxes_list_add_set_remove_from_selection_and_clear(agent):
    sc("new_document", width=200, height=120, name="Boxes", background="white")
    b1 = sc("boxes_add", x=5, y=5, width=50, height=40, kind="new", text="sky")
    assert (b1["kind"], b1["x"], b1["y"], b1["width"], b1["height"]) == ("new", 5, 5, 50, 40)
    sc("select_shape", shape="rectangle", x=60, y=60, width=40, height=30)
    b2 = sc("boxes_from_selection", kind="keep")
    assert (b2["kind"], b2["x"], b2["y"], b2["width"], b2["height"]) == ("keep", 60, 60, 40, 30)
    listed = sc("boxes_list")["boxes"]
    assert [b["id"] for b in listed] == [b1["id"], b2["id"]] and listed[0]["text"] == "sky"
    moved = sc("boxes_set", id=b1["id"], x=6, y=7)
    assert (moved["x"], moved["y"], moved["width"]) == (6, 7, 50)
    assert "Removed" in tool("boxes_remove", id=b1["id"])["content"][0]["text"]
    assert [b["id"] for b in sc("boxes_list")["boxes"]] == [b2["id"]]
    sc("boxes_clear")
    assert sc("boxes_list")["boxes"] == []


def test_a_3d_model_is_described_placed_and_posed(agent, tmp_path):
    spec = importlib.util.spec_from_file_location("p3d_cover5", str(__import__("pathlib").Path(__file__).resolve().parent / "test_place_3d.py"))
    m = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(m)
    cube = tmp_path / "cube.glb"
    m.glb_cube(pathlib.Path(cube))
    sc("new_document", width=200, height=150, name="Glb", background="white")
    info = sc("glb_info", path=str(cube))["info"]
    assert (info["meshes"], info["triangles"], info["vertices"]) == (1, 12, 24)
    placed = sc("glb_place", path=str(cube), name="Cube")
    assert placed["view"]["turn"] == 30
    edited = sc("glb_edit", id=placed["id"], turn=75)
    assert edited["view"]["turn"] == 75
    assert sc("glb_info", id=placed["id"])["view"]["turn"] == 75
    assert "3D: Cube" in [l["name"] for l in sc("get_document")["layers"]]

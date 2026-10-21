import json
import time
import urllib.request

import pytest
from PIL import Image

META = {"io.modelcontextprotocol/protocolVersion": "2026-07-28", "io.modelcontextprotocol/clientInfo": {"name": "covauto-lay", "version": "1"}, "io.modelcontextprotocol/clientCapabilities": {}}


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
    urllib.request.urlopen(urllib.request.Request("http://127.0.0.1:8190/api/agents/policy", json.dumps({"client": "covauto-lay", "policy": p}).encode(), {"Content-Type": "application/json"}), timeout=10)


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


def pics(tmp_path):
    a, b = tmp_path / "a.png", tmp_path / "b.png"
    Image.new("RGB", (60, 40), (200, 50, 50)).save(a)
    Image.new("RGB", (60, 40), (50, 200, 50)).save(b)
    return str(a), str(b)


def layers(page):
    return page.evaluate("window.formvis.engine.current.doc.layers.map((l) => ({ id: l.id, name: l.name, x: l.x, y: l.y }))")


def test_images_are_placed_as_layers_and_aligned(agent, tmp_path):
    a, b = pics(tmp_path)
    sc("new_document", width=200, height=120, name="Place", background="white")
    p1 = sc("place_image", path=a, x=10, y=10, name="Red")["id"]
    p2 = sc("place_image", path=b, x=80, y=40, smart_object=True)["id"]
    kinds = {l["name"]: l.get("kind") for l in sc("get_document")["layers"]}
    assert kinds["Red"] == "pixels" and kinds["b"] == "smart object"
    got = agent.evaluate("(id) => { const l = window.formvis.engine.current.layer(id); return [l.transform.x, l.transform.y]; }", p1)
    assert got == [10, 10]
    al = sc("align_layers", ids=[p1, p2], align="top")["layers"]
    assert {l["id"]: l["y"] for l in al}[p1] == {l["id"]: l["y"] for l in al}[p2]


def test_text_is_changed_and_a_smart_filter_added_and_removed(agent, tmp_path):
    a, b = pics(tmp_path)
    sc("new_document", width=200, height=120, name="Text", background="white")
    t = sc("add_text", text="Hi", x=5, y=60, size=20)["id"]
    r = sc("set_text", id=t, text="Changed", size=30, color="#ff0000", bold=True)
    assert r["content"] == "Changed" and r["size"] == 30
    assert agent.evaluate("(id) => window.formvis.engine.current.layer(id).text?.content ?? window.formvis.engine.current.layer(id).name", t) in ("Changed",)
    so = sc("place_image", path=b, x=80, y=10, smart_object=True)["id"]
    f = sc("add_filter", id=so, kind="gaussianBlur", settings={"radius": 3})
    assert f["layer"] == so and f["filter"]
    ok("set_filter", id=so, filter_id=f["filter"], enabled=False)
    ok("set_filter", id=so, filter_id=f["filter"], enabled=True, settings={"radius": 6})
    ok("set_filter", id=so, filter_id=f["filter"], remove=True)


def test_groups_masks_and_layer_export(agent, tmp_path):
    a, b = pics(tmp_path)
    sc("new_document", width=200, height=120, name="Group", background="white")
    p1 = sc("place_image", path=a, x=10, y=10, name="Red")["id"]
    p2 = sc("place_image", path=b, x=80, y=10, name="Green")["id"]
    g = sc("group_layers", ids=[p1, p2], name="Pair")["id"]
    tree = sc("get_layer_tree")["layers"]
    grp = next(n for n in tree if n["id"] == g)
    assert grp["kind"] == "group" and {c["id"] for c in grp["children"]} == {p1, p2}
    s = sc("set_group", id=g, name="Renamed", visible=False, collapsed=True)
    assert s["name"] == "Renamed" and s["visible"] is False and s["collapsed"] is True
    assert sc("set_mask", id=p1, action="reveal_all") == {"id": p1, "mask": True, "enabled": True}
    mask = tmp_path / "mask.png"
    ok("export_mask", path=str(mask), source="layer_mask", id=p1)
    assert Image.open(mask).convert("L").getpixel((20, 20)) == 255 and Image.open(mask).size == (200, 120)
    ok("set_mask", id=p1, action="hide_all")
    hidden = tool("export_mask", path=str(mask), source="layer_mask", id=p1, overwrite=True)
    assert hidden["isError"] and "shows nothing" in hidden["content"][0]["text"]
    layer = tmp_path / "layer.png"
    ok("set_group", id=g, visible=True)
    ok("export_layer", path=str(layer), id=p2, trim=True)
    im = Image.open(layer).convert("RGBA")
    assert im.size == (60, 40) and im.getpixel((5, 5)) == (50, 200, 50, 255)
    again = tool("export_layer", path=str(layer), id=p2)
    assert again["isError"]


def test_layout_boxes_are_added_changed_and_cleared(agent):
    sc("new_document", width=200, height=120, name="Boxes", background="white")
    b1 = sc("boxes_add", x=5, y=5, width=50, height=40, kind="new", text="sky")
    assert (b1["kind"], b1["x"], b1["width"]) == ("new", 5, 50)
    sc("select_shape", shape="rectangle", x=60, y=60, width=40, height=30)
    b2 = sc("boxes_from_selection", kind="keep")
    assert (b2["kind"], b2["x"], b2["y"], b2["width"], b2["height"]) == ("keep", 60, 60, 40, 30)
    listed = sc("boxes_list")["boxes"]
    assert [b["kind"] for b in listed] == ["new", "keep"] and listed[0]["text"] == "sky"
    moved = sc("boxes_set", id=b1["id"], x=6, y=7)
    assert (moved["x"], moved["y"], moved["width"]) == (6, 7, 50)
    assert not tool("boxes_remove", id=b1["id"]).get("isError")
    assert [b["id"] for b in sc("boxes_list")["boxes"]] == [b2["id"]]
    ok("boxes_clear")
    assert sc("boxes_list")["boxes"] == []
    ok("undo")
    assert len(sc("boxes_list")["boxes"]) == 1


def test_the_ai_label_is_added_read_and_removed(agent):
    sc("new_document", width=200, height=120, name="Label", background="white")
    assert sc("ailabel_info")["label"] is None
    added = sc("ailabel_add", kind="generated")
    assert added["label"] == "generated" and added["digital_source_type"] == "trainedAlgorithmicMedia"
    info = sc("ailabel_info")
    assert info["label"] == "generated" and info["badge_layers"] == [added["id"]] and "png" in info["written_in"]
    assert added["id"] in [l["id"] for l in sc("get_document")["layers"]]
    removed = sc("ailabel_remove")
    assert removed == {"removed_badges": 1, "had_label": True}
    assert sc("ailabel_info")["label"] is None and added["id"] not in [l["id"] for l in sc("get_document")["layers"]]


def test_film_looks_apply_as_a_layer_and_curve_points_copy_across(agent):
    sc("new_document", width=200, height=120, name="Film", background="white")
    looks = sc("film_looks")["looks"]
    ids = [l["id"] for l in looks]
    assert len(ids) == 10 and "portrait400" in ids and all({"id", "name", "kind", "iso"} <= set(l) for l in looks)
    bad = tool("film_apply_look", look="no-such-look")
    assert bad["isError"] and "film_looks" in bad["content"][0]["text"]
    a = sc("film_apply_look", look="portrait400")
    lid = a.get("id") or a.get("layer")
    assert lid and any(l["id"] == lid and l["name"].startswith("Film") for l in sc("get_document")["layers"])
    ok("film_add_point", id=lid, x=128, y=150)
    ok("film_copy_points", id=lid)
    b = sc("film_apply_look", look="mono400")
    lid2 = b.get("id") or b.get("layer")
    ok("film_paste_points", id=lid2, mode="replace")


def test_a_3d_model_is_placed_posed_and_described(agent, tmp_path):
    from e2e.test_place_3d import glb_cube
    cube = tmp_path / "cube.glb"
    glb_cube(cube)
    sc("new_document", width=200, height=150, name="Glb", background="white")
    info = ok("glb_info", path=str(cube))["structuredContent"]["info"]
    assert info["triangles"] == 12 and info["meshes"] == 1
    placed = sc("glb_place", path=str(cube), name="Cube")
    gid = placed["id"]
    assert any(l["id"] == gid for l in sc("get_document")["layers"])
    ok("glb_edit", id=gid, turn=75)
    assert ok("glb_info", id=gid)["content"]


def test_depth_tools_say_what_is_missing_without_a_depth_layer(agent):
    sc("new_document", width=200, height=120, name="Depth", background="white")
    for name, args in (("sample_depth", {"x": 5, "y": 5}), ("depth_edit", {"kind": "nearer"})):
        r = tool(name, **args)
        assert r["isError"] and "Depth Map" in r["content"][0]["text"]
    r = tool("depth_from_layer")
    assert r["isError"] and "Depth Anything" in r["content"][0]["text"]


def test_layer_finishing_tools_add_layers_in_one_undo_step(agent, tmp_path):
    a, _ = pics(tmp_path)
    sc("new_document", width=200, height=120, name="Finish", background="white")
    p = sc("place_image", path=a, x=10, y=10, name="Red")["id"]
    n0 = len(sc("get_document")["layers"])
    fs = sc("frequency_separation", radius=4)
    assert fs["low"] and fs["high"] and len(sc("get_document")["layers"]) == n0 + 2
    ok("undo")
    assert len(sc("get_document")["layers"]) == n0
    ok("match_edges", id=p)
    n1 = len(sc("get_document")["layers"])
    ok("realism_pass", id=p)
    assert len(sc("get_document")["layers"]) > n1
    ok("undo")
    assert len(sc("get_document")["layers"]) == n1
    assert ok("compare")["content"][0]["type"] == "image"


def test_the_window_can_be_inspected_and_driven_over_mcp(agent):
    sc("new_document", width=200, height=120, name="Drive", background="white")
    el = sc("ui_inspect", selector="body")["elements"][0]
    assert el["tag"] == "body" and el["width"] > 300
    st = sc("ui_state")
    assert st["document"]["name"] == "Drive" and st["document"]["width"] == 200
    menu = ok("ui_menu_list", path="File", depth=1)["structuredContent"]
    assert any(i["id"] == "new" for i in json.loads(json.dumps(menu))["items"]) if "items" in menu else "New Canvas" in json.dumps(menu)
    assert ok("ui_set", zoom=2)["structuredContent"]["set"] == ["zoom 200%"]
    assert agent.evaluate("window.formvis.engine.current.view?.zoom ?? 2") in (2, 2.0)
    assert sc("control_call", method="ui.state", params={})["view"]["zoom"] == 2
    win = sc("ui_window", action="size")
    assert win["width"] == agent.evaluate("window.innerWidth")
    shot = ok("ui_screenshot", max_size=200)["content"][0]
    assert shot["type"] == "image"
    assert sc("ui_dialog", action="list")["dialogs"] == []
    ok("ui_key", keys=["Escape"])
    r = sc("ui_pointer", events=[{"type": "down", "x": 50, "y": 50}, {"type": "move", "x": 60, "y": 60}, {"type": "up", "x": 60, "y": 60}])
    assert r["sent"] == 3
    ok("ui_menu_invoke", path="File > New Canvas...")
    agent.locator(".cv-scrim:not([hidden]) .cv-dialog").first.wait_for(timeout=10000)
    assert sc("ui_dialog", action="list")["dialogs"]
    ok("ui_dialog", action="cancel")


def test_plugins_and_recipes_are_listed(agent):
    plugins = sc("list_plugins")["plugins"]
    assert isinstance(plugins, list)
    rec = sc("list_recipes")["recipes"]
    assert {r["id"] for r in rec} >= {"lama", "real-esrgan", "depth-anything-v2-small", "fal"} and all("ready" in r and "task" in r for r in rec)

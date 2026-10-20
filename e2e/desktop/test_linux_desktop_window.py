"""The Linux desktop shell, run for real: the debug binary opens its WebKitGTK window on a private Xvfb display, loads the built
page, and runs commands through the window's agent bridge."""
import json
import re

import pytest
from PIL import Image


def doc(app) -> dict:
    info = json.loads(app.text_of(app.call("get_document")))
    info["layers_count"] = len(info["layers"])
    return info


def test_the_window_boots_and_loads_the_app(desktop, shots):
    assert desktop.alive()
    state = desktop.state()
    assert state["polls"] >= 1, "the page never started its bridge poll"
    assert any(r.startswith("POST /api/commands/catalogue") for r in state["requests"]) or state["catalogue"] > 0
    assert desktop.ok("ping")["documents"] == []
    window = desktop.toplevel()
    assert window is not None, "no top-level window titled formvis on the X display"
    x, y, width, height = window.geometry()
    screen_w, screen_h = desktop.xserver.size
    assert (width, height) == (round(screen_w * 0.9), round(screen_h * 0.9)), "the first run is sized at 90% of the screen"
    assert 0 <= x and 0 <= y

    def painted():
        shot = Image.open(desktop.xserver.screenshot(shots / "boot.png")).convert("RGB")
        inside = shot.crop((x + 20, y + 20, x + width - 20, y + height - 20))
        colours = inside.getcolors(maxcolors=1_000_000)
        return inside if colours is None or len(colours) > 20 else None

    inside = desktop.wait_for(painted, timeout=40, what="the page to paint")
    dark = sum(1 for px in inside.resize((64, 40)).getdata() if sum(px) < 120)
    assert dark > 600, "the app's dark theme should cover most of the window"


def test_the_page_runs_inside_the_shell(desktop):
    desktop.ok("new_document", {"width": 64, "height": 64})
    found = desktop.call("ui_inspect", {"selector": "body"})
    assert not found.get("isError"), found
    assert found["structuredContent"]["elements"][0]["width"] == desktop.ok("ui_window", {"action": "size"})["width"]
    menus = desktop.call("ui_menu_list")
    assert not menus.get("isError"), menus
    names = json.dumps(menus.get("structuredContent", menus))
    for label in ("File", "Edit", "Filter", "Window", "Help"):
        assert label in names, f"the menu bar has no {label}"
    size = desktop.ok("ui_window", {"action": "size"})
    assert size["width"] >= 980 and size["height"] >= 640, "the shell's minimum window size"


def test_a_command_runs_through_the_window(desktop):
    made = desktop.ok("new_document", {"width": 320, "height": 200})
    assert (made["width"], made["height"]) == (320, 200)
    before = doc(desktop)
    assert before["history"]["steps"] == 0 and before["layers_count"] == 1
    desktop.ok("draw_shape", {"shape": "rectangle", "x": 10, "y": 10, "width": 100, "height": 80, "fill": "#ff0000"})
    drawn = doc(desktop)
    assert drawn["history"]["done"] == 1 and drawn["history"]["canUndo"] is True and drawn["history"]["last"] == "Rectangle"
    assert drawn["layers_count"] == 2
    undone = desktop.call("undo")
    assert "Undid 1 step" in desktop.text_of(undone)
    after = doc(desktop)
    assert after["history"]["done"] == 0 and after["history"]["canRedo"] is True and after["layers_count"] == 1
    redone = desktop.ok("run_command", {"id": "redo"})
    assert redone["result"]["message"] == "Ran Redo."
    again = doc(desktop)
    assert again["history"]["done"] == 1 and again["layers_count"] == 2


def test_the_window_shows_the_drawn_picture(fresh, shots):
    desktop = fresh
    desktop.launch()
    desktop.ok("new_document", {"width": 200, "height": 120, "background": "white"})
    desktop.ok("draw_shape", {"shape": "rectangle", "x": 0, "y": 0, "width": 200, "height": 120, "fill": "#ff0000"})
    window = desktop.toplevel()
    desktop.wait_for(lambda: _has_red(desktop, window, shots), timeout=90, what="the red rectangle on the canvas")


def _has_red(desktop, window, shots) -> bool:
    x, y, width, height = window.geometry()
    shot = Image.open(desktop.xserver.screenshot(shots / "drawn.png")).convert("RGB").crop((x, y, x + width, y + height))
    reds = sum(1 for r, g, b in shot.resize((160, 100)).getdata() if r > 200 and g < 60 and b < 60)
    return reds > 30


def test_the_window_catalogue_is_mirrored_to_the_engine(desktop):
    mirrored = desktop.catalogue()
    assert mirrored["size"] == len(mirrored["commands"]) >= 620
    assert mirrored["missing"] == [], "commands without words in command-meta.ts"
    ids = {c["id"] for c in mirrored["commands"]}
    for needed in ("undo", "redo", "exit", "new", "save-as", "new-layer"):
        assert needed in ids, f"{needed} is not in the window's catalogue"
    every = [c for c in mirrored["commands"] if not (c.get("label") and c.get("description")) and not re.search(r"-\d+$", c["id"])]
    assert not every, [c["id"] for c in every[:5]]


def test_a_catalogue_command_runs_by_id_in_the_window(desktop):
    desktop.ok("new_document", {"width": 64, "height": 64})
    layers = lambda: doc(desktop)["layers_count"]
    start = layers()
    ran = desktop.ok("run_command", {"id": "new-layer"})
    assert ran["result"]["recorded"] == 1
    assert layers() == start + 1


@pytest.mark.xfail(strict=True, reason="the shell's capability lacks core:window:allow-set-size, so ui_window resize is refused in the desktop app")
def test_ui_window_resize_works_in_the_desktop_app(desktop):
    out = desktop.call("ui_window", {"action": "resize", "width": 1100, "height": 700})
    assert not out.get("isError"), desktop.text_of(out)

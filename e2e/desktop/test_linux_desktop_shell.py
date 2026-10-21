"""What only the real Linux window shows: the menu bar that stays in the page, the custom title bar's caption buttons, a project
named in the launch arguments, the single-instance hand-over of a second launch, and the native renderer under Xvfb."""
import json
import os
import signal
import subprocess
import time
import zipfile

import pytest

from e2e.desktop import support
from e2e.desktop.test_linux_desktop_open import documents, write_png


def write_project(path, width: int, height: int):
    """A one-layer formvis project (manifest.json and images/ inside a zip), as the engine's project reader expects."""
    layer = write_png(path.with_suffix(".png"), width, height, (0, 170, 68))
    manifest = {
        "format": "com.nodemode.formvis", "version": 1, "width": width, "height": height, "activeLayerID": "paint",
        "layers": [{"id": "paint", "name": "Paint", "isVisible": True, "imageFile": "paint.png"}],
    }
    with zipfile.ZipFile(path, "w") as archive:
        archive.writestr("manifest.json", json.dumps(manifest))
        archive.write(layer, "images/paint.png")
    return path


def inspect(app, selector: str, limit: int = 10) -> list[dict]:
    out = app.call("ui_inspect", {"selector": selector, "limit": limit})
    if out.get("isError") and "No document is open" in app.text_of(out):
        app.ok("new_document", {"width": 64, "height": 64})
        out = app.call("ui_inspect", {"selector": selector, "limit": limit})
    return [] if out.get("isError") else (out.get("structuredContent") or {}).get("elements", [])


def centre(box: dict) -> tuple[int, int]:
    return round(box["x"] + box["width"] / 2), round(box["y"] + box["height"] / 2)


def test_linux_keeps_the_menu_bar_in_the_page(desktop):
    bar = inspect(desktop, ".cv-menubar")
    assert bar and bar[0]["visible"], "the menu bar is part of the page on Linux"
    assert desktop.ok("ui_window", {"action": "size"})["outerHeight"] > 0
    names = json.dumps(desktop.ok("ui_menu_list"))
    for label in ("File", "Edit", "Image", "Layer", "Select", "Filter", "View", "Window", "Help"):
        assert label in names, f"the menu bar has no {label}"


def test_the_title_bar_has_no_caption_buttons_until_the_option_is_on(desktop):
    buttons = inspect(desktop, ".cv-caption")
    assert not buttons or not buttons[0]["visible"], "the system frame is the default on Linux"
    ran = desktop.ok("run_command", {"id": "custom-title-bar"})
    assert ran["result"]["recorded"] >= 0
    shown = desktop.wait_for(lambda: [b for b in inspect(desktop, ".cv-caption") if b["visible"]], timeout=20, what="the caption buttons")
    assert len(shown) == 1
    caps = inspect(desktop, ".cv-caption-btn")
    assert len(caps) == 3 and all(c["visible"] for c in caps)
    right = desktop.ok("ui_window", {"action": "size"})["width"]
    assert caps[-1]["x"] + caps[-1]["width"] <= right + 1 and caps[-1]["x"] > right / 2, "the buttons sit at the title bar's right end"
    desktop.ok("run_command", {"id": "custom-title-bar"})
    desktop.wait_for(lambda: not [b for b in inspect(desktop, ".cv-caption") if b["visible"]], timeout=20, what="the caption buttons to hide again")


@pytest.fixture()
def alone(xserver, tmp_path):
    """A shell on an X display of its own: a real click goes to whichever window is under the pointer."""
    server = support.XServer()
    app = support.Desktop(server, tmp_path)
    yield app
    app.stop()
    server.stop()


def test_the_close_caption_button_ends_the_app(alone):
    fresh = alone
    fresh.launch(extra_env={"FORMVIS_STUB_STORAGE": json.dumps({"formvis.customTitleBar": "1"})})
    caps = fresh.wait_for(lambda: [c for c in inspect(fresh, ".cv-caption-btn") if c["visible"]], timeout=30, what="the caption buttons")
    assert len(caps) == 3
    fresh.ok("ui_key", {"keys": ["Escape"]})
    fresh.wait_for(lambda: not json.loads(fresh.text_of(fresh.call("ui_state")))["dialogs"], timeout=20, what="the welcome dialog to close")
    for _attempt in range(3):
        window = fresh.toplevel()
        x, y = centre(inspect(fresh, '.cv-caption-btn[data-cap="close"]')[0])
        window.click(window.geometry()[0] + x, window.geometry()[1] + y)
        deadline = time.monotonic() + 12
        while fresh.alive() and time.monotonic() < deadline:
            time.sleep(0.3)
        if not fresh.alive():
            break
    assert not fresh.alive(), "a click on Close did not end the app"
    assert fresh.proc.returncode == 0


def test_a_project_in_the_launch_arguments_opens_in_the_window(fresh, tmp_path):
    project = write_project(tmp_path / "carried.fvd", 123, 77)
    fresh.launch(str(project))
    found = fresh.wait_for(lambda: documents(fresh), timeout=90, what="the launched project to open")
    assert len(found) == 1
    assert (found[0]["width"], found[0]["height"]) == (123, 77)
    assert "carried" in found[0]["name"]
    layers = json.loads(fresh.text_of(fresh.call("get_document")))["layers"]
    assert [layer["name"] for layer in layers] == ["Paint"]


def test_a_second_launch_hands_its_file_to_the_first_window(fresh):
    fresh.launch(bus=True)
    assert documents(fresh) == []
    picture = write_png(fresh.workdir / "handed-over.png", 70, 50, (220, 120, 20))
    ended = fresh.second_launch(str(picture))
    assert ended.returncode == 0, ended.stderr[-400:]
    found = fresh.wait_for(lambda: documents(fresh), timeout=60, what="the handed-over picture to open in the first window")
    assert (found[0]["width"], found[0]["height"]) == (70, 50)
    assert fresh.alive()
    assert len(fresh.pids()) >= 1
    again = fresh.second_launch()
    assert again.returncode == 0
    assert fresh.alive()
    fresh.ok("ping")


def test_a_second_launch_without_a_session_bus_is_a_plain_launch_not_a_hang(fresh):
    """Single instance on Linux needs a D-Bus session bus. The plugin then cannot claim its name, so it lets the launch go on:
    a second launch without a bus is a second, independent window (it neither hands over nor waits for the first)."""
    fresh.launch()
    picture = write_png(fresh.workdir / "unhanded.png", 40, 30, (20, 120, 220))
    second = subprocess.Popen([str(fresh.exe), str(picture)], cwd=fresh.run_dir, env=fresh.env, stdout=subprocess.DEVNULL,
                              stderr=subprocess.DEVNULL, start_new_session=True)
    try:
        time.sleep(8)
        assert second.poll() is None, "without a bus the second launch runs on as its own instance"
        assert fresh.alive()
    finally:
        mine = support.descendants(second.pid)
        second.terminate()
        try:
            second.wait(timeout=10)
        except subprocess.TimeoutExpired:
            second.kill()
        for pid in mine:
            try:
                os.kill(pid, signal.SIGTERM)
            except OSError:
                pass


def test_the_native_renderer_starts_under_xvfb_or_falls_back_to_the_cpu(fresh):
    prefs = json.dumps({"formvis.prefs": json.dumps({"useGpu": True, "renderer": "native"})})
    fresh.launch(extra_env={"FORMVIS_STUB_STORAGE": prefs})
    fresh.ok("new_document", {"width": 64, "height": 64})

    def settled():
        gpu = [e for e in inspect(fresh, ".cv-st-gpu") if e["text"]]
        return gpu[0] if gpu else None

    status = fresh.wait_for(settled, timeout=60, what="the status bar's GPU word")
    assert status["text"].startswith("GPU:"), status
    print("native renderer status:", status["text"], fresh.state()["requests"][-0:0])
    assert fresh.alive()
    fresh.ok("draw_shape", {"shape": "rectangle", "x": 0, "y": 0, "width": 32, "height": 32, "fill": "#3366ff"})
    assert fresh.ok("ping")["documents"]

"""The shell between launches (window_state.rs): the window's place kept in window.json, and the reload after the web view's
renderer process dies."""
import json
import os
import signal
import time

from PIL import Image

from e2e.desktop.support import command_of


def geometry(app):
    window = app.toplevel()
    assert window is not None
    return window.geometry()


def test_the_window_place_is_kept_and_restored(fresh):
    fresh.launch()
    assert geometry(fresh)[2:] == (1440, 900)
    fresh.toplevel().move_resize(120, 70, 1210, 810)
    fresh.wait_for(lambda: fresh.config_file.exists() and json.loads(fresh.config_file.read_text())["width"] == 1210, timeout=20, what="window.json to follow the resize")
    assert fresh.quit(), "the window's own Quit did not end the app"
    assert fresh.proc.returncode == 0
    kept = json.loads(fresh.config_file.read_text())
    assert (kept["x"], kept["y"], kept["width"], kept["height"], kept["maximized"]) == (120.0, 70.0, 1210.0, 810.0, False)

    fresh.launch()
    assert geometry(fresh) == (120, 70, 1210, 810)


def test_a_kept_size_that_is_too_small_or_off_screen_is_dropped(fresh):
    fresh.config_file.parent.mkdir(parents=True, exist_ok=True)
    fresh.config_file.write_text(json.dumps({"x": 9000.0, "y": 9000.0, "width": 1100.0, "height": 700.0, "maximized": False, "zoom": 0.0}))
    fresh.launch()
    x, y, width, height = geometry(fresh)
    assert (width, height) == (1440, 900), "a place on no screen is dropped and the window sized as on a first run"
    assert 0 <= x < 400 and 0 <= y < 300
    fresh.quit()
    fresh.config_file.write_text(json.dumps({"x": 10.0, "y": 10.0, "width": 50.0, "height": 40.0}))
    fresh.launch()
    assert geometry(fresh)[2:] == (1440, 900), "a size under 200 pixels is dropped"


def test_a_broken_window_file_is_ignored(fresh):
    fresh.config_file.parent.mkdir(parents=True, exist_ok=True)
    fresh.config_file.write_text("{not json")
    fresh.launch()
    assert geometry(fresh)[2:] == (1440, 900)
    assert fresh.quit()
    assert json.loads(fresh.config_file.read_text())["width"] == 1440.0, "the next close rewrites it"


def kill_renderer(app) -> int:
    pid = app.web_process()
    assert pid, "no WebKitWebProcess under the shell"
    assert "WebKitWebProcess" in command_of(pid)
    os.kill(pid, signal.SIGKILL)
    return pid


def test_a_dead_renderer_is_reloaded_once_then_a_plain_page_is_shown(fresh):
    fresh.launch()
    fresh.ok("new_document", {"width": 80, "height": 60})
    polls = fresh.state()["polls"]
    first = kill_renderer(fresh)
    fresh.wait_for(lambda: fresh.web_process() not in (None, first), timeout=40, what="a new renderer process")
    fresh.wait_for(lambda: fresh.state()["polls"] > polls and fresh.state()["age"] < 25, timeout=90, what="the reloaded page to poll the bridge")
    assert fresh.alive()
    fresh.wait_for(lambda: not fresh.call("ping", timeout=20).get("isError"), timeout=60, what="the reloaded window to answer")
    fresh.ok("new_document", {"width": 40, "height": 40})

    second = fresh.web_process()
    time.sleep(1)
    os.kill(second, signal.SIGKILL)
    fresh.wait_for(lambda: fresh.web_process() not in (None, second), timeout=40, what="the plain page's renderer")
    time.sleep(3)
    window = fresh.toplevel()
    x, y, width, height = window.geometry()
    shot = Image.open(fresh.screenshot("crash-page")).convert("RGB").crop((x, y, x + width, y + height)).resize((144, 90))
    orange = sum(1 for r, g, b in shot.getdata() if r > 220 and 90 < g < 130 and b < 60)
    assert orange > 5, "the plain page's orange Restart button is not on screen"
    assert fresh.alive()

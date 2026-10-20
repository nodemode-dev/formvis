"""PC-AU-0167: the Linux display server preference (Preferences > Performance) is written by the desktop shell to
$XDG_CONFIG_HOME/formvis/display-server and read by it as it starts. PC-AU-0199: the Interface Scale preference (Preferences >
Interface) zooms the real window's web view through the shell and the shell keeps the factor in window.json; the View > Interface
Zoom commands are in test_linux_desktop_scale.py."""
import json
import time
from pathlib import Path

from e2e.desktop.support import command_of


def display_file(app) -> Path:
    return app.home / ".config" / "formvis" / "display-server"


def preference(app, label: str, value: str) -> dict:
    """Sets one select of the open Preferences dialog; the field's key is its label followed by the shown choice."""
    shown = app.ok("ui_dialog", {"action": "list"})
    key = next(f["field"] for d in shown["dialogs"] for f in d["fields"] if f["field"].startswith(label))
    return app.ok("ui_dialog", {"action": "fields", "fields": {key: value}})


def open_preferences(app) -> None:
    app.ok("run_command", {"id": "settings"})
    app.wait_for(lambda: app.ok("ui_dialog", {"action": "list"})["dialogs"], timeout=20, what="Preferences")


def web_environment(app) -> dict:
    pid = app.wait_for(app.web_process, timeout=30, what="the web process")
    raw = (Path("/proc") / str(pid) / "environ").read_bytes().split(b"\0")
    return dict(item.decode(errors="replace").split("=", 1) for item in raw if b"=" in item)


def test_the_display_server_choice_is_written_for_the_next_launch(fresh):
    fresh.launch()
    assert not display_file(fresh).exists() or display_file(fresh).read_text() == "auto"
    open_preferences(fresh)
    for choice, kept in (("X11", "x11"), ("Wayland", "wayland"), ("Automatic", "auto")):
        preference(fresh, "Linux Display Server", choice)
        fresh.wait_for(lambda: display_file(fresh).exists() and display_file(fresh).read_text() == kept, timeout=20, what=f"{kept} kept in display-server")


def test_x11_is_read_at_start_and_turns_off_the_dma_buf_renderer(fresh):
    display_file(fresh).parent.mkdir(parents=True, exist_ok=True)
    display_file(fresh).write_text("x11")
    fresh.launch()
    env = web_environment(fresh)
    assert env.get("WEBKIT_DISABLE_DMABUF_RENDERER") == "1", env.get("WEBKIT_DISABLE_DMABUF_RENDERER")
    assert env.get("GDK_BACKEND") == "x11"


def test_automatic_sets_nothing(fresh):
    display_file(fresh).parent.mkdir(parents=True, exist_ok=True)
    display_file(fresh).write_text("auto")
    fresh.launch()
    assert "WEBKIT_DISABLE_DMABUF_RENDERER" not in web_environment(fresh)


def test_a_backend_set_in_the_environment_is_never_replaced(fresh):
    display_file(fresh).parent.mkdir(parents=True, exist_ok=True)
    display_file(fresh).write_text("wayland")
    fresh.launch()
    env = web_environment(fresh)
    assert env.get("GDK_BACKEND") == "x11"
    assert "WEBKIT_DISABLE_DMABUF_RENDERER" not in env
    assert fresh.toplevel() is not None


def body_width(app) -> float:
    if not app.ok("ping")["documents"]:
        app.ok("new_document", {"width": 64, "height": 64})
    return app.call("ui_inspect", {"selector": "body"})["structuredContent"]["elements"][0]["width"]


def kept_zoom(app) -> float:
    try:
        return json.loads(app.config_file.read_text()).get("zoom", 0)
    except (OSError, ValueError):
        return 0


def test_interface_scale_in_preferences_zooms_the_window_and_the_shell_keeps_it(fresh):
    fresh.launch()
    base = body_width(fresh)
    open_preferences(fresh)
    preference(fresh, "Interface Scale", "150%")
    fresh.wait_for(lambda: abs(kept_zoom(fresh) - 1.5) < 0.02, timeout=20, what="window.json to keep 1.5")
    zoomed = fresh.wait_for(lambda: (w := body_width(fresh)) < base * 0.8 and w, timeout=20, what="the page to lay out narrower in CSS pixels")
    assert abs(zoomed * 1.5 - base) < base * 0.03
    preference(fresh, "Interface Scale", "80%")
    fresh.wait_for(lambda: abs(kept_zoom(fresh) - 0.8) < 0.02, timeout=20, what="window.json to keep 0.8")
    fresh.wait_for(lambda: body_width(fresh) > base * 1.2, timeout=20, what="the page to lay out wider")
    preference(fresh, "Interface Scale", "100%")
    fresh.wait_for(lambda: abs(kept_zoom(fresh) - 1.0) < 1e-6, timeout=20, what="window.json to keep 1")
    fresh.wait_for(lambda: abs(body_width(fresh) - base) < 3, timeout=20, what="100 percent again")


def test_interface_scale_auto_leaves_a_normal_display_at_100_percent(fresh):
    fresh.launch()
    base = body_width(fresh)
    open_preferences(fresh)
    preference(fresh, "Interface Scale", "150%")
    fresh.wait_for(lambda: abs(kept_zoom(fresh) - 1.5) < 0.02, timeout=20, what="window.json to keep 1.5")
    preference(fresh, "Interface Scale", "Auto (follow the display)")
    fresh.wait_for(lambda: abs(kept_zoom(fresh) - 1.0) < 1e-6, timeout=20, what="Auto to return a 1600 pixel display to 100 percent")
    fresh.wait_for(lambda: abs(body_width(fresh) - base) < 3, timeout=20, what="the page at its first width")

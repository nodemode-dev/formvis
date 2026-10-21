"""Interface zoom in the real Linux window: the View commands zoom the web view itself and the shell keeps the factor in window.json.
The page reads its own choice from localStorage, which belongs to the stand-in engine's port and so starts empty on each launch here;
the restore across launches is therefore not asserted."""
import json


def width_of_body(app) -> float:
    if not app.ok("ping")["documents"]:
        app.ok("new_document", {"width": 64, "height": 64})
    found = app.call("ui_inspect", {"selector": "body"})
    assert not found.get("isError"), found
    return found["structuredContent"]["elements"][0]["width"]


def kept_zoom(app) -> float:
    return json.loads(app.config_file.read_text()).get("zoom", 0) if app.config_file.exists() else 0


def test_interface_zoom_in_zooms_the_web_view_keeps_the_factor_and_reset_returns_to_100(fresh):
    fresh.launch()
    base = width_of_body(fresh)
    fresh.ok("run_command", {"id": "interface-zoom-in"})
    fresh.wait_for(lambda: kept_zoom(fresh) > 1.05, timeout=20, what="window.json to keep the zoom")
    assert abs(kept_zoom(fresh) - 1.1) < 0.02
    zoomed = fresh.wait_for(lambda: (w := width_of_body(fresh)) < base * 0.97 and w, timeout=20, what="the page to lay out narrower in CSS pixels")
    assert abs(zoomed * 1.1 - base) < base * 0.03
    fresh.ok("run_command", {"id": "interface-zoom-out"})
    fresh.wait_for(lambda: abs(width_of_body(fresh) - base) < 3, timeout=20, what="100 percent by one step out")
    fresh.ok("run_command", {"id": "interface-zoom-out"})
    fresh.wait_for(lambda: width_of_body(fresh) > base * 1.05, timeout=20, what="90 percent")
    assert abs(kept_zoom(fresh) - 0.9) < 0.02
    fresh.ok("run_command", {"id": "interface-zoom-reset"})
    fresh.wait_for(lambda: abs(width_of_body(fresh) - base) < 3, timeout=20, what="100 percent again")
    fresh.wait_for(lambda: abs(kept_zoom(fresh) - 1.0) < 1e-6, timeout=20, what="the reset kept")

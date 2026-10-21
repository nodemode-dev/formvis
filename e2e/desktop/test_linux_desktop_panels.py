"""Floating panels in the real window (1.92.2): panel-float lifts a docked panel out of its column into a floating frame on the page,
panel-dock puts it back, and a click on the frame's own Dock button does the same."""
from e2e.desktop.test_linux_desktop_shell import alone, centre, inspect  # noqa: F401  (alone is a fixture)


def floating(app, panel: str) -> list[dict]:
    return [f for f in inspect(app, f'.cv-float-panel[data-panel="{panel}"]') if f["visible"]]


def test_a_panel_floats_out_of_the_dock_and_docks_back(desktop):
    desktop.ok("new_document", {"width": 120, "height": 90})
    assert not floating(desktop, "layers"), "the Layers panel starts docked"
    ran = desktop.ok("run_command", {"id": "panel-float", "params": {"panel": "layers", "x": 260, "y": 140, "w": 300, "h": 320}})
    assert ran["result"]["message"]
    frame = desktop.wait_for(lambda: floating(desktop, "layers"), timeout=20, what="the Layers panel to float")
    assert len(frame) == 1
    box = frame[0]
    assert box["width"] >= 200 and box["height"] >= 100
    assert abs(box["x"] - 260) <= 4 and abs(box["y"] - 140) <= 4, f"the frame stands where it was asked to: {box}"
    window = desktop.ok("ui_window", {"action": "size"})
    assert box["x"] + box["width"] <= window["width"] + 1 and box["y"] + box["height"] <= window["height"] + 1, "the frame is inside the window"
    assert inspect(desktop, '.cv-float-panel[data-panel="layers"] .cv-float-dock'), "the frame has its Dock back button"
    desktop.screenshot("panel-floating")

    desktop.ok("run_command", {"id": "panel-dock", "params": {"panel": "layers"}})
    desktop.wait_for(lambda: not floating(desktop, "layers"), timeout=20, what="the Layers panel to dock back")
    desktop.ok("ping")


def test_the_dock_button_on_a_floating_frame_docks_it_with_a_real_click(alone):
    app = alone
    app.launch()
    app.ok("new_document", {"width": 120, "height": 90})
    app.ok("run_command", {"id": "panel-float", "params": {"panel": "layers", "x": 300, "y": 160, "w": 300, "h": 300}})
    app.wait_for(lambda: floating(app, "layers"), timeout=20, what="the Layers panel to float")
    button = inspect(app, '.cv-float-panel[data-panel="layers"] .cv-float-dock')[0]
    window = app.toplevel()
    x, y = centre(button)
    gx, gy = window.geometry()[:2]
    for _attempt in range(3):
        window.click(gx + x, gy + y)
        try:
            app.wait_for(lambda: not floating(app, "layers"), timeout=8, what="the click on Dock back to dock the panel")
            break
        except TimeoutError:
            continue
    assert not floating(app, "layers")
    app.wait_for(lambda: not app.call("ping", timeout=30).get("isError"), timeout=90, what="the window to answer after the click")

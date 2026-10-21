"""The monitor profile is read again when the window moves (ui/colour.ts listens to the shell's move event), so a
window dragged to another screen draws through that screen's profile. Xvfb has a single output, so GTK sees one screen
here: the test changes the root window's `_ICC_PROFILE` while the window is still and checks that a move alone makes
the page pick it up. Which X property each screen reads (`_ICC_PROFILE_<n>`) is checked by display.rs's own test."""
import time
from pathlib import Path

import pytest

Xlib = pytest.importorskip("Xlib.display")
FX = Path(__file__).resolve().parents[1] / "fixtures"


KEEP: dict = {}


def set_profile(display_name: str, file: str) -> None:
    # The connection stays open: Xvfb resets, dropping root properties, when its last client leaves.
    d = KEEP.get(display_name) or KEEP.setdefault(display_name, Xlib.Display(display_name))
    root = d.screen().root
    root.change_property(d.intern_atom("_ICC_PROFILE"), d.intern_atom("CARDINAL"), 8, (FX / file).read_bytes())
    d.sync()


def monitor_line(app) -> str:
    app.ok("run_command", {"id": "proof-setup"})
    found = app.wait_for(lambda: [e["text"] for e in app.call("ui_inspect", {"selector": ".cv-scrim:not([hidden]) .cv-dialog-body > p.cv-note", "limit": 50})["structuredContent"]["elements"] if "from X11" in (e.get("text") or "")], timeout=20, what="the monitor line in Proof Setup")
    app.ok("ui_dialog", {"action": "close"})
    return found[0]


def test_moving_the_window_reads_the_monitor_profile_again(fresh):
    set_profile(fresh.xserver.display, "icc_srgb.icc")
    try:
        fresh.launch()
        fresh.ok("new_document", {"width": 64, "height": 64})
        window = fresh.toplevel()
        window.move_resize(100, 100, 1200, 800)
        time.sleep(1.5)
        assert "sRGB built-in" in monitor_line(fresh)
        set_profile(fresh.xserver.display, "icc_lab.icc")
        time.sleep(1.5)
        assert "sRGB built-in" in monitor_line(fresh), "without a move or focus the page keeps the profile it read"
        window.move_resize(300, 120, 1200, 800)
        fresh.wait_for(lambda: "Lab identity built-in" in monitor_line(fresh), timeout=30, what="the profile to be read again after the move")
    finally:
        set_profile(fresh.xserver.display, "icc_srgb.icc")

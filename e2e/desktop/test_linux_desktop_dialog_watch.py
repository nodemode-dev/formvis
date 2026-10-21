"""A file dialog that never comes back (a desktop file portal that fails the request) does not leave the window
waiting: after a while a notice offers Stop waiting, which answers the call as cancelled and shows the shell's dialog
report (io/disk.ts watched and dialogWatch, main.rs file_dialog_report)."""
import subprocess
import sys
import time
from pathlib import Path

import pytest

pytest.importorskip("jeepney")
PORTAL = Path(__file__).resolve().parent / "fake_portal.py"


def toasts(app) -> list[dict]:
    return app.call("ui_inspect", {"selector": "#toast-root .cv-toast", "limit": 10})["structuredContent"]["elements"]


def test_a_failing_portal_gives_a_way_out_and_a_report(fresh, tmp_path):
    address = fresh.start_bus()
    portal = subprocess.Popen([sys.executable, str(PORTAL), address], stdout=open(tmp_path / "portal.log", "w"), stderr=subprocess.STDOUT)
    try:
        fresh.launch(extra_env={"DBUS_SESSION_BUS_ADDRESS": address, "GTK_USE_PORTAL": "1"})
        fresh.ok("new_document", {"width": 64, "height": 64})
        started = time.monotonic()
        fresh.call("run_command", {"id": "place-linked"}, timeout=8)
        fresh.wait_for(lambda: "OpenFile" in (tmp_path / "portal.log").read_text(), timeout=20, what="the portal to be asked")
        assert not [t for t in toasts(fresh) if "has not come back" in (t.get("text") or "")], "no notice while the wait is short"
        slow = fresh.wait_for(lambda: [t for t in toasts(fresh) if "has not come back" in (t.get("text") or "")], timeout=40, what="the slow-dialog notice")
        assert time.monotonic() - started >= 15
        box = fresh.call("ui_inspect", {"selector": "#toast-root .cv-toast-action", "limit": 5})["structuredContent"]["elements"]
        stop = [b for b in box if b.get("text") == "Stop waiting"][0]
        window = fresh.toplevel()
        x, y, _, _ = window.geometry()
        window.click(x + int(stop["x"] + stop["width"] / 2), y + int(stop["y"] + stop["height"] / 2))
        report = fresh.wait_for(lambda: [t["text"] for t in toasts(fresh) if (t.get("text") or "").startswith("File dialog report:")], timeout=20, what="the dialog report")
        assert "file portal: used" in report[0]
        assert not [t for t in toasts(fresh) if "has not come back" in (t.get("text") or "")]
        assert slow
        fresh.ok("ping")                                     # the window answers; nothing is left waiting on the page side
    finally:
        portal.terminate()

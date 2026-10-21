"""PC-IO-0204: the desktop app's Save As and Open are the system's own file dialogs (GTK here, no portal), and they do
not block the window: while a dialog is open the page still answers the bridge. A path typed into the dialog is where
the project is written, and Open reads the file chosen in its dialog."""
import ctypes
import json
import time

from e2e.desktop.support import XWindow


def type_text(win: XWindow, text: str) -> None:
    names = {"/": "slash", ".": "period", "-": "minus"}
    win.keys(*[names.get(c, c) for c in text])


def documents(app) -> list[dict]:
    out = app.call("get_document")
    return [] if out.get("isError") else json.loads(app.text_of(out)).get("documents", [])


def dialog(app, title: str) -> XWindow:
    found = app.wait_for(lambda: XWindow.find(app.xserver.display, title), timeout=30, what=f"the {title} dialog")
    time.sleep(2)                                                       # mapped and its name field focused before typing
    found.focus()
    found.lib.XSetInputFocus.argtypes = [ctypes.c_void_p, ctypes.c_ulong, ctypes.c_int, ctypes.c_ulong]
    found.lib.XSetInputFocus(found.display, found.window, 1, 0)         # no window manager here: give the dialog the keyboard
    found.lib.XSync(found.display, 0)
    time.sleep(0.5)
    return found


def test_save_as_and_open_use_the_system_dialog_without_blocking_the_window(fresh):
    folder = fresh.workdir / "saved"
    folder.mkdir(parents=True, exist_ok=True)
    target = folder / "dialogtest.fvd"
    assert all(c.islower() or c.isdigit() or c in "/.-" for c in str(target)), target
    fresh.launch()
    fresh.ok("new_document", {"width": 64, "height": 48})

    fresh.call("run_command", {"id": "save-as"}, timeout=10)
    save = dialog(fresh, "Save As")
    started = time.monotonic()
    answer = fresh.call("ping", timeout=10)
    assert answer.get("isError") is not True, answer                    # the page answers while the dialog is open
    assert time.monotonic() - started < 10
    save.focus()
    save.keys("Control_L+a")
    type_text(save, str(target))
    save.keys("Return")
    fresh.wait_for(lambda: target.exists() and target.stat().st_size > 0, timeout=60, what="the project written where the dialog said")

    other = folder / "dialogcopy.fvd"                                   # a different path, so Open makes a new document
    other.write_bytes(target.read_bytes())                              # rather than switching to the one already open
    target = other
    before = len(documents(fresh))
    fresh.call("run_command", {"id": "open"}, timeout=10)              # File > Open, then Browse... in the Open Project dialog
    browse = fresh.wait_for(lambda: [b for b in fresh.call("ui_inspect", {"selector": "[data-from='file']", "limit": 5})["structuredContent"]["elements"] if b.get("visible")], timeout=20, what="the Browse button")[0]
    window = fresh.toplevel()
    x, y, _, _ = window.geometry()
    window.click(x + int(browse["x"] + browse["width"] / 2), y + int(browse["y"] + browse["height"] / 2))
    picker = dialog(fresh, "Open")
    assert fresh.call("ping", timeout=10).get("isError") is not True
    picker.focus()
    picker.keys("slash")                                                # a slash opens the dialog's location field
    time.sleep(1)
    type_text(picker, str(target)[1:])
    time.sleep(1)
    picker.keys("Return")
    found = fresh.wait_for(lambda: len(documents(fresh)) > before and documents(fresh), timeout=60, what="the chosen project to open")
    assert any(d["width"] == 64 and d["height"] == 48 for d in found), found

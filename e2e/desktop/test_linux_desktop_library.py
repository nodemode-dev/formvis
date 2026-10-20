"""A project saved with File > Save As in the real window (the system's save panel, driven with real key presses) lands in the
library folder, is listed in File > Open Recent, and both survive an app restart: the list is read back from the window's
storage (the stub keeps one address across the restart so the page's storage origin is the same) and the entry reopens the project."""
import json
import socket
import threading
import urllib.request
from pathlib import Path

import pytest

from e2e.desktop import support
from e2e.desktop.test_linux_desktop_open import documents


def free_port() -> int:
    with socket.socket() as sock:
        sock.bind(("127.0.0.1", 0))
        return sock.getsockname()[1]


def library_folder() -> Path:
    with urllib.request.urlopen(f"http://127.0.0.1:{support.ENGINE_PORT}/api/projects/folder", timeout=10) as r:
        return Path(json.load(r)["folder"])


def recent_labels(app) -> list[str]:
    out = app.call("ui_menu_list", {"path": "File", "depth": 3})
    text = app.text_of(out)
    return [item["label"] for item in _items(json.loads(text.split(": ", 1)[1])) if item.get("id", "").startswith("recent-") and item.get("label")]


def _items(tree):
    for item in tree if isinstance(tree, list) else []:
        yield item
        yield from _items(item.get("items"))


def test_save_as_into_the_library_then_recent_files_and_the_project_after_a_restart(fresh):
    port = free_port()
    name = f"desktop-e2e-{port}"
    env = {"FORMVIS_STUB_PORT": str(port)}
    saved = library_folder() / f"{name}.fvd"
    try:
        fresh.launch(extra_env=env)
        fresh.ok("new_document", {"width": 90, "height": 70})
        fresh.ok("fill", {"color": "#3377cc"})
        assert recent_labels(fresh) == [] or not any(name in label for label in recent_labels(fresh))

        answer: dict = {}
        asking = threading.Thread(target=lambda: answer.update(fresh.call("ui_menu_invoke", {"path": "File > Save As..."}, timeout=90)))
        asking.start()
        panel = fresh.wait_for(lambda: support.XWindow.find(fresh.xserver.display, "Save As"), timeout=40, what="the save panel")
        panel.focus()
        fresh.screenshot("save-panel")
        panel.keys("Control_L+a")
        for char in name:
            panel.keys("minus" if char == "-" else char)
        panel.keys("Return")
        asking.join(timeout=60)
        fresh.wait_for(lambda: saved.exists(), timeout=40, what=f"{saved} to be written")
        assert saved.stat().st_size > 0
        fresh.wait_for(lambda: any(name in label for label in recent_labels(fresh)), timeout=20, what="Open Recent to list the saved project")

        assert fresh.quit(), "the window's own Quit did not end the app"
        fresh.launch(extra_env=env)
        labels = fresh.wait_for(lambda: [label for label in recent_labels(fresh) if name in label], timeout=40, what="Open Recent after the restart")
        assert labels[0].startswith("1. ") and f"{name}.fvd" in labels[0]
        fresh.ok("run_command", {"id": "recent-0"})
        found = fresh.wait_for(lambda: documents(fresh), timeout=60, what="the recent project to open")
        assert (found[0]["width"], found[0]["height"]) == (90, 70)
        assert name in found[0]["name"]
    finally:
        saved.unlink(missing_ok=True)
        for leftover in saved.parent.glob(f"{name}*"):
            if leftover.is_file():
                leftover.unlink(missing_ok=True)

import io
import os
import time

import pytest
from fastapi.testclient import TestClient
from PIL import Image


@pytest.fixture(autouse=True)
def fresh_secrets(monkeypatch):
    from app.services import secrets

    monkeypatch.setattr(secrets, "_held", {})
    monkeypatch.setattr(secrets, "_asked", set())


@pytest.fixture()
def client(tmp_path, monkeypatch):
    monkeypatch.setenv("FORMVIS_DATA_DIR", str(tmp_path))
    from app.core import window_key
    from app.main import app

    with TestClient(app, base_url="http://127.0.0.1:8190", headers={window_key.HEADER: window_key.KEY}) as c:
        yield c


@pytest.fixture()
def bare(tmp_path, monkeypatch):
    monkeypatch.setenv("FORMVIS_DATA_DIR", str(tmp_path))
    from app.main import app

    with TestClient(app, base_url="http://127.0.0.1:8190") as c:
        yield c


def need_model(model: str, download: bool = False) -> None:
    from app.localgen import jobs, model_manager

    if model_manager.ready(model):
        return
    if not (download and os.environ.get("FORMVIS_TEST_DOWNLOAD_MODELS") == "1"):
        pytest.skip(f"needs the {model} model in the data folder; set FORMVIS_TEST_DOWNLOAD_MODELS=1 to fetch it (network)")
    job = model_manager.start_download(model)
    state = {}
    for _ in range(1200):
        state = jobs.status(job["job_id"])
        if state["status"] in ("done", "error", "failed"):
            break
        time.sleep(0.25)
    if not model_manager.ready(model):
        pytest.skip(f"the {model} model could not be downloaded: {state.get('status')}")


def png_bytes(size=(8, 6), color=(200, 100, 50, 255)) -> bytes:
    buf = io.BytesIO()
    Image.new("RGBA", size, color).save(buf, "PNG")
    return buf.getvalue()


STAND_IN_SHELL = """#!/bin/sh
script=""
while [ $# -gt 0 ]; do
  if [ "$1" = "-c" ]; then shift; script="$1"; fi
  shift
done
if [ -f "$HOME/.shell-path" ]; then PATH="$(cat "$HOME/.shell-path"):$PATH"; export PATH; fi
exec /bin/sh -c "$script"
"""
STAND_IN = """#!/bin/sh
if [ "$1" = "--version" ]; then echo "9.9.9 (stand-in)"; exit 0; fi
echo "stand-in started"
read line
"""


def stand_in(path, text=STAND_IN):
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(text)
    path.chmod(0o755)
    return path


@pytest.fixture()
def dock_start(tmp_path, monkeypatch):
    """What an app started from the Dock has: the system's four folders on PATH, here with a made-up home, a stand-in
    login shell whose PATH gains what the home's .shell-path file names, and no system install folders."""
    from app.services import agent_lookup, claude_code

    home = tmp_path / "home"
    home.mkdir()
    monkeypatch.setenv("HOME", str(home))
    monkeypatch.setenv("SHELL", str(stand_in(tmp_path / "zsh", STAND_IN_SHELL)))
    monkeypatch.setenv("PATH", "/usr/bin:/bin:/usr/sbin:/sbin")
    for name in ("FORMVIS_CLAUDE_BIN", "FORMVIS_CODEX_BIN", "FORMVIS_CURSOR_BIN", "FORMVIS_ANTIGRAVITY_BIN"):
        monkeypatch.delenv(name, raising=False)
    monkeypatch.setattr(agent_lookup, "system_folders", lambda platform=None: [])
    monkeypatch.setitem(claude_code._cache, "value", None)
    agent_lookup.forget()
    yield home
    agent_lookup.forget()


def manifest(width=8, height=6, layers=None) -> dict:
    return {"format": "com.nodemode.formvis", "version": 1, "width": width, "height": height, "layers": layers or []}

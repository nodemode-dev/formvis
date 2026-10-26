import json
import os
import socket
import subprocess
import sys
import time
import urllib.request
from pathlib import Path

import pytest

from app import __version__

BACKEND = Path(__file__).resolve().parents[1]


def free_port():
    with socket.socket() as s:
        s.bind(("127.0.0.1", 0))
        return s.getsockname()[1]


def get_json(url):
    with urllib.request.urlopen(url, timeout=2.0) as r:
        return r.status, json.loads(r.read().decode("utf-8"))


@pytest.fixture(scope="module")
def engine(tmp_path_factory):
    root = tmp_path_factory.mktemp("boot")
    data, home = root / "data", root / "home"
    data.mkdir()
    home.mkdir()
    port = free_port()
    env = {**os.environ, "FORMVIS_DATA_DIR": str(data), "FORMVIS_PORT": str(port), "HOME": str(home), "USERPROFILE": str(home), "FORMVIS_OPEN_WINDOW": "0"}
    proc = subprocess.Popen([sys.executable, str(BACKEND / "formvis_engine.py")], cwd=BACKEND, env=env, stdout=subprocess.PIPE, stderr=subprocess.STDOUT)
    base = f"http://127.0.0.1:{port}"
    deadline = time.monotonic() + 60
    ready = False
    while time.monotonic() < deadline and proc.poll() is None and not ready:
        try:
            ready = get_json(base + "/api/health")[0] == 200
        except OSError:
            time.sleep(0.25)
    if not ready:
        proc.kill()
        raise RuntimeError("engine did not answer /api/health within 60 s:\n" + proc.communicate(timeout=5)[0].decode("utf-8", "replace")[-4000:])
    yield {"base": base, "port": port, "data": data, "home": home, "proc": proc}
    proc.terminate()
    try:
        proc.wait(timeout=10)
    except subprocess.TimeoutExpired:
        proc.kill()


def test_engine_boots_on_a_free_port_with_an_empty_data_folder(engine):
    assert get_json(engine["base"] + "/api/health")[0] == 200
    assert engine["proc"].poll() is None


def test_engine_reports_the_repository_version(engine):
    status, body = get_json(engine["base"] + "/api/version")
    assert status == 200 and body["version"] == __version__


def test_engine_announces_its_port_in_the_data_folder_it_was_given(engine):
    deadline = time.monotonic() + 10
    announced = engine["data"] / "engine.port"
    while not announced.is_file() and time.monotonic() < deadline:
        time.sleep(0.2)
    record = json.loads(announced.read_text(encoding="utf-8"))
    assert record["port"] == engine["port"] and record["pid"] == engine["proc"].pid


def test_engine_creates_nothing_in_the_home_folder(engine):
    assert list(engine["home"].iterdir()) == []

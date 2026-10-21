# covengine: where the engine keeps its data (switches, override, portable, legacy, default) and freeing helper models on request.
import os
import time

from app.core import config, runtime
from app.localgen import sessions

CLEAN = ("FORMVIS_DATA_DIR", "FORMVIS_PORTABLE", "FORMVIS_PORT")


def fresh(monkeypatch, tmp_path):
    monkeypatch.setattr(os, "environ", os.environ.copy())
    for name in CLEAN:
        monkeypatch.delenv(name, raising=False)
    home = tmp_path / "home"
    home.mkdir(exist_ok=True)
    monkeypatch.setenv("HOME", str(home))
    monkeypatch.setenv("XDG_DATA_HOME", "")
    beside = tmp_path / "engine"
    beside.mkdir(exist_ok=True)
    monkeypatch.setattr(config, "BACKEND_DIR", beside)
    return home, beside


def test_data_folder_resolution_order(monkeypatch, tmp_path):
    home, beside = fresh(monkeypatch, tmp_path)
    assert config.data_dir() == home / ".local" / "share" / "formvis" and config.data_dir_source() == "default"
    (home / "Formvis").mkdir()
    assert config.data_dir() == home / "Formvis" and config.data_dir_source() == "default"
    monkeypatch.setenv("FORMVIS_PORTABLE", "1")
    assert config.data_dir() == beside / "FormvisData" and config.data_dir_source() == "portable"
    monkeypatch.setenv("FORMVIS_DATA_DIR", str(tmp_path / "chosen"))
    assert config.data_dir() == tmp_path / "chosen" and config.data_dir_source() == "override"
    assert (tmp_path / "chosen").is_dir()


def test_user_data_dir_and_portable_switches_reach_the_config(monkeypatch, tmp_path):
    fresh(monkeypatch, tmp_path)
    rest = runtime.apply_switches(["--user-data-dir", str(tmp_path / "a"), "--other", "--portable", "--port=9"])
    assert rest == ["--other"] and runtime.switches()["portable"] is True
    assert config.data_dir() == tmp_path / "a" and config.data_dir_source() == "override"
    monkeypatch.delenv("FORMVIS_DATA_DIR")
    runtime.apply_switches([f"--user-data-dir={tmp_path / 'b'}"])
    assert config.data_dir() == tmp_path / "b"


def test_capabilities_report_the_folder_and_why(client):
    caps = client.get("/api/capabilities").json()
    assert caps["dataDirSource"] == "override" and caps["dataDir"] == str(config.data_dir())


def test_helper_models_are_held_at_most_two_and_freed_on_request(client):
    sessions.release_all()
    for key in ("depth", "seg", "lama"):
        sessions.get(key, lambda key=key: object())
    assert client.get("/api/helpers").json() == {"held": ["seg", "lama"]}
    freed = client.post("/api/helpers/free").json()
    assert freed == {"freed": ["seg", "lama"], "held": []}
    assert client.get("/api/helpers").json() == {"held": []}


def test_an_idle_helper_model_is_released_after_ten_minutes(client):
    sessions.release_all()
    sessions.get("depth", lambda: object())
    assert sessions.release_idle(time.monotonic() + 60) == []
    assert sessions.release_idle(time.monotonic() + sessions.IDLE_SECONDS + 1) == ["depth"]
    assert client.get("/api/helpers").json() == {"held": []}

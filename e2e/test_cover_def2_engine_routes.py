# D35 desktop exports accepted by name, D36 and D39 sky and MoGe-2 are installable models, D42 mirror setting reachable.
# Uses an in-process TestClient on a scratch FORMVIS_DATA_DIR; the shared engine and its sources.json are not touched.
import sys
from pathlib import Path

import pytest
from fastapi.testclient import TestClient

if str(Path(__file__).resolve().parent.parent / "backend") not in sys.path:
    sys.path.insert(0, str(Path(__file__).resolve().parent.parent / "backend"))

NAMES = ["a.gif", "a.mp4", "a.zip", "a.psb", "a.ora", "a.hdr", "a.exr", "a.csv", "a.json", "a.cube", "a.atn", "a.ai", "a.abr", "a.asl", "a.sh", "a.webm"]


@pytest.fixture()
def scratch(tmp_path, monkeypatch):
    monkeypatch.setenv("FORMVIS_DATA_DIR", str(tmp_path))
    from app.main import app
    from app.localgen import model_manager as mm

    monkeypatch.setattr(mm, "ROOT", tmp_path / "models")
    monkeypatch.setattr(mm, "SOURCES_FILE", tmp_path / "models" / "sources.json")
    with TestClient(app) as c:
        yield c, mm, tmp_path


def export(c, name):
    return c.post("/api/io/export", files={"file": ("x", b"123")}, data={"name": name})


def test_d35_every_export_type_is_written_and_unsafe_names_are_refused(scratch):
    c, _, root = scratch
    for n in NAMES:
        r = export(c, n)
        assert r.status_code == 200, n
        assert Path(r.json()["path"]).read_bytes() == b"123"
    for n in ["a.exe", ".a.png", "a/b.exe", "noext"]:
        assert export(c, n).status_code == 400, n
    r = export(c, "../escape.png")
    assert Path(r.json()["path"]).parent == root / "Exports"


def test_d36_d39_sky_and_moge_are_models_the_app_can_install_and_remove(scratch):
    c, _, _ = scratch
    ids = {m["id"] for m in c.get("/api/models").json()}
    assert {"skyseg", "moge-2-vits-normal"} <= ids
    assert c.delete("/api/models/skyseg").status_code == 200
    assert c.delete("/api/models/moge-2-vits-normal").status_code == 200


def test_d42_mirror_setting_is_stored_listed_and_used_for_the_next_download(scratch):
    c, mm, root = scratch
    assert c.get("/api/models/sources").json() == {"models": {}}
    r = c.put("/api/models/yunet-face/source", json={"mode": "mirror", "url": "http://127.0.0.1:9/m"})
    assert r.status_code == 200
    assert (root / "models" / "sources.json").is_file()
    assert c.get("/api/models/sources").json()["models"]["yunet-face"]["url"] == "http://127.0.0.1:9/m"
    name, upstream = next(iter(mm.MODELS["yunet-face"]["files"].items()))
    assert mm.source_for("yunet-face", name, upstream) == "http://127.0.0.1:9/m/" + name
    assert c.put("/api/models/yunet-face/source", json={"mode": "upstream"}).status_code == 200
    assert mm.source_for("yunet-face", name, upstream) == upstream
    assert c.put("/api/models/yunet-face/source", json={"mode": "mirror"}).status_code == 400
    assert c.put("/api/models/yunet-face/source", json={"mode": "custom", "url": "ftp://x"}).status_code == 400
    assert c.put("/api/models/nope/source", json={"mode": "upstream"}).status_code == 404

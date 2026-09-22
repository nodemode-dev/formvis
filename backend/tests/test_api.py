import io
import json

from PIL import Image

from app import __version__
from tests.conftest import manifest, png_bytes


def test_health_version_and_capabilities(client):
    assert client.get("/api/health").status_code == 200
    assert client.get("/api/version").json()["version"] == __version__
    caps = client.get("/api/capabilities").json()
    assert caps["version"] == __version__ and "decode" in caps


def test_decode_png_reports_size_and_returns_png(client):
    r = client.post("/api/io/decode", files={"file": ("a.png", png_bytes((12, 7)), "image/png")})
    assert r.status_code == 200
    assert (r.headers["X-Width"], r.headers["X-Height"]) == ("12", "7")
    with Image.open(io.BytesIO(r.content)) as im:
        assert im.size == (12, 7) and im.format == "PNG"


def test_decode_rejects_garbage(client):
    r = client.post("/api/io/decode", files={"file": ("x.png", b"not an image", "image/png")})
    assert r.status_code == 415


def test_export_writes_and_never_overwrites(client, tmp_path):
    first = client.post("/api/io/export", files={"file": ("f", b"one", "image/png")}, data={"name": "shot.png"}).json()["path"]
    second = client.post("/api/io/export", files={"file": ("f", b"two", "image/png")}, data={"name": "shot.png"}).json()["path"]
    assert first != second
    assert open(first, "rb").read() == b"one" and open(second, "rb").read() == b"two"


def test_export_refuses_unsafe_names(client, tmp_path):
    for bad in [".hidden.png", "a.exe", "x" * 200 + ".png"]:
        r = client.post("/api/io/export", files={"file": ("f", b"1", "image/png")}, data={"name": bad})
        assert r.status_code == 400, bad
    r = client.post("/api/io/export", files={"file": ("f", b"1", "image/png")}, data={"name": "../../x.png"})
    assert r.status_code == 200
    assert r.json()["path"] == str(tmp_path / "Exports" / "x.png")


def test_project_save_list_open_delete_round_trip(client):
    layers = [{"id": "L1", "name": "Layer", "imageFile": "L1.png"}]
    r = client.post("/api/projects/save", data={"name": "Trip", "manifest": json.dumps(manifest(layers=layers))}, files=[("files", ("L1.png", png_bytes(), "image/png"))])
    assert r.status_code == 200, r.text
    assert [p["name"] for p in client.get("/api/projects").json()] == ["Trip"]
    opened = client.get("/api/projects/library/Trip")
    assert opened.status_code == 200
    assert opened.json()["manifest"]["layers"][0]["id"] == "L1"
    assert client.delete("/api/projects/library/Trip").status_code == 200
    assert client.get("/api/projects").json() == []


def test_project_validation_refuses_bad_manifests(client):
    cases = [
        {"format": "other", "version": 1, "width": 8, "height": 6, "layers": []},
        {**manifest(), "version": 99},
        {**manifest(), "width": 0},
        manifest(layers=[{"id": "A"}, {"id": "A"}]),
        manifest(layers=[{"id": "A", "imageFile": "../escape.png"}]),
        manifest(layers=[{"id": "A", "imageFile": "missing.png"}]),
    ]
    for m in cases:
        r = client.post("/api/projects/save", data={"name": "Bad", "manifest": json.dumps(m)})
        assert r.status_code == 422, m
    assert client.get("/api/projects").json() == []


def test_package_returns_a_zip(client):
    r = client.post("/api/projects/package", data={"manifest": json.dumps(manifest())})
    assert r.status_code == 200 and r.content[:2] == b"PK"


def test_background_unknown_engine_is_501(client):
    r = client.post("/api/ops/remove-background", files={"file": ("a.png", png_bytes(), "image/png")}, data={"method": "nonexistent"})
    assert r.status_code == 501

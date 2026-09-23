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


def test_encode_to_tiff_pdf_webp_and_avif(client):
    src = png_bytes((10, 6), (200, 100, 50, 128))
    for fmt, head, pil in [("tiff", (b"II*\x00", b"MM\x00*"), "TIFF"), ("pdf", (b"%PDF-",), None), ("webp", (b"RIFF",), "WEBP"), ("avif", None, "AVIF")]:
        r = client.post("/api/io/encode", files={"file": ("a.png", src, "image/png")}, data={"format": fmt, "quality": "80"})
        assert r.status_code == 200, (fmt, r.text)
        if head:
            assert r.content.startswith(head), fmt
        if pil:
            with Image.open(io.BytesIO(r.content)) as im:
                assert im.format == pil and im.size == (10, 6), fmt
                if fmt != "avif":
                    assert im.convert("RGBA").getpixel((3, 3))[3] == 128, fmt


def test_encode_refuses_unknown_formats_and_bad_images(client):
    assert client.post("/api/io/encode", files={"file": ("a.png", png_bytes(), "image/png")}, data={"format": "bmp"}).status_code == 415
    assert client.post("/api/io/encode", files={"file": ("a.png", b"junk", "image/png")}, data={"format": "tiff"}).status_code == 415
    ok = client.post("/api/io/export", files={"file": ("f", b"1", "image/tiff")}, data={"name": "out.tiff"})
    assert ok.status_code == 200


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


def test_projects_save_as_sny_and_older_sonny_files_still_work(client):
    from app.core import config
    import shutil

    layers = [{"id": "L1", "name": "Layer", "imageFile": "L1.png"}]
    body = {"name": "Old", "manifest": json.dumps(manifest(layers=layers))}
    img = [("files", ("L1.png", png_bytes(), "image/png"))]
    r = client.post("/api/projects/save", data=body, files=img)
    assert r.status_code == 200 and r.json()["path"].endswith("Old.sny"), r.text
    lib = config.projects_dir()
    # an older project, as saved before 0.90.0
    shutil.move(str(lib / "Old.sny"), str(lib / "Old.sonny"))
    assert [p["name"] for p in client.get("/api/projects").json()] == ["Old"]
    assert client.get("/api/projects/library/Old").status_code == 200
    # saving it again writes .sny and leaves one entry
    assert client.post("/api/projects/save", data=body, files=img).status_code == 200
    assert sorted(p.name for p in lib.iterdir() if p.stem == "Old") == ["Old.sny"]
    assert [p["name"] for p in client.get("/api/projects").json()] == ["Old"]
    # delete removes either
    shutil.copy(str(lib / "Old.sny"), str(lib / "Old.sonny"))
    assert client.delete("/api/projects/library/Old").status_code == 200
    assert client.get("/api/projects").json() == []
    assert client.post("/api/io/export", files={"file": ("f", b"1", "application/zip")}, data={"name": "x.sny"}).status_code == 200


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

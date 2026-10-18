import io
import json

from PIL import Image

from app import __version__
from app.core import legacy
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


def test_projects_save_as_fmv_and_older_files_still_work(client):   # the former extension from app.core.legacy
    from app.core import config
    import shutil

    layers = [{"id": "L1", "name": "Layer", "imageFile": "L1.png"}]
    body = {"name": "Old", "manifest": json.dumps(manifest(layers=layers))}
    img = [("files", ("L1.png", png_bytes(), "image/png"))]
    r = client.post("/api/projects/save", data=body, files=img)
    assert r.status_code == 200 and r.json()["path"].endswith("Old.fvd"), r.text
    lib = config.projects_dir()
    # an older project, as saved before 0.90.0
    shutil.move(str(lib / "Old.fvd"), str(lib / f"Old{legacy.PROJECT_EXTENSIONS[-1]}"))
    assert [p["name"] for p in client.get("/api/projects").json()] == ["Old"]
    assert client.get("/api/projects/library/Old").status_code == 200
    # saving it again writes .fvd and leaves one entry
    assert client.post("/api/projects/save", data=body, files=img).status_code == 200
    assert sorted(p.name for p in lib.iterdir() if p.stem == "Old") == ["Old.fvd"]
    assert [p["name"] for p in client.get("/api/projects").json()] == ["Old"]
    # delete removes either
    shutil.copy(str(lib / "Old.fvd"), str(lib / f"Old{legacy.PROJECT_EXTENSIONS[-1]}"))
    assert client.delete("/api/projects/library/Old").status_code == 200
    assert client.get("/api/projects").json() == []
    assert client.post("/api/io/export", files={"file": ("f", b"1", "application/zip")}, data={"name": "x.fmv"}).status_code == 200


def test_encode_embeds_an_icc_profile(client):
    import io as _io
    from PIL import Image, ImageCms

    icc = ImageCms.ImageCmsProfile(ImageCms.createProfile("sRGB")).tobytes()
    for fmt in ("tiff", "webp", "avif"):
        r = client.post("/api/io/encode", data={"format": fmt, "quality": "90"}, files={"file": ("a.png", png_bytes(), "image/png"), "icc": ("p.icc", icc, "application/vnd.iccprofile")})
        assert r.status_code == 200, (fmt, r.text)
        assert Image.open(_io.BytesIO(r.content)).info.get("icc_profile") == icc, fmt
    r = client.post("/api/io/encode", data={"format": "tiff"}, files={"file": ("a.png", png_bytes(), "image/png"), "icc": ("p.icc", b"not a profile", "application/vnd.iccprofile")})
    assert r.status_code == 415


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


def _canvasor_zip(version=1, fmt="com.nodemode.canvasor") -> bytes:
    """A small canvasor project laid out as NodeMode canvasor writes it: manifest.json and images/<id>.png."""
    import zipfile

    m = {"format": fmt, "version": version, "colorSpace": "sRGB", "resolution": 72, "documentID": "D0C", "width": 8, "height": 6,
         "layers": [{"id": "A", "name": "Base", "isVisible": True, "imageFile": "A.png",
                     "transform": {"origin": [0, 0], "size": [8, 6], "rotation": 0, "flipX": False, "flipY": False, "sampling": "High quality"}},
                    {"id": "B", "name": "Empty", "isVisible": True,
                     "transform": {"origin": [0, 0], "size": [8, 6], "rotation": 0, "flipX": False, "flipY": False, "sampling": "High quality"}}],
         "activeLayerID": "A"}
    buf = io.BytesIO()
    with zipfile.ZipFile(buf, "w") as z:
        z.writestr("manifest.json", json.dumps(m))
        z.writestr("images/A.png", png_bytes())
    return buf.getvalue()


def test_canvasor_projects_open_and_unknown_versions_are_refused(client):
    ok = client.post("/api/projects/import", files=[("files", ("My Scene.canvasor", _canvasor_zip(), "application/zip"))])
    assert ok.status_code == 200, ok.text
    body = ok.json()
    assert body["name"] == "My Scene"                                   # .canvasor is stripped from the name
    assert [l["name"] for l in body["manifest"]["layers"]] == ["Base", "Empty"]
    later = client.post("/api/projects/import", files=[("files", ("x.canvasor", _canvasor_zip(version=2), "application/zip"))])
    assert later.status_code == 422 and "format version 2" in later.json()["detail"]
    other = client.post("/api/projects/import", files=[("files", ("x.canvasor", _canvasor_zip(fmt="com.example.other"), "application/zip"))])
    assert other.status_code == 422 and "canvasor" in other.json()["detail"]


def test_generation_sizes_keep_the_shape_within_what_fal_takes():
    from app.services.generative import generation_size
    assert generation_size(1920, 1080) == (1440, 800)          # the longer side at most 1440, multiples of 32
    assert generation_size(100, 50) == (512, 256)              # the shorter side at least 256
    assert generation_size(1024, 1024) == (1024, 1024)
    assert generation_size(4000, 200) == (1440, 256)           # a thin strip: both limits hold


def test_generate_image_asks_for_a_key_and_a_prompt(client, monkeypatch):
    from app.services import generative
    monkeypatch.setattr(generative, "_key", lambda: (None, None))
    assert client.post("/api/generative/generate", data={"prompt": "a lighthouse"}).status_code == 428
    monkeypatch.setattr(generative, "_key", lambda: ("k", "env"))
    assert client.post("/api/generative/generate", data={"prompt": "  "}).status_code == 400

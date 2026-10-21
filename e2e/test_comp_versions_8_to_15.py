"""A .comp project at versions 8 to 15, written by hand from the format's published notes (not by formvis's own
serializer): folder opacity and guides (8), a Gaussian Blur adjustment (9), text with colour runs (10, 11), an OpenEXR
layer (13) and shape style fields (14, 15) open, with what formvis can map mapped and the pixels kept."""
import base64
import io
import json
import struct
import zipfile
import zlib

import pytest

A, B, C, D, E, F = (f"0000000{i}-0000-4000-8000-00000000000{i}" for i in range(1, 7))


def png(width: int, height: int, rgba: tuple[int, int, int, int]) -> bytes:
    row = b"\x00" + bytes(rgba) * width

    def chunk(kind: bytes, data: bytes) -> bytes:
        return struct.pack(">I", len(data)) + kind + data + struct.pack(">I", zlib.crc32(kind + data) & 0xFFFFFFFF)

    return b"\x89PNG\r\n\x1a\n" + chunk(b"IHDR", struct.pack(">IIBBBBB", width, height, 8, 6, 0, 0, 0)) + chunk(b"IDAT", zlib.compress(row * height)) + chunk(b"IEND", b"")


def exr(width: int, height: int, rgba: tuple[float, float, float, float]) -> bytes:
    OpenEXR = pytest.importorskip("OpenEXR")
    Imath = pytest.importorskip("Imath")
    import os
    import tempfile
    header = OpenEXR.Header(width, height)
    half = Imath.Channel(Imath.PixelType(Imath.PixelType.HALF))
    header["channels"] = {k: half for k in "RGBA"}
    import numpy as np
    planes = {k: np.full((height, width), v, np.float16).tobytes() for k, v in zip("RGBA", rgba)}
    fd, path = tempfile.mkstemp(suffix=".exr")
    os.close(fd)
    try:
        out = OpenEXR.OutputFile(path, header)
        out.writePixels(planes)
        out.close()
        return open(path, "rb").read()
    finally:
        os.unlink(path)


def place(w: int, h: int, x: int = 0, y: int = 0) -> dict:
    return {"origin": [x, y], "size": [w, h], "rotation": 0, "flipX": False, "flipY": False, "sampling": "High quality"}


def project(version: int) -> bytes:
    layers = [
        {"id": A, "name": "Background", "imageFile": f"{A}.png", "isVisible": True, "isGroup": False, "opacity": 1, "blendMode": "Normal", "transform": place(40, 30)},
        {"id": B, "name": "Folder", "isVisible": True, "isGroup": True, "opacity": 0.5, "blendMode": "Normal", "transform": place(40, 30)},
        {"id": C, "name": "Red", "parentID": B, "imageFile": f"{C}.png", "isVisible": True, "isGroup": False, "opacity": 1, "blendMode": "Normal", "transform": place(10, 10, 5, 5)},
        {"id": D, "name": "Soften", "isVisible": True, "isGroup": False, "opacity": 1, "blendMode": "Normal", "transform": place(40, 30),
         "adjustment": {"kind": "Gaussian Blur", "blurRadius": 3.5}},
        {"id": E, "name": "Title", "imageFile": f"{E}.png", "isVisible": True, "isGroup": False, "opacity": 1, "blendMode": "Normal", "transform": place(20, 8, 2, 2),
         "text": {"content": "Hi there", "fontName": "Helvetica", "fontSize": 12, "red": 0, "green": 0, "blue": 0, "alignment": "left",
                  "colorRuns": [{"location": 0, "length": 2, "red": 1, "green": 0, "blue": 0}],
                  **({"fontRuns": [{"location": 3, "length": 5, "fontName": "Helvetica-Bold"}]} if version >= 11 else {})}},
    ]
    files = {f"{A}.png": png(40, 30, (255, 255, 255, 255)), f"{C}.png": png(10, 10, (255, 0, 0, 255)), f"{E}.png": png(20, 8, (0, 0, 0, 255))}
    if version >= 13:
        layers.append({"id": F, "name": "Glow", "imageFile": f"{F}.exr", "isVisible": True, "isGroup": False, "opacity": 1, "blendMode": "Screen", "transform": place(6, 6, 30, 20)})
        files[f"{F}.exr"] = exr(6, 6, (2.0, 0.5, 0.25, 1.0))
    if version >= 15:
        layers[0]["shape"] = {"kind": "Line", "red": 0, "green": 0, "blue": 0, "lineWidth": 2, "start": [0, 0], "end": [1, 1], "lineStyle": "Dashed", "lineCap": "Round", "smoothing": True}
    manifest = {"format": "com.example.project", "version": version, "colorSpace": "sRGB", "documentID": "0C5E7A91-3B2D-4F6A-8E1C-9D0B7A6F5E4D",
                "width": 40, "height": 30, "resolution": 72, "activeLayerID": C, "layers": layers,
                "guides": [{"id": "G1", "axis": "vertical", "position": 12}, {"id": "G2", "axis": "horizontal", "position": 7}]}
    buf = io.BytesIO()
    with zipfile.ZipFile(buf, "w") as z:
        z.writestr("manifest.json", json.dumps(manifest))
        for name, data in files.items():
            z.writestr(f"images/{name}", data)
    return buf.getvalue()


def drop(page, data: bytes, name: str) -> None:
    page.evaluate("""([b64, name]) => {
      const bytes = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0)), dt = new DataTransfer();
      dt.items.add(new File([bytes], name, { type: '' }));
      const t = document.querySelector('.cv-stage') || document.body, r = t.getBoundingClientRect();
      for (const type of ['dragenter', 'dragover', 'drop']) t.dispatchEvent(new DragEvent(type, { bubbles: true, cancelable: true, dataTransfer: dt, clientX: r.left + 10, clientY: r.top + 10 }));
    }""", [base64.b64encode(data).decode(), name])


READ = """() => { const p = window.formvis.engine.current;
  return { name: p.name, layers: p.doc.layers.map((l) => ({ id: l.id, name: l.name, opacity: l.opacity, group: !!l.isGroup, parent: l.parentId ?? null,
    kind: l.adjustment?.kind ?? null, data: l.adjustment?.data ?? null, text: !!l.text, raster: l.raster ? [l.raster.width, l.raster.height] : null, blend: l.blend })),
    guides: (p.doc.guides ?? []).map((g) => [g.axis, g.at]) }; }"""


@pytest.mark.parametrize("version", [9, 11, 13, 15])
def test_a_later_comp_version_opens_with_its_new_fields_mapped(page, version):
    drop(page, project(version), f"Later {version}.comp")
    page.wait_for_function(f"window.formvis.engine.current?.name === 'Later {version}'", timeout=20000)
    got = page.evaluate(READ)
    by = {l["id"]: l for l in got["layers"]}
    assert by[B]["group"] and by[B]["opacity"] == 0.5 and by[C]["parent"] == B          # folder opacity (8)
    assert sorted(got["guides"]) == [["x", 12], ["y", 7]]                                  # guides (8)
    assert by[D]["kind"] == "gaussianBlur" and by[D]["data"]["radius"] == 3.5              # Gaussian Blur with its radius (9)
    assert by[E]["text"] is False and by[E]["raster"] == [20, 8]                           # letter runs kept as pixels (10, 11)
    if version >= 13:
        assert by[F]["raster"] == [6, 6] and by[F]["blend"] == "screen"                   # the OpenEXR layer, clipped to white (13)
        px = page.evaluate(f"""() => {{ const l = window.formvis.engine.current.doc.layers.find((x) => x.id === '{F}');
          return Array.from(l.raster.ctx.getImageData(3, 3, 1, 1).data); }}""")
        assert px[0] == 255 and 120 <= px[1] <= 135 and 60 <= px[2] <= 70 and px[3] == 255, px


def test_version_8_guides_and_folder_opacity(page):
    data = project(9)
    raw = zipfile.ZipFile(io.BytesIO(data))
    manifest = json.loads(raw.read("manifest.json"))
    manifest["version"] = 8
    manifest["layers"] = [r for r in manifest["layers"] if r["id"] not in (D, E)]
    buf = io.BytesIO()
    with zipfile.ZipFile(buf, "w") as z:
        z.writestr("manifest.json", json.dumps(manifest))
        for n in raw.namelist():
            if n.startswith("images/") and E not in n:
                z.writestr(n, raw.read(n))
    drop(page, buf.getvalue(), "Later 8.comp")
    page.wait_for_function("window.formvis.engine.current?.name === 'Later 8'", timeout=20000)
    got = page.evaluate(READ)
    by = {l["id"]: l for l in got["layers"]}
    assert by[B]["opacity"] == 0.5 and sorted(got["guides"]) == [["x", 12], ["y", 7]]


def test_version_16_is_still_refused(page):
    data = project(15)
    raw = zipfile.ZipFile(io.BytesIO(data))
    manifest = json.loads(raw.read("manifest.json"))
    manifest["version"] = 16
    buf = io.BytesIO()
    with zipfile.ZipFile(buf, "w") as z:
        z.writestr("manifest.json", json.dumps(manifest))
        for n in raw.namelist():
            if n != "manifest.json":
                z.writestr(n, raw.read(n))
    drop(page, buf.getvalue(), "Too New.comp")
    page.get_by_text("format version 16").first.wait_for(timeout=20000)

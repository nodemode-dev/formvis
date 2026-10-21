import base64
import functools
import gzip
import io
import struct

from PIL import Image
from playwright.sync_api import Error as PlaywrightError

DLG = ".cv-scrim:not([hidden]) .cv-dialog"
W, H = 6, 4


def steady(fn):
    @functools.wraps(fn)
    def run(page, tmp_path):
        for attempt in range(3):
            try:
                return fn(page, tmp_path)
            except PlaywrightError as err:
                if "context was destroyed" not in str(err) or attempt == 2:
                    raise
                page.wait_for_function("window.formvis && window.formvis.engine", timeout=60000)
    return run


def png(w, h, rgba):
    b = io.BytesIO()
    Image.new("RGBA", (w, h), rgba).save(b, "PNG")
    return b.getvalue()


def i32(n):
    return struct.pack("<i", n)


def lstr(s):
    raw = s.encode()
    return bytes([len(raw)]) + raw


def lib(lib_id, name):
    return b"\x0c" + i32(lib_id) + lstr(name)


def class_def(rec, obj_id, name, members, lib_id=2):
    out = bytes([rec]) + i32(obj_id) + lstr(name) + i32(len(members)) + b"".join(lstr(m[0]) for m in members)
    out += bytes(m[1] for m in members)
    for _, kind, extra in members:
        if kind == 0:
            out += bytes([extra])
    return out + i32(lib_id)


def string_rec(obj_id, s):
    return b"\x06" + i32(obj_id) + lstr(s)


def null_rec():
    return b"\x0a"


def ref_rec(obj_id):
    return b"\x09" + i32(obj_id)


def class_with_id(obj_id, meta_id):
    return b"\x01" + i32(obj_id) + i32(meta_id)


OBJ, STR, PRIM = 2, 1, 0
BOOL, BYTE, INT32, INT64 = 1, 2, 8, 9


def pixels(seed):
    out = bytearray()
    for y in range(H):
        for x in range(W):
            out += bytes([200 - seed * 50, 20 * y + seed, 10 * x + 5, 255])
    return bytes(out)


def block(raw, order):
    chunk = 48
    parts = [raw[i:i + chunk] for i in range(0, len(raw), chunk)]
    out = b"\x00" + struct.pack(">I", chunk)
    for no in order:
        gz = gzip.compress(parts[no])
        out += struct.pack(">II", no, len(gz)) + gz
    return out


def graph():
    g = struct.pack("<Bi", 0, 1) + i32(-1) + i32(1) + i32(0)
    g += lib(2, "PaintDotNet.Core")
    g += class_def(5, 1, "PaintDotNet.Document", [("layers", OBJ, None), ("first", OBJ, None), ("tag", OBJ, None)])
    g += b"\x10" + i32(3) + i32(2)
    props_meta = [("name", STR, None), ("visible", PRIM, BOOL), ("opacity", PRIM, BYTE), ("blendMode", OBJ, None), ("userMetaData", OBJ, None)]
    layer_meta = [("width", PRIM, INT32), ("height", PRIM, INT32), ("properties", OBJ, None), ("surface", OBJ, None)]
    surf_meta = [("width", PRIM, INT32), ("height", PRIM, INT32), ("stride", PRIM, INT32), ("scan0", OBJ, None)]
    mem_meta = [("length64", PRIM, INT64)]
    enum_meta = [("value__", PRIM, INT32)]

    g += class_def(5, 4, "PaintDotNet.BitmapLayer", layer_meta) + i32(W) + i32(H)
    g += class_def(5, 5, "PaintDotNet.LayerProperties", props_meta) + string_rec(6, "Paper") + b"\x01" + b"\xff"
    g += class_def(5, 7, "PaintDotNet.BlendMode", enum_meta) + i32(7)
    g += null_rec()
    g += class_def(5, 8, "PaintDotNet.Surface", surf_meta) + i32(W) + i32(H) + i32(W * 4)
    g += class_def(5, 9, "PaintDotNet.MemoryBlock", mem_meta) + struct.pack("<q", W * H * 4)

    g += class_with_id(10, 4) + i32(W) + i32(H)
    g += class_with_id(11, 5) + string_rec(12, "Ink") + b"\x00" + bytes([128])
    g += class_with_id(13, 7) + i32(1)
    g += null_rec()
    g += class_with_id(14, 8) + i32(W) + i32(H) + i32(W * 4)
    g += class_with_id(15, 9) + struct.pack("<q", W * H * 4)

    g += ref_rec(4)
    g += null_rec()
    g += b"\x0b"
    return g


def pdn(w, h, thumb, with_layers=True):
    head = f'<pdnImage width="{w}" height="{h}" layers="2" savedWith="4.0"><thumb png="{base64.b64encode(thumb).decode()}" /></pdnImage>'.encode()
    body = graph() + block(pixels(0), [0, 1]) + block(pixels(1), [1, 0]) if with_layers else b""
    return b"PDN3" + struct.pack("<I", len(head))[:3] + head + b"\x00\x01" + body


def open_file(page, path, name):
    page.evaluate("window.formvis.commands.run('open')")
    page.locator(f"{DLG} input[type=file]").first.set_input_files(str(path))
    page.wait_for_function("(n) => window.formvis.engine.current && window.formvis.engine.current.name === n", arg=name, timeout=20000)


INSPECT = """() => { const d = window.formvis.engine.current.doc;
  const px = (l, x, y) => Array.from(l.raster.ctx.getImageData(x, y, 1, 1).data);
  return { w: d.width, h: d.height, layers: d.layers.map((l) => ({ name: l.name, blend: l.blend, opacity: Math.round(l.opacity * 1000) / 1000, visible: l.visible !== false,
    a: px(l, 0, 0), b: px(l, 4, 3), c: px(l, 1, 2) })) }; }"""


def rgba(seed, x, y):
    b, g, r, a = pixels(seed)[(y * W + x) * 4:(y * W + x) * 4 + 4]
    return [r, g, b, a]


@steady
def test_pdn_two_layers_names_opacity_blend_visibility_and_pixels(page, tmp_path):
    f = tmp_path / "doc.pdn"
    f.write_bytes(pdn(W, H, png(W, H, (1, 2, 3, 255))))
    open_file(page, f, "doc")
    got = page.evaluate(INSPECT)
    assert got["w"] == W and got["h"] == H
    assert [l["name"] for l in got["layers"]] == ["Paper", "Ink"], got["layers"]
    paper, ink = got["layers"]
    assert paper["blend"] == "overlay" and paper["visible"] is True and paper["opacity"] == 1
    assert ink["blend"] == "multiply" and ink["visible"] is False and abs(ink["opacity"] - 128 / 255) < 0.005
    for seed, lay in ((0, paper), (1, ink)):
        for key, (x, y) in (("a", (0, 0)), ("b", (4, 3)), ("c", (1, 2))):
            assert lay[key] == rgba(seed, x, y), (seed, key, lay[key])


@steady
def test_pdn_truncated_layer_stream_falls_back_to_the_thumbnail(page, tmp_path):
    full = pdn(W, H, png(W, H, (200, 20, 20, 255)))
    f = tmp_path / "cut.pdn"
    f.write_bytes(full[:-20])
    open_file(page, f, "cut")
    got = page.evaluate(INSPECT)
    assert [l["name"] for l in got["layers"]] == ["Background"], got["layers"]
    assert got["layers"][0]["a"][:3] == [200, 20, 20]
    page.wait_for_function("() => [...document.querySelectorAll('.cv-toast')].some((t) => t.textContent.includes('thumbnail'))", timeout=5000)

import base64
import functools
import io
import re
import struct

from PIL import Image
from playwright.sync_api import Error as PlaywrightError

DLG = ".cv-scrim:not([hidden]) .cv-dialog"


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


CAPTURE = """async ([cmd, args]) => {
  const got = new Promise((resolve) => {
    const make = URL.createObjectURL, click = HTMLAnchorElement.prototype.click; let made = null;
    URL.createObjectURL = function (b) { made = b; return make.call(URL, b); };
    HTMLAnchorElement.prototype.click = function () { URL.createObjectURL = make; HTMLAnchorElement.prototype.click = click; const name = this.download, blob = made;
      if (!blob) { resolve(null); return; } blob.arrayBuffer().then((buf) => { let s = ''; new Uint8Array(buf).forEach((c) => { s += String.fromCharCode(c); }); resolve({ name, b64: btoa(s) }); }, () => resolve(null)); };
  });
  for (let i = 0; i < 100 && !window.formvis.commands.run(cmd, args); i++) await new Promise((r) => setTimeout(r, 100));
  return await Promise.race([got, new Promise((r) => setTimeout(() => r(null), 25000))]);
}"""
SCENE = """async () => {
  const e = window.formvis.engine, E = await import('/src/engine/index.ts');
  e.newDocument(64, 48, 'Wide', 'white');
  const paint = (r, g, b, x, y, w, h) => { e.fg = { r, g, b }; e.applySelection(E.SelectionMask.cropped(x, y, w, h, new Uint8Array(w * h).fill(255)), 'replace', 's'); e.fill('fg'); e.deselect(); };
  e.addLayer({ name: 'Red', blend: 'multiply', opacity: 0.5 }); paint(220, 30, 30, 0, 0, 32, 24);
  e.addLayer({ name: 'Blue', blend: 'normal', opacity: 1 }); paint(30, 40, 220, 32, 24, 32, 24);
}"""


def grab(page, cmd, args=None):
    r = page.evaluate(CAPTURE, [cmd, args])
    assert r, f"{cmd} delivered nothing"
    return r["name"], base64.b64decode(r["b64"])


def rle_hdr(data):
    end = data.index(b"\n\n") + 2
    head = data[:end]
    m = re.search(rb"-Y (\d+) \+X (\d+)\n", data[end:end + 40])
    return head, int(m.group(1)), int(m.group(2))


@steady
def test_hdr_export_is_a_radiance_file_with_the_document_size(page, tmp_path):
    page.evaluate(SCENE)
    name, data = grab(page, "export-hdr")
    assert name.lower().endswith(".hdr") and data.startswith(b"#?RADIANCE")
    head, h, w = rle_hdr(data)
    assert b"FORMAT=32-bit_rle_rgbe" in head and (w, h) == (64, 48)


@steady
def test_exr_export_has_the_magic_the_channels_and_the_data_window(page, tmp_path):
    page.evaluate(SCENE)
    name, data = grab(page, "export-exr")
    assert name.lower().endswith(".exr") and data[:4] == bytes([0x76, 0x2F, 0x31, 0x01])
    assert b"channels\x00chlist" in data and b"dataWindow\x00box2i" in data
    i = data.index(b"dataWindow\x00box2i\x00") + len(b"dataWindow\x00box2i\x00")
    size, = struct.unpack("<i", data[i:i + 4])
    x0, y0, x1, y1 = struct.unpack("<4i", data[i + 4:i + 20])
    assert size == 16 and (x1 - x0 + 1, y1 - y0 + 1) == (64, 48)
    for ch in (b"R\x00", b"G\x00", b"B\x00"):
        assert ch in data[:600]


@steady
def test_tiff_with_layers_carries_the_layers_and_reopens_with_them(page, tmp_path):
    page.evaluate(SCENE)
    name, data = grab(page, "export-tiff-layers", {"layers": True})
    assert name.lower().endswith((".tif", ".tiff")) and data[:4] in (b"II*\x00", b"MM\x00*")
    im = Image.open(io.BytesIO(data)).convert("RGB")
    assert im.size == (64, 48)
    f = tmp_path / "Layered.tif"
    f.write_bytes(data)
    page.evaluate("window.formvis.commands.run('open')")
    page.locator(f"{DLG} input[type=file]").first.set_input_files(str(f))
    page.wait_for_function("() => window.formvis.engine.current && window.formvis.engine.current.name === 'Layered'", timeout=20000)
    got = page.evaluate("""() => window.formvis.engine.current.doc.layers.map((l) => ({ name: l.name, blend: l.blend, opacity: Math.round(l.opacity * 100) / 100 }))""")
    by = {l["name"]: l for l in got}
    assert "Red" in by and "Blue" in by, got
    assert by["Red"]["blend"] == "multiply" and abs(by["Red"]["opacity"] - 0.5) < 0.02


@steady
def test_heic_and_camera_raw_that_cannot_be_decoded_are_refused_gracefully(page, tmp_path):
    before = page.evaluate("window.formvis.engine.projects ? window.formvis.engine.projects.length : -1")
    bad = tmp_path / "photo.heic"
    bad.write_bytes(b"\x00\x00\x00\x18ftypheic" + bytes(64))
    page.evaluate("window.formvis.commands.run('open')")
    page.locator(f"{DLG} input[type=file]").first.set_input_files(str(bad))
    page.wait_for_function("() => [...document.querySelectorAll('.cv-toast')].some((t) => t.textContent.includes('photo.heic'))", timeout=30000)
    raw = tmp_path / "shot.cr2"
    raw.write_bytes(b"II*\x00\x10\x00\x00\x00CR\x02\x00" + bytes(64))
    page.evaluate("window.formvis.commands.run('open')")
    page.locator(f"{DLG} input[type=file]").first.set_input_files(str(raw))
    page.wait_for_function("() => [...document.querySelectorAll('.cv-toast')].some((t) => t.textContent.includes('shot.cr2')) || !!document.querySelector('.cv-scrim:not([hidden])')", timeout=30000)
    assert page.evaluate("window.formvis.engine.projects ? window.formvis.engine.projects.length : -1") == before
    assert page.evaluate("document.title.length > 0")

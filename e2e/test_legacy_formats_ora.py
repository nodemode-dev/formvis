import base64
import functools
import io
import zipfile
import xml.etree.ElementTree as ET

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


CAPTURE = """async () => {
  const got = new Promise((resolve) => {
    const make = URL.createObjectURL, click = HTMLAnchorElement.prototype.click; let made = null;
    URL.createObjectURL = function (b) { made = b; return make.call(URL, b); };
    HTMLAnchorElement.prototype.click = function () { URL.createObjectURL = make; HTMLAnchorElement.prototype.click = click; const name = this.download, blob = made;
      if (!blob) { resolve(null); return; } blob.arrayBuffer().then((buf) => { let s = ''; new Uint8Array(buf).forEach((c) => { s += String.fromCharCode(c); }); resolve({ name, b64: btoa(s) }); }, () => resolve(null)); };
  });
  for (let i = 0; i < 100 && !window.formvis.commands.run('export-ora'); i++) await new Promise((r) => setTimeout(r, 100));
  return await Promise.race([got, new Promise((r) => setTimeout(() => r(null), 20000))]);
}"""
SCENE = """async () => {
  const e = window.formvis.engine, E = await import('/src/engine/index.ts');
  e.newDocument(120, 80, 'Trip', 'white');
  const paint = (r, g, b, x, y, w, h) => { e.fg = { r, g, b }; e.applySelection(E.SelectionMask.cropped(x, y, w, h, new Uint8Array(w * h).fill(255)), 'replace', 's'); e.fill('fg'); e.deselect(); };
  e.addLayer({ name: 'Red', blend: 'multiply', opacity: 0.5 }); paint(220, 30, 30, 10, 10, 40, 30);
  e.addLayer({ name: 'Green', blend: 'screen', opacity: 0.8 }); paint(30, 200, 60, 60, 30, 40, 30);
  e.addLayer({ name: 'Blue', blend: 'overlay', opacity: 1 }); paint(30, 40, 220, 90, 5, 20, 20);
  e.current.updateLayer(e.activeLayer.id, { visible: false });
}"""
INSPECT = """() => { const d = window.formvis.engine.current.doc, flat = window.formvis.engine.flattened(), px = (x, y) => Array.from(flat.getContext('2d').getImageData(x, y, 1, 1).data);
  return { w: d.width, h: d.height, layers: d.layers.map((l) => ({ name: l.name, blend: l.blend, opacity: Math.round(l.opacity * 100) / 100, visible: l.visible !== false })),
    px: { red: px(20, 20), green: px(80, 45), none: px(115, 75) } }; }"""


def export(page, name="Trip.ora"):
    r = page.evaluate(CAPTURE)
    assert r and r["name"] == name
    return base64.b64decode(r["b64"])


@steady
def test_ora_round_trip_keeps_layers_blend_opacity_visibility_and_pixels(page, tmp_path):
    page.evaluate(SCENE)
    before = page.evaluate(INSPECT)
    data = export(page)
    z = zipfile.ZipFile(io.BytesIO(data))
    stack = ET.fromstring(z.read("stack.xml"))
    rows = {e.get("name"): e for e in stack.iter("layer")}
    assert rows["Red"].get("composite-op") == "svg:multiply" and rows["Green"].get("composite-op") == "svg:screen" and rows["Blue"].get("composite-op") == "svg:overlay"
    assert rows["Blue"].get("visibility") == "hidden" and abs(float(rows["Green"].get("opacity")) - 0.8) < 0.005
    assert (rows["Green"].get("x"), rows["Green"].get("y")) == ("0", "0") or Image.open(io.BytesIO(z.read(rows["Green"].get("src")))).size[0] >= 40
    merged = Image.open(io.BytesIO(z.read("mergedimage.png"))).convert("RGB")
    assert merged.size == (120, 80)
    f = tmp_path / "Reopened.ora"
    f.write_bytes(data)
    page.evaluate("window.formvis.engine.newDocument(10, 10, 'Other', 'white')")
    page.evaluate("window.formvis.commands.run('open')")
    page.locator(f"{DLG} input[type=file]").first.set_input_files(str(f))
    page.wait_for_function("() => window.formvis.engine.current && window.formvis.engine.current.name === 'Reopened'", timeout=20000)
    after = page.evaluate(INSPECT)
    assert after["w"] == 120 and after["h"] == 80
    assert [l["name"] for l in after["layers"]] == [l["name"] for l in before["layers"]], after["layers"]
    for a, b in zip(after["layers"], before["layers"]):
        assert a["blend"] == b["blend"] and abs(a["opacity"] - b["opacity"]) < 0.02 and a["visible"] == b["visible"], (a, b)
    for k in ("red", "green", "none"):
        assert all(abs(p - q) <= 3 for p, q in zip(after["px"][k], before["px"][k])), (k, after["px"][k], before["px"][k])
    rr = after["px"]["red"]
    assert rr[0] > rr[1] + 50, rr


@steady
def test_ora_second_export_is_stable_after_reopen(page, tmp_path):
    page.evaluate(SCENE)
    first = export(page)
    f = tmp_path / "Reopened.ora"
    f.write_bytes(first)
    page.evaluate("window.formvis.engine.newDocument(10, 10, 'Other', 'white')")
    page.evaluate("window.formvis.commands.run('open')")
    page.locator(f"{DLG} input[type=file]").first.set_input_files(str(f))
    page.wait_for_function("() => window.formvis.engine.current && window.formvis.engine.current.name === 'Reopened'", timeout=20000)
    second = export(page, "Reopened.ora")
    names = lambda d: [(e.get("name"), e.get("composite-op"), e.get("visibility"), round(float(e.get("opacity")), 2)) for e in ET.fromstring(zipfile.ZipFile(io.BytesIO(d)).read("stack.xml")).iter("layer")]
    assert names(first) == names(second)
    a = Image.open(io.BytesIO(zipfile.ZipFile(io.BytesIO(first)).read("mergedimage.png"))).convert("RGB")
    b = Image.open(io.BytesIO(zipfile.ZipFile(io.BytesIO(second)).read("mergedimage.png"))).convert("RGB")
    assert a.size == b.size and all(abs(p - q) <= 3 for p, q in zip(a.getpixel((20, 20)), b.getpixel((20, 20))))


@steady
def test_ora_refuses_a_zip_that_is_not_openraster(page, tmp_path):
    f = tmp_path / "wrong.ora"
    with zipfile.ZipFile(f, "w") as z:
        z.writestr("mimetype", "application/zip")
        z.writestr("stack.xml", "<image/>")
    page.evaluate("window.formvis.commands.run('open')")
    page.locator(f"{DLG} input[type=file]").first.set_input_files(str(f))
    page.wait_for_function("() => [...document.querySelectorAll('.cv-toast')].some((t) => t.textContent.includes('not an OpenRaster'))", timeout=15000)

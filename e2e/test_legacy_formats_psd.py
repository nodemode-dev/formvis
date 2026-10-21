import base64
import functools
import io

import pytest
from playwright.sync_api import Error as PlaywrightError

psd_tools = pytest.importorskip("psd_tools", reason="psd-tools reads the exported PSD independently")
from psd_tools.constants import BlendMode  # noqa: E402


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


SCENE = """async () => {
  const e = window.formvis.engine, E = await import('/src/engine/index.ts'), T = await import('/src/engine/text.ts');
  e.newDocument(160, 100, 'Layered', 'white');
  const paint = (rgb, x, y, w, h) => { const [r, g, b] = rgb.match(/\d+/g).map(Number); e.fg = { r, g, b }; e.applySelection(E.SelectionMask.cropped(x, y, w, h, new Uint8Array(w * h).fill(255)), 'replace', 's'); e.fill('fg'); e.deselect(); };
  e.addLayer({ name: 'Red box', blend: 'multiply', opacity: 0.5 });
  paint('rgb(220,30,30)', 10, 10, 50, 40);
  e.addLayer({ name: 'Green box', blend: 'screen', opacity: 0.8 });
  paint('rgb(30,200,60)', 70, 20, 40, 40);
  e.applySelection(E.SelectionMask.cropped(70, 20, 20, 40, new Uint8Array(800).fill(255)), 'replace', 's'); e.addMask(false); e.deselect();
  e.addLayer({ name: 'Blue box', blend: 'overlay', opacity: 1 });
  paint('rgb(30,40,220)', 100, 60, 30, 30);
  e.convertToSmartObject();
  await e.createTextLayer({ x: 8, y: 80 }, { ...T.defaultText(), content: 'Hello PSD', family: 'DejaVu Sans', size: 18 });
  e.refresh();
}"""
CAPTURE = """async (cmd) => {
  const got = new Promise((resolve) => {
    const orig = HTMLAnchorElement.prototype.click;
    HTMLAnchorElement.prototype.click = function () {
      HTMLAnchorElement.prototype.click = orig;
      fetch(this.href).then((r) => r.arrayBuffer()).then((buf) => { let s = ''; new Uint8Array(buf).forEach((b) => { s += String.fromCharCode(b); }); resolve({ name: this.download, b64: btoa(s) }); });
    };
  });
  if (!window.formvis.commands.run(cmd)) throw new Error(cmd);
  return await Promise.race([got, new Promise((r) => setTimeout(() => r(null), 25000))]);
}"""


def export(page, cmd="export-psd"):
    r = page.evaluate(CAPTURE, cmd)
    assert r, "nothing was delivered"
    return r["name"], base64.b64decode(r["b64"])


def layers_by_name(psd):
    return {layer.name: layer for layer in psd.descendants()}


@steady
def test_layered_psd_has_names_modes_opacity_masks_text_and_smart_object(page, tmp_path):
    page.evaluate(SCENE)
    name, data = export(page)
    assert name == "Layered.psd" and data[:6] == b"8BPS\x00\x01"
    psd = psd_tools.PSDImage.open(io.BytesIO(data))
    assert (psd.width, psd.height) == (160, 100) and psd.depth == 8
    by = layers_by_name(psd)
    assert {"Red box", "Green box", "Blue box"} <= set(by), list(by)
    red, green, blue = by["Red box"], by["Green box"], by["Blue box"]
    assert red.blend_mode == BlendMode.MULTIPLY and abs(red.opacity - 128) <= 1
    assert green.blend_mode == BlendMode.SCREEN and abs(green.opacity - 204) <= 1
    assert blue.blend_mode == BlendMode.OVERLAY
    assert red.bbox == (0, 0, 160, 100), red.bbox
    assert green.has_mask() and not red.has_mask()
    mask = green.mask
    assert mask.bbox is not None
    assert blue.kind == "smartobject"
    texts = [lay for lay in psd.descendants() if lay.kind == "type"]
    assert len(texts) == 1 and texts[0].text.strip() == "Hello PSD"
    assert (texts[0].left, texts[0].top) != (0, 0)


@steady
def test_layered_psd_layer_pixels_match_what_was_painted(page, tmp_path):
    page.evaluate(SCENE)
    _, data = export(page)
    psd = psd_tools.PSDImage.open(io.BytesIO(data))
    by = layers_by_name(psd)
    px = by["Red box"].numpy()
    assert px.shape[2] == 4
    inner = px[15, 15]
    assert tuple(int(round(v * 255)) for v in inner[:3]) == (220, 30, 30) and inner[3] == 1.0
    assert px[80, 140][3] == 0
    g = by["Green box"].numpy()
    assert tuple(int(round(v * 255)) for v in g[30, 80][:3]) == (30, 200, 60)
    m = by["Green box"].mask.topil()
    assert m is not None and max(m.getdata()) == 255 and min(m.getdata()) == 0
    comp = psd.composite()
    assert comp.size == (160, 100)


@steady
def test_layered_psd_merged_preview_matches_formvis_flattened_view(page, tmp_path):
    page.evaluate(SCENE)
    flat = page.evaluate("Array.from(window.formvis.engine.flattened().getContext('2d').getImageData(0, 0, 160, 100).data)")
    _, data = export(page)
    img = psd_tools.PSDImage.open(io.BytesIO(data)).composite(force=False) or None
    assert img is not None
    rgba = img.convert("RGBA")
    close = 0
    for (x, y) in [(5, 5), (30, 30), (80, 40), (120, 70), (150, 95), (95, 40)]:
        a = rgba.getpixel((x, y))
        b = tuple(flat[(y * 160 + x) * 4:(y * 160 + x) * 4 + 3])
        if all(abs(p - q) <= 12 for p, q in zip(a[:3], b)):
            close += 1
    assert close >= 5, close


@steady
def test_layered_psd_reopens_in_formvis_with_the_same_structure(page, tmp_path):
    page.evaluate(SCENE)
    _, data = export(page)
    f = tmp_path / "Layered.psd"
    f.write_bytes(data)
    count = page.evaluate("window.formvis.engine.projects.length")
    page.set_input_files("input[data-role='open-files']", str(f))
    page.wait_for_function(f"window.formvis.engine.projects.length > {count}", timeout=30000)
    got = page.evaluate("""(() => { const d = window.formvis.engine.current.doc;
      return { w: d.width, h: d.height, layers: d.layers.map((l) => ({ n: l.name, b: l.blend, o: Math.round(l.opacity * 100), m: !!l.mask, t: l.text ? l.text.content : null, s: !!l.smart })) }; })()""")
    assert (got["w"], got["h"]) == (160, 100)
    by = {l["n"]: l for l in got["layers"]}
    assert by["Red box"]["b"] == "multiply" and by["Red box"]["o"] == 50
    assert by["Green box"]["b"] == "screen" and by["Green box"]["o"] == 80 and by["Green box"]["m"]
    assert by["Blue box"]["b"] == "overlay" and by["Blue box"]["s"]
    assert any(l["t"] and l["t"].strip() == "Hello PSD" for l in got["layers"])


@steady
def test_psb_export_uses_the_large_document_header_with_the_same_layers(page, tmp_path):
    page.evaluate(SCENE)
    name, data = export(page, "export-psb")
    assert name == "Layered.psb" and data[:6] == b"8BPS\x00\x02"
    psd = psd_tools.PSDImage.open(io.BytesIO(data))
    assert {"Red box", "Green box", "Blue box"} <= set(layers_by_name(psd))

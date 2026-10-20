import base64
import functools
import io
import json
import zipfile

import pytest
from PIL import Image
from playwright.sync_api import Error as PlaywrightError

from e2e.test_select_subject import _engine_up


def steady(fn):
    @functools.wraps(fn)
    def run(page, **kw):
        for attempt in range(3):
            try:
                return fn(page, **kw)
            except PlaywrightError as err:
                if "context was destroyed" not in str(err) or attempt == 2:
                    raise
                page.wait_for_function("window.formvis && window.formvis.engine", timeout=60000)
    return run


SCENE = """async () => {
  const e = window.formvis.engine, E = await import('/src/engine/index.ts');
  e.newDocument(60, 40, 'Dl', 'white');
  const box = (rgb, x, y, w, h) => { e.fg = { r: rgb[0], g: rgb[1], b: rgb[2] }; e.applySelection(E.SelectionMask.cropped(x, y, w, h, new Uint8Array(w * h).fill(255)), 'replace', 's'); e.fill('fg'); e.deselect(); };
  box([200, 40, 40], 0, 0, 30, 20);
  box([30, 60, 210], 30, 20, 30, 20);
}"""
CAPTURE = """async (cmd) => {
  const got = new Promise((resolve) => {
    const make = URL.createObjectURL, click = HTMLAnchorElement.prototype.click; let made = null;
    URL.createObjectURL = function (b) { made = b; return make.call(URL, b); };
    HTMLAnchorElement.prototype.click = function () {
      URL.createObjectURL = make; HTMLAnchorElement.prototype.click = click;
      const name = this.download, blob = made;
      if (!blob) { resolve(null); return; }
      blob.arrayBuffer().then((buf) => { let s = ''; new Uint8Array(buf).forEach((c) => { s += String.fromCharCode(c); }); resolve({ name, b64: btoa(s) }); });
    };
  });
  for (let i = 0; i < 100 && !window.formvis.commands.run(cmd); i++) await new Promise((r) => setTimeout(r, 100));
  return await Promise.race([got, new Promise((r) => setTimeout(() => r(null), 25000))]);
}"""
EXPORT_AS = """async (preset) => {
  const got = new Promise((resolve) => {
    const orig = HTMLAnchorElement.prototype.click;
    HTMLAnchorElement.prototype.click = function () {
      HTMLAnchorElement.prototype.click = orig;
      fetch(this.href).then((r) => r.arrayBuffer()).then((buf) => { let s = ''; new Uint8Array(buf).forEach((c) => { s += String.fromCharCode(c); }); resolve({ name: this.download, b64: btoa(s) }); });
    };
  });
  window.formvis.commands.run('export-as');
  await new Promise((r) => setTimeout(r, 300));
  const dlg = document.querySelector('.cv-scrim:not([hidden]) .cv-dialog'), sel = dlg.querySelectorAll('select')[1];
  sel.value = preset; sel.dispatchEvent(new Event('change', { bubbles: true }));
  [...dlg.querySelectorAll('.cv-dialog-foot button')].find((b) => b.textContent === 'Export').click();
  return await Promise.race([got, new Promise((r) => setTimeout(() => r(null), 25000))]);
}"""


def get(page, cmd):
    r = page.evaluate(CAPTURE, cmd)
    assert r, f"{cmd} delivered nothing"
    return r["name"], base64.b64decode(r["b64"])


def check_pixels(im):
    rgb = im.convert("RGB")
    assert rgb.size == (60, 40)
    near = lambda a, b, t=14: all(abs(p - q) <= t for p, q in zip(a, b))
    assert near(rgb.getpixel((10, 8)), (200, 40, 40)), rgb.getpixel((10, 8))
    assert near(rgb.getpixel((45, 30)), (30, 60, 210)), rgb.getpixel((45, 30))
    assert near(rgb.getpixel((45, 5)), (255, 255, 255)) and near(rgb.getpixel((5, 35)), (255, 255, 255))


@steady
def test_export_png_is_a_lossless_png_with_the_exact_pixels(page):
    page.evaluate(SCENE)
    name, data = get(page, "export-png")
    assert name == "Dl.png" and data[:8] == b"\x89PNG\r\n\x1a\n"
    im = Image.open(io.BytesIO(data))
    assert im.format == "PNG" and im.size == (60, 40)
    assert im.convert("RGB").getpixel((10, 8)) == (200, 40, 40) and im.convert("RGB").getpixel((45, 30)) == (30, 60, 210)
    assert im.convert("RGB").getpixel((45, 5)) == (255, 255, 255)


@steady
def test_export_as_jpeg_is_a_baseline_or_progressive_jpeg_pillow_decodes(page):
    page.evaluate(SCENE)
    r = page.evaluate(EXPORT_AS, "jpg-web")
    assert r and r["name"] == "Dl.jpg"
    data = base64.b64decode(r["b64"])
    assert data[:3] == b"\xff\xd8\xff" and data[-2:] == b"\xff\xd9"
    im = Image.open(io.BytesIO(data))
    assert im.format == "JPEG" and im.mode == "RGB"
    check_pixels(im)


@steady
def test_export_webp_is_a_riff_webp_pillow_decodes(page):
    page.evaluate(SCENE)
    name, data = get(page, "export-webp")
    assert name == "Dl.webp" and data[:4] == b"RIFF" and data[8:12] == b"WEBP"
    im = Image.open(io.BytesIO(data))
    assert im.format == "WEBP"
    check_pixels(im)


@steady
def test_export_tiff_is_read_by_pillow_and_tifffile_with_the_exact_size(page):
    if not _engine_up():
        pytest.skip("needs the engine on 8190 (./formvis backend)")
    tifffile = pytest.importorskip("tifffile")
    page.evaluate(SCENE)
    name, data = get(page, "export-tiff")
    assert name == "Dl.tif" and data[:4] in (b"II*\x00", b"MM\x00*")
    im = Image.open(io.BytesIO(data))
    assert im.format == "TIFF"
    check_pixels(im)
    with tifffile.TiffFile(io.BytesIO(data)) as tf:
        pg = tf.pages[0]
        assert pg.shape[0] == 40 and pg.shape[1] == 60 and pg.samplesperpixel in (3, 4)
        assert pg.photometric.name == "RGB" and pg.bitspersample == 8 if hasattr(pg, "bitspersample") else True


@steady
def test_export_psd_flat_composite_matches_the_png_export(page):
    psd_tools = pytest.importorskip("psd_tools")
    page.evaluate(SCENE)
    _, png = get(page, "export-png")
    name, psd = get(page, "export-psd")
    assert name == "Dl.psd"
    comp = psd_tools.PSDImage.open(io.BytesIO(psd)).composite().convert("RGB")
    ref = Image.open(io.BytesIO(png)).convert("RGB")
    for xy in [(10, 8), (45, 30), (45, 5), (5, 35)]:
        assert all(abs(a - b) <= 2 for a, b in zip(comp.getpixel(xy), ref.getpixel(xy))), xy


@steady
def test_project_download_is_a_zip_with_a_manifest_that_names_every_layer_and_reopens(page, tmp_path):
    page.evaluate(SCENE)
    page.evaluate("""async () => { const e = window.formvis.engine; e.addLayer({ name: 'Top', blend: 'multiply', opacity: 0.35 }); }""")
    name, data = get(page, "download-project")
    assert name == "Dl.fvd" and data[:2] == b"PK"
    z = zipfile.ZipFile(io.BytesIO(data))
    assert z.testzip() is None
    names = z.namelist()
    manifest = next(n for n in names if n.endswith(".json"))
    m = json.loads(z.read(manifest))
    assert m.get("format") == "com.nodemode.formvis" and m.get("version") == 1
    dumped = json.dumps(m)
    assert "Top" in dumped and "multiply" in dumped.lower()
    pngs = [n for n in names if n.lower().endswith(".png")]
    assert pngs and all(z.read(n)[:8] == b"\x89PNG\r\n\x1a\n" for n in pngs)
    f = tmp_path / "Dl.fvd"
    f.write_bytes(data)
    count = page.evaluate("window.formvis.engine.projects.length")
    page.set_input_files("input[data-role='open-files']", str(f))
    page.wait_for_function(f"window.formvis.engine.projects.length > {count}", timeout=20000)
    got = page.evaluate("""(() => { const e = window.formvis.engine, ls = e.current.doc.layers;
      return { n: ls.length, top: [ls[ls.length - 1].name, ls[ls.length - 1].blend, Math.round(ls[ls.length - 1].opacity * 100)], px: Array.from(e.flattened().getContext('2d').getImageData(10, 8, 1, 1).data).slice(0, 3) }; })()""")
    assert got["n"] == 2 and got["top"] == ["Top", "multiply", 35] and got["px"] == [200, 40, 40], got


@steady
def test_sfw_slice_html_names_every_cell_and_escapes_text(page):
    html = page.evaluate("""async () => {
      const m = await import('/src/io/sfw-html.ts');
      return m.slicesHtml('A & B', 40, 20, [
        { x: 0, y: 0, w: 20, h: 20, file: 'images/a_01.png', url: 'https://example.org/?a=1&b=2', alt: 'say "hi"' },
        { x: 20, y: 0, w: 20, h: 20, file: 'images/a_02.png' }]);
    }""")
    assert html.count("<img") == 2 and "images/a_01.png" in html and "images/a_02.png" in html
    assert "A &amp; B" in html and "&quot;hi&quot;" in html and "a=1&amp;b=2" in html
    assert 'width="20"' in html and 'height="20"' in html


@steady
def test_sfw_reduction_limits_colours_and_the_web_palette_snaps_to_216(page):
    r = page.evaluate("""async () => {
      const m = await import('/src/io/sfw-reduce.ts'), w = 32, h = 8, d = new Uint8ClampedArray(w * h * 4);
      for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) d.set([x * 8, 255 - x * 8, (x * 37) & 255, 255], (y * w + x) * 4);
      const base = { palette: 'adaptive', colors: 8, dither: 'none', amount: 0, transparency: false, matte: [255, 255, 255] };
      const a = m.reduceColours(d.slice(), w, h, base), web = m.reduceColours(d.slice(), w, h, { ...base, palette: 'web', colors: 256 });
      const uniq = (px) => new Set(Array.from({ length: w * h }, (_, i) => px[i * 4] + ',' + px[i * 4 + 1] + ',' + px[i * 4 + 2])).size;
      const webOk = Array.from({ length: w * h * 3 }, (_, i) => web.data[Math.floor(i / 3) * 4 + (i % 3)]).every((v) => v % 51 === 0);
      return { adaptive: uniq(a.data), used: a.used, table: a.table.length, web: uniq(web.data), webOk };
    }""")
    assert r["adaptive"] <= 8 and r["used"] <= 8 and r["table"] <= 8 and r["adaptive"] >= 2
    assert r["webOk"] and r["web"] <= 216


@steady
def test_sfw_built_in_presets_cover_every_output_format(page):
    r = page.evaluate("""async () => { const m = await import('/src/io/sfw-presets.ts'); return m.SFW_BUILTIN.map((p) => [p.name, p.cfg.fmt, p.builtin]); }""")
    fmts = {x[1] for x in r}
    assert {"jpeg", "png24", "png8", "gif"} <= fmts and all(x[2] for x in r)

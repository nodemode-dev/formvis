import base64
import functools
import io

from PIL import Image
from playwright.sync_api import Error as PlaywrightError


def steady(fn):
    @functools.wraps(fn)
    def run(page):
        for attempt in range(3):
            try:
                return fn(page)
            except PlaywrightError as err:
                if "context was destroyed" not in str(err) or attempt == 2:
                    raise
                page.wait_for_function("window.formvis && window.formvis.engine", timeout=60000)
    return run


# The real File > Export > Save for Web (Legacy) dialog, opened through its menu command and driven through its own
# controls (format, quality, colours, image size, the check boxes); Save... delivers the file through the same download
# path the app uses, and the bytes are read back with Pillow (format, mode, size, palette entries, JPEG quantization
# tables and the progressive flag, the PNG interlace flag, the embedded profile). The picture is a 96 x 64 document: a
# diagonal colour ramp with a hard red block and a hard blue block on it.
SCENE = """() => {
  const e = window.formvis.engine;
  e.newDocument(96, 64, 'Sfw', 'white');
  const c = document.createElement('canvas'); c.width = 96; c.height = 64;
  const g = c.getContext('2d'), d = g.createImageData(96, 64);
  for (let y = 0; y < 64; y++) for (let x = 0; x < 96; x++) {
    const i = (y * 96 + x) * 4, hard = x < 24 && y < 16 ? [255, 0, 0] : x >= 72 && y >= 48 ? [0, 0, 255] : null;
    d.data[i] = hard ? hard[0] : Math.round(40 + x * 1.9 + Math.sin(y * 0.9) * 18);
    d.data[i + 1] = hard ? hard[1] : Math.round(60 + y * 2.4 + Math.cos(x * 0.7) * 14);
    d.data[i + 2] = hard ? hard[2] : Math.round(200 - x * 1.2 - y * 0.8);
    d.data[i + 3] = 255;
  }
  g.putImageData(d, 0, 0);
  e.insertImages([{ name: 'ramp.png', width: 96, height: 64, source: c }]);
}"""
CLEAR = "() => { try { localStorage.removeItem('formvis.saveForWeb'); } catch (e) {} }"

DRIVE = """async (cfg) => {
  const got = new Promise((resolve) => {
    const orig = HTMLAnchorElement.prototype.click;
    HTMLAnchorElement.prototype.click = function () {
      HTMLAnchorElement.prototype.click = orig;
      fetch(this.href).then((r) => r.arrayBuffer()).then((buf) => { let s = ''; new Uint8Array(buf).forEach((c) => { s += String.fromCharCode(c); }); resolve({ name: this.download, b64: btoa(s) }); });
    };
  });
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  window.formvis.commands.run('save-for-web');
  let dlg = null;
  for (let i = 0; i < 80 && !dlg; i++) { await sleep(100); dlg = [...document.querySelectorAll('.cv-scrim:not([hidden]) .cv-dialog')].find((d) => /Save for Web/.test(d.textContent)) || null; }
  if (!dlg) return { error: 'no dialog' };
  const field = (label) => [...dlg.querySelectorAll('.cv-field')].find((f) => f.querySelector('span') && f.querySelector('span').textContent === label);
  const out = { hidden: {} };
  for (const [label, kind, value] of cfg.steps) {
    const f = field(label);
    if (!f) return { error: 'no field ' + label };
    if (kind === 'select') { const s = f.querySelector('select'); s.value = value; s.dispatchEvent(new Event('change', { bubbles: true })); }
    else if (kind === 'range') { const r = f.querySelector('input[type=range]'); r.value = String(value); r.dispatchEvent(new Event('input', { bubbles: true })); }
    else if (kind === 'check') { const c = f.querySelector('input[type=checkbox]'); c.checked = value; c.dispatchEvent(new Event('change', { bubbles: true })); }
    else if (kind === 'color') { const c = f.querySelector('input[type=color]'); c.value = value; c.dispatchEvent(new Event('input', { bubbles: true })); }
    await sleep(60);
  }
  for (const l of ['Quality', 'Colors', 'Color reduction', 'Dither', 'Progressive', 'Optimized', 'Interlaced', 'Transparency', 'Matte', 'Embed Color Profile', 'Web Snap (%)']) { const f = field(l); out.hidden[l] = f ? f.hidden : null; }
  await sleep(900);
  out.captions = [...dlg.querySelectorAll('p.cv-note')].map((p) => p.textContent).filter((t) => t);
  const save = [...dlg.querySelectorAll('.cv-dialog-foot button')].find((b) => b.textContent === 'Save...');
  save.click();
  const res = await Promise.race([got, new Promise((r) => setTimeout(() => r(null), 25000))]);
  if (!res) return { error: 'nothing delivered', ...out };
  await sleep(200);
  out.open = !!document.querySelector('.cv-scrim:not([hidden]) .cv-dialog') && [...document.querySelectorAll('.cv-scrim:not([hidden]) .cv-dialog')].some((d) => /Save for Web/.test(d.textContent));
  return { ...out, name: res.name, b64: res.b64 };
}"""


def sfw(page, *steps):
    page.evaluate(SCENE)
    page.evaluate(CLEAR)
    page.wait_for_timeout(300)
    r = page.evaluate(DRIVE, {"steps": [list(s) for s in steps]})
    assert "error" not in r, r
    r["data"] = base64.b64decode(r["b64"])
    return r


def near(a, b, t=24):
    return all(abs(x - y) <= t for x, y in zip(a, b))


def red_blue_ok(im, t=40):
    rgb = im.convert("RGB")
    sx, sy = rgb.width / 96, rgb.height / 64
    px = lambda x, y: rgb.getpixel((int(x * sx), int(y * sy)))
    assert near(px(8, 6), (255, 0, 0), t), px(8, 6)
    assert near(px(84, 56), (0, 0, 255), t), px(84, 56)


def palette_entries(im):
    pal = im.getpalette()
    return len(pal) // 3 if pal else 0


@steady
def test_the_dialog_opens_from_the_menu_command_with_four_views_and_a_working_preview(page):
    page.evaluate(SCENE)
    page.evaluate(CLEAR)
    assert page.evaluate("() => !!window.formvis.commands.get('save-for-web').enabled()") is True
    page.evaluate("() => window.formvis.commands.run('save-for-web')")
    page.wait_for_timeout(1200)
    info = page.evaluate("""() => {
      const dlg = [...document.querySelectorAll('.cv-scrim:not([hidden]) .cv-dialog')].find((d) => /Save for Web/.test(d.textContent));
      if (!dlg) return null;
      return { tabs: [...dlg.querySelectorAll('[role=tab]')].map((t) => t.textContent), notes: [...dlg.querySelectorAll('p.cv-note')].map((p) => p.textContent).filter((t) => t),
        fmt: [...dlg.querySelectorAll('.cv-field')].find((f) => f.querySelector('span') && f.querySelector('span').textContent === 'Format').querySelector('select').value, canvases: dlg.querySelectorAll('canvas').length }; }""")
    assert info and info["tabs"] == ["Original", "Optimized", "2-Up", "4-Up"], info
    assert info["fmt"] == "jpeg" and info["canvases"] == 4
    assert any(n.startswith("JPEG") and "Quality 80" in n for n in info["notes"]) or any("JPEG" in n for n in info["notes"]), info["notes"]
    page.keyboard.press("Escape")


@steady
def test_png24_saves_a_lossless_rgb_png_with_the_exact_pixels(page):
    r = sfw(page, ("Format", "select", "png24"))
    assert r["name"].lower() == "sfw.png" and r["open"] is False
    d = r["data"]
    assert d[:8] == b"\x89PNG\r\n\x1a\n"
    im = Image.open(io.BytesIO(d))
    assert im.format == "PNG" and im.size == (96, 64) and im.mode in ("RGB", "RGBA")
    assert im.convert("RGB").getpixel((8, 6)) == (255, 0, 0) and im.convert("RGB").getpixel((84, 56)) == (0, 0, 255)
    assert r["hidden"]["Quality"] is True and r["hidden"]["Colors"] is True


@steady
def test_png24_interlaced_and_with_the_srgb_profile(page):
    r = sfw(page, ("Format", "select", "png24"), ("Interlaced", "check", True), ("Embed Color Profile", "check", True))
    im = Image.open(io.BytesIO(r["data"]))
    assert im.format == "PNG" and im.info.get("interlace") == 1, im.info.keys()
    assert im.info.get("icc_profile") and b"sRGB" in im.info["icc_profile"]
    red_blue_ok(im, 2)


@steady
def test_png24_not_interlaced_has_no_interlace_flag_and_no_profile(page):
    r = sfw(page, ("Format", "select", "png24"))
    im = Image.open(io.BytesIO(r["data"]))
    assert not im.info.get("interlace") and not im.info.get("icc_profile")


@steady
def test_png8_is_an_indexed_png_with_at_most_the_chosen_number_of_colours(page):
    r = sfw(page, ("Format", "select", "png8"), ("Colors", "range", 16), ("Dither", "select", "none"))
    d = r["data"]
    assert d[:8] == b"\x89PNG\r\n\x1a\n"
    im = Image.open(io.BytesIO(d))
    assert im.format == "PNG" and im.mode == "P" and im.size == (96, 64)
    used = len(set(im.convert("RGB").getdata()))
    assert 2 <= used <= 16, used
    assert palette_entries(im) <= 16 + 1
    red_blue_ok(im, 40)
    assert r["hidden"]["Colors"] is False and r["hidden"]["Quality"] is True
    assert any("16" in c and "colors" in c for c in r["captions"]), r["captions"]


@steady
def test_png8_with_more_colours_keeps_more_of_the_ramp(page):
    few = Image.open(io.BytesIO(sfw(page, ("Format", "select", "png8"), ("Colors", "range", 4), ("Dither", "select", "none"))["data"]))
    many = Image.open(io.BytesIO(sfw(page, ("Format", "select", "png8"), ("Colors", "range", 128), ("Dither", "select", "none"))["data"]))
    a, b = len(set(few.convert("RGB").getdata())), len(set(many.convert("RGB").getdata()))
    assert a <= 4 and b > a * 4, (a, b)


@steady
def test_png8_web_palette_uses_web_safe_colours_only(page):
    r = sfw(page, ("Format", "select", "png8"), ("Color reduction", "select", "web"), ("Dither", "select", "none"))
    im = Image.open(io.BytesIO(r["data"]))
    assert im.mode == "P"
    for px in set(im.convert("RGB").getdata()):
        assert all(v in (0, 51, 102, 153, 204, 255) for v in px), px


@steady
def test_gif_is_a_gif89a_with_a_palette_within_the_chosen_colours(page):
    r = sfw(page, ("Format", "select", "gif"), ("Colors", "range", 32), ("Dither", "select", "none"))
    d = r["data"]
    assert r["name"].lower() == "sfw.gif" and d[:6] in (b"GIF87a", b"GIF89a") and d[-1:] == b";"
    im = Image.open(io.BytesIO(d))
    assert im.format == "GIF" and im.size == (96, 64) and im.mode == "P"
    assert len(set(im.convert("RGB").getdata())) <= 32
    assert palette_entries(im) <= 32
    red_blue_ok(im, 40)


@steady
def test_gif_with_fewer_colours_is_smaller_and_uses_fewer_colours(page):
    big = sfw(page, ("Format", "select", "gif"), ("Colors", "range", 128), ("Dither", "select", "none"))["data"]
    small = sfw(page, ("Format", "select", "gif"), ("Colors", "range", 8), ("Dither", "select", "none"))["data"]
    assert len(small) < len(big)
    assert len(set(Image.open(io.BytesIO(small)).convert("RGB").getdata())) <= 8


@steady
def test_gif_diffusion_dither_uses_more_distinct_neighbours_than_no_dither(page):
    plain = Image.open(io.BytesIO(sfw(page, ("Format", "select", "gif"), ("Colors", "range", 8), ("Dither", "select", "none"))["data"])).convert("RGB")
    dith = Image.open(io.BytesIO(sfw(page, ("Format", "select", "gif"), ("Colors", "range", 8), ("Dither", "select", "diffusion"), ("Dither amount (%)", "range", 100))["data"])).convert("RGB")

    def changes(im):
        n = 0
        for y in range(8, 56):
            for x in range(30, 66):
                n += im.getpixel((x, y)) != im.getpixel((x + 1, y))
        return n
    assert changes(dith) > changes(plain), (changes(dith), changes(plain))


@steady
def test_jpeg_quality_changes_the_quantization_tables_and_the_size(page):
    hi = sfw(page, ("Format", "select", "jpeg"), ("Quality", "range", 95))
    lo = sfw(page, ("Format", "select", "jpeg"), ("Quality", "range", 10))
    for r in (hi, lo):
        assert r["name"].lower().startswith("sfw") and r["name"].lower().endswith(".jpg") and r["data"][:3] == b"\xff\xd8\xff" and r["data"][-2:] == b"\xff\xd9"
    a, b = Image.open(io.BytesIO(hi["data"])), Image.open(io.BytesIO(lo["data"]))
    assert a.format == "JPEG" and a.mode == "RGB" and a.size == (96, 64)
    assert sum(a.quantization[0]) < sum(b.quantization[0]) * 0.5, (a.quantization[0][:8], b.quantization[0][:8])
    assert len(lo["data"]) < len(hi["data"])
    red_blue_ok(a, 30)
    assert hi["hidden"]["Quality"] is False and hi["hidden"]["Colors"] is True


@steady
def test_jpeg_progressive_sets_the_progressive_marker_and_baseline_does_not(page):
    prog = Image.open(io.BytesIO(sfw(page, ("Format", "select", "jpeg"), ("Progressive", "check", True))["data"]))
    base = Image.open(io.BytesIO(sfw(page, ("Format", "select", "jpeg"), ("Progressive", "check", False))["data"]))
    assert prog.info.get("progressive") or prog.info.get("progression")
    assert not base.info.get("progressive") and not base.info.get("progression")
    red_blue_ok(prog, 30)


@steady
def test_jpeg_with_the_profile_embedded_carries_an_icc_segment(page):
    r = sfw(page, ("Format", "select", "jpeg"), ("Embed Color Profile", "check", True))
    im = Image.open(io.BytesIO(r["data"]))
    assert im.format == "JPEG" and im.info.get("icc_profile") and b"sRGB" in im.info["icc_profile"]
    plain = Image.open(io.BytesIO(sfw(page, ("Format", "select", "jpeg"), ("Embed Color Profile", "check", False))["data"]))
    assert plain.info.get("icc_profile") != im.info["icc_profile"]


@steady
def test_webp_quality_changes_the_size_and_the_file_is_a_riff_webp(page):
    hi = sfw(page, ("Format", "select", "webp"), ("Quality", "range", 95))
    lo = sfw(page, ("Format", "select", "webp"), ("Quality", "range", 5))
    for r in (hi, lo):
        assert r["name"].lower().startswith("sfw") and r["name"].lower().endswith(".webp") and r["data"][:4] == b"RIFF" and r["data"][8:12] == b"WEBP"
    assert len(lo["data"]) < len(hi["data"])
    im = Image.open(io.BytesIO(hi["data"]))
    assert im.format == "WEBP" and im.size == (96, 64)
    red_blue_ok(im, 30)


@steady
def test_image_size_percent_scales_the_saved_picture(page):
    r = sfw(page, ("Format", "select", "png24"), ("Image size (%)", "range", 50))
    im = Image.open(io.BytesIO(r["data"]))
    assert im.size == (48, 32)
    red_blue_ok(im, 40)
    big = Image.open(io.BytesIO(sfw(page, ("Format", "select", "png24"), ("Image size (%)", "range", 200))["data"]))
    assert big.size == (192, 128)


@steady
def test_the_built_in_presets_set_their_format_and_settings(page):
    r = sfw(page, ("Preset", "select", "jpegLow"))
    im = Image.open(io.BytesIO(r["data"]))
    assert im.format == "JPEG"
    assert sum(im.quantization[0]) > 1200, im.quantization[0][:8]
    g = sfw(page, ("Preset", "select", "gif32"))
    gi = Image.open(io.BytesIO(g["data"]))
    assert gi.format == "GIF" and len(set(gi.convert("RGB").getdata())) <= 32
    w = sfw(page, ("Preset", "select", "webpHigh"))
    assert Image.open(io.BytesIO(w["data"])).format == "WEBP"


@steady
def test_png24_on_a_transparent_document_keeps_the_alpha_and_gif_marks_a_transparent_index(page):
    page.evaluate("""() => { const e = window.formvis.engine; e.newDocument(40, 40, 'Tr', 'transparent');
      const c = document.createElement('canvas'); c.width = 20; c.height = 20; const g = c.getContext('2d'); g.fillStyle = '#00ff00'; g.fillRect(0, 0, 20, 20);
      e.insertImages([{ name: 'g.png', width: 20, height: 20, source: c }]); }""")
    page.evaluate(CLEAR)
    page.wait_for_timeout(300)
    r = page.evaluate(DRIVE, {"steps": [["Format", "select", "png24"], ["Transparency", "check", True]]})
    assert "error" not in r, r
    im = Image.open(io.BytesIO(base64.b64decode(r["b64"])))
    assert im.mode == "RGBA"
    assert im.getpixel((1, 1))[3] == 0 and im.getpixel((20, 20))[3] == 255 and im.getpixel((20, 20))[:3] == (0, 255, 0)
    g = page.evaluate(DRIVE, {"steps": [["Format", "select", "gif"], ["Transparency", "check", True], ["Dither", "select", "none"]]})
    assert "error" not in g, g
    gi = Image.open(io.BytesIO(base64.b64decode(g["b64"])))
    assert gi.format == "GIF" and "transparency" in gi.info
    t = gi.convert("RGBA")
    assert t.getpixel((1, 1))[3] == 0 and t.getpixel((20, 20))[3] == 255


@steady
def test_the_last_settings_are_remembered_by_the_next_dialog(page):
    page.evaluate(SCENE)
    page.evaluate(CLEAR)
    page.evaluate(DRIVE, {"steps": [["Format", "select", "webp"], ["Quality", "range", 33]]})
    page.wait_for_timeout(300)
    page.evaluate("() => window.formvis.commands.run('save-for-web')")
    page.wait_for_timeout(800)
    got = page.evaluate("""() => { const dlg = [...document.querySelectorAll('.cv-scrim:not([hidden]) .cv-dialog')].find((d) => /Save for Web/.test(d.textContent));
      const f = [...dlg.querySelectorAll('.cv-field')].find((x) => x.querySelector('span') && x.querySelector('span').textContent === 'Format');
      const q = [...dlg.querySelectorAll('.cv-field')].find((x) => x.querySelector('span') && x.querySelector('span').textContent === 'Quality');
      return [f.querySelector('select').value, q.querySelector('input[type=range]').value]; }""")
    assert got == ["webp", "33"], got
    page.keyboard.press("Escape")


@steady
def test_the_dialog_is_off_without_a_document(page):
    assert page.evaluate("() => window.formvis.engine.projects.length") == 0
    assert page.evaluate("() => !!window.formvis.commands.get('save-for-web').enabled()") is False
    page.evaluate("() => window.formvis.commands.run('save-for-web')")
    page.wait_for_timeout(400)
    assert page.evaluate("() => [...document.querySelectorAll('.cv-scrim:not([hidden]) .cv-dialog')].some((d) => /Save for Web/.test(d.textContent))") is False

import base64
import functools
import io
import struct

import pytest
from PIL import Image
from playwright.sync_api import Error as PlaywrightError

RED, BLUE = (220, 30, 30), (30, 40, 220)


def steady(fn):
    @functools.wraps(fn)
    def run(page, tmp_path, **kw):
        for attempt in range(3):
            try:
                return fn(page, tmp_path, **kw)
            except PlaywrightError as err:
                if "context was destroyed" not in str(err) or attempt == 2:
                    raise
                page.wait_for_function("window.formvis && window.formvis.engine", timeout=60000)
    return run


SCENE = """async (rgb) => {
  const e = window.formvis.engine, E = await import('/src/engine/index.ts');
  e.newDocument(16, 12, 'Ex', 'white');
  e.fg = { r: rgb[0][0], g: rgb[0][1], b: rgb[0][2] }; e.fill('fg');
  e.fg = { r: rgb[1][0], g: rgb[1][1], b: rgb[1][2] };
  e.applySelection(E.SelectionMask.cropped(8, 0, 8, 12, new Uint8Array(96).fill(255)), 'replace', 's'); e.fill('fg'); e.deselect();
}"""
EXPORT_AS = """async (fmt) => {
  const got = new Promise((resolve) => {
    const orig = HTMLAnchorElement.prototype.click;
    HTMLAnchorElement.prototype.click = function () {
      HTMLAnchorElement.prototype.click = orig;
      fetch(this.href).then((r) => r.arrayBuffer()).then((buf) => { let s = ''; new Uint8Array(buf).forEach((c) => { s += String.fromCharCode(c); }); resolve({ name: this.download, b64: btoa(s) }); });
    };
  });
  window.formvis.commands.run('export-as');
  await new Promise((r) => setTimeout(r, 400));
  const dlg = document.querySelector('.cv-scrim:not([hidden]) .cv-dialog'), sel = dlg.querySelectorAll('select')[2];
  sel.value = fmt; sel.dispatchEvent(new Event('change', { bubbles: true }));
  await new Promise((r) => setTimeout(r, 200));
  [...dlg.querySelectorAll('.cv-dialog-foot button')].find((b) => b.textContent === 'Export').click();
  return await Promise.race([got, new Promise((r) => setTimeout(() => r(null), 25000))]);
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
PIXEL = """([x, y]) => Array.from(window.formvis.engine.flattened().getContext('2d').getImageData(x, y, 1, 1).data)"""


def two_tone(size=(16, 12)):
    im = Image.new("RGB", size, RED)
    for x in range(8, 16):
        for y in range(size[1]):
            im.putpixel((x, y), BLUE)
    return im


def near(a, b, t):
    return all(abs(p - q) <= t for p, q in zip(a[:3], b))


def open_file(page, path):
    count = page.evaluate("window.formvis.engine.projects.length")
    page.set_input_files("input[data-role='open-files']", str(path))
    page.wait_for_function(f"window.formvis.engine.projects.length > {count}", timeout=20000)
    return page.evaluate("[window.formvis.engine.current.doc.width, window.formvis.engine.current.doc.height]")


def exported(page, fmt):
    page.evaluate(SCENE, [RED, BLUE])
    r = page.evaluate(EXPORT_AS, fmt)
    assert r, f"Export As {fmt} delivered nothing"
    return r["name"], base64.b64decode(r["b64"])


READ_CASES = [
    ("png", "PNG", {}, 0), ("jpg", "JPEG", {"quality": 95, "subsampling": 0}, 4), ("gif", "GIF", {}, 0), ("bmp", "BMP", {}, 0),
    ("tga", "TGA", {}, 0), ("pcx", "PCX", {}, 0), ("ppm", "PPM", {}, 0), ("tif", "TIFF", {}, 0),
    ("webp", "WEBP", {"lossless": True}, 0), ("dds", "DDS", {}, 0),
]


@pytest.mark.parametrize("ext,fmt,kw,tol", READ_CASES, ids=[c[0] for c in READ_CASES])
@steady
def test_a_picture_in_each_common_format_opens_with_its_size_and_colours(page, tmp_path, ext, fmt, kw, tol):
    f = tmp_path / f"in.{ext}"
    two_tone().save(f, fmt, **kw)
    assert open_file(page, f) == [16, 12]
    assert near(page.evaluate(PIXEL, [3, 3]), RED, tol) and near(page.evaluate(PIXEL, [12, 8]), BLUE, tol)


@steady
def test_xpm_and_pgm_and_pam_open_with_their_colours(page, tmp_path):
    rows = ",\n".join('"' + "r" * 8 + "b" * 8 + '"' for _ in range(12))
    xpm = tmp_path / "in.xpm"
    xpm.write_text('/* XPM */\nstatic char *a[] = {\n"16 12 2 1",\n"r c #DC1E1E",\n"b c #1E28DC",\n' + rows + "\n};\n")
    assert open_file(page, xpm) == [16, 12]
    assert near(page.evaluate(PIXEL, [3, 3]), RED, 0) and near(page.evaluate(PIXEL, [12, 8]), BLUE, 0)
    grey = tmp_path / "in.pgm"
    grey.write_bytes(b"P5\n16 12\n255\n" + bytes([60] * 8 + [200] * 8) * 12)
    assert open_file(page, grey) == [16, 12]
    assert page.evaluate(PIXEL, [3, 3])[:3] == [60, 60, 60] and page.evaluate(PIXEL, [12, 8])[:3] == [200, 200, 200]
    pam = tmp_path / "in.pam"
    pam.write_bytes(b"P7\nWIDTH 16\nHEIGHT 12\nDEPTH 4\nMAXVAL 255\nTUPLTYPE RGB_ALPHA\nENDHDR\n" + (bytes(RED) + b"\xff") * 8 * 12 + (bytes(BLUE) + b"\x80") * 8 * 12)
    assert open_file(page, pam) == [16, 12]
    got = page.evaluate(PIXEL, [3, 3])
    assert got[:3] == list(RED) and got[3] == 255


@steady
def test_a_pfm_a_fits_and_a_radiance_file_written_by_hand_open_at_32_and_16_bits(page, tmp_path):
    pfm = tmp_path / "in.pfm"
    rows = b""
    for _ in range(12):
        rows += struct.pack("<48f", *([0.1, 0.2, 0.9] * 8 + [0.8, 0.3, 0.1] * 8))
    pfm.write_bytes(b"PF\n16 12\n-1.0\n" + rows)
    assert open_file(page, pfm) == [16, 12]
    assert page.evaluate("window.formvis.engine.current.doc.depth") == 32
    left = page.evaluate(PIXEL, [3, 3])
    assert near(left, (round(0.1 ** (1 / 2.2) * 255), round(0.2 ** (1 / 2.2) * 255), round(0.9 ** (1 / 2.2) * 255)), 40) or near(left, (26, 51, 230), 40), left
    assert left[2] > left[0] and page.evaluate(PIXEL, [12, 8])[0] > page.evaluate(PIXEL, [12, 8])[2]

    def card(s):
        return s.ljust(80).encode()
    hdr = b"".join(card(c) for c in ["SIMPLE  =                    T", "BITPIX  =                   16", "NAXIS   =                    2", "NAXIS1  =                   16", "NAXIS2  =                   12", "END"])
    hdr = hdr.ljust(2880, b" ")
    data = (struct.pack(">8h", *([1000] * 8)) + struct.pack(">8h", *([3000] * 8))) * 12
    fits = tmp_path / "in.fits"
    fits.write_bytes(hdr + data.ljust(2880, b"\0"))
    assert open_file(page, fits) == [16, 12]
    a, b = page.evaluate(PIXEL, [3, 3]), page.evaluate(PIXEL, [12, 8])
    assert a[0] == a[1] == a[2] and b[0] == b[1] == b[2] and b[0] > a[0]

    rad = tmp_path / "in.hdr"
    px = bytes([128, 64, 32, 129])
    px2 = bytes([32, 128, 64, 128])
    body = b"".join(px * 8 + px2 * 8 for _ in range(12))
    rad.write_bytes(b"#?RADIANCE\nFORMAT=32-bit_rle_rgbe\n\n-Y 12 +X 16\n" + body)
    assert open_file(page, rad) == [16, 12]
    assert page.evaluate("window.formvis.engine.current.doc.depth") == 32
    assert page.evaluate(PIXEL, [3, 3])[0] != page.evaluate(PIXEL, [12, 8])[0]


EXPORT_CASES = [("png", "Ex.png"), ("jpg", "Ex.jpg"), ("webp", "Ex.webp"), ("avif", "Ex.avif"), ("tiff", "Ex.tif"), ("qoi", "Ex.qoi"), ("pnm", "Ex.ppm"), ("tga", "Ex.tga"), ("bmp", "Ex.bmp")]


@pytest.mark.parametrize("fmt,name", EXPORT_CASES, ids=[c[0] for c in EXPORT_CASES])
@steady
def test_export_as_writes_each_common_format_that_pillow_reads_back_exactly(page, tmp_path, fmt, name):
    got, data = exported(page, fmt)
    assert got == name
    im = Image.open(io.BytesIO(data))
    im.load()
    assert im.size == (16, 12)
    rgb = im.convert("RGB")
    tol = 4 if fmt in ("jpg", "webp", "avif") else 0
    assert near(rgb.getpixel((3, 3)), RED, tol) and near(rgb.getpixel((12, 8)), BLUE, tol)
    f = tmp_path / got
    f.write_bytes(data)
    assert open_file(page, f) == [16, 12]
    assert near(page.evaluate(PIXEL, [3, 3]), RED, tol + 2) and near(page.evaluate(PIXEL, [12, 8]), BLUE, tol + 2)


@steady
def test_export_as_fits_dpx_and_wbmp_have_their_headers_and_reopen(page, tmp_path):
    name, fits = exported(page, "fits")
    assert name == "Ex.fits" and fits[:30].startswith(b"SIMPLE  =") and len(fits) % 2880 == 0
    cards = [fits[i:i + 80].decode() for i in range(0, 2880, 80)]
    keys = {c[:8].strip(): c[10:30].strip() for c in cards if "=" in c[:10]}
    assert keys["NAXIS1"] == "16" and keys["NAXIS2"] == "12" and keys["NAXIS"] == "3" and keys["NAXIS3"] == "3"
    first = Image.open(io.BytesIO(fits)).convert("L")
    assert first.getpixel((3, 3)) == RED[0] and first.getpixel((12, 8)) == BLUE[0]
    f = tmp_path / name
    f.write_bytes(fits)
    assert open_file(page, f) == [16, 12]
    a, b = page.evaluate(PIXEL, [3, 3]), page.evaluate(PIXEL, [12, 8])
    assert a[0] > a[2] and b[2] > b[0]

    name, dpx = exported(page, "dpx")
    assert name.startswith("Ex") and name.endswith(".dpx") and dpx[:4] == b"SDPX"
    assert struct.unpack(">II", dpx[772:780]) == (16, 12)
    f = tmp_path / name
    f.write_bytes(dpx)
    assert open_file(page, f) == [16, 12]
    assert near(page.evaluate(PIXEL, [3, 3]), RED, 1) and near(page.evaluate(PIXEL, [12, 8]), BLUE, 1)

    page.evaluate("""async () => {
      const e = window.formvis.engine, E = await import('/src/engine/index.ts');
      e.newDocument(16, 12, 'Wb', 'white'); e.fg = { r: 0, g: 0, b: 0 };
      e.applySelection(E.SelectionMask.cropped(8, 0, 8, 12, new Uint8Array(96).fill(255)), 'replace', 's'); e.fill('fg'); e.deselect();
    }""")
    r = page.evaluate(EXPORT_AS, "wbmp")
    wb = base64.b64decode(r["b64"])
    assert r["name"] == "Wb.wbmp" and wb[:4] == bytes([0, 0, 16, 12]) and len(wb) == 4 + 2 * 12
    assert all(wb[4 + 2 * y: 6 + 2 * y] == b"\xff\x00" for y in range(12))
    f = tmp_path / r["name"]
    f.write_bytes(wb)
    assert open_file(page, f) == [16, 12]
    assert page.evaluate(PIXEL, [3, 3])[:3] == [255, 255, 255] and page.evaluate(PIXEL, [12, 8])[:3] == [0, 0, 0]


@steady
def test_an_svg_asks_for_its_pixel_size_then_imports_rasterised(page, tmp_path):
    svg = tmp_path / "pic.svg"
    svg.write_text('<svg xmlns="http://www.w3.org/2000/svg" width="40" height="30"><rect width="20" height="30" fill="#dc1e1e"/><rect x="20" width="20" height="30" fill="#1e28dc"/></svg>')
    page.evaluate("window.formvis.engine.newDocument(10, 10, 'Base', 'white')")
    page.set_input_files("input[data-role='open-files']", str(svg))
    dlg = page.locator(".cv-scrim:not([hidden]) .cv-dialog")
    dlg.wait_for(timeout=20000)
    assert "pic.svg" in dlg.inner_text() and "width in pixels" in dlg.inner_text()
    dlg.locator(".cv-dialog-foot button", has_text="Import").click()
    page.wait_for_function("window.formvis.engine.current.doc.width >= 40 || window.formvis.engine.current.doc.layers.length > 1", timeout=20000)
    w, h = page.evaluate("[window.formvis.engine.current.doc.width, window.formvis.engine.current.doc.height]")
    assert w > 0 and h > 0
    left, right = page.evaluate(PIXEL, [w // 4, h // 2]), page.evaluate(PIXEL, [w * 3 // 4, h // 2])
    assert near(left, RED, 3) and near(right, BLUE, 3), (w, h, left, right)


@steady
def test_several_files_open_together_as_separate_documents(page, tmp_path):
    a, b = tmp_path / "one.png", tmp_path / "two.bmp"
    two_tone().save(a)
    Image.new("RGB", (10, 8), BLUE).save(b)
    count = page.evaluate("window.formvis.engine.projects.length")
    page.set_input_files("input[data-role='open-files']", [str(a), str(b)])
    page.wait_for_function(f"window.formvis.engine.projects.length >= {count + 2}", timeout=20000)
    names = page.evaluate("window.formvis.engine.projects.map((p) => p.name)")
    assert "one" in names and "two" in names


@steady
def test_export_as_pdf_is_one_flattened_page_with_the_picture(page, tmp_path):
    name, pdf = exported(page, "pdf")
    assert name == "Ex.pdf" and pdf[:5] == b"%PDF-" and pdf.rstrip().endswith(b"%%EOF")
    assert pdf.count(b"/Type /Page\n") + pdf.count(b"/Type /Page ") + pdf.count(b"/Type/Page/") >= 1 or b"/Page" in pdf
    assert b"/Image" in pdf and b"/MediaBox" in pdf and pdf.count(b"/Type /Pages") + pdf.count(b"/Type/Pages") >= 1


@steady
def test_hdr_exr_and_pfm_exports_reopen_past_8_bits_with_the_painted_colours(page, tmp_path):
    for cmd, ext, tol in [("export-hdr", "hdr", 4), ("export-exr", "exr", 1), ("export-pfm", "pfm", 1), ("export-exr-half", "exr", 1), ("export-exr-piz", "exr", 1), ("export-exr-none", "exr", 1)]:
        page.evaluate(SCENE, [RED, BLUE])
        r = page.evaluate(CAPTURE, cmd)
        assert r and r["name"].startswith("Ex") and r["name"].endswith(f".{ext}"), cmd
        f = tmp_path / (cmd + "." + ext)
        f.write_bytes(base64.b64decode(r["b64"]))
        if ext == "exr":
            raw = f.read_bytes()
            tag = b"compression\x00compression\x00\x01\x00\x00\x00"
            code = raw[raw.index(tag) + len(tag)]
            if cmd == "export-exr-none":
                assert code == 0
            if cmd == "export-exr-piz":
                assert code == 4
        assert open_file(page, f) == [16, 12]
        assert page.evaluate("window.formvis.engine.current.doc.depth") == 32, cmd
        assert near(page.evaluate(PIXEL, [3, 3]), RED, tol) and near(page.evaluate(PIXEL, [12, 8]), BLUE, tol), cmd

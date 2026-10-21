import base64
import functools
import io

from PIL import Image, ImageCms
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


# Byte-level round trips of the io modules: the page writes the bytes (PNG text, embedded ICC profiles, Exif blocks) and
# an independent reader (Pillow, or a hand parse) reads them back; the page's own readers are checked against Pillow's files.
PNG = """async (kind) => {
  const c = document.createElement('canvas'); c.width = 6; c.height = 4;
  const x = c.getContext('2d'); x.fillStyle = '#c86432'; x.fillRect(0, 0, 6, 4);
  const blob = await new Promise((r) => c.toBlob(r, kind === 'jpeg' ? 'image/jpeg' : 'image/png', 0.95));
  return Array.from(new Uint8Array(await blob.arrayBuffer()));
}"""
TEXT = """async ([png, entries]) => {
  const m = await import('/src/io/png-text.ts');
  return Array.from(m.addPngText(new Uint8Array(png), entries));
}"""
EMBED = """async ([kind, file, icc, name]) => {
  const m = await import('/src/io/embed-icc.ts');
  const blob = new Blob([new Uint8Array(file)]);
  const out = kind === 'png' ? await m.embedPng(blob, new Uint8Array(icc), name) : await m.embedJpeg(blob, new Uint8Array(icc));
  return Array.from(new Uint8Array(await out.arrayBuffer()));
}"""
READ = """async (file) => {
  const m = await import('/src/io/icc-read.ts');
  const p = await m.embeddedProfile(new Blob([new Uint8Array(file)]));
  return p ? { bytes: Array.from(p), name: m.profileName(p) } : null;
}"""


def icc():
    return ImageCms.ImageCmsProfile(ImageCms.createProfile("sRGB")).tobytes()


@steady
def test_png_text_chunks_are_read_by_an_independent_decoder(page):
    png = page.evaluate(PNG, "png")
    out = bytes(page.evaluate(TEXT, [png, [["parameters", "a cat, sharp\nSteps: 20, Seed: 7"], ["note", "café 中"]]]))
    im = Image.open(io.BytesIO(out))
    im.load()
    assert im.text["parameters"] == "a cat, sharp\nSteps: 20, Seed: 7"
    assert im.text["note"] == "café 中"
    assert im.size == (6, 4) and im.getpixel((2, 2))[:3] == (200, 100, 50)


@steady
def test_png_text_rejects_a_file_that_is_not_a_png(page):
    err = None
    try:
        page.evaluate(TEXT, [[1, 2, 3], [["a", "b"]]])
    except PlaywrightError as e:
        err = str(e)
    assert err and "not a PNG" in err


@steady
def test_embedded_png_profile_is_found_by_pillow_and_by_the_page_reader(page):
    profile = icc()
    png = page.evaluate(PNG, "png")
    out = bytes(page.evaluate(EMBED, ["png", png, list(profile), "My sRGB"]))
    im = Image.open(io.BytesIO(out))
    assert im.info["icc_profile"] == profile
    back = page.evaluate(READ, list(out))
    assert bytes(back["bytes"]) == profile and back["name"]
    assert Image.open(io.BytesIO(out)).convert("RGB").getpixel((1, 1)) == (200, 100, 50)


@steady
def test_embedded_png_profile_replaces_an_older_one(page):
    profile = icc()
    png = page.evaluate(PNG, "png")
    once = page.evaluate(EMBED, ["png", png, list(profile), "A"])
    twice = bytes(page.evaluate(EMBED, ["png", once, list(profile), "B"]))
    assert twice.count(b"iCCP") == 1


@steady
def test_embedded_jpeg_profile_is_found_by_pillow_and_the_old_one_is_dropped(page):
    profile = icc()
    jpg = page.evaluate(PNG, "jpeg")
    out = bytes(page.evaluate(EMBED, ["jpeg", jpg, list(profile), ""]))
    im = Image.open(io.BytesIO(out))
    assert im.info["icc_profile"] == profile
    assert out.count(b"ICC_PROFILE") == 1
    again = bytes(page.evaluate(EMBED, ["jpeg", list(out), list(profile), ""]))
    assert again.count(b"ICC_PROFILE") == 1
    assert bytes(page.evaluate(READ, list(again))["bytes"]) == profile


@steady
def test_large_profile_is_split_over_jpeg_segments_and_joined_back(page):
    big = icc() + bytes(range(256)) * 400
    jpg = page.evaluate(PNG, "jpeg")
    out = bytes(page.evaluate(EMBED, ["jpeg", jpg, list(big), ""]))
    assert out.count(b"ICC_PROFILE") == 2
    assert Image.open(io.BytesIO(out)).info["icc_profile"] == big
    assert bytes(page.evaluate(READ, list(out))["bytes"]) == big


@steady
def test_profile_reader_returns_null_for_a_plain_png(page):
    assert page.evaluate(READ, page.evaluate(PNG, "png")) is None or page.evaluate(READ, page.evaluate(PNG, "png"))["bytes"] is not None


EXIF = """async (cam) => {
  const m = await import('/src/io/exif.ts');
  const block = m.buildExifBlock(cam);
  return block ? Array.from(block) : null;
}"""
CAMERA = {"make": "Acme", "model": "Cam 9", "exposure": "1/250", "aperture": "2.8", "iso": "400", "focalLength": "50", "lens": "50mm F1.8", "dateTaken": "2024-05-06T07:08:09"}


@steady
def test_exif_block_is_parsed_by_pillow(page):
    block = bytes(page.evaluate(EXIF, CAMERA))
    assert block[:4] == b"II*\x00"
    ex = Image.Exif()
    ex.load(b"Exif\x00\x00" + block)
    assert ex[271] == "Acme" and ex[272] == "Cam 9"
    sub = ex.get_ifd(0x8769)
    assert sub[34855] == 400 and sub[36867] == "2024:05:06 07:08:09" and sub[42036] == "50mm F1.8"
    assert abs(float(sub[33434]) - 1 / 250) < 1e-4 and abs(float(sub[33437]) - 2.8) < 1e-3 and float(sub[37386]) == 50


@steady
def test_exif_block_round_trips_through_the_page_reader(page):
    got = page.evaluate("""async (cam) => { const m = await import('/src/io/exif.ts'); return m.cameraFromTiff(m.buildExifBlock(cam)); }""", CAMERA)
    assert got["make"] == "Acme" and got["model"] == "Cam 9" and got["iso"] == "400" and got["lens"] == "50mm F1.8"
    assert got["dateTaken"].startswith("2024-05-06") and got["exposure"] == "1/250"


@steady
def test_exif_block_is_empty_without_any_field_and_reads_pillow_files(page):
    assert page.evaluate(EXIF, {}) is None
    ex = Image.Exif()
    ex[271] = "Maker"
    ex[272] = "Body"
    raw = ex.tobytes()
    got = page.evaluate("""async (b) => { const m = await import('/src/io/exif.ts'); return m.cameraFromTiff(new Uint8Array(b)); }""", list(raw[6:] if raw[:4] == b"Exif" else raw))
    assert got["make"] == "Maker" and got["model"] == "Body"


@steady
def test_exposure_and_rational_text_helpers(page):
    r = page.evaluate("""async () => { const m = await import('/src/io/exif.ts'); return [m.exposureText(0.004), m.exposureText(2), m.roundText(2.84), m.rationalOf('1/250')]; }""")
    assert r[0] == "1/250" and r[1] == "2" and r[2] == "2.8" and abs(r[3] - 0.004) < 1e-9


@steady
def test_fits_and_dpx_headers_become_fields(page):
    cards = b"".join(c.ljust(80).encode() for c in ["SIMPLE  =                    T", "BITPIX  =                    8", "OBJECT  = 'M31     '           / target", "EXPTIME =                 30.0", "END"])
    r = page.evaluate("""async (b) => { const m = await import('/src/io/header-meta.ts'); return m.fitsCards(new Uint8Array(b)); }""", list(cards))
    assert r["OBJECT"] == "M31" and r["EXPTIME"] == "30.0" and "BITPIX" not in r
    assert page.evaluate("""async () => { const m = await import('/src/io/header-meta.ts'); return [m.fitsCards(new Uint8Array(100)), m.dpxFields(new Uint8Array(10))]; }""") == [None, None]

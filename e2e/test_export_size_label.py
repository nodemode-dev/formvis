# Export As (1.51.8): Fit Within and Frame sizes, and the AI label in PNG, JPEG and WebP, checked with Pillow.
import base64
import io
import re
import struct

from PIL import Image

DLG = ".cv-scrim:not([hidden]) .cv-dialog"
CATCH = """() => { window.__file = null; const make = URL.createObjectURL, click = HTMLAnchorElement.prototype.click; let made = null;
  URL.createObjectURL = function (b) { made = b; return make.call(URL, b); };
  HTMLAnchorElement.prototype.click = function () { URL.createObjectURL = make; HTMLAnchorElement.prototype.click = click; const name = this.download;
    made.arrayBuffer().then((buf) => { let s = ''; new Uint8Array(buf).forEach((c) => { s += String.fromCharCode(c); }); window.__file = { name, b64: btoa(s) }; }); }; }"""


def export(page, fmt, size="scale", box=None, label="none"):
    page.evaluate("window.formvis.engine.newDocument(300, 100, 'Pic', 'white'); window.formvis.engine.fg = { r: 30, g: 90, b: 200 }; window.formvis.engine.fill('fg')")
    page.evaluate("window.formvis.commands.run('export-as')")
    row = lambda text: page.locator(f"{DLG} .cv-field").filter(has_text=re.compile(rf"^\s*{re.escape(text)}")).locator("select").first
    row("Format").select_option(fmt)
    row("Size").select_option(size)
    if box:
        page.locator(f"{DLG} input[aria-label='Width']").fill(str(box[0])); page.locator(f"{DLG} input[aria-label='Width']").press("Tab")
        page.locator(f"{DLG} input[aria-label='Height']").fill(str(box[1])); page.locator(f"{DLG} input[aria-label='Height']").press("Tab")
    row("AI label").select_option(label)
    page.evaluate(CATCH)
    page.locator(f"{DLG} .cv-dialog-foot button", has_text="Export").click()
    page.wait_for_function("() => window.__file !== null", timeout=15000)
    return base64.b64decode(page.evaluate("window.__file.b64"))


def test_fit_within_and_frame(page):
    im = Image.open(io.BytesIO(export(page, "png", "fit", (150, 150))))
    assert im.size == (150, 50)
    im = Image.open(io.BytesIO(export(page, "png", "frame", (200, 200)))).convert("RGBA")
    assert im.size == (200, 200) and im.getpixel((100, 10))[3] == 0 and im.getpixel((100, 100)) == (30, 90, 200, 255)   # centred, clear margins
    im = Image.open(io.BytesIO(export(page, "jpg", "frame", (200, 200)))).convert("RGB")
    assert all(v > 245 for v in im.getpixel((100, 10))) and im.getpixel((100, 100))[2] > 180                             # white margins in JPEG


def test_the_ai_label_in_png_jpeg_and_webp(page):
    for fmt, label, want in (("png", "edited", "compositeWithTrainedAlgorithmicMedia"), ("jpg", "generated", "trainedAlgorithmicMedia"), ("webp", "edited", "compositeWithTrainedAlgorithmicMedia")):
        data = export(page, fmt, label=label)
        im = Image.open(io.BytesIO(data)); im.load()                                                                       # still decodes
        xmp = im.info.get("xmp") or im.info.get("XML:com.adobe.xmp") or b""
        xmp = xmp.decode() if isinstance(xmp, bytes) else xmp
        assert f"digitalsourcetype/{want}\"" in xmp, (fmt, xmp[:200])
        assert im.size == (300, 100)
        if fmt == "webp":
            assert data[12:16] == b"VP8X" and struct.unpack("<I", data[4:8])[0] == len(data) - 8 and data[20] & 0x04               # extended, XMP flag, sizes consistent
    none = export(page, "png")
    assert b"digitalsourcetype" not in none                                                                                  # no label unless chosen

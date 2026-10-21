import base64
import functools
import io

from PIL import Image
from playwright.sync_api import Error as PlaywrightError

from e2e.test_cover_files_flat_formats import CAPTURE


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


@steady
def test_export_selection_as_mask_png_is_white_inside_black_outside_and_document_sized(page):
    page.evaluate("""async () => {
      const e = window.formvis.engine, E = await import('/src/engine/index.ts');
      e.newDocument(16, 12, 'Sel', 'white'); e.fg = { r: 30, g: 40, b: 220 }; e.fill('fg');
      e.applySelection(E.SelectionMask.cropped(8, 0, 8, 12, new Uint8Array(96).fill(255)), 'replace', 's');
    }""")
    r = page.evaluate(CAPTURE, "export-selection-mask")
    assert r and r["name"] == "Sel selection.png"
    data = base64.b64decode(r["b64"])
    assert data[:8] == b"\x89PNG\r\n\x1a\n"
    im = Image.open(io.BytesIO(data)).convert("RGB")
    assert im.size == (16, 12)
    assert im.getpixel((12, 8)) == (255, 255, 255) and im.getpixel((12, 0)) == (255, 255, 255) and im.getpixel((15, 11)) == (255, 255, 255)
    assert im.getpixel((3, 3)) == (0, 0, 0) and im.getpixel((7, 11)) == (0, 0, 0) and im.getpixel((0, 0)) == (0, 0, 0)
    assert sum(1 for p in im.getdata() if p == (255, 255, 255)) == 8 * 12

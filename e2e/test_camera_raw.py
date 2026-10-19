import base64
from pathlib import Path

DNG = base64.b64encode((Path(__file__).parent.parent / "backend" / "tests" / "fixtures" / "synthetic.dng").read_bytes()).decode()


def test_a_dropped_raw_file_is_developed_and_opens_develop(page):
    page.evaluate("window.formvis.engine.newDocument(200, 150, 'R', 'white')")
    page.evaluate("""(b64) => {
      const bytes = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0)), dt = new DataTransfer();
      dt.items.add(new File([bytes], 'photo.dng', { type: '' }));
      const target = document.querySelector('.cv-stage') || document.body, r = target.getBoundingClientRect();
      for (const type of ['dragenter', 'dragover', 'drop'])
        target.dispatchEvent(new DragEvent(type, { bubbles: true, cancelable: true, dataTransfer: dt, clientX: r.left + r.width / 2, clientY: r.top + r.height / 2 }));
    }""", DNG)
    # A single camera RAW opens into the Camera Raw dialog first (1.71.7); Open develops and places it.
    page.locator(".cv-scrim:not([hidden]) .cv-dialog", has_text="Camera Raw").wait_for(timeout=10000)
    page.locator(".cv-scrim:not([hidden]) .cv-dialog-foot button", has_text="Open").click()
    page.wait_for_function("window.formvis.engine.current.activeLayer?.name?.startsWith('photo')", timeout=15000)
    # Develop opens on the layer at once and may pad its raster to the document, so the developed picture is found by its opaque bounds.
    px = page.evaluate("""() => { const l = window.formvis.engine.current.activeLayer, c = l.raster.ctx, W = l.raster.width, H = l.raster.height, d = c.getImageData(0, 0, W, H).data;
      let x0 = W, y0 = H, x1 = -1, y1 = -1;
      for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) if (d[(y * W + x) * 4 + 3]) { x0 = Math.min(x0, x); x1 = Math.max(x1, x); y0 = Math.min(y0, y); y1 = Math.max(y1, y); }
      const w = x1 - x0 + 1, h = y1 - y0 + 1, at = (x, y) => Array.from(c.getImageData(x0 + x, y0 + y, 1, 1).data); return { w, h, left: at(8, h >> 1), right: at(w - 8, h >> 1) }; }""")
    assert (px["w"], px["h"]) == (64, 48), px
    assert px["left"][0] > 200 and px["left"][2] < 150 and px["right"][2] > 200 and px["right"][0] < 150, px   # red left, blue right
    # formvis opens a RAW file into Develop.
    page.wait_for_function("[...document.querySelectorAll('.cv-scrim:not([hidden]) .cv-develop-head > button:first-child')].some((n) => n.textContent === 'Point Curve')", timeout=10000)
    page.keyboard.press("Escape")
